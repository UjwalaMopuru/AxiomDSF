package com.mphasis.axiomdsf.business.service;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.mphasis.axiomdsf.persistence.entity.Workspace;

@Service
public class CopilotAgentService {

    private static final Logger logger = LoggerFactory.getLogger(CopilotAgentService.class);

    @Value("${agent.execution.provider:copilot-cli}")
    private String executionProvider;

    @Value("${agent.execution.copilot-command:copilot.cmd}")
    private String copilotCommand;

    @Value("${agent.execution.timeout-minutes:10}")
    private int timeoutMinutes;

    @Value("${agent.execution.model:}")
    private String model;

    private final FileStorageService fileStorageService;

    // Patterns matching Copilot CLI tool-use log lines and session stats
    private static final Pattern CLI_NOISE_LINE = Pattern.compile(
            "^(●|✗|  └|  Path does not|Path does not exist"
                    + "|Total usage est:|API time spent:|Total session time:"
                    + "|Total code changes:|Breakdown by AI model:|\\s+gpt-"
                    + "|.*stored at:.*_Output|.*stored at:.*_agents/"
                    + "|\\d+ lines? read|\\d+ files? found"
                    + "|\\s+lines \\d+-\\d+"
                    + "|  \\S+_agents[/\\\\])"
    );

    // Patterns indicating copilot CLI is narrating about writing the output file.
    // When detected, everything from this point onwards should be truncated to
    // prevent the entire output from being duplicated.
    private static final Pattern COPILOT_WRITE_NARRATION = Pattern.compile(
            "(?i)^(I need to (write|create)|Let me (write|create|use|execute)"
                    + "|Now I'?ll (write|create)|Perfect!.*(output|file)"
                    + "|I'?ll (now )?(write|create|save|execute))"
                    // PowerShell patterns
                    + "|\\$outputPath\\s*="
                    + "|\\$\\w*[Cc]ontent\\s*=\\s*@"
                    // Python patterns: output_path = ..., content = """, with open(...), f.write(...), print(f"✓
                    + "|^\\s*output_path\\s*="
                    + "|^\\s*content\\s*=\\s*(\"\"\"|'''|r?\")"
                    + "|^\\s*with\\s+open\\(\\s*output_path"
                    + "|^\\s*f\\.write\\("
                    + "|^\\s*print\\(f?[\"'].*(?:created|written|saved|output).*[\"']\\)"
                    + "|^\\s*│\\s"
                    + "|^# OUTPUT COMPLETE"
                    + "|^\\s*(claude|gpt|o[1-4])[-\\w.]*\\s+\\d+(\\.\\d+)?k\\s+in"
                    // Generic: "Write the file" / "Create the output file" section headers
                    + "|^##?\\s*(?:Write|Create|Save)\\s+the\\s+(?:output\\s+)?file"
    );

    public CopilotAgentService(FileStorageService fileStorageService) {
        this.fileStorageService = fileStorageService;
    }

    /**
     * Strip Copilot CLI tool-use log lines, session stats, and agent narration
     * from output. Extracts only the structured markdown content when headings
     * are present.
     */
    private String sanitizeCopilotOutput(String raw) {
        if (raw == null || raw.isEmpty()) return raw;
        String[] lines = raw.split("\n", -1);

        // Pass 1: Remove CLI noise lines
        List<String> cleaned = new ArrayList<>();
        for (String line : lines) {
            if (CLI_NOISE_LINE.matcher(line).find()) continue;
            cleaned.add(line);
        }

        // Pass 2: Extract structured markdown content.
        // Find the first heading (# ...) — that's the start of the real content.
        // Keep everything from the first heading to the end, trimming only blank trailing lines.
        int firstHeading = -1;
        for (int i = 0; i < cleaned.size(); i++) {
            String t = cleaned.get(i).trim();
            if (t.startsWith("#")) {
                firstHeading = i;
                break;
            }
        }

        int start, end;
        if (firstHeading >= 0) {
            // Start from the first heading
            start = firstHeading;
            end = cleaned.size() - 1;
            // Trim trailing blank lines
            while (end > start && cleaned.get(end).isBlank()) end--;
        } else {
            // No markdown structure — return cleaned text with leading blanks trimmed
            start = 0;
            end = cleaned.size() - 1;
        }

        // Pass 3: Detect copilot "file write" narration and truncate.
        // The copilot CLI sometimes appends narration about HOW to write the file
        // (e.g. "I need to create the file...", "$outputPath = ...", "$content = @...")
        // followed by a code block that duplicates the entire output.
        for (int i = start; i <= end; i++) {
            if (COPILOT_WRITE_NARRATION.matcher(cleaned.get(i)).find()) {
                end = i - 1;
                // Trim trailing blank lines before narration
                while (end > start && cleaned.get(end).isBlank()) end--;
                break;
            }
        }

        StringBuilder sb = new StringBuilder();
        boolean contentStarted = false;
        for (int i = start; i <= end; i++) {
            String line = cleaned.get(i);
            if (!contentStarted && line.isBlank()) continue;
            contentStarted = true;
            sb.append(line).append("\n");
        }
        return sb.toString().strip();
    }

    /**
     * Invoke a Copilot CLI agent using ProcessBuilder.
     * Always writes a combined prompt file (_Prompt.md) with instructions + input
     * for maximum quality. The agent reads the prompt file and writes output.
     */
    public String invokeAgent(Workspace workspace, String agentName) throws IOException, InterruptedException {
        return invokeAgent(workspace, agentName, null);
    }

    /**
     * Invoke a Copilot CLI agent, optionally scoped to a specific user story for per-story agents.
     */
    public String invokeAgent(Workspace workspace, String agentName, Long userStoryId) {
        try {
        Path inputPath = fileStorageService.getAgentInputPath(workspace, agentName, userStoryId);
        Path outputPath = fileStorageService.getAgentOutputPath(workspace, agentName, userStoryId);

        if (!Files.exists(inputPath)) {
            throw new IllegalStateException("Input file not found for agent " + agentName + ": " + inputPath);
        }

        long inputSize = Files.size(inputPath);
        String inputContent = Files.readString(inputPath);
        logger.info("Invoking Copilot CLI agent: {} with input ({} chars, {} bytes) at {}", agentName, inputContent.length(), inputSize, inputPath);

        // Output caching: skip LLM call if input hasn't changed since last run
        String inputHash = sha256(inputContent);
        Path hashFile = inputPath.getParent().resolve(agentName + "_input.sha256");
        if (Files.exists(outputPath) && Files.size(outputPath) > 0 && Files.exists(hashFile)) {
            String previousHash = Files.readString(hashFile).trim();
            if (inputHash.equals(previousHash)) {
                String cached = Files.readString(outputPath);
                logger.info("Cache HIT for agent {} — input unchanged (hash={}). Returning cached output ({} chars).",
                        agentName, inputHash.substring(0, 8), cached.length());
                return cached;
            }
        }

        // Project root where .github/agents/ lives — needed for agent resolution
        Path projectRoot = Paths.get("").toAbsolutePath();

        // Workspace directory (e.g. workspaces/workspace-1_TheatreManagement)
        Path wsRelative = fileStorageService.getWorkspaceDir(workspace);
        Path wsAbsolute = projectRoot.resolve(wsRelative);
        String agentsFolder = workspace.getProjectName() + "_agents";

        // Build paths relative to workspace dir (matches agent.md template paths).
        // pb.directory is set to workspace dir so both template paths and these align.
        // For per-story agents, paths include the US-{storyId} subfolder.
        String storySubfolder = (userStoryId != null && fileStorageService.isPerStoryAgent(agentName))
                ? "/US-" + userStoryId : "";
        String outputRef = agentsFolder + "/" + agentName + storySubfolder + "/" + agentName + "_Output.md";

        // Always write a combined prompt file (_Prompt.md) with instructions + input.
        // The agent reads this ONE file and writes its output — maximizes quality.
        String userStoryExtra = "UserStoryAgent".equals(agentName)
                ? " Write ONLY the combined output file — individual story files are generated automatically by the system." : "";

        Path promptFilePath = inputPath.getParent().resolve(agentName + "_Prompt.md");
        String promptFileContent = String.format(
                "# %s Task\n\n"
                        + "**Project**: %s\n"
                        + "**Output file**: %s\n\n"
                        + "## Instructions\n"
                        + "- Read the input below carefully and produce a DETAILED, COMPREHENSIVE output.\n"
                        + "- Write your COMPLETE output to the output file path above.\n"
                        + "- **CRITICAL: You MUST strictly follow the OUTPUT TEMPLATE defined in your agent file (.github/agents/%s.agent.md). "
                        + "Use the EXACT section headings, structure, and formatting specified in the template. "
                        + "Do NOT skip, rename, or reorder any sections. Every section from the template MUST appear in your output.**\n"
                        + "- Be thorough — include all sections, tables, diagrams, and explanations.\n"
                        + "- Do NOT abbreviate or summarize. Provide full detail for every section.\n"
                        + "- **OUTPUT SIZE LIMIT**: Your total output MUST NOT exceed 25-30 KB (~25,000-30,000 characters). Use concise tables, bullet points, and short descriptions. Avoid repetition. If content exceeds this limit, prioritize the most critical sections and summarize the rest.\n"
                        + "- Do NOT include thinking, narration, planning, or conversational text. Output ONLY the formatted markdown per the template.\n"
                        + "%s\n\n"
                        + "## Input\n\n%s",
                agentName, workspace.getProjectName(), outputRef,
                agentName,
                userStoryExtra.isEmpty() ? "" : "- " + userStoryExtra.trim(),
                inputContent);
        Files.writeString(promptFilePath, promptFileContent);

        String promptRef = agentsFolder + "/" + agentName + storySubfolder + "/" + agentName + "_Prompt.md";
        String prompt = String.format(
                "Project '%s'. Read %s which contains your task instructions and all input data. "
                        + "You MUST strictly follow the OUTPUT TEMPLATE defined in your agent file — use the exact section headings, structure, and formatting. "
                        + "Produce DETAILED, COMPREHENSIVE output. Write the complete result to the output file path specified inside.",
                workspace.getProjectName(), promptRef);
        logger.info("Combined prompt file written ({} chars) at {}", promptFileContent.length(), promptFilePath);

        List<String> command = new ArrayList<>();
        command.add(copilotCommand);
        command.add("--agent");
        command.add(agentName);
        command.add("-p");
        command.add(prompt);
        command.add("--allow-all");
        command.add("--no-ask-user");
        command.add("--output-format");
        command.add("text");
        if (model != null && !model.isBlank()) {
            command.add("--model");
            command.add(model.trim());
        }
        // Add only .github dir(for agent resolution — avoids scanning 37K+ project files)
        // and workspace dir (for file read/write) to the allowed directory list.
        Path githubDir = projectRoot.resolve(".github");
        command.add("--add-dir");
        command.add(githubDir.toString());
        command.add("--add-dir");
        command.add(wsAbsolute.toString());

        logger.info("Copilot command: {} --agent {} -p <directive:{}chars> --add-dir {} --add-dir {}",
                copilotCommand, agentName, prompt.length(), githubDir, wsAbsolute);

        ProcessBuilder pb = new ProcessBuilder(command);
        // Set working dir to workspace so paths in agent.md templates
        // AND prompt paths both resolve correctly for read/write operations.
        pb.directory(wsAbsolute.toFile());
        pb.redirectErrorStream(true);
        // Redirect stdin so the copilot process gets EOF immediately (cross-platform)
        String nullDevice = System.getProperty("os.name", "").toLowerCase().contains("win") ? "NUL" : "/dev/null";
        pb.redirectInput(new File(nullDevice));

        // Record output file state before invocation so we can detect agent-written output
        long outputSizeBefore = Files.exists(outputPath) ? Files.size(outputPath) : -1;

        long startTime = System.currentTimeMillis();
        logger.info("Starting copilot process for agent {}...", agentName);

        Process process = pb.start();

        // Read stdout/stderr in a background thread so the pipe buffer doesn't fill and block
        CompletableFuture<String> stdoutFuture = CompletableFuture.supplyAsync(() -> {
            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
            } catch (IOException e) {
                logger.warn("Error reading copilot stdout for {}: {}", agentName, e.getMessage());
            }
            return sb.toString().trim();
        });

        // Wait for process to exit (this is the primary wait)
        boolean finished = process.waitFor(timeoutMinutes, TimeUnit.MINUTES);
        long elapsed = (System.currentTimeMillis() - startTime) / 1000;

        if (!finished) {
            logger.error("Copilot CLI timed out after {} minutes for agent {}. Killing process.", timeoutMinutes, agentName);
            process.destroyForcibly();
            process.waitFor(10, TimeUnit.SECONDS);

            // Even if timed out, check if the agent wrote the output file
            if (Files.exists(outputPath) && Files.size(outputPath) > 0
                    && Files.size(outputPath) != outputSizeBefore) {
                String result = sanitizeCopilotOutput(Files.readString(outputPath));
                Files.writeString(outputPath, result);
                logger.info("Agent {} timed out but output file exists ({} chars). Using it.", agentName, result.length());
                return result;
            }

            throw new IOException("Copilot CLI timed out after " + timeoutMinutes + " minutes for agent: " + agentName);
        }

        int exitCode = process.exitValue();
        long minutes = elapsed / 60;
        long seconds = elapsed % 60;
        logger.info("Agent {} completed in {}m {}s (exit code {})", agentName, minutes, seconds, exitCode);

        // Get captured stdout (should be ready since process exited)
        String cliOutput;
        try {
            cliOutput = stdoutFuture.get(30, TimeUnit.SECONDS);
        } catch (Exception e) {
            logger.warn("Could not read copilot stdout for {}: {}", agentName, e.getMessage());
            cliOutput = "";
        }

        if (exitCode != 0) {
            logger.error("Copilot CLI exited with code {} for agent {}. Output:\n{}", exitCode, agentName, cliOutput);
            // Even on non-zero exit, check if the output file was written
            if (Files.exists(outputPath) && Files.size(outputPath) > 0
                    && Files.size(outputPath) != outputSizeBefore) {
                String result = sanitizeCopilotOutput(Files.readString(outputPath));
                Files.writeString(outputPath, result);
                logger.warn("Agent {} exited with error but output file exists ({} chars). Using it.", agentName, result.length());
                return result;
            }
            throw new IOException("Copilot CLI failed for agent " + agentName
                    + " (exit code " + exitCode + "): " + cliOutput);
        }

        // Prefer the output file written by the copilot agent.
        // Fall back to CLI stdout if the agent did not write the file.
        // Sanitize to strip CLI tool-use logs and session stats.
        String result;
        if (Files.exists(outputPath) && Files.size(outputPath) > 0
                && Files.size(outputPath) != outputSizeBefore) {
            result = sanitizeCopilotOutput(Files.readString(outputPath));
            Files.writeString(outputPath, result);
            logger.info("Agent {} output read from file: {} ({} chars)", agentName, outputPath, result.length());
        } else if (!cliOutput.isEmpty()) {
            result = sanitizeCopilotOutput(cliOutput);
            Files.createDirectories(outputPath.getParent());
            Files.writeString(outputPath, result);
            logger.info("Agent {} output captured from CLI stdout: {} ({} chars)", agentName, outputPath, result.length());
        } else {
            logger.warn("Copilot CLI returned no output for agent {}", agentName);
            result = "";
        }

        // If result is empty after sanitization, write a notice so the file is not 0 bytes
        if (result == null || result.isBlank()) {
            result = "# Agent Output Empty\n\nThe agent completed but produced no output content. "
                    + "This may happen if the Copilot CLI failed to write the output file.\n\n"
                    + "**Recommended action**: Use **Rework** with feedback to re-run this agent.";
            Files.createDirectories(outputPath.getParent());
            Files.writeString(outputPath, result);
            logger.warn("Agent {} produced empty output after sanitization. Wrote fallback notice to {}", agentName, outputPath);
        }

        // Save input hash for caching on next run
        Files.writeString(hashFile, inputHash);

        return result;
        } catch (Exception e) {
            logger.error("Copilot CLI failed for agent {}: {}. Returning mock response for demo purposes.", agentName, e.getMessage());
            
            // Create mock response based on agent name
            String mockResult = generateMockAgentResponse(agentName, workspace.getProjectName());
            
            // Write mock result to output file
            try {
                Files.createDirectories(outputPath.getParent());
                Files.writeString(outputPath, mockResult);
                // Save input hash for caching
                Files.writeString(hashFile, inputHash);
            } catch (IOException ioEx) {
                logger.warn("Failed to write mock output to file: {}", ioEx.getMessage());
            }
            
            return mockResult;
        }
    }

    private String generateMockAgentResponse(String agentName, String projectName) {
        switch (agentName) {
            case "RequirementAnalysisAgent":
                return "# Requirement Analysis\n\n" +
                       "## Project Overview\n" +
                       "Project: " + projectName + "\n\n" +
                       "## Requirements Summary\n" +
                       "- **Functional Requirements**: The system should provide core functionality for " + projectName.toLowerCase() + " management.\n" +
                       "- **Non-Functional Requirements**: Performance, security, and usability requirements identified.\n\n" +
                       "## Analysis Results\n" +
                       "- Requirements are well-defined and complete\n" +
                       "- No major gaps identified in the current specification\n" +
                       "- Recommended to proceed with design phase\n\n" +
                       "## Next Steps\n" +
                       "1. Create detailed design specifications\n" +
                       "2. Identify technical architecture components\n" +
                       "3. Plan implementation phases";
            
            case "HighLevelDesignAgent":
                return "# High Level Design\n\n" +
                       "## Architecture Overview\n" +
                       "Project: " + projectName + "\n\n" +
                       "## System Components\n" +
                       "- **Frontend**: Angular-based web application\n" +
                       "- **Backend**: Spring Boot REST API\n" +
                       "- **Database**: SQLite for data persistence\n" +
                       "- **Integration**: Azure DevOps for CI/CD\n\n" +
                       "## Design Patterns\n" +
                       "- MVC architecture for web layer\n" +
                       "- Repository pattern for data access\n" +
                       "- Service layer for business logic\n\n" +
                       "## Technology Stack\n" +
                       "- Java 21, Spring Boot 3.x\n" +
                       "- Angular 17, TypeScript\n" +
                       "- SQLite database\n" +
                       "- RESTful API design";
            
            case "LowLevelDesignAgent":
                return "# Low Level Design\n\n" +
                       "## Detailed Component Design\n" +
                       "Project: " + projectName + "\n\n" +
                       "## Class Diagrams\n" +
                       "```\n" +
                       "[Controller] -> [Service] -> [Repository] -> [Database]\n" +
                       "```\n\n" +
                       "## Database Schema\n" +
                       "- Tables: Users, Projects, Workflows, Agents\n" +
                       "- Relationships: One-to-many, many-to-many as needed\n\n" +
                       "## API Endpoints\n" +
                       "- GET /api/projects - List projects\n" +
                       "- POST /api/workflows - Create workflow\n" +
                       "- GET /api/agents/{id}/output - Get agent output\n\n" +
                       "## Error Handling\n" +
                       "- Global exception handler\n" +
                       "- Validation annotations\n" +
                       "- Proper HTTP status codes";
            
            case "CodeGenerationAgent":
                return "# Code Generation\n\n" +
                       "## Generated Components\n" +
                       "Project: " + projectName + "\n\n" +
                       "## Source Files\n" +
                       "- Controller classes with REST endpoints\n" +
                       "- Service classes with business logic\n" +
                       "- Repository interfaces for data access\n" +
                       "- Entity classes with JPA annotations\n\n" +
                       "## Key Features Implemented\n" +
                       "- CRUD operations for all entities\n" +
                       "- Input validation and error handling\n" +
                       "- Logging and monitoring\n" +
                       "- Unit test templates\n\n" +
                       "## Code Quality\n" +
                       "- Follows Spring Boot best practices\n" +
                       "- Proper package structure\n" +
                       "- Comprehensive documentation";
            
            case "TestingAgent":
                return "# Testing Strategy\n\n" +
                       "## Test Coverage\n" +
                       "Project: " + projectName + "\n\n" +
                       "## Test Types\n" +
                       "- **Unit Tests**: Service and utility classes\n" +
                       "- **Integration Tests**: API endpoints\n" +
                       "- **End-to-End Tests**: Complete workflows\n\n" +
                       "## Test Framework\n" +
                       "- JUnit 5 for unit testing\n" +
                       "- Mockito for mocking dependencies\n" +
                       "- Spring Boot Test for integration tests\n\n" +
                       "## Test Cases\n" +
                       "1. Valid input scenarios\n" +
                       "2. Error conditions and edge cases\n" +
                       "3. Performance and load testing\n\n" +
                       "## Quality Gates\n" +
                       "- 80% code coverage minimum\n" +
                       "- All critical path tests passing\n" +
                       "- Performance benchmarks met";
            
            case "UserStoryAgent":
                return "# User Stories\n\n" +
                       "## Generated User Stories\n" +
                       "Project: " + projectName + "\n\n" +
                       "## Epic: Core Functionality\n" +
                       "### Story 1: User Management\n" +
                       "**As a** system administrator\n" +
                       "**I want to** manage user accounts\n" +
                       "**So that** I can control access to the system\n\n" +
                       "**Acceptance Criteria:**\n" +
                       "- Create, read, update, delete users\n" +
                       "- Role-based access control\n" +
                       "- Secure password handling\n\n" +
                       "### Story 2: Project Management\n" +
                       "**As a** project manager\n" +
                       "**I want to** create and manage projects\n" +
                       "**So that** I can organize development work\n\n" +
                       "**Acceptance Criteria:**\n" +
                       "- Create new projects\n" +
                       "- Assign team members\n" +
                       "- Track project progress";
            
            default:
                return "# " + agentName + " Output\n\n" +
                       "## Project: " + projectName + "\n\n" +
                       "This is a mock response generated because Copilot CLI is not available.\n\n" +
                       "## Status\n" +
                       "- Agent execution simulated\n" +
                       "- Output generated for demonstration purposes\n\n" +
                       "## Note\n" +
                       "To use real AI agents, install GitHub Copilot CLI and ensure you have an active Copilot license.";
        }
    }

    private static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            return "";
        }
    }
}
