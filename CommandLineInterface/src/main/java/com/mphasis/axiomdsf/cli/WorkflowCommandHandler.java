package com.mphasis.axiomdsf.cli;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Handles all workflow-related CLI commands using local file-based orchestration.
 * Manages the 10-agent SDLC pipeline by preparing input files, tracking state,
 * and watching for agent output files.
 */
public class WorkflowCommandHandler {

    private final WorkspaceManager workspaceManager;
    private final Path projectRoot;
    private final String copilotCommand;
    private final String copilotModel;
    private final LocalPersistenceHelper persistence;
    private static final Logger logger = LoggerFactory.getLogger(WorkflowCommandHandler.class);
    private static final int POLL_INTERVAL_MS = 3000;
    private static final int MAX_POLL_ATTEMPTS = 6000; // ~5 hours max
    private static final int COPILOT_TIMEOUT_MINUTES = 240; // 4 hours

    // Patterns matching Copilot CLI tool-use log lines, session stats, and agent narration
    private static final Pattern CLI_NOISE_LINE = Pattern.compile(
            "^(●|✗|\\u25CF|\\u2717"                                     // tool-use bullet markers
                    + "|  └|  \\u2514"                                     // indented tree chars
                    + "|  Path does not|Path does not exist"              // path errors
                    + "|Total usage est:|API time spent:|Total session time:"  // session stats
                    + "|Total code changes:|Breakdown by AI model:|\\s+gpt-|\\s+claude-" // model stats
                    + "|.*stored at:.*_Output|.*stored at:.*_agents/"    // file stored msgs
                    + "|\\d+ lines? read|\\d+ files? found"              // read/find counts
                    + "|\\s+lines \\d+-\\d+"                              // line range refs
                    + "|  \\S+_agents[/\\\\]"                              // agent path refs
                    + "|Est\\. \\d+.*Premium"                              // usage estimates
                    + "|\\d+[km]? (in|out|cached)"                        // token counts
                    + ")"
    );

    // Patterns matching agent narration/thinking lines (not markdown content)
    private static final Pattern NARRATION_LINE = Pattern.compile(
            "^(Now I'll |Let me |I'll now |I need to |I apologize|Based on my analysis"
                    + "|Perfect\\.|Here's what |I have |Since I cannot|Given the "
                    + "|Would you like me to|The refined requirement"
                    + "|Now creating|I should |Let me create|Let me generate"
                    + "|Now I need|I cannot directly|Let me prepare"
                    + "|Summary of |## Summary of "
                    + "|I see that |I'll create|Actually,|I'll need to|I'll write"
                    + "|First, |Given the constraints|I realize"
                    + "|Let me (check|update|enhance|examine|use|read)"
                    + "|Based on the instructions|I should use"
                    + "|\\*\\*Agent Assignment\\*\\*"
                    + ")",
            Pattern.CASE_INSENSITIVE
    );

    // Lines that are PowerShell/shell script artifacts or JSON schema fragments — not markdown content
    private static final Pattern SCRIPT_LINE = Pattern.compile(
            "^(\\$\\w+\\s*=|Set-Content |New-Item |Get-Content |Write-Host |Out-File "
                    + "|\"@$|^\"@|^@\"|\\$outputPath|\\$markdownContent|\\$jsonContent"
                    + "|-Path |-Value |-Encoding "
                    + "|\\s*lines \\d+-\\d+|\\s*lines \\d+-end"
                    + "|# (Write |Create |Read |Check |Run |Build |Copy |Store |Save |Output |Delete |Set |Get |Update )"
                    + ")"
    );

    public WorkflowCommandHandler(WorkspaceManager workspaceManager, LocalPersistenceHelper persistence) {
        this.workspaceManager = workspaceManager;
        this.persistence = persistence;
        this.projectRoot = workspaceManager.getWorkspacesRoot().getParent();
        this.copilotCommand = detectCopilotCommand();
        this.copilotModel = detectCopilotModel();
    }

    /**
     * Detect the model override from system property or config.
     * Set via: -Dagent.execution.model=gpt-4.1
     */
    private String detectCopilotModel() {
        String m = System.getProperty("agent.execution.model", "").trim();
        if (!m.isEmpty()) {
            logger.info("Copilot model override: {}", m);
            return m;
        }
        return null;
    }

    private String detectCopilotCommand() {
        // Try to find copilot.cmd on the system
        for (String cmd : new String[]{"copilot.cmd", "copilot"}) {
            try {
                Process p = new ProcessBuilder(cmd, "--version")
                        .redirectErrorStream(true)
                        .start();
                boolean done = p.waitFor(5, TimeUnit.SECONDS);
                if (done && p.exitValue() == 0) {
                    logger.info("Copilot CLI found: {}", cmd);
                    return cmd;
                }
                if (!done) p.destroyForcibly();
            } catch (Exception ignored) {}
        }
        logger.warn("Copilot CLI not found on PATH. Will poll for manual agent invocation.");
        return null;
    }

    public void handle(CommandParser cmd) {
        switch (cmd.getAction()) {
            case "start":
                handleStart(cmd);
                break;
            case "status":
                handleStatus(cmd);
                break;
            case "approve":
                handleApprove(cmd);
                break;
            case "output":
                handleOutput(cmd);
                break;
            case "all":
                handleAll();
                break;
            case "run-agent":
                handleRunAgent(cmd);
                break;
            case "pick-story":
                handlePickStory(cmd);
                break;
            case "approve-story":
                handleApproveStory(cmd);
                break;
            case "story-status":
                handleStoryStatus(cmd);
                break;
            default:
                System.out.println("Unknown workflow command: " + cmd.getAction());
                System.out.println("Available: start | status | approve | output | all | run-agent | pick-story | approve-story | story-status");
                break;
        }
    }

    // --- workflow start ---

    private void handleStart(CommandParser cmd) {
        int workspaceId = cmd.requireIntArg("workspace");

        try {
            PipelineState state = workspaceManager.loadState(workspaceId);
            if (state == null) {
                ConsolePrinter.printError("Workspace not found: " + workspaceId);
                return;
            }
            state.setWorkspaceId(workspaceId);

            // Get requirement text
            String requirementText;
            if (cmd.hasArg("file")) {
                Path filePath = Paths.get(cmd.getArg("file"));
                if (!Files.exists(filePath)) {
                    ConsolePrinter.printError("File not found: " + filePath);
                    return;
                }
                requirementText = Files.readString(filePath);
            } else if (cmd.hasArg("text")) {
                requirementText = cmd.getArg("text");
            } else {
                ConsolePrinter.printError("Must provide either --text <requirement> or --file <filePath>");
                return;
            }

            String userStory = cmd.hasArg("userstory") ? cmd.getArg("userstory") : null;

            // Determine starting agent
            int startSequence = 1;
            if (cmd.hasArg("agent")) {
                AgentRegistry.AgentDef agentDef = AgentRegistry.resolve(cmd.getArg("agent"));
                if (agentDef != null) {
                    startSequence = agentDef.getSequence();
                }
            }

            // Create requirement entry
            int reqId = state.getNextRequirementId();
            PipelineState.RequirementState req = new PipelineState.RequirementState();
            req.setRequirementId(reqId);
            req.setText(requirementText);
            req.setUserStory(userStory);
            req.setCurrentAgentSequence(startSequence);
            req.setState("IN_PROGRESS");
            req.setCompletionStatus(false);
            req.setStartedAt(LocalDateTime.now().toString());
            state.getRequirements().add(req);

            // Save requirement to file
            Path wsDir = workspaceManager.findWorkspaceDir(workspaceId);
            Path reqFile = wsDir.resolve("requirements").resolve("requirement-" + reqId + ".md");
            Files.writeString(reqFile, requirementText);

            // Prepare input file for the starting agent
            AgentRegistry.AgentDef agent = AgentRegistry.getBySequence(startSequence);
            prepareAgentInput(state, req, agent, null);

            // Save state
            workspaceManager.saveState(state);

            // Record INIT and IN_PROGRESS state transitions
            String inputPath = agent.getName() + "/" + agent.getInputFileName();
            persistence.recordStateChange(workspaceId, reqId, agent,
                    null, "INIT", inputPath, null, false);
            persistence.recordStateChange(workspaceId, reqId, agent,
                    "INIT", "IN_PROGRESS", inputPath, null, false);
            persistence.logPipelineAction(workspaceId,
                    "Workflow started: requirement=" + reqId + ", agent=" + agent.getName());

            // Sync to DB via REST API (best-effort)
            persistence.syncWorkflowStartToApi(workspaceId, requirementText);

            System.out.println();
            System.out.println("  ╔══════════════════════════════════════════════════════╗");
            System.out.println("  ║  Workflow Started                                    ║");
            System.out.println("  ╠══════════════════════════════════════════════════════╣");
            System.out.printf("  ║  Agent : %-43s║%n", agent.getName() + " (#" + agent.getSequence() + ")");
            System.out.printf("  ║  State : %-43s║%n", "INIT -> IN_PROGRESS");
            System.out.println("  ╚══════════════════════════════════════════════════════╝");

            // Watch for output file
            watchForOutput(state, req, agent);

        } catch (IOException e) {
            logger.error("Failed to start workflow", e);
            ConsolePrinter.printError("Failed to start workflow: " + e.getMessage());
        }
    }

    // --- workflow status ---

    private void handleStatus(CommandParser cmd) {
        int workspaceId = cmd.requireIntArg("workspace");
        int requirementId = cmd.requireIntArg("requirement");

        try {
            PipelineState state = workspaceManager.loadState(workspaceId);
            if (state == null) {
                ConsolePrinter.printError("Workspace not found: " + workspaceId);
                return;
            }
            state.setWorkspaceId(workspaceId);

            PipelineState.RequirementState req = state.getRequirement(requirementId);
            if (req == null) {
                ConsolePrinter.printError("Requirement not found: " + requirementId);
                return;
            }

            AgentRegistry.AgentDef agent = AgentRegistry.getBySequence(req.getCurrentAgentSequence());

            // Auto-detect if output file exists
            Path agentDir = workspaceManager.getAgentDir(workspaceId, agent.getName());
            Path outputFile = agentDir.resolve(agent.getOutputFileName());
            if ("IN_PROGRESS".equals(req.getState()) && Files.exists(outputFile) && Files.size(outputFile) > 0) {
                req.setState("IN_REVIEW");
                workspaceManager.saveState(state);

                String outRef = agent.getName() + "/" + agent.getOutputFileName();
                persistence.recordStateChange(workspaceId, requirementId, agent,
                        "IN_PROGRESS", "IN_REVIEW", null, outRef, false);
            }

            System.out.println();
            System.out.println("  ╔══════════════════════════════════════════════════════╗");
            System.out.println("  ║  Workflow Status                                     ║");
            System.out.println("  ╠══════════════════════════════════════════════════════╣");
            System.out.printf("  ║  Workspace : %-39s║%n", state.getWorkspaceName() + " (#" + workspaceId + ")");
            System.out.printf("  ║  Agent     : %-39s║%n", agent.getName() + " (#" + agent.getSequence() + ")");
            System.out.printf("  ║  State     : %-39s║%n", req.getState());
            System.out.println("  ╚══════════════════════════════════════════════════════╝");

            ConsolePrinter.printPipelineStatus(req.getCurrentAgentSequence(), req.getState(), req.isCompletionStatus());
        } catch (IOException e) {
            ConsolePrinter.printError("Failed to get status: " + e.getMessage());
        }
    }

    // --- workflow approve ---

    private void handleApprove(CommandParser cmd) {
        int workspaceId = cmd.requireIntArg("workspace");
        int requirementId = cmd.requireIntArg("requirement");
        String additionalContent = cmd.hasArg("ADD") ? cmd.getArg("ADD") : null;

        try {
            PipelineState state = workspaceManager.loadState(workspaceId);
            if (state == null) {
                ConsolePrinter.printError("Workspace not found: " + workspaceId);
                return;
            }
            state.setWorkspaceId(workspaceId);

            PipelineState.RequirementState req = state.getRequirement(requirementId);
            if (req == null) {
                ConsolePrinter.printError("Requirement not found: " + requirementId);
                return;
            }

            AgentRegistry.AgentDef currentAgent = AgentRegistry.getBySequence(req.getCurrentAgentSequence());

            // Auto-detect if output file exists
            Path agentDir = workspaceManager.getAgentDir(workspaceId, currentAgent.getName());
            Path outputFile = agentDir.resolve(currentAgent.getOutputFileName());
            if ("IN_PROGRESS".equals(req.getState()) && Files.exists(outputFile) && Files.size(outputFile) > 0) {
                req.setState("IN_REVIEW");
                workspaceManager.saveState(state);

                String outRef = currentAgent.getName() + "/" + currentAgent.getOutputFileName();
                persistence.recordStateChange(workspaceId, requirementId, currentAgent,
                        "IN_PROGRESS", "IN_REVIEW", null, outRef, false);
            }

            // Display current status
            System.out.println();
            System.out.println("  ╔══════════════════════════════════════════════════════╗");
            System.out.println("  ║  Approval                                            ║");
            System.out.println("  ╠══════════════════════════════════════════════════════╣");
            System.out.printf("  ║  Agent : %-43s║%n", currentAgent.getName() + " (#" + currentAgent.getSequence() + ")");
            System.out.printf("  ║  State : %-43s║%n", req.getState());
            System.out.println("  ╚══════════════════════════════════════════════════════╝");

            if ("IN_PROGRESS".equals(req.getState())) {
                System.out.println("\n  Agent is still IN_PROGRESS. Waiting for output...");
                watchForOutput(state, req, currentAgent);
                return;
            }

            if ("COMPLETED".equals(req.getState())) {
                System.out.println("\n  Pipeline is already complete.");
                return;
            }

            if ("REJECTED".equals(req.getState())) {
                System.out.println("\n  Pipeline has been rejected. No further actions possible.");
                return;
            }

            if (!"IN_REVIEW".equals(req.getState())) {
                System.out.println("\n  Agent is in state: " + req.getState() + ". Cannot approve.");
                return;
            }

            // --ADD: Prepend additional content to the current agent's output file
            if (additionalContent != null && Files.exists(outputFile)) {
                String existingContent = Files.readString(outputFile);
                String updatedContent = additionalContent + "\n" + existingContent;
                Files.writeString(outputFile, updatedContent);
                System.out.println("  [OK] Additional content prepended to " + currentAgent.getName() + " output.");
            }

            // Get decision
            String decision;
            String comments = null;

            if (cmd.hasArg("decision")) {
                decision = cmd.getArg("decision").toUpperCase();
                comments = cmd.hasArg("comments") ? cmd.getArg("comments") : null;
            } else {
                // Interactive prompt
                System.out.println();
                System.out.println("  Choose an action:");
                System.out.println("    1. APPROVE  - Approve and move to next agent");
                System.out.println("    2. REJECT   - Reject the workflow");
                System.out.println("    3. REWORK   - Send back for rework");
                System.out.print("\n  Decision (APPROVE/REJECT/REWORK): ");
                System.out.flush();

                BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
                decision = reader.readLine();
                if (decision == null || decision.isBlank()) {
                    ConsolePrinter.printError("No decision provided.");
                    return;
                }
                decision = decision.trim().toUpperCase();

                if ("REWORK".equals(decision)) {
                    System.out.print("Enter rework comments: ");
                    System.out.flush();
                    comments = reader.readLine();
                }
            }

            if (!"APPROVE".equals(decision) && !"REJECT".equals(decision) && !"REWORK".equals(decision)) {
                ConsolePrinter.printError("Invalid decision: " + decision + ". Must be APPROVE, REJECT, or REWORK.");
                return;
            }

            applyDecision(state, req, currentAgent, decision, comments);
        } catch (IOException e) {
            ConsolePrinter.printError("Failed to approve: " + e.getMessage());
        }
    }

    private void applyDecision(PipelineState state, PipelineState.RequirementState req,
                               AgentRegistry.AgentDef currentAgent, String decision, String comments) throws IOException {
        System.out.println();

        switch (decision) {
            case "APPROVE":
                if (currentAgent.getSequence() >= AgentRegistry.getTotalAgents()) {
                    // Last agent — pipeline complete
                    req.setState("COMPLETED");
                    req.setCompletionStatus(true);
                    workspaceManager.saveState(state);

                    String outPath = currentAgent.getName() + "/" + currentAgent.getOutputFileName();
                    persistence.recordStateChange(state.getWorkspaceId(), req.getRequirementId(),
                            currentAgent, "IN_REVIEW", "APPROVED", null, outPath, true);
                    persistence.recordStateChange(state.getWorkspaceId(), req.getRequirementId(),
                            currentAgent, "APPROVED", "COMPLETED", null, outPath, true);
                    persistence.logPipelineAction(state.getWorkspaceId(),
                            "Pipeline COMPLETED for requirement=" + req.getRequirementId());
                    persistence.syncApprovalToApi(state.getWorkspaceId(), req.getRequirementId(), "APPROVE", comments);

                    System.out.println("  [OK] Pipeline Complete! All agents finished successfully.");
                    ConsolePrinter.printPipelineStatus(currentAgent.getSequence() + 1, "COMPLETED", true);
                } else {
                    // Advance to next agent
                    int nextSeq = currentAgent.getSequence() + 1;
                    AgentRegistry.AgentDef nextAgent = AgentRegistry.getBySequence(nextSeq);

                    // Intercept: UserStoryAgent (seq 4) → per-story pipeline flow
                    if (currentAgent.getSequence() == 4) {
                        req.setState("STORY_READY");
                        workspaceManager.saveState(state);

                        String curOutput = currentAgent.getName() + "/" + currentAgent.getOutputFileName();
                        persistence.recordStateChange(state.getWorkspaceId(), req.getRequirementId(),
                                currentAgent, "IN_REVIEW", "APPROVED", null, curOutput, true);
                        persistence.logPipelineAction(state.getWorkspaceId(),
                                "UserStoryAgent APPROVED — ready for per-story pipeline");
                        persistence.syncApprovalToApi(state.getWorkspaceId(), req.getRequirementId(), "APPROVE", comments);

                        System.out.println();
                        System.out.println("  ╔══════════════════════════════════════════════════════╗");
                        System.out.println("  ║  UserStoryAgent -> APPROVED                         ║");
                        System.out.println("  ╠══════════════════════════════════════════════════════╣");
                        System.out.println("  ║  Per-Story Pipeline Ready!                          ║");
                        System.out.println("  ║                                                      ║");
                        System.out.println("  ║  Next: Pick a user story to process through          ║");
                        System.out.println("  ║  TDD -> (approve) -> LLD -> (approve) -> Code:      ║");
                        System.out.println("  ║                                                      ║");
                        System.out.printf("  ║  workflow pick-story --workspace %-3d                 ║%n", state.getWorkspaceId());
                        System.out.printf("  ║    --requirement %-3d --story US-001                  ║%n", req.getRequirementId());
                        System.out.println("  ╚══════════════════════════════════════════════════════╝");
                        break;
                    }

                    req.setCurrentAgentSequence(nextSeq);
                    req.setState("IN_PROGRESS");

                    // Task 2: Prepare input for next agent with optional comments
                    prepareAgentInput(state, req, nextAgent, comments);
                    workspaceManager.saveState(state);

                    // Record state transitions for current agent approval + next agent init
                    String curOutput = currentAgent.getName() + "/" + currentAgent.getOutputFileName();
                    persistence.recordStateChange(state.getWorkspaceId(), req.getRequirementId(),
                            currentAgent, "IN_REVIEW", "APPROVED", null, curOutput, true);
                    String nextInput = nextAgent.getName() + "/" + nextAgent.getInputFileName();
                    persistence.recordStateChange(state.getWorkspaceId(), req.getRequirementId(),
                            nextAgent, null, "INIT", nextInput, null, false);
                    persistence.recordStateChange(state.getWorkspaceId(), req.getRequirementId(),
                            nextAgent, "INIT", "IN_PROGRESS", nextInput, null, false);
                    persistence.logPipelineAction(state.getWorkspaceId(),
                            "Agent " + currentAgent.getName() + " APPROVED, advancing to " + nextAgent.getName());
                    persistence.syncApprovalToApi(state.getWorkspaceId(), req.getRequirementId(), "APPROVE", comments);

                    String approveTitle = currentAgent.getName() + " -> APPROVED";
                    System.out.println();
                    System.out.println("  ╔══════════════════════════════════════════════════════╗");
                    System.out.printf("  ║  %-52s║%n", approveTitle);
                    System.out.println("  ╠══════════════════════════════════════════════════════╣");
                    System.out.printf("  ║  Next  : %-43s║%n", nextAgent.getName() + " (#" + nextSeq + ")");
                    System.out.printf("  ║  State : %-43s║%n", "IN_PROGRESS");
                    System.out.println("  ╚══════════════════════════════════════════════════════╝");

                    // Watch for output
                    watchForOutput(state, req, nextAgent);
                }
                break;

            case "REJECT":
                req.setState("REJECTED");
                workspaceManager.saveState(state);

                persistence.recordStateChange(state.getWorkspaceId(), req.getRequirementId(),
                        currentAgent, "IN_REVIEW", "REJECTED", null, null, false);
                persistence.logPipelineAction(state.getWorkspaceId(),
                        "Agent " + currentAgent.getName() + " REJECTED");
                persistence.syncApprovalToApi(state.getWorkspaceId(), req.getRequirementId(), "REJECT", comments);

                System.out.println("  [REJECTED] Workflow rejected at " + currentAgent.getName() + ".");
                break;

            case "REWORK":
                // Delete existing output to force regeneration
                Path agentDir = workspaceManager.getAgentDir(state.getWorkspaceId(), currentAgent.getName());
                Path outputFile = agentDir.resolve(currentAgent.getOutputFileName());
                if (Files.exists(outputFile)) {
                    Files.delete(outputFile);
                }
                // Delete extra output files
                for (String extra : currentAgent.getExtraOutputFiles()) {
                    Path extraFile = agentDir.resolve(extra);
                    if (Files.exists(extraFile)) Files.delete(extraFile);
                }

                // Task 1: Use default rework comments if none provided
                String reworkComments = (comments != null && !comments.isBlank()) 
                    ? comments 
                    : AgentRegistry.getDefaultReworkComment(currentAgent.getName());

                // Append rework comments to the input file
                Path inputFile = agentDir.resolve(currentAgent.getInputFileName());
                String existing = Files.readString(inputFile);
                String updated = existing + "\n\n---\n# REWORK COMMENTS\n" + reworkComments + "\n";
                Files.writeString(inputFile, updated);

                req.setState("IN_PROGRESS");
                workspaceManager.saveState(state);

                persistence.recordStateChange(state.getWorkspaceId(), req.getRequirementId(),
                        currentAgent, "IN_REVIEW", "REWORK", null, null, false);
                persistence.recordStateChange(state.getWorkspaceId(), req.getRequirementId(),
                        currentAgent, "REWORK", "IN_PROGRESS", null, null, false);
                persistence.logPipelineAction(state.getWorkspaceId(),
                        "Agent " + currentAgent.getName() + " sent for REWORK: " + reworkComments);
                persistence.syncApprovalToApi(state.getWorkspaceId(), req.getRequirementId(), "REWORK", reworkComments);

                String reworkTitle = currentAgent.getName() + " -> REWORK";
                System.out.println();
                System.out.println("  ╔══════════════════════════════════════════════════════╗");
                System.out.printf("  ║  %-52s║%n", reworkTitle);
                System.out.println("  ╠══════════════════════════════════════════════════════╣");
                System.out.printf("  ║  State : %-43s║%n", "IN_PROGRESS (reworking)");
                System.out.println("  ╚══════════════════════════════════════════════════════╝");

                watchForOutput(state, req, currentAgent);
                break;
        }
    }

    // --- workflow output ---

    private void handleOutput(CommandParser cmd) {
        // Task 4: Accept agent by number, short name, or full name
        String agentRef = cmd.getArg("agent");
        if (agentRef == null || agentRef.isBlank()) {
            ConsolePrinter.printError("Missing --agent argument. Use number (1-10), short name (REQ, HLS, etc), or full name.");
            System.out.println("  " + AgentRegistry.getShortNamesHelp());
            return;
        }

        AgentRegistry.AgentDef agent = AgentRegistry.resolve(agentRef);
        if (agent == null) {
            ConsolePrinter.printError("Invalid agent: " + agentRef + ". Use number (1-10), short name (REQ, HLS, etc), or full name.");
            System.out.println("  " + AgentRegistry.getShortNamesHelp());
            return;
        }

        int workspaceId = cmd.requireIntArg("workspace");

        try {
            Path agentDir = workspaceManager.getAgentDir(workspaceId, agent.getName());
            if (agentDir == null) {
                ConsolePrinter.printError("Workspace not found: " + workspaceId);
                return;
            }

            Path outputFile = agentDir.resolve(agent.getOutputFileName());
            if (!Files.exists(outputFile)) {
                ConsolePrinter.printError("Output file not found for agent '" + agent.getName()
                    + "'. Agent may not have run yet.");
                return;
            }

            String rawContent = Files.readString(outputFile);
            // Task 3: Sanitize output - remove Copilot CLI noise and thinking
            String content = cmd.hasArg("raw") ? rawContent : sanitizeCopilotOutput(rawContent);
            
            System.out.println();
            System.out.println("  ╔══════════════════════════════════════════════════════╗");
            System.out.printf("  ║  Output: %-43s║%n", agent.getName() + " (#" + agent.getSequence() + ")");
            System.out.println("  ╚══════════════════════════════════════════════════════╝");
            System.out.println();
            System.out.println(content);
            System.out.println();
            System.out.println("  ══════════════════════════════════════════════════════");

        } catch (IOException e) {
            ConsolePrinter.printError("Failed to read output: " + e.getMessage());
        }
    }

    /**
     * Condense a large agent output to keep within context window limits.
     * Extracts all headings and the first N lines of content under each heading.
     * Targets ~20KB output to leave room for other deps and agent instructions.
     */
    private String condenseLargeOutput(String fullContent) {
        if (fullContent == null || fullContent.length() <= 12288) return fullContent;

        String[] lines = fullContent.split("\n", -1);
        StringBuilder sb = new StringBuilder();
        int linesAfterHeading = 0;
        int maxLinesPerSection = 6; // Keep first 6 lines after each heading
        boolean inSection = false;
        boolean truncatedSection = false;

        for (String line : lines) {
            String trimmed = line.trim();
            boolean isHeading = trimmed.startsWith("#");
            boolean isSeparator = trimmed.equals("---");

            if (isHeading || isSeparator) {
                if (truncatedSection) {
                    sb.append("  _(... section truncated for brevity)_\n\n");
                    truncatedSection = false;
                }
                sb.append(line).append("\n");
                linesAfterHeading = 0;
                inSection = isHeading;
                continue;
            }

            if (inSection) {
                linesAfterHeading++;
                if (linesAfterHeading <= maxLinesPerSection || trimmed.isEmpty()) {
                    sb.append(line).append("\n");
                } else if (!truncatedSection) {
                    truncatedSection = true;
                }
            } else {
                sb.append(line).append("\n");
            }

            // Stop if we hit 12KB
            if (sb.length() > 12288) {
                sb.append("\n\n_(... remaining content truncated for context window limits)_\n");
                break;
            }
        }
        if (truncatedSection) {
            sb.append("  _(... section truncated for brevity)_\n");
        }

        logger.info("Condensed output from {} to {} chars", fullContent.length(), sb.length());
        return sb.toString();
    }

    /**
     * Task 3: Strip Copilot CLI tool-use log lines, session stats, and agent narration
     * from output. Extracts only the structured markdown content when headings are present.
     */
    private String sanitizeCopilotOutput(String raw) {
        if (raw == null || raw.isEmpty()) return raw;
        String[] lines = raw.split("\n", -1);

        // Pass 1: Remove entire non-content code blocks (PowerShell, JSON schema, shell scripts)
        // and strip CLI noise, narration, and script artifact lines.
        List<String> cleaned = new ArrayList<>();
        boolean insideCodeBlock = false;
        boolean insideJunkCodeBlock = false;
        String codeBlockLang = "";
        for (String line : lines) {
            String trimmed = line.trim();

            // Track code block boundaries
            if (trimmed.startsWith("```")) {
                if (!insideCodeBlock) {
                    // Opening a code block
                    codeBlockLang = trimmed.length() > 3 ? trimmed.substring(3).trim().toLowerCase() : "";
                    // Markdown fence wrapping the entire output — strip the fence
                    if (codeBlockLang.equals("markdown") || codeBlockLang.equals("md")) {
                        insideCodeBlock = true;
                        insideJunkCodeBlock = true; // strip the fences themselves
                        continue;
                    }
                    // PowerShell, shell, JSON code blocks are junk (agent thinking/scripts)
                    if (codeBlockLang.equals("powershell") || codeBlockLang.equals("json")
                            || codeBlockLang.equals("bash") || codeBlockLang.equals("sh")
                            || codeBlockLang.equals("shell") || codeBlockLang.equals("cmd")) {
                        insideCodeBlock = true;
                        insideJunkCodeBlock = true;
                        continue;
                    }
                    // Unlabeled code block — check if content looks like script
                    insideCodeBlock = true;
                    insideJunkCodeBlock = false;
                    // Keep this opening fence for now; we'll check content
                    cleaned.add(line);
                    continue;
                } else {
                    // Closing a code block
                    insideCodeBlock = false;
                    if (insideJunkCodeBlock) {
                        insideJunkCodeBlock = false;
                        continue; // skip closing fence of junk block
                    }
                    cleaned.add(line);
                    continue;
                }
            }

            // Inside a junk code block — skip everything
            if (insideJunkCodeBlock) continue;

            // Inside a legitimate code block — keep everything
            if (insideCodeBlock) {
                cleaned.add(line);
                continue;
            }

            // Outside code blocks — filter noise, narration, and script lines
            if (CLI_NOISE_LINE.matcher(line).find()) continue;
            if (NARRATION_LINE.matcher(trimmed).find()) continue;
            if (SCRIPT_LINE.matcher(trimmed).find()) continue;

            cleaned.add(line);
        }

        // Pass 2: Find the REAL markdown content heading.
        // A real heading is "# Title Words" where the title starts with a capital letter
        // and contains meaningful words — NOT "# Write to output file" (PowerShell comment).
        // Real headings: "# Theatre Management System", "## 1. Structured Summary"
        Pattern realHeading = Pattern.compile(
                "^#{1,6}\\s+(\\d+\\.\\s+)?[A-Z][A-Za-z].*"
        );
        int firstHeading = -1;
        int lastContentLine = -1;
        for (int i = 0; i < cleaned.size(); i++) {
            String t = cleaned.get(i).trim();
            if (firstHeading == -1 && realHeading.matcher(t).matches()) {
                firstHeading = i;
            }
            // Track last line that looks like real markdown content
            if (firstHeading >= 0 && !t.isEmpty()) {
                if (t.startsWith("#") || t.startsWith("-") || t.startsWith("*")
                        || t.startsWith("|") || t.startsWith(">") || t.startsWith("```")
                        || t.matches("^\\d+[.)]\\s.*") || t.startsWith("---")
                        || t.startsWith("**") || t.startsWith("_")
                        || t.matches("^[A-Z].*[.:]$")   // Sentence ending in . or :
                        || t.matches("^[A-Z].*[a-z)]$") // Normal sentence
                        || t.matches("^\\[.*\\].*")       // Link syntax
                        || t.matches("^- AC-\\d+:.*")     // Acceptance criteria
                        ) {
                    lastContentLine = i;
                }
            }
        }

        if (firstHeading < 0) {
            // No heading found — return everything after stripping noise
            firstHeading = 0;
            lastContentLine = cleaned.size() - 1;
        }
        if (lastContentLine < firstHeading) {
            lastContentLine = cleaned.size() - 1;
        }

        // Trim trailing blank and narration lines from the end
        while (lastContentLine > firstHeading && cleaned.get(lastContentLine).isBlank()) lastContentLine--;
        while (lastContentLine > firstHeading) {
            String t = cleaned.get(lastContentLine).trim();
            if (NARRATION_LINE.matcher(t).find() || SCRIPT_LINE.matcher(t).find() || t.isEmpty()) {
                lastContentLine--;
            } else {
                break;
            }
        }

        StringBuilder sb = new StringBuilder();
        boolean contentStarted = false;
        for (int i = firstHeading; i <= lastContentLine; i++) {
            String line = cleaned.get(i);
            if (!contentStarted && line.isBlank()) continue;
            contentStarted = true;
            sb.append(line).append("\n");
        }
        return sb.toString().strip();
    }

    /**
     * Sanitize an agent output file in-place: read, clean, rewrite.
     * Applied after every agent completes to ensure no CLI noise/thinking in output files.
     */
    private void sanitizeOutputFile(Path outputFile) {
        try {
            if (!Files.exists(outputFile) || Files.size(outputFile) == 0) return;
            String raw = Files.readString(outputFile);
            String sanitized = sanitizeCopilotOutput(raw);
            if (!sanitized.isEmpty() && !sanitized.equals(raw.strip())) {
                Files.writeString(outputFile, sanitized);
                logger.info("Sanitized output file: {} ({} -> {} chars)",
                        outputFile.getFileName(), raw.length(), sanitized.length());
            }
        } catch (IOException e) {
            logger.warn("Failed to sanitize output file {}: {}", outputFile, e.getMessage());
        }
    }

    // --- workflow all ---

    // ======================== PER-STORY PIPELINE ========================

    /**
     * Pick a single user story and run TDD agent for it.
     * After TDD completes, user must approve before LLD runs, then approve LLD before CodingAgent runs.
     * Multiple stories can run in parallel from different terminals — each gets its own state entry.
     * All outputs are stored inside the story's own subfolder under UserStoryAgent/.
     * Usage: workflow pick-story --workspace <id> --requirement <id> --story US-001
     */
    private void handlePickStory(CommandParser cmd) {
        int workspaceId = cmd.requireIntArg("workspace");
        int requirementId = cmd.requireIntArg("requirement");
        String storyId = cmd.requireArg("story").trim().toUpperCase();

        try {
            PipelineState state = workspaceManager.loadState(workspaceId);
            if (state == null) { ConsolePrinter.printError("Workspace not found: " + workspaceId); return; }
            state.setWorkspaceId(workspaceId);

            PipelineState.RequirementState req = state.getRequirement(requirementId);
            if (req == null) { ConsolePrinter.printError("Requirement not found: " + requirementId); return; }

            // Check if this story is already running
            PipelineState.StoryPipelineState existingStory = req.getStoryPipeline(storyId);
            if (existingStory != null && !"COMPLETED".equals(existingStory.getAgentState())) {
                ConsolePrinter.printError("Story " + storyId + " is already active (state: "
                        + existingStory.getAgentState() + ", agent seq: " + existingStory.getAgentSequence() + ").");
                System.out.println("  Use 'workflow approve-story' to advance it, or wait for it to finish.");
                return;
            }

            // Locate the user story file (now inside subfolder)
            Path wsDir = workspaceManager.findWorkspaceDir(workspaceId);
            Path usAgentDir = wsDir.resolve(state.getWorkspaceName() + "_agents").resolve("UserStoryAgent");
            Path storyFile = findStoryFile(usAgentDir, storyId);

            if (storyFile == null) {
                ConsolePrinter.printError("Story file not found for " + storyId + ". Run UserStoryAgent first.");
                // List available stories
                if (Files.exists(usAgentDir)) {
                    System.out.println("  Available stories:");
                    try (var stream = Files.list(usAgentDir)) {
                        stream.filter(Files::isDirectory)
                              .filter(p -> p.getFileName().toString().matches("US-\\d+"))
                              .sorted()
                              .forEach(p -> System.out.println("    " + p.getFileName()));
                    }
                }
                return;
            }

            // The story folder is: UserStoryAgent/<storyId>/
            Path storyDir = usAgentDir.resolve(storyId);
            Files.createDirectories(storyDir);

            String storyContent = Files.readString(storyFile);

            // Register this story in the per-story pipelines map (file-locked save)
            req.putStoryPipeline(storyId, 5, "IN_PROGRESS");
            workspaceManager.saveState(state);

            // Show parallel stories if any
            long activeCount = req.getStoryPipelines().values().stream()
                    .filter(s -> !"COMPLETED".equals(s.getAgentState()))
                    .count();

            System.out.println();
            System.out.println("  ╔══════════════════════════════════════════════════════╗");
            System.out.println("  ║  Per-Story Pipeline                                  ║");
            System.out.println("  ╠══════════════════════════════════════════════════════╣");
            System.out.printf("  ║  Story    : %-40s║%n", storyId);
            System.out.printf("  ║  Pipeline : TDD → (approve) → LLD → (approve) → Code ║%n");
            System.out.printf("  ║  Output   : UserStoryAgent/%-25s║%n", storyId + "/");
            if (activeCount > 1) {
                System.out.printf("  ║  Parallel : %d stories active                         ║%n", activeCount);
            }
            System.out.println("  ╚══════════════════════════════════════════════════════╝");

            // === Run TDD only; user must approve before LLD ===
            runPerStoryAgent(state, req, storyId, storyDir, usAgentDir, wsDir, 5, "TDDAgent", storyContent);

            // Reload state (another terminal may have saved), then update this story
            state = workspaceManager.loadState(workspaceId);
            state.setWorkspaceId(workspaceId);
            req = state.getRequirement(requirementId);
            req.putStoryPipeline(storyId, 5, "STORY_TDD_REVIEW");
            workspaceManager.saveState(state);

            System.out.println();
            System.out.println("  ╔══════════════════════════════════════════════════════╗");
            System.out.println("  ║  TDDAgent Complete — Awaiting Approval               ║");
            System.out.println("  ╠══════════════════════════════════════════════════════╣");
            System.out.printf("  ║  Story  : %-42s║%n", storyId);
            System.out.printf("  ║  Output : UserStoryAgent/%-26s║%n", storyId + "/TDDAgent/");
            System.out.println("  ║                                                      ║");
            System.out.println("  ║  Review the TDD output, then approve:                ║");
            System.out.printf("  ║    workflow approve-story --workspace %-3d             ║%n", workspaceId);
            System.out.printf("  ║      --requirement %-3d --story %-6s                ║%n", requirementId, storyId);
            System.out.println("  ╚══════════════════════════════════════════════════════╝");

        } catch (IOException | InterruptedException e) {
            logger.error("Per-story pipeline failed", e);
            ConsolePrinter.printError("Per-story pipeline failed: " + e.getMessage());
        }
    }

    /**
     * Approve the current per-story agent output and advance to the next agent.
     * Flow: TDD (approve) → LLD (approve) → CodingAgent → done.
     * Each story is tracked independently, so multiple stories can be approved from different terminals.
     * Usage: workflow approve-story --workspace <id> --requirement <id> --story US-001
     *        Optional: --decision APPROVE|REWORK --comments <text>
     */
    private void handleApproveStory(CommandParser cmd) {
        int workspaceId = cmd.requireIntArg("workspace");
        int requirementId = cmd.requireIntArg("requirement");
        String storyId = cmd.requireArg("story").trim().toUpperCase();

        try {
            PipelineState state = workspaceManager.loadState(workspaceId);
            if (state == null) { ConsolePrinter.printError("Workspace not found: " + workspaceId); return; }
            state.setWorkspaceId(workspaceId);

            PipelineState.RequirementState req = state.getRequirement(requirementId);
            if (req == null) { ConsolePrinter.printError("Requirement not found: " + requirementId); return; }

            // Look up this story's pipeline state
            PipelineState.StoryPipelineState storyState = req.getStoryPipeline(storyId);
            if (storyState == null) {
                ConsolePrinter.printError("Story " + storyId + " has no active pipeline. Run pick-story first.");
                return;
            }

            String currentStoryState = storyState.getAgentState();
            int storySeq = storyState.getAgentSequence();

            // Determine what agent just completed
            String completedAgent;
            String nextAgent;
            int nextSeq;
            String nextReviewState;
            if ("STORY_TDD_REVIEW".equals(currentStoryState) && storySeq == 5) {
                completedAgent = "TDDAgent";
                nextAgent = "LLDAgent";
                nextSeq = 6;
                nextReviewState = "STORY_LLD_REVIEW";
            } else if ("STORY_LLD_REVIEW".equals(currentStoryState) && storySeq == 6) {
                completedAgent = "LLDAgent";
                nextAgent = "CodingAgent";
                nextSeq = 7;
                nextReviewState = null; // CodingAgent is the last step
            } else {
                ConsolePrinter.printError("Story " + storyId + " is not awaiting approval. State: " + currentStoryState);
                return;
            }

            System.out.println();
            System.out.println("  ╔══════════════════════════════════════════════════════╗");
            System.out.printf("  ║  Story Approval: %-34s║%n", completedAgent + " for " + storyId);
            System.out.println("  ╠══════════════════════════════════════════════════════╣");

            // Get decision
            String decision;
            String comments = null;

            if (cmd.hasArg("decision")) {
                decision = cmd.getArg("decision").toUpperCase();
                comments = cmd.hasArg("comments") ? cmd.getArg("comments") : null;
            } else {
                // Interactive prompt
                System.out.println("  ║  Choose an action:                                  ║");
                System.out.println("  ║    1. APPROVE  - Approve and run " + nextAgent);
                System.out.println("  ║    2. REWORK   - Send back for rework               ║");
                System.out.println("  ╚══════════════════════════════════════════════════════╝");
                System.out.print("\n  Decision (APPROVE/REWORK): ");
                System.out.flush();

                BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
                decision = reader.readLine();
                if (decision == null || decision.isBlank()) {
                    ConsolePrinter.printError("No decision provided.");
                    return;
                }
                decision = decision.trim().toUpperCase();

                if ("REWORK".equals(decision)) {
                    System.out.print("  Enter rework comments: ");
                    System.out.flush();
                    comments = reader.readLine();
                }
            }

            if (!"APPROVE".equals(decision) && !"REWORK".equals(decision)) {
                ConsolePrinter.printError("Invalid decision: " + decision + ". Must be APPROVE or REWORK.");
                return;
            }

            Path wsDir = workspaceManager.findWorkspaceDir(workspaceId);
            Path usAgentDir = wsDir.resolve(state.getWorkspaceName() + "_agents").resolve("UserStoryAgent");
            Path storyDir = usAgentDir.resolve(storyId);

            if ("REWORK".equals(decision)) {
                // Delete the agent's output and re-run
                Path agentSubDir = storyDir.resolve(completedAgent);
                Path outputFile = agentSubDir.resolve(completedAgent + "_output.md");
                if (Files.exists(outputFile)) Files.delete(outputFile);

                // Append rework comments to input
                Path inputFile = agentSubDir.resolve(completedAgent + "_input.md");
                if (Files.exists(inputFile)) {
                    String reworkComments = (comments != null && !comments.isBlank())
                            ? comments
                            : AgentRegistry.getDefaultReworkComment(completedAgent);
                    String existing = Files.readString(inputFile);
                    Files.writeString(inputFile, existing + "\n\n---\n# REWORK COMMENTS\n" + reworkComments + "\n");
                }

                // Mark as IN_PROGRESS for rework
                req.putStoryPipeline(storyId, storySeq, "IN_PROGRESS");
                workspaceManager.saveState(state);

                // Re-run the agent
                Path storyFile = findStoryFile(usAgentDir, storyId);
                String storyContent = storyFile != null ? Files.readString(storyFile) : "";
                int agentSeq = "TDDAgent".equals(completedAgent) ? 5 : 6;

                System.out.println("  Re-running " + completedAgent + " for " + storyId + "...");
                runPerStoryAgent(state, req, storyId, storyDir, usAgentDir, wsDir, agentSeq, completedAgent, storyContent);

                // Reload, update story state back to review
                state = workspaceManager.loadState(workspaceId);
                state.setWorkspaceId(workspaceId);
                req = state.getRequirement(requirementId);
                req.putStoryPipeline(storyId, storySeq,
                        storySeq == 5 ? "STORY_TDD_REVIEW" : "STORY_LLD_REVIEW");
                workspaceManager.saveState(state);

                System.out.println();
                System.out.printf("  ╔══════════════════════════════════════════════════════╗%n");
                System.out.printf("  ║  %s Rework Complete — Awaiting Approval    ║%n", completedAgent);
                System.out.printf("  ╠══════════════════════════════════════════════════════╣%n");
                System.out.printf("  ║  Review and approve again:                          ║%n");
                System.out.printf("  ║    workflow approve-story --workspace %-3d             ║%n", workspaceId);
                System.out.printf("  ║      --requirement %-3d --story %-6s                ║%n", requirementId, storyId);
                System.out.printf("  ╚══════════════════════════════════════════════════════╝%n");
                return;
            }

            // APPROVE: mark as in-progress for next agent
            req.putStoryPipeline(storyId, nextSeq, "IN_PROGRESS");
            workspaceManager.saveState(state);

            Path storyFile = findStoryFile(usAgentDir, storyId);
            String storyContent = storyFile != null ? Files.readString(storyFile) : "";

            System.out.println("  " + completedAgent + " APPROVED. Running " + nextAgent + "...");
            persistence.logPipelineAction(state.getWorkspaceId(),
                    completedAgent + " APPROVED for " + storyId + ", advancing to " + nextAgent);

            runPerStoryAgent(state, req, storyId, storyDir, usAgentDir, wsDir, nextSeq, nextAgent, storyContent);

            // Reload state after agent run (another terminal may have modified)
            state = workspaceManager.loadState(workspaceId);
            state.setWorkspaceId(workspaceId);
            req = state.getRequirement(requirementId);

            if (nextReviewState != null) {
                // LLD completed — needs approval before CodingAgent
                req.putStoryPipeline(storyId, nextSeq, nextReviewState);
                workspaceManager.saveState(state);

                System.out.println();
                System.out.println("  ╔══════════════════════════════════════════════════════╗");
                System.out.printf("  ║  %s Complete — Awaiting Approval           ║%n", nextAgent);
                System.out.println("  ╠══════════════════════════════════════════════════════╣");
                System.out.printf("  ║  Story  : %-42s║%n", storyId);
                System.out.printf("  ║  Output : UserStoryAgent/%-26s║%n", storyId + "/" + nextAgent + "/");
                System.out.println("  ║                                                      ║");
                System.out.println("  ║  Review the output, then approve:                    ║");
                System.out.printf("  ║    workflow approve-story --workspace %-3d             ║%n", workspaceId);
                System.out.printf("  ║      --requirement %-3d --story %-6s                ║%n", requirementId, storyId);
                System.out.println("  ╚══════════════════════════════════════════════════════╝");
            } else {
                // CodingAgent completed — story pipeline done
                req.putStoryPipeline(storyId, 7, "COMPLETED");
                workspaceManager.saveState(state);

                System.out.println();
                System.out.println("  ╔══════════════════════════════════════════════════════╗");
                System.out.println("  ║  Story Pipeline Complete!                            ║");
                System.out.println("  ╠══════════════════════════════════════════════════════╣");
                System.out.printf("  ║  Story  : %-42s║%n", storyId);
                System.out.printf("  ║  Output : UserStoryAgent/%-26s║%n", storyId + "/");
                System.out.println("  ║  Contains:                                           ║");
                System.out.println("  ║    TDDAgent/    - TDD input & output                 ║");
                System.out.println("  ║    LLDAgent/    - LLD input & output                 ║");
                System.out.println("  ║    CodingAgent/ - Coding output                      ║");
                System.out.println("  ║    code/        - Extracted source files              ║");
                System.out.println("  ╠══════════════════════════════════════════════════════╣");
                System.out.println("  ║  Run another story:                                  ║");
                System.out.printf("  ║    workflow pick-story --workspace %-3d                ║%n", workspaceId);
                System.out.printf("  ║      --requirement %-3d --story US-XXX                 ║%n", requirementId);
                System.out.println("  ╚══════════════════════════════════════════════════════╝");
            }

        } catch (IOException | InterruptedException e) {
            logger.error("Per-story approval failed", e);
            ConsolePrinter.printError("Per-story approval failed: " + e.getMessage());
        }
    }

    /**
     * Show the status of all per-story pipelines for a requirement.
     * Useful to see which stories are running, awaiting approval, or completed across terminals.
     * Usage: workflow story-status --workspace <id> --requirement <id>
     */
    private void handleStoryStatus(CommandParser cmd) {
        int workspaceId = cmd.requireIntArg("workspace");
        int requirementId = cmd.requireIntArg("requirement");

        try {
            PipelineState state = workspaceManager.loadState(workspaceId);
            if (state == null) { ConsolePrinter.printError("Workspace not found: " + workspaceId); return; }

            PipelineState.RequirementState req = state.getRequirement(requirementId);
            if (req == null) { ConsolePrinter.printError("Requirement not found: " + requirementId); return; }

            var pipelines = req.getStoryPipelines();

            System.out.println();
            System.out.println("  ╔══════════════════════════════════════════════════════╗");
            System.out.println("  ║  Per-Story Pipeline Status                           ║");
            System.out.println("  ╠══════════════════════════════════════════════════════╣");
            System.out.printf("  ║  Workspace   : %-36s║%n", state.getWorkspaceName() + " (#" + workspaceId + ")");
            System.out.printf("  ║  Requirement : %-36s║%n", "#" + requirementId);
            System.out.printf("  ║  Active      : %-36s║%n",
                    pipelines.values().stream().filter(s -> !"COMPLETED".equals(s.getAgentState())).count() + " stories");
            System.out.println("  ╠══════════════════════════════════════════════════════╣");

            if (pipelines.isEmpty()) {
                System.out.println("  ║  No stories have been started yet.                  ║");
                System.out.println("  ║  Use 'workflow pick-story' to begin.                 ║");
            } else {
                for (var entry : pipelines.entrySet()) {
                    PipelineState.StoryPipelineState sps = entry.getValue();
                    String agentName;
                    switch (sps.getAgentSequence()) {
                        case 5: agentName = "TDDAgent"; break;
                        case 6: agentName = "LLDAgent"; break;
                        case 7: agentName = "CodingAgent"; break;
                        default: agentName = "Agent#" + sps.getAgentSequence(); break;
                    }
                    String statusIcon = "COMPLETED".equals(sps.getAgentState()) ? "✓"
                            : sps.getAgentState().contains("REVIEW") ? "⏳" : "▶";
                    System.out.printf("  ║  %s %-8s  %-12s  %-22s║%n",
                            statusIcon, entry.getKey(), agentName, sps.getAgentState());
                }
            }

            System.out.println("  ╚══════════════════════════════════════════════════════╝");

        } catch (IOException e) {
            ConsolePrinter.printError("Failed to get story status: " + e.getMessage());
        }
    }

    /**
     * Run a single agent (TDD/LLD/Coding) for a specific user story.
     * Input/output are stored in the agent subfolder: storyDir/<agentName>/
     * Code files are extracted to storyDir/code/
     */
    private void runPerStoryAgent(PipelineState state, PipelineState.RequirementState req,
                                   String storyId, Path storyDir, Path usAgentDir, Path wsDir,
                                   int agentSeq, String agentName,
                                   String storyContent) throws IOException, InterruptedException {

        AgentRegistry.AgentDef agent = AgentRegistry.getBySequence(agentSeq);

        System.out.println();
        System.out.println("  ── " + agentName + " for " + storyId + " ──");

        // Create agent subfolder inside story folder: storyDir/<agentName>/
        Path agentSubDir = storyDir.resolve(agentName);
        Files.createDirectories(agentSubDir);

        // Prepare input
        Path inputFile = agentSubDir.resolve(agentName + "_input.md");
        StringBuilder content = new StringBuilder();
        content.append("# ").append(agentName).append(" Input for ").append(storyId).append("\n\n");
        content.append("- **Project**: ").append(state.getWorkspaceName()).append("\n");
        content.append("- **Tech Stack**: ").append(state.getTechStack()).append("\n");
        content.append("- **Story**: ").append(storyId).append("\n");

        Path outputFile = agentSubDir.resolve(agentName + "_output.md");
        content.append("- **Output Path**: ").append(outputFile.toAbsolutePath().toString().replace('\\', '/')).append("\n");

        if ("CodingAgent".equals(agentName)) {
            Path codeDir = storyDir.resolve("code");
            Files.createDirectories(codeDir);
            content.append("- **Code Files Path**: ").append(codeDir.toAbsolutePath().toString().replace('\\', '/')).append("/\n");
        }
        content.append("\n---\n\n");

        // Include HLD context
        Path hldOutput = wsDir.resolve(state.getWorkspaceName() + "_agents").resolve("HLDAgent")
                .resolve("output_high_level_design.md");
        if (Files.exists(hldOutput)) {
            String hldContent = Files.readString(hldOutput);
            content.append("## HLD Context\n\n");
            if (hldContent.length() < 8192) {
                content.append(hldContent);
            } else {
                content.append("**Read the full HLD from**: `")
                       .append(hldOutput.toAbsolutePath().toString().replace('\\', '/')).append("`\n");
            }
            content.append("\n\n---\n\n");
        }

        // For LLD: include TDD output (from TDDAgent subfolder)
        if ("LLDAgent".equals(agentName)) {
            Path tddOutput = storyDir.resolve("TDDAgent").resolve("TDDAgent_output.md");
            if (Files.exists(tddOutput)) {
                String tddContent = Files.readString(tddOutput);
                content.append("## TDD Output\n\n");
                if (tddContent.length() < 8192) {
                    content.append(tddContent);
                } else {
                    content.append("**Read the full TDD output from**: `")
                           .append(tddOutput.toAbsolutePath().toString().replace('\\', '/')).append("`\n");
                }
                content.append("\n\n---\n\n");
            }
        }

        // For CodingAgent: include LLD + TDD output (from their subfolders)
        if ("CodingAgent".equals(agentName)) {
            Path lldOutput = storyDir.resolve("LLDAgent").resolve("LLDAgent_output.md");
            if (Files.exists(lldOutput)) {
                String lldContent = Files.readString(lldOutput);
                content.append("## LLD Output\n\n");
                if (lldContent.length() < 8192) {
                    content.append(lldContent);
                } else {
                    content.append("**Read the full LLD output from**: `")
                           .append(lldOutput.toAbsolutePath().toString().replace('\\', '/')).append("`\n");
                }
                content.append("\n\n---\n\n");
            }
            Path tddOutput = storyDir.resolve("TDDAgent").resolve("TDDAgent_output.md");
            if (Files.exists(tddOutput)) {
                String tddContent = Files.readString(tddOutput);
                content.append("## TDD Output\n\n");
                if (tddContent.length() < 8192) {
                    content.append(tddContent);
                } else {
                    content.append("**Read the full TDD output from**: `")
                           .append(tddOutput.toAbsolutePath().toString().replace('\\', '/')).append("`\n");
                }
                content.append("\n\n---\n\n");
            }
        }

        // Include user story content
        content.append("## User Story\n\n");
        content.append(storyContent).append("\n");

        Files.writeString(inputFile, content.toString());
        logger.info("Prepared {} input for {} at: {}", agentName, storyId, inputFile);

        // Update per-story state (reload first to avoid clobbering parallel stories)
        PipelineState freshState = workspaceManager.loadState(state.getWorkspaceId());
        if (freshState != null) {
            freshState.setWorkspaceId(state.getWorkspaceId());
            PipelineState.RequirementState freshReq = freshState.getRequirement(req.getRequirementId());
            if (freshReq != null) {
                freshReq.putStoryPipeline(storyId, agentSeq, "IN_PROGRESS");
            }
            workspaceManager.saveState(freshState);
        }

        // Invoke Copilot CLI (or poll)
        if (copilotCommand != null) {
            String absInput = inputFile.toAbsolutePath().toString().replace('\\', '/');
            String absOutput = outputFile.toAbsolutePath().toString().replace('\\', '/');

            String prompt;
            if ("CodingAgent".equals(agentName)) {
                prompt = String.format(
                    "You are CodingAgent. Read the LLD input from: %s\n\n"
                        + "TASK: Implement ALL source code files specified in the LLD for story %s.\n"
                        + "ALSO implement ALL TDD test cases as actual compilable test code files.\n\n"
                        + "CRITICAL INSTRUCTION: Write ALL code into a SINGLE output file: %s\n\n"
                        + "Do NOT use the create tool. Do NOT use the edit tool to create separate files.\n"
                        + "Write EVERYTHING into the one output file above.\n\n"
                        + "FORMAT — For EACH source file, write a section like this:\n\n"
                        + "### FILE: subfolder/Filename.java\n"
                        + "```java\n"
                        + "package com.example;\n"
                        + "// complete source code\n"
                        + "```\n\n"
                        + "For EACH test file from TDD cases, write a section like this:\n\n"
                        + "### FILE: test/ServiceTest.java\n"
                        + "```java\n"
                        + "package com.example.test;\n"
                        + "// complete test code with assertions\n"
                        + "```\n\n"
                        + "RULES:\n"
                        + "- EVERY class/interface/enum from the LLD must have its own ### FILE: section\n"
                        + "- EVERY TDD test case must be implemented as a real test file in a test/ subfolder\n"
                        + "- Each code block must be COMPLETE and COMPILABLE with all imports\n"
                        + "- After all code blocks, end with a ## Summary section listing all files\n"
                        + "- Do NOT include any thinking or narration — ONLY ### FILE: sections and ## Summary",
                    absInput, storyId, absOutput);
            } else {
                prompt = String.format(
                    "Project name is '%s'. "
                        + "Read your input file at: %s "
                        + "(If any dependency says 'read from file', use the read tool to fetch that file too.) "
                        + "Process the input according to your instructions. "
                        + "You MUST write your complete markdown output to EXACTLY ONE file: %s. "
                        + "All file paths must be ABSOLUTE. "
                        + "Do NOT create any other files. "
                        + "Do NOT include any thinking, narration, or explanation in the output file — ONLY structured markdown content starting with a # heading.",
                    state.getWorkspaceName(), absInput, absOutput);
            }

            List<String> command = new ArrayList<>();
            command.add(copilotCommand);
            command.add("--agent");
            command.add(agent.getName());
            command.add("-p");
            command.add(prompt);
            command.add("--allow-all");
            command.add("--no-ask-user");
            command.add("--output-format");
            command.add("text");
            if (copilotModel != null) {
                command.add("--model");
                command.add(copilotModel);
            }
            command.add("--add-dir");
            command.add(projectRoot.toString());
            command.add("--add-dir");
            command.add(wsDir.toAbsolutePath().toString());

            logger.info("Invoking Copilot CLI for {}/{}: {}", storyId, agentName, agent.getName());
            System.out.println("  Invoking Copilot CLI for " + agentName + " (" + storyId + ")...");

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(wsDir.toAbsolutePath().toFile());
            pb.redirectErrorStream(true);
            pb.redirectInput(new File(System.getProperty("os.name").toLowerCase().contains("win") ? "NUL" : "/dev/null"));

            TimerDisplay timer = new TimerDisplay();
            timer.start(agentName + " running for " + storyId);

            Process process = pb.start();

            // Read stdout in background
            CompletableFuture<String> stdoutFuture = CompletableFuture.supplyAsync(() -> {
                StringBuilder sb = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line).append("\n");
                    }
                } catch (IOException e) {
                    logger.warn("Error reading copilot stdout for {}/{}: {}", storyId, agentName, e.getMessage());
                }
                return sb.toString().trim();
            });

            boolean finished = process.waitFor(COPILOT_TIMEOUT_MINUTES, TimeUnit.MINUTES);
            long elapsed = timer.stop();

            if (!finished) {
                process.destroyForcibly();
                process.waitFor(10, TimeUnit.SECONDS);
            }

            // Check if output written
            boolean outputWritten = Files.exists(outputFile) && Files.size(outputFile) > 0;

            if (!outputWritten) {
                // Try capturing stdout
                String cliOutput;
                try { cliOutput = stdoutFuture.get(30, TimeUnit.SECONDS); } catch (Exception e) { cliOutput = ""; }
                if (!cliOutput.isBlank()) {
                    String sanitized = sanitizeCopilotOutput(cliOutput);
                    String finalContent = sanitized.isEmpty() ? cliOutput : sanitized;
                    if (!finalContent.isBlank()) {
                        Files.writeString(outputFile, finalContent);
                        outputWritten = true;
                    }
                }
            }

            if (outputWritten) {
                // For CodingAgent: extract code blocks
                if ("CodingAgent".equals(agentName)) {
                    Path codeDir = storyDir.resolve("code");
                    Files.createDirectories(codeDir);
                    extractCodeFromOutput(outputFile, codeDir);
                } else {
                    sanitizeOutputFile(outputFile);
                }
                System.out.printf("  ✓ %s completed for %s (%ds)%n", agentName, storyId, elapsed);

                persistence.logPipelineAction(state.getWorkspaceId(),
                        agentName + " completed for " + storyId + " (" + elapsed + "s)");
            } else {
                System.out.printf("  [WARN] %s produced no output for %s. Waiting...%n", agentName, storyId);
                // Poll for manual output
                TimerDisplay pollTimer = new TimerDisplay();
                pollTimer.start("Waiting for " + agentName + " output for " + storyId);
                for (int i = 0; i < MAX_POLL_ATTEMPTS; i++) {
                    Thread.sleep(POLL_INTERVAL_MS);
                    if (Files.exists(outputFile) && Files.size(outputFile) > 0) {
                        long pollElapsed = pollTimer.stop();
                        if ("CodingAgent".equals(agentName)) {
                            Path codeDir = storyDir.resolve("code");
                            Files.createDirectories(codeDir);
                            extractCodeFromOutput(outputFile, codeDir);
                        } else {
                            sanitizeOutputFile(outputFile);
                        }
                        System.out.printf("  ✓ %s output detected (%ds)%n", agentName, pollElapsed);
                        break;
                    }
                }
                pollTimer.stop();
            }
        } else {
            System.out.println("  Copilot CLI not available. Place output at: " + outputFile);
            // Poll
            TimerDisplay pollTimer = new TimerDisplay();
            pollTimer.start("Waiting for " + agentName + " output");
            for (int i = 0; i < MAX_POLL_ATTEMPTS; i++) {
                Thread.sleep(POLL_INTERVAL_MS);
                if (Files.exists(outputFile) && Files.size(outputFile) > 0) {
                    long pollElapsed = pollTimer.stop();
                    if ("CodingAgent".equals(agentName)) {
                        Path codeDir = storyDir.resolve("code");
                        Files.createDirectories(codeDir);
                        extractCodeFromOutput(outputFile, codeDir);
                    } else {
                        sanitizeOutputFile(outputFile);
                    }
                    System.out.printf("  ✓ %s output detected (%ds)%n", agentName, pollElapsed);
                    break;
                }
            }
            pollTimer.stop();
        }
    }

    /**
     * Find the story file matching a story ID (e.g., US-001) in the UserStoryAgent directory.
     * Stories are stored in subfolders: UserStoryAgent/US-001/US-001-Title.md
     */
    private Path findStoryFile(Path usAgentDir, String storyId) throws IOException {
        if (!Files.exists(usAgentDir)) return null;
        // First: look inside the story subfolder (new structure)
        Path storyFolder = usAgentDir.resolve(storyId);
        if (Files.exists(storyFolder) && Files.isDirectory(storyFolder)) {
            try (var stream = Files.list(storyFolder)) {
                Path found = stream
                        .filter(p -> p.getFileName().toString().startsWith(storyId) && p.getFileName().toString().endsWith(".md"))
                        .filter(Files::isRegularFile)
                        .findFirst()
                        .orElse(null);
                if (found != null) return found;
            }
        }
        // Fallback: look at the agent directory level (legacy/flat structure)
        try (var stream = Files.list(usAgentDir)) {
            return stream
                    .filter(p -> p.getFileName().toString().startsWith(storyId) && p.getFileName().toString().endsWith(".md"))
                    .filter(Files::isRegularFile)
                    .findFirst()
                    .orElse(null);
        }
    }

    // ======================== EXISTING METHODS BELOW ========================

    private void handleAll() {
        try {
            List<PipelineState> workspaces = workspaceManager.listWorkspaces();
            if (workspaces.isEmpty()) {
                System.out.println("\nNo workflows found.");
                return;
            }
            System.out.println();
            System.out.println("  ╔══════════════════════════════════════════════════════╗");
            System.out.println("  ║  All Workflows                                      ║");
            System.out.println("  ╠══════════════════════════════════════════════════════╣");
            for (PipelineState ws : workspaces) {
                for (PipelineState.RequirementState req : ws.getRequirements()) {
                    AgentRegistry.AgentDef agent = AgentRegistry.getBySequence(req.getCurrentAgentSequence());
                    String agentName = agent != null ? agent.getName() : "?";
                    String row = String.format("ws=%-3d  agent=%-30s  state=%s",
                            ws.getWorkspaceId(), agentName, req.getState());
                    System.out.printf("  ║  %-52s║%n", row);
                }
            }
            System.out.println("  ╚══════════════════════════════════════════════════════╝");
        } catch (IOException e) {
            ConsolePrinter.printError("Failed to list workflows: " + e.getMessage());
        }
    }

    // --- workflow run-agent (run single agent directly) ---

    /**
     * Run a single agent directly using existing input files in the workspace.
     * Usage: workflow run-agent --workspace <id> --agent <name>
     * 
     * This allows testing an individual agent without running the entire pipeline.
     */
    private void handleRunAgent(CommandParser cmd) {
        int workspaceId = cmd.requireIntArg("workspace");
        String agentName = cmd.requireArg("agent");

        try {
            PipelineState state = workspaceManager.loadState(workspaceId);
            if (state == null) {
                ConsolePrinter.printError("Workspace not found: " + workspaceId);
                return;
            }

            // Ensure state uses the CLI-provided workspace ID (state.json may have a stale ID)
            state.setWorkspaceId(workspaceId);

            // Resolve agent by name, short name, or sequence number
            AgentRegistry.AgentDef agent = AgentRegistry.resolve(agentName);
            if (agent == null) {
                ConsolePrinter.printError("Unknown agent: " + agentName);
                System.out.println("  Available agents: RequirementAnalysisRefinementAgent, HLSAgent, HLDAgent,");
                System.out.println("                   UserStoryAgent, TRReviewAgent, LLDAgent, TDDAgent,");
                System.out.println("                   CodingAgent, StaticCodeAnalysisAgent, SecurityAgent");
                System.out.println("  Or use short names: RAR, HLS, HLD, US, TR, LLD, TDD, CODE, SCA, SEC");
                System.out.println("  Or use sequence numbers: 1-10");
                return;
            }

            // Check input file exists
            Path agentDir = workspaceManager.getAgentDir(workspaceId, agent.getName());
            Path inputFile = agentDir.resolve(agent.getInputFileName());
            Path outputFile = agentDir.resolve(agent.getOutputFileName());

            if (!Files.exists(inputFile)) {
                ConsolePrinter.printError("Input file not found: " + inputFile);
                System.out.println("  Expected input file: " + agent.getInputFileName());
                System.out.println("  Please ensure the input file exists before running this agent.");
                return;
            }

            System.out.println();
            System.out.println("  ╔══════════════════════════════════════════════════════╗");
            System.out.println("  ║  Run Agent                                          ║");
            System.out.println("  ╠══════════════════════════════════════════════════════╣");
            System.out.printf("  ║  Agent : %-43s║%n", agent.getName() + " (#" + agent.getSequence() + ")");
            System.out.printf("  ║  State : %-43s║%n", "IN_PROGRESS");
            System.out.println("  ╚══════════════════════════════════════════════════════╝");
            System.out.println();

            if (copilotCommand == null) {
                ConsolePrinter.printError("Copilot CLI not found. Please install or add to PATH.");
                return;
            }

            // Create a dummy requirement state for the invokeCopilotAgent method
            PipelineState.RequirementState dummyReq = new PipelineState.RequirementState();
            dummyReq.setRequirementId(0);
            dummyReq.setCurrentAgentSequence(agent.getSequence());
            dummyReq.setState("IN_PROGRESS");

            // Record INIT + IN_PROGRESS for run-agent
            String inputRef = agent.getName() + "/" + agent.getInputFileName();
            persistence.recordStateChange(workspaceId, 0, agent,
                    null, "INIT", inputRef, null, false);
            persistence.recordStateChange(workspaceId, 0, agent,
                    "INIT", "IN_PROGRESS", inputRef, null, false);
            persistence.logPipelineAction(workspaceId,
                    "Direct run-agent: " + agent.getName() + " (#" + agent.getSequence() + ")");

            // Invoke the agent
            invokeCopilotAgent(state, dummyReq, agent, outputFile);

            // Check if output was generated
            if (Files.exists(outputFile) && Files.size(outputFile) > 0) {
                System.out.println("\n  [OK] " + agent.getName() + " completed.");
            } else {
                System.out.println("\n  [WARN] " + agent.getName() + " completed but no output detected.");
            }

        } catch (IOException | InterruptedException e) {
            logger.error("Failed to run agent", e);
            ConsolePrinter.printError("Failed to run agent: " + e.getMessage());
        }
    }

    // --- Input Preparation ---

    /**
     * Print standardized agent completion message with next commands.
     */
    private void printAgentComplete(PipelineState state, PipelineState.RequirementState req,
                                     AgentRegistry.AgentDef agent, long elapsed) {
        int wsId = state.getWorkspaceId();
        int reqId = req.getRequirementId();
        String reviewTitle = agent.getName() + " -> IN_REVIEW";
        System.out.println();
        System.out.println("  ╔══════════════════════════════════════════════════════╗");
        System.out.printf("  ║  %-52s║%n", reviewTitle);
        System.out.println("  ╠══════════════════════════════════════════════════════╣");
        String timeStr = (elapsed >= 60) ? (elapsed / 60) + "m " + (elapsed % 60) + "s" : elapsed + "s";
        System.out.printf("  ║  Completed in %-38s║%n", timeStr);
        System.out.println("  ╠══════════════════════════════════════════════════════╣");
        System.out.println("  ║  Suggested commands:                                 ║");
        System.out.printf("  ║    %-49s║%n", "workflow output --workspace " + wsId + " --agent " + agent.getShortName());
        System.out.printf("  ║    %-49s║%n", "workflow approve --workspace " + wsId + " --requirement " + reqId);
        System.out.printf("  ║    %-49s║%n", "workflow status --workspace " + wsId + " --requirement " + reqId);
        System.out.println("  ╚══════════════════════════════════════════════════════╝");
    }

    /**
     * Print output command hint (kept for backward compatibility).
     */
    @SuppressWarnings("unused")
    private void printOutputCommandHint(PipelineState state, AgentRegistry.AgentDef agent) {
        System.out.println("    workflow output --workspace " + state.getWorkspaceId()
            + " --agent " + agent.getShortName());
    }

    /**
     * Task 2: Prepare agent input with optional comments from approval
     */
    private void prepareAgentInput(PipelineState state, PipelineState.RequirementState req,
                                   AgentRegistry.AgentDef agent, String approvalComments) throws IOException {
        Path agentDir = workspaceManager.getAgentDir(state.getWorkspaceId(), agent.getName());
        Path inputFile = agentDir.resolve(agent.getInputFileName());

        StringBuilder content = new StringBuilder();

        // Context header
        content.append("# Agent Execution Context\n");
        content.append("- **Project**: ").append(state.getWorkspaceName()).append("\n");
        content.append("- **Tech Stack**: ").append(state.getTechStack()).append("\n");
        content.append("- **Description**: ").append(state.getDescription()).append("\n");
        content.append("- **Agent**: ").append(agent.getName()).append(" (#").append(agent.getSequence()).append(")\n");
        content.append("- **Output Path**: ").append(state.getWorkspaceName()).append("_agents/")
               .append(agent.getName()).append("/").append(agent.getOutputFileName()).append("\n");
        content.append("\n---\n\n");

        // Task 2: Include approval comments if provided
        if (approvalComments != null && !approvalComments.isBlank()) {
            content.append("# Reviewer Comments\n\n");
            content.append(approvalComments).append("\n");
            content.append("\n---\n\n");
        }

        if (agent.getSequence() == 1) {
            // First agent: raw requirement
            content.append("# Raw Requirement\n\n");
            content.append(req.getText()).append("\n");
            if (req.getUserStory() != null && !req.getUserStory().isBlank()) {
                content.append("\n# User Story\n\n");
                content.append(req.getUserStory()).append("\n");
            }
        } else {
            // For agents 8, 9, 10: Add instructions to read code from per-story code directories
            if (agent.getSequence() >= 8) {
                Path wsDir2 = workspaceManager.findWorkspaceDir(state.getWorkspaceId());
                Path usAgentDir = wsDir2.resolve(state.getWorkspaceName() + "_agents").resolve("UserStoryAgent");
                content.append("# Source Code Location\n\n");
                content.append("**IMPORTANT**: The implemented code is organized per user story under the UserStoryAgent folder.\n\n");
                content.append("Each story has its code in: `UserStoryAgent/<storyId>/code/`\n\n");
                // List all story code directories that exist
                if (Files.exists(usAgentDir)) {
                    try (var storyDirs = Files.list(usAgentDir)) {
                        storyDirs.filter(Files::isDirectory)
                                .filter(p -> p.getFileName().toString().matches("US-\\d+"))
                                .sorted()
                                .forEach(p -> {
                                    Path codeDir = p.resolve("code");
                                    if (Files.exists(codeDir)) {
                                        content.append("- `").append(codeDir.toAbsolutePath().toString().replace('\\', '/'))
                                               .append("/`\n");
                                    }
                                });
                    }
                }
                content.append("\nUse the `read` tool to access these files for analysis.\n");
                content.append("\n---\n\n");
            }
            
            // Subsequent agents: combine outputs from source agents.
            // Calculate total dependency size to decide strategy.
            List<Integer> sourceAgents = agent.getInputSourceAgents();
            long totalDepSize = 0;
            for (int sourceSeq : sourceAgents) {
                AgentRegistry.AgentDef sourceAgent = AgentRegistry.getBySequence(sourceSeq);
                Path sourceDir = workspaceManager.getAgentDir(state.getWorkspaceId(), sourceAgent.getName());
                Path sourceOutput = sourceDir.resolve(sourceAgent.getOutputFileName());
                if (Files.exists(sourceOutput)) totalDepSize += Files.size(sourceOutput);
            }
            boolean multiLargeDeps = sourceAgents.size() > 1 && totalDepSize > 40960;
            
            for (int sourceSeq : sourceAgents) {
                AgentRegistry.AgentDef sourceAgent = AgentRegistry.getBySequence(sourceSeq);
                Path sourceDir = workspaceManager.getAgentDir(state.getWorkspaceId(), sourceAgent.getName());
                Path sourceOutput = sourceDir.resolve(sourceAgent.getOutputFileName());

                // For agents after CodingAgent (seq >= 8), skip inlining CodingAgent output
                // since the actual code is accessible from per-story code directories
                if (agent.getSequence() >= 8 && sourceSeq == 7) {
                    content.append("# Code from CodingAgent\n\n");
                    content.append("The implemented source code files are in the per-story `code/` directories referenced above.\n");
                    content.append("Use the `read` tool to access individual files as needed for your analysis.\n\n");
                    content.append("---\n\n");
                    continue;
                }

                if (Files.exists(sourceOutput)) {
                    long fileSize = Files.size(sourceOutput);
                    if (fileSize <= 8192) {
                        content.append("# Input from ").append(sourceAgent.getName())
                               .append(" (Agent #").append(sourceSeq).append(")\n\n");
                        content.append(Files.readString(sourceOutput));
                        content.append("\n\n---\n\n");
                    } else if (multiLargeDeps) {
                        // Multiple large deps: condense each to avoid context overflow
                        content.append("# Input from ").append(sourceAgent.getName())
                               .append(" (Agent #").append(sourceSeq).append(") [Condensed]\n\n");
                        content.append(condenseLargeOutput(Files.readString(sourceOutput)));
                        content.append("\n\n---\n\n");
                    } else {
                        // Single large dep: use file reference
                        String absSourcePath = sourceOutput.toAbsolutePath().toString().replace('\\', '/');
                        content.append("# Input from ").append(sourceAgent.getName())
                               .append(" (Agent #").append(sourceSeq).append(")\n\n");
                        content.append("**Read the full output from file**: `").append(absSourcePath).append("`\n\n");
                        content.append("Use the read tool to fetch this file.\n\n");
                        content.append("---\n\n");
                    }
                } else {
                    content.append("# [WARNING] Output not found from ").append(sourceAgent.getName()).append("\n\n");
                }
            }
        }

        Files.writeString(inputFile, content.toString());
        logger.info("Prepared input file: {}", inputFile);
    }

    // --- File Watching & Copilot CLI Invocation ---

    private void watchForOutput(PipelineState state, PipelineState.RequirementState req,
                                AgentRegistry.AgentDef agent) {
        try {
            Path agentDir = workspaceManager.getAgentDir(state.getWorkspaceId(), agent.getName());
            Path outputFile = agentDir.resolve(agent.getOutputFileName());

            // Check if output already exists
            if (Files.exists(outputFile) && Files.size(outputFile) > 0) {
                req.setState("IN_REVIEW");
                workspaceManager.saveState(state);
                System.out.println("  " + agent.getName() + " → IN_REVIEW (output exists)");
                return;
            }

            if (copilotCommand != null) {
                // Auto-invoke via Copilot CLI
                invokeCopilotAgent(state, req, agent, outputFile);
            } else {
                // Fall back to manual polling
                System.out.println("  Copilot CLI not available. Invoke @" + agent.getName() + " in VS Code Copilot Chat.");
                pollForOutput(state, req, agent, outputFile);
            }

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            System.out.println("\n  Interrupted. Agent is still IN_PROGRESS. Check status later.");
        } catch (IOException e) {
            ConsolePrinter.printError("Error watching for output: " + e.getMessage());
        }
    }

    /**
     * Invoke Copilot CLI to run the agent automatically.
     */
    private void invokeCopilotAgent(PipelineState state, PipelineState.RequirementState req,
                                     AgentRegistry.AgentDef agent, Path outputFile)
            throws IOException, InterruptedException {


        Path wsDir = workspaceManager.findWorkspaceDir(state.getWorkspaceId());
        String agentsFolder = state.getWorkspaceName() + "_agents";

        String inputRef = agentsFolder + "/" + agent.getName() + "/" + agent.getInputFileName();
        String outputRef = agentsFolder + "/" + agent.getName() + "/" + agent.getOutputFileName();

        // Standard prompt for sequential agents (1-4)
        String absInput = wsDir.toAbsolutePath().resolve(inputRef).toString().replace('\\', '/');
        String absOutput = wsDir.toAbsolutePath().resolve(outputRef).toString().replace('\\', '/');
        String prompt = String.format(
                "Project name is '%s'. "
                        + "Read your input file at: %s "
                        + "(If any dependency says 'read from file', use the read tool to fetch that file too.) "
                        + "Process the input according to your instructions. "
                        + "You MUST write your complete markdown output to EXACTLY ONE file: %s. "
                        + "All file paths must be ABSOLUTE. "
                        + "Do NOT create any other files. No JSON files, no extra markdown files, no scripts. "
                        + "Do NOT include any thinking, narration, or explanation in the output file — ONLY structured markdown content starting with a # heading.",
                state.getWorkspaceName(), absInput, absOutput);

        List<String> command = new ArrayList<>();
        command.add(copilotCommand);
        command.add("--agent");
        command.add(agent.getName());
        command.add("-p");
        command.add(prompt);
        command.add("--allow-all");
        command.add("--no-ask-user");
        command.add("--output-format");
        command.add("text");
        if (copilotModel != null) {
            command.add("--model");
            command.add(copilotModel);
        }
        command.add("--add-dir");
        command.add(projectRoot.toString());
        command.add("--add-dir");
        command.add(wsDir.toAbsolutePath().toString());

        logger.info("Invoking Copilot CLI: {} --agent {} --add-dir {} --add-dir {}",
                copilotCommand, agent.getName(), projectRoot, wsDir.toAbsolutePath());

        System.out.println("  Invoking Copilot CLI for " + agent.getName() + "...");

        ProcessBuilder pb = new ProcessBuilder(command);
        pb.directory(wsDir.toAbsolutePath().toFile());
        pb.redirectErrorStream(true);
        // Redirect stdin from NUL so copilot doesn't hang waiting for input
        pb.redirectInput(new File(System.getProperty("os.name").toLowerCase().contains("win") ? "NUL" : "/dev/null"));

        long outputSizeBefore = Files.exists(outputFile) ? Files.size(outputFile) : -1;

        TimerDisplay timer = new TimerDisplay();
        timer.start("Agent " + agent.getName() + " running via Copilot CLI");

        Process process = pb.start();

        // Read stdout in background thread
        CompletableFuture<String> stdoutFuture = CompletableFuture.supplyAsync(() -> {
            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
            } catch (IOException e) {
                logger.warn("Error reading copilot stdout for {}: {}", agent.getName(), e.getMessage());
            }
            return sb.toString().trim();
        });

        boolean finished = process.waitFor(COPILOT_TIMEOUT_MINUTES, TimeUnit.MINUTES);
        long elapsed = timer.stop();

        if (!finished) {
            logger.error("Copilot CLI timed out after {} minutes for agent {}.", COPILOT_TIMEOUT_MINUTES, agent.getName());
            process.destroyForcibly();
            process.waitFor(10, TimeUnit.SECONDS);

            // Check if agent managed to write output before timeout
            if (Files.exists(outputFile) && Files.size(outputFile) > 0
                    && Files.size(outputFile) != outputSizeBefore) {
                req.setState("IN_REVIEW");
                workspaceManager.saveState(state);

                String outRef = agent.getName() + "/" + agent.getOutputFileName();
                persistence.recordStateChange(state.getWorkspaceId(), req.getRequirementId(),
                        agent, "IN_PROGRESS", "IN_REVIEW", null, outRef, false);
                persistence.writeAgentLog(state.getWorkspaceId(), agent.getName(),
                        agent.getSequence(), "(timed out but output was written)", elapsed, -1);
                persistence.logPipelineAction(state.getWorkspaceId(),
                        "Agent " + agent.getName() + " timed out but output was written (" + elapsed + "s)");

                sanitizeOutputFile(outputFile);

                // For UserStoryAgent: split into individual story files and save to DB
                if (agent.getSequence() == 4) {
                    processUserStoryOutput(state, req, outputFile);
                }

                printAgentComplete(state, req, agent, elapsed);
                return;
            }

            ConsolePrinter.printError(agent.getName() + " timed out after " + COPILOT_TIMEOUT_MINUTES + " minutes.");
            pollForOutput(state, req, agent, outputFile);
            return;
        }

        int exitCode = process.exitValue();
        logger.info("Copilot CLI for agent {} exited with code {} in {}s", agent.getName(), exitCode, elapsed);

        // Get stdout
        String cliOutput;
        try {
            cliOutput = stdoutFuture.get(30, TimeUnit.SECONDS);
        } catch (Exception e) {
            cliOutput = "";
        }

        // Check if output file was written
        boolean outputWritten = Files.exists(outputFile) && Files.size(outputFile) > 0
                && Files.size(outputFile) != outputSizeBefore;

        if (!outputWritten && !cliOutput.isEmpty()) {
            // Agent didn't write file directly — sanitize and save CLI stdout as output
            Path agentDir = workspaceManager.getAgentDir(state.getWorkspaceId(), agent.getName());
            Files.createDirectories(agentDir);
            String sanitized = sanitizeCopilotOutput(cliOutput);
            String content = sanitized.isEmpty() ? cliOutput : sanitized;
            if (!content.isBlank()) {
                Files.writeString(outputFile, content);
                outputWritten = true;
                logger.info("Captured stdout as output for {} ({} bytes, exit code {})",
                        agent.getName(), content.length(), exitCode);
            }
        }

        if (exitCode != 0 && !outputWritten) {
            logger.error("Copilot CLI exited with code {} for agent {}. Output:\n{}", exitCode, agent.getName(), cliOutput);

            persistence.writeAgentLog(state.getWorkspaceId(), agent.getName(),
                    agent.getSequence(), cliOutput, elapsed, exitCode);
            persistence.recordStateChange(state.getWorkspaceId(), req.getRequirementId(),
                    agent, "IN_PROGRESS", "FAILED", null, null, false);
            persistence.logPipelineAction(state.getWorkspaceId(),
                    "Agent " + agent.getName() + " FAILED (exit code " + exitCode + ", " + elapsed + "s)");

            ConsolePrinter.printError(agent.getName() + " failed (exit code " + exitCode + ").");
            pollForOutput(state, req, agent, outputFile);
            return;
        }

        if (outputWritten) {
            // Sanitize output file
            sanitizeOutputFile(outputFile);

            // For UserStoryAgent: split into individual story files and save to DB
            if (agent.getSequence() == 4) {
                processUserStoryOutput(state, req, outputFile);
            }

            req.setState("IN_REVIEW");
            workspaceManager.saveState(state);
            long fileSize = Files.size(outputFile);

            // Record state transition and save execution log
            String outRef = agent.getName() + "/" + agent.getOutputFileName();
            persistence.recordStateChange(state.getWorkspaceId(), req.getRequirementId(),
                    agent, "IN_PROGRESS", "IN_REVIEW", null, outRef, false);
            persistence.writeAgentLog(state.getWorkspaceId(), agent.getName(),
                    agent.getSequence(), cliOutput, elapsed, exitCode);
            persistence.logPipelineAction(state.getWorkspaceId(),
                    "Agent " + agent.getName() + " completed: IN_REVIEW (" + elapsed + "s, " + fileSize + " bytes)");

            printAgentComplete(state, req, agent, elapsed);
        } else {
            System.out.println("  No output from " + agent.getName() + ". Waiting for manual output...");
            pollForOutput(state, req, agent, outputFile);
        }
    }

    /**
     * Poll the filesystem waiting for the output file to appear (manual mode).
     */
    private void pollForOutput(PipelineState state, PipelineState.RequirementState req,
                               AgentRegistry.AgentDef agent, Path outputFile)
            throws IOException, InterruptedException {

        TimerDisplay timer = new TimerDisplay();
        timer.start("Copilot is thinking... waiting for " + agent.getOutputFileName());

        for (int i = 0; i < MAX_POLL_ATTEMPTS; i++) {
            Thread.sleep(POLL_INTERVAL_MS);
            if (Files.exists(outputFile) && Files.size(outputFile) > 0) {
                long elapsed = timer.stop();
                req.setState("IN_REVIEW");
                workspaceManager.saveState(state);

                String outRef = agent.getName() + "/" + agent.getOutputFileName();
                persistence.recordStateChange(state.getWorkspaceId(), req.getRequirementId(),
                        agent, "IN_PROGRESS", "IN_REVIEW", null, outRef, false);
                persistence.logPipelineAction(state.getWorkspaceId(),
                        "Agent " + agent.getName() + " output detected via polling (" + elapsed + "s)");

                sanitizeOutputFile(outputFile);

                printAgentComplete(state, req, agent, elapsed);
                return;
            }
        }
        timer.stop();
        System.out.println("  Timeout waiting for output. Run 'workflow status --workspace "
                + state.getWorkspaceId() + " --requirement " + req.getRequirementId() + "' to check.");
    }

    /**
     * Parse UserStoryAgent output, split into individual .md files in the agent directory,
     * and sync each user story to the DB via REST API.
     */
    private void processUserStoryOutput(PipelineState state, PipelineState.RequirementState req, Path outputFile) {
        try {
            if (!Files.exists(outputFile) || Files.size(outputFile) == 0) return;

            String content = Files.readString(outputFile);
            Path agentDir = outputFile.getParent();

            // Parse user stories by finding **Story ID**: US-XXX patterns
            Pattern storyIdPattern = Pattern.compile("\\*\\*Story\\s+ID\\*\\*:\\s*(US-\\d+)", Pattern.CASE_INSENSITIVE);
            Pattern titlePattern = Pattern.compile("\\*\\*Title\\*\\*:\\s*(.+)", Pattern.CASE_INSENSITIVE);
            Pattern priorityPattern = Pattern.compile("\\*\\*Priority\\*\\*:\\s*(P[012])", Pattern.CASE_INSENSITIVE);

            String[] lines = content.split("\n", -1);

            // Find all story start positions (lines with Story ID)
            List<int[]> storyPositions = new ArrayList<>();
            for (int i = 0; i < lines.length; i++) {
                if (storyIdPattern.matcher(lines[i]).find()) {
                    storyPositions.add(new int[]{i, -1});
                }
            }

            if (storyPositions.isEmpty()) {
                logger.info("No individual user stories found to split.");
                return;
            }

            // Set boundaries: each story runs from its heading to just before the next story's heading
            for (int s = 0; s < storyPositions.size(); s++) {
                // Find the heading above the Story ID line
                int headingStart = storyPositions.get(s)[0];
                int searchFloor = (s > 0) ? storyPositions.get(s - 1)[0] + 1 : 0;
                for (int h = storyPositions.get(s)[0] - 1; h >= searchFloor; h--) {
                    if (lines[h].trim().startsWith("#")) {
                        headingStart = h;
                        break;
                    }
                    if (!lines[h].isBlank() && !lines[h].trim().equals("---")) break;
                }
                storyPositions.get(s)[0] = headingStart;

                if (s + 1 < storyPositions.size()) {
                    int nextStart = storyPositions.get(s + 1)[0];
                    int end = nextStart - 1;
                    while (end > headingStart && (lines[end].isBlank() || lines[end].trim().equals("---"))) end--;
                    storyPositions.get(s)[1] = end;
                } else {
                    storyPositions.get(s)[1] = lines.length - 1;
                }
            }

            int fileCount = 0;
            StringBuilder indexContent = new StringBuilder("# User Stories Index\n\n");

            for (int[] bounds : storyPositions) {
                StringBuilder storyContent = new StringBuilder();
                String storyId = null, title = null, priority = null;

                for (int i = bounds[0]; i <= bounds[1]; i++) {
                    storyContent.append(lines[i]).append("\n");
                    if (storyId == null) {
                        Matcher m = storyIdPattern.matcher(lines[i]);
                        if (m.find()) storyId = m.group(1);
                    }
                    if (title == null) {
                        Matcher m = titlePattern.matcher(lines[i]);
                        if (m.find()) title = m.group(1).trim();
                    }
                    if (priority == null) {
                        Matcher m = priorityPattern.matcher(lines[i]);
                        if (m.find()) priority = m.group(1).toUpperCase();
                    }
                }

                if (storyId == null) continue;
                if (title == null) title = "Untitled";
                if (priority == null) priority = "P1";

                // Build filename: US-001-Story-Title.md
                String safeName = title.replaceAll("[^A-Za-z0-9\\s-]", "").trim().replaceAll("\\s+", "-");
                if (safeName.length() > 60) safeName = safeName.substring(0, 60);
                String fileName = storyId + "-" + safeName + ".md";

                // Create per-story subfolder: UserStoryAgent/<storyId>/
                Path storyFolder = agentDir.resolve(storyId);
                Files.createDirectories(storyFolder);
                Path storyFile = storyFolder.resolve(fileName);
                Files.writeString(storyFile, storyContent.toString().trim());
                fileCount++;

                indexContent.append("- [").append(storyId).append("] ").append(title)
                        .append(" (").append(priority).append(")\n");

                // Sync to DB via REST API (best-effort)
                syncUserStoryToApi(state.getWorkspaceId(), req.getRequirementId(),
                        storyId, title, priority, storyFile.toString(), storyContent.toString().trim());

                logger.debug("Created user story file: {} in folder {}", storyFile, storyFolder);
            }

            // Write INDEX.md at the agent level (outside story folders)
            if (fileCount > 0) {
                Files.writeString(agentDir.resolve("INDEX.md"), indexContent.toString());
            }

            System.out.println("  [OK] Split " + fileCount + " user stories into individual files.");
            persistence.logPipelineAction(state.getWorkspaceId(),
                    "UserStoryAgent: split " + fileCount + " stories into individual .md files and saved to DB");

        } catch (IOException e) {
            logger.warn("Failed to process UserStoryAgent output: {}", e.getMessage());
        }
    }

    /**
     * Sync a single user story to the DB via REST API (best-effort).
     */
    private void syncUserStoryToApi(int workspaceId, int requirementId,
                                    String storyId, String title, String priority,
                                    String filePath, String content) {
        try {
            ApiClient client = new ApiClient("http://localhost:8080");
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("workspaceId", (long) workspaceId);
            body.put("requirementId", (long) requirementId);
            body.put("storyId", storyId);
            body.put("title", title);
            body.put("priority", priority);
            body.put("filePath", filePath);
            body.put("userStoryText", content);

            ApiClient.ApiResponse resp = client.post("/userstory/save", body);
            if (resp.isSuccess()) {
                logger.debug("Synced user story {} to DB via API", storyId);
            } else {
                logger.debug("User story API sync failed for {}: status={}", storyId, resp.getStatusCode());
            }
        } catch (Exception e) {
            logger.debug("User story API sync failed for {}: {}", storyId, e.getMessage());
        }
    }

    /**
     * Extract code blocks from CodingAgent output file into actual source files.
     * Parses ### FILE: <path> sections followed by code blocks and writes them to the code directory.
     */
    private void extractCodeFromOutput(Path outputFile, Path finalCodesDir) throws IOException {
        if (!Files.exists(outputFile)) return;

        String content = Files.readString(outputFile);
        // Match multiple agent output formats:
        // 1. ### FILE: <path>     2. ## File: `<path>`     3. ## `<path>`
        // 4. ## File 1 — `<path>`  5. ## File 1 - `<path>`
        // followed by optional blank lines then ```<lang>\n<code>\n```
        Pattern filePattern = Pattern.compile(
                "#{2,3}\\s+(?:FILE:|File(?:\\s+\\d+)?\\s*[\\u2014\\-:])?\\s*`?([^`\\n]+?)`?\\s*(?:\\r?\\n)+```\\w*\\r?\\n(.*?)\\r?\\n```",
                Pattern.DOTALL);
        Matcher matcher = filePattern.matcher(content);

        int count = 0;
        while (matcher.find()) {
            String relativePath = matcher.group(1).trim();
            String code = matcher.group(2);

            // Strip any leading folder prefix like "TheatreManagement_finalcodes/" or "ProjectName_agents/"
            relativePath = relativePath.replaceFirst("^[A-Za-z0-9_-]+_(finalcodes|agents)/", "");

            // Security: prevent directory traversal
            if (relativePath.contains("..") || relativePath.startsWith("/") || relativePath.startsWith("\\")) {
                logger.warn("Skipping suspicious path in CodingAgent output: {}", relativePath);
                continue;
            }

            Path targetFile = finalCodesDir.resolve(relativePath);
            Files.createDirectories(targetFile.getParent());
            Files.writeString(targetFile, code);
            count++;
            logger.info("Extracted: {} ({} bytes)", relativePath, code.length());
        }

        if (count > 0) {
            System.out.println("  [OK] Extracted " + count + " source file(s) to " + finalCodesDir.getFileName() + "/");
        } else {
            logger.warn("No code blocks found in CodingAgent output. Output length: {}", content.length());
            System.out.println("  [WARN] No code blocks found in output. Check output with: workflow output --agent CODE");
        }
    }

    /**
     * Post-process CodingAgent output: move flat files into subfolders based on filename patterns.
     * Works for any tech stack — uses filename heuristics to determine the target subfolder.
     */
    @SuppressWarnings("unused")
    private void organizeCodeFiles(Path finalCodesDir) throws IOException {
        // Map of filename patterns (case-insensitive) to target subfolder names
        Map<String, String> patternToFolder = new LinkedHashMap<>();
        // Java / Spring patterns
        patternToFolder.put("controller", "controller");
        patternToFolder.put("resource", "controller");  // JAX-RS style
        patternToFolder.put("service", "service");
        patternToFolder.put("repository", "repository");
        patternToFolder.put("dao", "repository");
        patternToFolder.put("model", "model");
        patternToFolder.put("entity", "model");
        patternToFolder.put("dto", "dto");
        patternToFolder.put("request", "dto");
        patternToFolder.put("response", "dto");
        patternToFolder.put("exception", "exception");
        patternToFolder.put("error", "exception");
        patternToFolder.put("handler", "handler");
        patternToFolder.put("advice", "handler");
        patternToFolder.put("config", "config");
        patternToFolder.put("security", "config");
        patternToFolder.put("cors", "config");
        patternToFolder.put("jwt", "config");
        patternToFolder.put("filter", "config");
        patternToFolder.put("interceptor", "config");
        patternToFolder.put("middleware", "middleware");
        patternToFolder.put("util", "util");
        patternToFolder.put("helper", "util");
        patternToFolder.put("mapper", "util");
        patternToFolder.put("converter", "util");
        // Python patterns
        patternToFolder.put("schema", "schemas");
        patternToFolder.put("route", "routes");
        patternToFolder.put("view", "views");

        // Files that stay at root (build files, entry points, markdown)
        Set<String> rootFiles = Set.of("pom.xml", "build.gradle", "build.gradle.kts",
                "package.json", "requirements.txt", "pyproject.toml", "cargo.toml",
                "go.mod", "go.sum", "makefile", "dockerfile", ".env");

        // Properties/config files go in resources/
        Set<String> resourceExtensions = Set.of(".properties", ".yaml", ".yml", ".sql", ".json", ".toml", ".ini", ".cfg");

        int moved = 0;
        List<Path> filesToProcess;
        try (var stream = Files.list(finalCodesDir)) {
            filesToProcess = stream
                    .filter(Files::isRegularFile)
                    .filter(p -> !p.getFileName().toString().endsWith(".md")) // skip markdown
                    .toList();
        }

        for (Path file : filesToProcess) {
            String fileName = file.getFileName().toString();
            String fileNameLower = fileName.toLowerCase();

            // Skip files that belong at root
            if (rootFiles.contains(fileNameLower)) continue;

            // Check if it's the main Application entry point (stays at root)
            if (fileNameLower.contains("application") && !fileNameLower.contains("properties")
                    && !fileNameLower.contains("yaml") && !fileNameLower.contains("yml")) {
                continue;
            }
            if (fileNameLower.equals("main.py") || fileNameLower.equals("app.py")
                    || fileNameLower.equals("app.js") || fileNameLower.equals("index.js")
                    || fileNameLower.equals("main.go") || fileNameLower.equals("main.rs")) {
                continue;
            }

            // Check if it's a resource/config file by extension
            String targetFolder = null;
            for (String ext : resourceExtensions) {
                if (fileNameLower.endsWith(ext)) {
                    targetFolder = "resources";
                    break;
                }
            }

            // If not a resource file, match by filename pattern
            if (targetFolder == null) {
                String nameWithoutExt = fileNameLower.contains(".")
                        ? fileNameLower.substring(0, fileNameLower.lastIndexOf('.'))
                        : fileNameLower;
                for (Map.Entry<String, String> entry : patternToFolder.entrySet()) {
                    if (nameWithoutExt.contains(entry.getKey())) {
                        targetFolder = entry.getValue();
                        break;
                    }
                }
            }

            // If we found a target, move the file
            if (targetFolder != null) {
                Path targetDir = finalCodesDir.resolve(targetFolder);
                Files.createDirectories(targetDir);
                Path targetPath = targetDir.resolve(fileName);
                Files.move(file, targetPath, StandardCopyOption.REPLACE_EXISTING);
                moved++;
                logger.debug("Moved {} → {}/{}", fileName, targetFolder, fileName);
            }
        }

        if (moved > 0) {
            System.out.println("  \u2714 Organized " + moved + " file(s) into subfolders.");
        }
    }
}
