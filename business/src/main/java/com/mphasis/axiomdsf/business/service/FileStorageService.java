package com.mphasis.axiomdsf.business.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.mphasis.axiomdsf.business.config.AgentConfigProperties;
import com.mphasis.axiomdsf.business.config.AgentPipelineProperties;
import com.mphasis.axiomdsf.persistence.entity.Requirement;
import com.mphasis.axiomdsf.persistence.entity.UserStory;
import com.mphasis.axiomdsf.persistence.entity.Workflow;
import com.mphasis.axiomdsf.persistence.entity.Workspace;
import com.mphasis.axiomdsf.persistence.port.out.RequirementPersistencePort;
import com.mphasis.axiomdsf.persistence.port.out.UserStoryPersistencePort;
import com.mphasis.axiomdsf.persistence.port.out.WorkflowPersistencePort;

import jakarta.annotation.PostConstruct;

@Service
public class FileStorageService {

    private static final Logger logger = LoggerFactory.getLogger(FileStorageService.class);
    private static final String WORKSPACES_ROOT = "workspaces";

    private final AgentPipelineProperties pipelineProperties;
    private final UserStoryPersistencePort userStoryPort;
    private final RequirementPersistencePort requirementPort;
    private final WorkflowPersistencePort workflowPort;

    public FileStorageService(AgentPipelineProperties pipelineProperties,
                              UserStoryPersistencePort userStoryPort,
                              RequirementPersistencePort requirementPort,
                              WorkflowPersistencePort workflowPort) {
        this.pipelineProperties = pipelineProperties;
        this.userStoryPort = userStoryPort;
        this.requirementPort = requirementPort;
        this.workflowPort = workflowPort;
    }

    /**
     * Ensure workspace root directory exists on application startup.
     * Data is now preserved across restarts (schema.sql uses IF NOT EXISTS).
     */
    @PostConstruct
    public void ensureWorkspacesRootExists() {
        Path workspacesRoot = Paths.get(WORKSPACES_ROOT).toAbsolutePath();
        try {
            Files.createDirectories(workspacesRoot);
            logger.info("Workspaces root directory ready: {}", workspacesRoot);
        } catch (IOException e) {
            logger.warn("Could not create workspaces root directory: {}", workspacesRoot, e);
        }
    }

    private void deleteDirectoryIfExists(Path dir) {
        if (!Files.exists(dir)) return;
        logger.info("Attempting to clean up directory: {}", dir);

        // Retry up to 5 times with increasing delays to handle file locks (e.g. VS Code watchers)
        for (int attempt = 1; attempt <= 5; attempt++) {
            // Try Java NIO walk + delete
            try (Stream<Path> walker = Files.walk(dir)) {
                walker.sorted(Comparator.reverseOrder())
                        .forEach(path -> {
                            try {
                                Files.delete(path);
                            } catch (IOException e) {
                                // Silently skip on intermediate attempts
                            }
                        });
            } catch (IOException e) {
                // ignore
            }

            if (!Files.exists(dir)) {
                logger.info("Cleaned up workspaces directory: {} (attempt {})", dir, attempt);
                return;
            }

            // Fallback: OS-level forced delete
            try {
                String os = System.getProperty("os.name", "").toLowerCase();
                Process p;
                if (os.contains("win")) {
                    p = new ProcessBuilder("cmd", "/c", "rmdir", "/s", "/q", dir.toString())
                            .redirectErrorStream(true).start();
                } else {
                    p = new ProcessBuilder("rm", "-rf", dir.toString())
                            .redirectErrorStream(true).start();
                }
                p.waitFor(10, TimeUnit.SECONDS);
            } catch (Exception e) {
                // ignore
            }

            if (!Files.exists(dir)) {
                logger.info("Cleaned up workspaces directory: {} (attempt {}, OS-level)", dir, attempt);
                return;
            }

            // Wait before retry — gives VS Code file watchers time to release locks
            logger.info("Directory still locked, retrying in {}s... (attempt {}/5)", attempt, attempt);
            try {
                Thread.sleep(attempt * 1000L);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            }
        }

        if (Files.exists(dir)) {
            logger.warn("Could not fully delete directory after 5 attempts: {}", dir);
        }
    }

    public Path getWorkspaceDir(Workspace workspace) {
        return Paths.get(WORKSPACES_ROOT,
                "workspace-" + workspace.getId() + "_" + workspace.getProjectName());
    }

    public void createWorkspaceDirectories(Workspace workspace) throws IOException {
        Path wsDir = getWorkspaceDir(workspace);
        Files.createDirectories(wsDir.resolve("requirements"));
        Files.createDirectories(wsDir.resolve("workflows"));
        Files.createDirectories(wsDir.resolve("events"));
        Files.createDirectories(wsDir.resolve("logs"));
        Files.createDirectories(wsDir.resolve("orchestrator"));

        String agentsFolder = workspace.getProjectName() + "_agents";
        // Only create folders for shared agents (1-3); UserStoryAgent (4) output goes to DB/work items,
        // per-story agents (5-10) are created dynamically
        for (AgentConfigProperties agent : pipelineProperties.getEnabledAgentsInOrder()) {
            int order = agent.getExecutionOrder();
            if (order <= 3) {
                Files.createDirectories(wsDir.resolve(agentsFolder).resolve(agent.getAgentName()));
            }
        }

        logger.info("Created workspace directories at: {}", wsDir);
    }

    public void saveMetadata(Workspace workspace) throws IOException {
        Path metaPath = getWorkspaceDir(workspace).resolve("metadata.json");
        String json = String.format(
                "{\n  \"id\" : %d,\n  \"projectName\" : \"%s\",\n  \"techStack\" : %s,\n  \"location\" : %s,\n  \"description\" : %s,\n  \"status\" : %s\n}",
                workspace.getId(),
                workspace.getProjectName(),
                workspace.getTechStack() != null ? "\"" + workspace.getTechStack() + "\"" : "null",
                workspace.getLocation() != null ? "\"" + workspace.getLocation() + "\"" : "null",
                workspace.getDescription() != null ? "\"" + workspace.getDescription() + "\"" : "null",
                workspace.isStatus());
        Files.writeString(metaPath, json);
    }

    public void saveRequirement(Workspace workspace, Long requirementId, String requirementText) throws IOException {
        Path reqDir = getWorkspaceDir(workspace).resolve("requirements").resolve("requirement-" + requirementId);
        Files.createDirectories(reqDir);
        Files.writeString(reqDir.resolve("requirement.txt"), requirementText);
        logger.debug("Saved requirement text to: {}", reqDir);
    }

    public Path getAgentInputPath(Workspace workspace, String agentName) {
        return getAgentInputPath(workspace, agentName, null);
    }

    /**
     * Get agent input path, optionally scoped to a specific user story.
     * Per-story agents (order >= 5) use: AgentName/US-{storyId}/AgentName_Input.md
     */
    public Path getAgentInputPath(Workspace workspace, String agentName, Long userStoryId) {
        String agentsFolder = workspace.getProjectName() + "_agents";
        Path agentDir = getWorkspaceDir(workspace).resolve(agentsFolder).resolve(agentName);
        if (userStoryId != null && isPerStoryAgent(agentName)) {
            agentDir = agentDir.resolve("US-" + userStoryId);
        }
        return agentDir.resolve(agentName + "_Input.md");
    }

    public Path getAgentOutputPath(Workspace workspace, String agentName) {
        return getAgentOutputPath(workspace, agentName, null);
    }

    /**
     * Get agent output path, optionally scoped to a specific user story.
     * Per-story agents (order >= 5) use: AgentName/US-{storyId}/AgentName_Output.md
     */
    public Path getAgentOutputPath(Workspace workspace, String agentName, Long userStoryId) {
        String agentsFolder = workspace.getProjectName() + "_agents";
        Path agentDir = getWorkspaceDir(workspace).resolve(agentsFolder).resolve(agentName);
        if (userStoryId != null && isPerStoryAgent(agentName)) {
            agentDir = agentDir.resolve("US-" + userStoryId);
        }
        return agentDir.resolve(agentName + "_Output.md");
    }

    /**
     * Check if an agent is a per-story agent (execution order >= 5).
     */
    public boolean isPerStoryAgent(String agentName) {
        return pipelineProperties.getAgentByName(agentName)
                .map(a -> a.getExecutionOrder() >= 5)
                .orElse(false);
    }

    /**
     * Build the combined input file for an agent by merging outputs of its dependencies.
     * For the first agent, the input is the requirement text itself.
     * For per-story agents, includes the specific user story content.
     */
    public void prepareAgentInput(Workspace workspace, Long requirementId, String agentName) throws IOException {
        prepareAgentInput(workspace, requirementId, agentName, null);
    }

    /**
     * Build the combined input file for an agent by merging outputs of its dependencies.
     * For the first agent, the input is the requirement text itself.
     * For per-story agents (TDD/LLD/Coding etc.), scopes input/output to the user story.
     *
     * DYNAMIC DEPENDENCY RESOLUTION: When a dependency agent was skipped (deselected),
     * the system automatically collects ALL available outputs from previous agents
     * in execution order. This ensures the pipeline never breaks when agents are removed.
     */
    public void prepareAgentInput(Workspace workspace, Long requirementId, String agentName, Long userStoryId) throws IOException {
        AgentConfigProperties agentConfig = pipelineProperties.getAgentByName(agentName)
                .orElseThrow(() -> new IllegalArgumentException("Unknown agent: " + agentName));

        Path inputPath = getAgentInputPath(workspace, agentName, userStoryId);
        Files.createDirectories(inputPath.getParent());

        List<String> deps = agentConfig.getDependencies();
        if (deps == null || deps.isEmpty()) {
            // First agent — use the requirement text as input
            Path reqFile = getWorkspaceDir(workspace)
                    .resolve("requirements")
                    .resolve("requirement-" + requirementId)
                    .resolve("requirement.txt");
            if (Files.exists(reqFile)) {
                String content = "# Input for " + agentName + "\n\n## Requirement\n\n" + Files.readString(reqFile);
                Files.writeString(inputPath, content);
            } else {
                // Fallback: read requirement text from database and save to disk
                logger.warn("Requirement file not found at {}, falling back to database", reqFile);
                Requirement req = requirementPort.findByWorkspaceId(workspace.getId()).stream()
                        .filter(r -> r.getId().equals(requirementId))
                        .findFirst().orElse(null);
                if (req != null && req.getRequirementText() != null) {
                    saveRequirement(workspace, requirementId, req.getRequirementText());
                    String content = "# Input for " + agentName + "\n\n## Requirement\n\n" + req.getRequirementText();
                    Files.writeString(inputPath, content);
                    logger.info("Recovered requirement text from DB and saved to disk");
                } else {
                    throw new IOException("No requirement text found for requirement " + requirementId);
                }
            }
        } else {
            StringBuilder combined = new StringBuilder();
            combined.append("# Input for ").append(agentName).append("\n\n");

            // For per-story agents, include the specific user story's content
            if (userStoryId != null && isPerStoryAgent(agentName)) {
                UserStory story = userStoryPort.findById(userStoryId).orElse(null);
                if (story != null && story.getUserStoryText() != null) {
                    combined.append("## User Story (").append(story.getStoryId())
                            .append(": ").append(story.getTitle()).append(")\n\n");
                    combined.append(story.getUserStoryText()).append("\n\n");
                }
            }

            // Collect outputs from declared dependencies
            for (String depType : deps) {
                pipelineProperties.getAgents().stream()
                        .filter(a -> a.getAgentType().equals(depType))
                        .findFirst()
                        .ifPresent(depAgent -> {
                            if (userStoryId != null && isPerStoryAgent(agentName)
                                    && "UserStoryAgent".equals(depAgent.getAgentName())) {
                                return; // already included above from DB
                            }
                            Long depStoryId = (userStoryId != null && isPerStoryAgent(depAgent.getAgentName()))
                                    ? userStoryId : null;
                            Path depOutput = getAgentOutputPath(workspace, depAgent.getAgentName(), depStoryId);
                            if (Files.exists(depOutput)) {
                                try {
                                    String content = Files.readString(depOutput);
                                    combined.append("## ").append(depAgent.getAgentName()).append(" Output\n\n");
                                    combined.append(content);
                                    combined.append("\n\n");
                                } catch (IOException e) {
                                    logger.warn("Could not read dependency output: {}", depOutput, e);
                                }
                            }
                        });
            }

            // DYNAMIC FALLBACK: If none of the declared dependencies produced output
            // (because they were skipped/deselected), gather outputs from ALL previous
            // agents in execution order. This ensures the chain never breaks.
            if (!combined.toString().contains(" Output\n\n")) {
                logger.info("No declared dependency outputs found for {}. Resolving dynamically from previous agents.", agentName);
                int currentOrder = agentConfig.getExecutionOrder();
                List<AgentConfigProperties> previousAgents = pipelineProperties.getEnabledAgentsInOrder().stream()
                        .filter(a -> a.getExecutionOrder() < currentOrder)
                        .toList();

                for (AgentConfigProperties prev : previousAgents) {
                    if (userStoryId != null && isPerStoryAgent(agentName)
                            && "UserStoryAgent".equals(prev.getAgentName())) {
                        continue; // already included from DB
                    }
                    Long prevStoryId = (userStoryId != null && isPerStoryAgent(prev.getAgentName()))
                            ? userStoryId : null;
                    Path prevOutput = getAgentOutputPath(workspace, prev.getAgentName(), prevStoryId);
                    if (Files.exists(prevOutput)) {
                        try {
                            String content = Files.readString(prevOutput);
                            combined.append("## ").append(prev.getAgentName()).append(" Output\n\n");
                            combined.append(content);
                            combined.append("\n\n");
                        } catch (IOException e) {
                            logger.warn("Could not read fallback output: {}", prevOutput, e);
                        }
                    }
                }
            }

            // Append wiki URLs of previous agent outputs as references
            try {
                List<Workflow> prevWorkflows = workflowPort.findByWorkspaceAndRequirement(
                        workspace.getId(), requirementId);
                List<String> wikiRefs = new ArrayList<>();
                for (Workflow wf : prevWorkflows) {
                    if (wf.getOutputWikiUrl() != null && !wf.getOutputWikiUrl().isBlank()
                            && !wf.getAgentName().equals(agentName)) {
                        wikiRefs.add("- **" + wf.getAgentName() + " Output**: " + wf.getOutputWikiUrl());
                    }
                }
                if (!wikiRefs.isEmpty()) {
                    combined.append("## Previous Agent Wiki References\n\n");
                    for (String ref : wikiRefs) {
                        combined.append(ref).append("\n");
                    }
                    combined.append("\n");
                }
            } catch (Exception e) {
                logger.warn("Could not fetch wiki URLs for agent {} input: {}", agentName, e.getMessage());
            }

            Files.writeString(inputPath, combined.toString());
        }

        logger.info("Prepared input for agent {} at: {}", agentName, inputPath);
    }

    /**
     * Prepare rework input: combines comments + previous output + original input.
     */
    public void prepareReworkInput(Workspace workspace, String agentName, String comments) throws IOException {
        prepareReworkInput(workspace, agentName, comments, null);
    }

    public void prepareReworkInput(Workspace workspace, String agentName, String comments, Long userStoryId) throws IOException {
        Path currentInput = getAgentInputPath(workspace, agentName, userStoryId);
        Path currentOutput = getAgentOutputPath(workspace, agentName, userStoryId);

        StringBuilder reworkInput = new StringBuilder();
        reworkInput.append("# REWORK Input for ").append(agentName).append("\n\n");
        reworkInput.append("## Reviewer Comments\n\n").append(comments).append("\n\n");

        if (Files.exists(currentOutput)) {
            reworkInput.append("## Previous Output\n\n").append(Files.readString(currentOutput)).append("\n\n");
        }

        if (Files.exists(currentInput)) {
            reworkInput.append("## Original Input\n\n").append(Files.readString(currentInput)).append("\n\n");
        }

        Files.writeString(currentInput, reworkInput.toString());
        logger.info("Prepared rework input for agent {}", agentName);
    }

    public String readAgentOutput(Workspace workspace, String agentName) throws IOException {
        Path outputPath = getAgentOutputPath(workspace, agentName);
        if (!Files.exists(outputPath)) {
            throw new IllegalStateException("Agent output not found: " + outputPath);
        }
        return Files.readString(outputPath);
    }

    public String readAgentOutput(Workspace workspace, String agentName, Long userStoryId) throws IOException {
        Path outputPath = getAgentOutputPath(workspace, agentName, userStoryId);
        if (!Files.exists(outputPath)) {
            // Fallback to non-userStory path
            outputPath = getAgentOutputPath(workspace, agentName);
        }
        if (!Files.exists(outputPath)) {
            throw new IllegalStateException("Agent output not found: " + outputPath);
        }
        return Files.readString(outputPath);
    }

    /**
     * Read the output of agent at the given execution order number.
     */
    public String readAgentOutputByOrder(Workspace workspace, int agentNumber) throws IOException {
        return readAgentOutputByOrder(workspace, agentNumber, null);
    }

    /**
     * Read the output of agent at the given execution order number, optionally scoped to a user story.
     * For per-story agents called without a userStoryId, aggregates outputs from all US-* subdirectories.
     */
    public String readAgentOutputByOrder(Workspace workspace, int agentNumber, Long userStoryId) throws IOException {
        AgentConfigProperties agent = pipelineProperties.getAgentByOrder(agentNumber)
                .orElseThrow(() -> new IllegalArgumentException("No agent found at position: " + agentNumber));
        String agentName = agent.getAgentName();

        // If a specific story is requested, read that directly
        if (userStoryId != null) {
            Path outputPath = getAgentOutputPath(workspace, agentName, userStoryId);
            if (!Files.exists(outputPath)) {
                outputPath = getAgentOutputPath(workspace, agentName, null);
            }
            if (!Files.exists(outputPath)) {
                throw new IllegalStateException("Agent output not found: " + outputPath);
            }
            return Files.readString(outputPath);
        }

        // For per-story agents without a specific story: aggregate all US-* subdirectories
        if (isPerStoryAgent(agentName)) {
            String agentsFolder = workspace.getProjectName() + "_agents";
            Path agentDir = getWorkspaceDir(workspace).resolve(agentsFolder).resolve(agentName);
            if (Files.isDirectory(agentDir)) {
                StringBuilder aggregated = new StringBuilder();
                try (var dirs = Files.list(agentDir)) {
                    List<Path> storyDirs = dirs
                            .filter(Files::isDirectory)
                            .filter(p -> p.getFileName().toString().startsWith("US-"))
                            .sorted()
                            .toList();
                    for (Path storyDir : storyDirs) {
                        Path outFile = storyDir.resolve(agentName + "_Output.md");
                        if (Files.exists(outFile)) {
                            String storyLabel = storyDir.getFileName().toString(); // e.g. US-3
                            if (aggregated.length() > 0) aggregated.append("\n\n---\n\n");
                            aggregated.append("## ").append(storyLabel).append("\n\n");
                            aggregated.append(Files.readString(outFile));
                        }
                    }
                }
                if (aggregated.length() > 0) {
                    return aggregated.toString();
                }
            }
            // Fall through: try non-scoped path as final fallback
        }

        // Shared agent or fallback: read from non-scoped path
        Path outputPath = getAgentOutputPath(workspace, agentName, null);
        if (!Files.exists(outputPath)) {
            throw new IllegalStateException("Agent output not found: " + outputPath);
        }
        return Files.readString(outputPath);
    }

    // --- User Story Parsing & File Splitting ---

    private static final Pattern STORY_ID_PATTERN = Pattern.compile(
            "\\*\\*Story\\s+ID\\*\\*:\\s*(US-\\d+)",
            Pattern.CASE_INSENSITIVE
    );

    private static final Pattern STORY_TITLE_PATTERN = Pattern.compile(
            "\\*\\*Title\\*\\*:\\s*(.+)",
            Pattern.CASE_INSENSITIVE
    );

    private static final Pattern STORY_PRIORITY_PATTERN = Pattern.compile(
            "\\*\\*Priority\\*\\*:\\s*(P[012])",
            Pattern.CASE_INSENSITIVE
    );

    /**
     * Parse the UserStoryAgent combined output into individual story blocks.
     * Returns a list of maps, each containing: storyId, title, priority, content.
     *
     * Detection strategy:
     * 1. Find every line that contains a **Story ID**: US-XXX marker.
     * 2. Walk backwards from that line to find the nearest heading (# or ## or ###)
     *    that starts the story section — this becomes the real start of the block.
     * 3. Each story block runs from its real start until just before the next story's
     *    real start (or end of file for the last story).
     */
    public List<Map<String, String>> parseUserStories(String outputContent) {
        List<Map<String, String>> stories = new ArrayList<>();
        if (outputContent == null || outputContent.isBlank()) return stories;

        String[] lines = outputContent.split("\n", -1);

        // Phase 1: locate every Story ID line and walk back to find the section heading
        List<int[]> storyRanges = new ArrayList<>(); // each entry: [startLine, idLine]
        for (int i = 0; i < lines.length; i++) {
            Matcher idMatcher = STORY_ID_PATTERN.matcher(lines[i]);
            if (idMatcher.find()) {
                // Walk backwards to find the section heading for this story
                int sectionStart = i;
                for (int h = i - 1; h >= 0; h--) {
                    String trimmed = lines[h].trim();
                    if (trimmed.startsWith("#")) {
                        sectionStart = h;
                        break;
                    }
                    // Stop walking if we hit a non-blank, non-heading, non-metadata line
                    // that looks like content from a previous story
                    if (!trimmed.isEmpty() && !trimmed.equals("---")
                            && !trimmed.startsWith("**") && !trimmed.startsWith("- ")
                            && !trimmed.matches("^\\d+\\.\\s+.*")) {
                        break;
                    }
                }
                storyRanges.add(new int[]{sectionStart, i});
            }
        }

        if (storyRanges.isEmpty()) {
            logger.warn("No Story ID markers found in UserStoryAgent output");
            return stories;
        }

        // Phase 2: determine end boundaries — each story ends just before the next story starts
        for (int s = 0; s < storyRanges.size(); s++) {
            int storyStart = storyRanges.get(s)[0];
            int storyEnd;
            if (s + 1 < storyRanges.size()) {
                storyEnd = storyRanges.get(s + 1)[0] - 1;
                // Trim trailing blank lines and separators
                while (storyEnd > storyStart && (lines[storyEnd].isBlank() || lines[storyEnd].trim().equals("---"))) {
                    storyEnd--;
                }
            } else {
                storyEnd = lines.length - 1;
                // Trim trailing blanks from last story
                while (storyEnd > storyStart && lines[storyEnd].isBlank()) {
                    storyEnd--;
                }
            }

            // Extract story metadata from the block
            StringBuilder storyContent = new StringBuilder();
            String storyId = null;
            String title = null;
            String priority = null;

            for (int i = storyStart; i <= storyEnd; i++) {
                storyContent.append(lines[i]).append("\n");

                if (storyId == null) {
                    Matcher m = STORY_ID_PATTERN.matcher(lines[i]);
                    if (m.find()) storyId = m.group(1);
                }
                if (title == null) {
                    Matcher m = STORY_TITLE_PATTERN.matcher(lines[i]);
                    if (m.find()) title = m.group(1).trim();
                }
                if (priority == null) {
                    Matcher m = STORY_PRIORITY_PATTERN.matcher(lines[i]);
                    if (m.find()) priority = m.group(1).toUpperCase();
                }
            }

            if (storyId != null) {
                Map<String, String> story = new LinkedHashMap<>();
                story.put("storyId", storyId);
                story.put("title", title != null ? title : "Untitled");
                story.put("priority", priority != null ? priority : "P1");
                story.put("content", storyContent.toString().trim());
                stories.add(story);
            }
        }

        logger.info("Parsed {} user stories from output", stories.size());
        return stories;
    }

    /**
     * Parse user stories by scanning the UserStoryAgent directory for individual US-*.md files.
     * This is a fallback when the combined output file is missing or doesn't contain story markers.
     * Each individual file (e.g., US-001-Owner-Registration-and-Login.md) is read and parsed.
     */
    public List<Map<String, String>> parseUserStoriesFromDirectory(Workspace workspace) {
        List<Map<String, String>> allStories = new ArrayList<>();
        Path agentDir = getAgentOutputPath(workspace, "UserStoryAgent").getParent();

        if (!Files.isDirectory(agentDir)) {
            logger.warn("UserStoryAgent directory does not exist: {}", agentDir);
            return allStories;
        }

        try (Stream<Path> entries = Files.list(agentDir)) {
            // Collect US-*.md files at top level AND .md files inside US-XXX/ subdirectories
            List<Path> storyFiles = new ArrayList<>();

            entries.sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .forEach(p -> {
                        String name = p.getFileName().toString();
                        if (name.matches("US-\\d+.*\\.md") && Files.isRegularFile(p)) {
                            // Direct US-*.md file at top level
                            storyFiles.add(p);
                        } else if (name.matches("US-\\d+") && Files.isDirectory(p)) {
                            // US-XXX/ subdirectory — look for .md files inside
                            try (Stream<Path> subFiles = Files.list(p)) {
                                subFiles.filter(sf -> sf.getFileName().toString().endsWith(".md") && Files.isRegularFile(sf))
                                        .forEach(storyFiles::add);
                            } catch (IOException e) {
                                logger.error("Failed to list subdirectory: {}", p, e);
                            }
                        }
                    });

            logger.info("Found {} individual story files in {}", storyFiles.size(), agentDir);

            for (Path storyFile : storyFiles) {
                try {
                    String content = Files.readString(storyFile);
                    List<Map<String, String>> parsed = parseUserStories(content);
                    if (!parsed.isEmpty()) {
                        Map<String, String> story = parsed.get(0);
                        story.put("filePath", storyFile.toString());
                        allStories.add(story);
                        logger.debug("Parsed story {} from file: {}", story.get("storyId"), storyFile.getFileName());
                    } else {
                        logger.warn("No story markers found in file: {}", storyFile.getFileName());
                    }
                } catch (IOException e) {
                    logger.error("Failed to read story file: {}", storyFile, e);
                }
            }
        } catch (IOException e) {
            logger.error("Failed to list UserStoryAgent directory: {}", agentDir, e);
        }

        logger.info("Parsed {} user stories from individual files in directory", allStories.size());
        return allStories;
    }

    /**
     * Split the UserStoryAgent output into individual .md files in per-story subfolders.
     * Structure: UserStoryAgent/US-001/US-001-Title.md, UserStoryAgent/US-002/US-002-Title.md, etc.
     * INDEX.md is at the agent directory level.
     * Returns the list of created file paths.
     */
    public List<Path> splitUserStoriesToFiles(Workspace workspace, List<Map<String, String>> stories) throws IOException {
        Path agentDir = getAgentOutputPath(workspace, "UserStoryAgent").getParent();
        List<Path> createdFiles = new ArrayList<>();

        for (Map<String, String> story : stories) {
            String storyId = story.get("storyId");
            String title = story.get("title");
            String content = story.get("content");

            // Build filename: US-001-Story-Title.md
            String safeName = title.replaceAll("[^A-Za-z0-9\\s-]", "")
                    .trim()
                    .replaceAll("\\s+", "-");
            if (safeName.length() > 60) safeName = safeName.substring(0, 60);
            String fileName = storyId + "-" + safeName + ".md";

            // Create per-story subfolder: UserStoryAgent/<storyId>/
            Path storyFolder = agentDir.resolve(storyId);
            Files.createDirectories(storyFolder);
            Path storyFile = storyFolder.resolve(fileName);
            Files.writeString(storyFile, content);
            createdFiles.add(storyFile);
            logger.debug("Created user story file: {}", storyFile);
        }

        // Create INDEX.md at the agent directory level (outside story folders)
        if (!stories.isEmpty()) {
            StringBuilder index = new StringBuilder("# User Stories Index\n\n");
            for (Map<String, String> story : stories) {
                index.append("- [").append(story.get("storyId")).append("] ")
                        .append(story.get("title"))
                        .append(" (").append(story.get("priority")).append(")\n");
            }
            Path indexFile = agentDir.resolve("INDEX.md");
            Files.writeString(indexFile, index.toString());
            createdFiles.add(indexFile);
            logger.debug("Created INDEX.md at: {}", indexFile);
        }

        logger.info("Split {} user stories into individual files at: {}", stories.size(), agentDir);
        return createdFiles;
    }
}
