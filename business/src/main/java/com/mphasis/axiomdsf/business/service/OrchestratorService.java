package com.mphasis.axiomdsf.business.service;

import com.mphasis.axiomdsf.business.config.AgentConfigProperties;
import com.mphasis.axiomdsf.business.config.AgentPipelineProperties;
import com.mphasis.axiomdsf.business.model.AgentState;
import com.mphasis.axiomdsf.persistence.entity.UserStory;
import com.mphasis.axiomdsf.persistence.entity.Workflow;
import com.mphasis.axiomdsf.persistence.entity.Workspace;
import com.mphasis.axiomdsf.persistence.port.out.UserStoryPersistencePort;
import com.mphasis.axiomdsf.persistence.port.out.WorkflowPersistencePort;
import com.mphasis.axiomdsf.persistence.port.out.WorkspacePersistencePort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;

@Service
public class OrchestratorService {

    private static final Logger logger = LoggerFactory.getLogger(OrchestratorService.class);

    private final AgentPipelineProperties pipelineProperties;
    private final FileStorageService fileStorageService;
    private final CopilotAgentService copilotAgentService;
    private final EventService eventService;
    private final WorkflowPersistencePort workflowPort;
    private final WorkspacePersistencePort workspacePort;
    private final UserStoryPersistencePort userStoryPort;
    private final Executor agentExecutor;
    private final AzureDevOpsIntegrationService azureDevOpsIntegrationService;

    public OrchestratorService(AgentPipelineProperties pipelineProperties,
                               FileStorageService fileStorageService,
                               CopilotAgentService copilotAgentService,
                               EventService eventService,
                               WorkflowPersistencePort workflowPort,
                               WorkspacePersistencePort workspacePort,
                               UserStoryPersistencePort userStoryPort,
                               @Qualifier("agentExecutor") Executor agentExecutor,
                               AzureDevOpsIntegrationService azureDevOpsIntegrationService) {
        this.pipelineProperties = pipelineProperties;
        this.fileStorageService = fileStorageService;
        this.copilotAgentService = copilotAgentService;
        this.eventService = eventService;
        this.workflowPort = workflowPort;
        this.workspacePort = workspacePort;
        this.userStoryPort = userStoryPort;
        this.agentExecutor = agentExecutor;
        this.azureDevOpsIntegrationService = azureDevOpsIntegrationService;
    }

    /**
     * Start orchestration for the first agent in the pipeline (or a specific agent if provided).
     * Creates the workflow record synchronously (INIT -> IN_PROGRESS),
     * then invokes the agent asynchronously. Returns immediately.
     */
    public Workflow startOrchestration(Workspace workspace, Long requirementId, Long userStoryId) {
        return startOrchestration(workspace, requirementId, userStoryId, null, "per-story", null);
    }

    /**
     * Start orchestration from a specific agent. If startAgentName is null, starts from the first agent.
     * For per-story pipelines, pass the userStoryId and agentName (e.g. "TRReviewAgent") to skip shared agents.
     */
    public Workflow startOrchestration(Workspace workspace, Long requirementId, Long userStoryId, String startAgentName) {
        return startOrchestration(workspace, requirementId, userStoryId, startAgentName, "per-story", null);
    }

    /**
     * Start orchestration from a specific agent with an explicit pipeline mode.
     * Sets pipelineMode on the workflow BEFORE the first save to prevent race conditions.
     */
    public Workflow startOrchestration(Workspace workspace, Long requirementId, Long userStoryId, String startAgentName, String pipelineMode) {
        return startOrchestration(workspace, requirementId, userStoryId, startAgentName, pipelineMode, null);
    }

    /**
     * Start orchestration from a specific agent with an explicit pipeline mode and selected agents.
     * Sets pipelineMode and selectedAgents on the workflow BEFORE the first save to prevent race conditions
     * with the background agent thread overwriting these fields.
     */
    public Workflow startOrchestration(Workspace workspace, Long requirementId, Long userStoryId, String startAgentName, String pipelineMode, List<String> selectedAgents) {
        AgentConfigProperties startAgent;
        if (startAgentName != null && !startAgentName.isBlank()) {
            startAgent = pipelineProperties.getAgentByName(startAgentName)
                    .orElseThrow(() -> new IllegalArgumentException("Unknown agent: " + startAgentName));
            logger.info("Starting orchestration from specific agent: {} (order={})", startAgentName, startAgent.getExecutionOrder());
        } else {
            startAgent = pipelineProperties.getFirstAgent()
                    .orElseThrow(() -> new IllegalStateException("No agents configured in pipeline"));
        }

        String selectedAgentsStr = (selectedAgents != null && !selectedAgents.isEmpty())
                ? String.join(",", selectedAgents) : null;
        return initiateAgent(workspace, requirementId, userStoryId, startAgent, pipelineMode, selectedAgentsStr);
    }

    /**
     * Advance to the next agent after the current one has been approved.
     * Returns the new workflow in IN_PROGRESS state (agent runs async),
     * or the approved workflow if it's the last agent.
     * 
     * In per-story mode, STOPS after UserStoryAgent — the user manually starts
     * the per-story pipeline (Test Review → Security) for each user story.
     * In full-sequence mode, agents 5-10 are NOT per-story — they run once for all stories.
     */
    public Workflow advanceToNextAgent(Workflow currentWorkflow, Workspace workspace) {
        List<String> selectedAgents = currentWorkflow.getSelectedAgentsList();
        AgentConfigProperties nextAgentConfig = pipelineProperties.getNextAgent(
                currentWorkflow.getAgentName(), selectedAgents.isEmpty() ? null : selectedAgents)
                .orElse(null);

        if (nextAgentConfig == null) {
            // Last agent — mark as complete
            logger.info("All agents complete for workspace={}, requirement={}",
                    currentWorkflow.getWorkspaceId(), currentWorkflow.getRequirementId());
            currentWorkflow.setCompletionStatus(true);
            return workflowPort.save(currentWorkflow);
        }

        // Propagate pipeline mode to the next workflow
        Long userStoryId = currentWorkflow.getUserStoryId();
        String pipelineMode = currentWorkflow.getPipelineMode() != null ? currentWorkflow.getPipelineMode() : "per-story";
        
        // In per-story mode, STOP after UserStoryAgent (agent 4).
        // The user will manually kick off the per-story pipeline (TRReview→Security) for each story.
        if ("per-story".equals(pipelineMode) && "UserStoryAgent".equals(currentWorkflow.getAgentName())) {
            logger.info("Per-story mode: stopping shared pipeline after UserStoryAgent. " +
                    "User will start per-story pipelines manually for each user story.");
            currentWorkflow.setCompletionStatus(true);
            return workflowPort.save(currentWorkflow);
        }

        // In full-sequence mode, never use per-story scoping — userStoryId stays null
        if ("full-sequence".equals(pipelineMode)) {
            userStoryId = null;
        }

        // Parallel fan-out: after CodingAgent, launch SCA and SEC in parallel
        // (both depend only on CODE output, not on each other)
        if ("CodingAgent".equals(currentWorkflow.getAgentName())) {
            List<AgentConfigProperties> parallelAgents = findParallelSuccessors(currentWorkflow.getAgentName(), selectedAgents);
            if (parallelAgents.size() > 1) {
                logger.info("Fan-out: launching {} agents in parallel after CodingAgent: {}",
                        parallelAgents.size(), parallelAgents.stream().map(AgentConfigProperties::getAgentName).toList());
                Workflow firstWorkflow = null;
                for (AgentConfigProperties parallelAgent : parallelAgents) {
                    Workflow wf = initiateAgent(workspace, currentWorkflow.getRequirementId(),
                            userStoryId, parallelAgent, pipelineMode, currentWorkflow.getSelectedAgents());
                    if (firstWorkflow == null) firstWorkflow = wf;
                }
                return firstWorkflow;
            }
        }

        Workflow nextWorkflow = initiateAgent(workspace, currentWorkflow.getRequirementId(),
                userStoryId, nextAgentConfig, pipelineMode, currentWorkflow.getSelectedAgents());
        return nextWorkflow;
    }

    /**
     * Find agents that can run in parallel after the given agent.
     * Two agents are parallel if they both depend on the current agent but not on each other.
     * In practice: SCA(9) and SEC(10) both depend on CODE(8).
     */
    private List<AgentConfigProperties> findParallelSuccessors(String currentAgentName, List<String> selectedAgents) {
        List<AgentConfigProperties> enabledAgents = (selectedAgents != null && !selectedAgents.isEmpty())
                ? pipelineProperties.buildDynamicPipeline(selectedAgents)
                : pipelineProperties.getEnabledAgentsInOrder();

        AgentConfigProperties current = pipelineProperties.getAgentByName(currentAgentName).orElse(null);
        if (current == null) return List.of();

        int currentOrder = current.getExecutionOrder();
        // Find all agents whose ONLY dependency is the current agent's type
        String currentType = current.getAgentType();
        List<AgentConfigProperties> successors = new ArrayList<>();
        for (AgentConfigProperties agent : enabledAgents) {
            if (agent.getExecutionOrder() > currentOrder
                    && agent.getDependencies().size() == 1
                    && agent.getDependencies().contains(currentType)) {
                successors.add(agent);
            }
        }
        return successors.isEmpty() ? List.of() : successors;
    }

    /**
     * Re-run an agent with rework input (comments + previous output + original input).
     * Sets up REWORK -> IN_PROGRESS synchronously, runs agent async.
     */
    public Workflow reworkAgent(Workflow workflow, Workspace workspace, String comments) {
        String agentName = workflow.getAgentName();
        Long requirementId = workflow.getRequirementId();

        // Transition: current state -> REWORK
        String prevState = workflow.getState();
        workflow.setState(AgentState.REWORK.name());
        workflowPort.save(workflow);
        eventService.recordStateTransition(workspace.getId(), workflow.getId(),
                requirementId, workflow.getUserStoryId(), agentName, prevState, AgentState.REWORK.name());

        // Prepare rework input (include userStoryId for per-story agents)
        try {
            // Delete old output so stale results aren't shown if rework fails
            Path oldOutput = fileStorageService.getAgentOutputPath(workspace, agentName, workflow.getUserStoryId());
            if (Files.exists(oldOutput)) {
                Files.delete(oldOutput);
                logger.info("Deleted old output for rework: {}", oldOutput);
            }
            // Clear stale output wiki URL since old output was deleted
            workflow.setOutputWikiUrl(null);

            fileStorageService.prepareReworkInput(workspace, agentName, comments, workflow.getUserStoryId());

            // Regenerate inputWikiUrl for the new rework input
            if (workspace.isAzureDevOpsEnabled()) {
                try {
                    Path inputPath = fileStorageService.getAgentInputPath(workspace, agentName, workflow.getUserStoryId());
                    String reworkContent = Files.readString(inputPath);
                    String reworkInputUrl = azureDevOpsIntegrationService.saveAgentInput(
                            workspace.getId(), requirementId, agentName, reworkContent, workflow.getUserStoryId());
                    if (reworkInputUrl != null) {
                        workflow.setInputWikiUrl(reworkInputUrl);
                    }
                } catch (Exception wikiEx) {
                    logger.warn("Failed to save rework input to wiki for {}: {}", agentName, wikiEx.getMessage());
                }
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to prepare rework input for " + agentName, e);
        }

        // Transition: REWORK -> IN_PROGRESS
        workflow.setState(AgentState.IN_PROGRESS.name());
        workflowPort.save(workflow);
        eventService.recordStateTransition(workspace.getId(), workflow.getId(),
                requirementId, workflow.getUserStoryId(), agentName, AgentState.REWORK.name(), AgentState.IN_PROGRESS.name());
        recordEvent(workspace, workflow, AgentState.IN_PROGRESS.name());

        // Invoke the agent asynchronously via executor
        final Long wsId = workspace.getId();
        final Long wfId = workflow.getId();
        agentExecutor.execute(() -> invokeAgentInBackground(wsId, wfId, agentName));

        logger.info("Agent {} rework started asynchronously, workflow in IN_PROGRESS", agentName);
        return workflow;
    }

    /**
     * Create workflow record synchronously (INIT -> IN_PROGRESS),
     * prepare input, then invoke agent asynchronously.
     * Returns the workflow in IN_PROGRESS state immediately.
     */
    @SuppressWarnings("unused")
    private Workflow initiateAgent(Workspace workspace, Long requirementId, Long userStoryId,
                                   AgentConfigProperties agentConfig) {
        return initiateAgent(workspace, requirementId, userStoryId, agentConfig, null, null);
    }

    private Workflow initiateAgent(Workspace workspace, Long requirementId, Long userStoryId,
                                   AgentConfigProperties agentConfig, String pipelineMode, String selectedAgents) {
        String agentName = agentConfig.getAgentName();
        logger.info("Initiating agent: {} (order={})", agentName, agentConfig.getExecutionOrder());

        // Create workflow record in INIT state
        // Set pipelineMode and selectedAgents BEFORE the first save to prevent race conditions
        // with the background agent thread (which loads the workflow and could overwrite these fields).
        Workflow workflow = new Workflow();
        workflow.setWorkspaceId(workspace.getId());
        workflow.setRequirementId(requirementId);
        workflow.setUserStoryId(userStoryId);
        workflow.setAgentName(agentName);
        workflow.setState(AgentState.INIT.name());
        workflow.setSequenceNumber(agentConfig.getExecutionOrder());
        workflow.setCreatedAt(LocalDateTime.now());
        if (pipelineMode != null) {
            workflow.setPipelineMode(pipelineMode);
        }
        if (selectedAgents != null) {
            workflow.setSelectedAgents(selectedAgents);
        }
        workflow = workflowPort.save(workflow);

        eventService.recordStateTransition(workspace.getId(), workflow.getId(),
                requirementId, userStoryId, agentName, null, AgentState.INIT.name());
        recordEvent(workspace, workflow, AgentState.INIT.name());

        // INIT -> IN_PROGRESS: prepare input
        workflow.setState(AgentState.IN_PROGRESS.name());
        Path inputPath = fileStorageService.getAgentInputPath(workspace, agentName, userStoryId);
        workflow.setInputFilePath(inputPath.toString());
        workflowPort.save(workflow);

        eventService.recordStateTransition(workspace.getId(), workflow.getId(),
                requirementId, userStoryId, agentName, AgentState.INIT.name(), AgentState.IN_PROGRESS.name());
        recordEvent(workspace, workflow, AgentState.IN_PROGRESS.name());

        // Prepare the agent input file synchronously (fast, just file I/O)
        try {
            fileStorageService.prepareAgentInput(workspace, requirementId, agentName, userStoryId);
            
            // Save agent input to Azure DevOps wiki and store URL in workflow
            if (workspace.isAzureDevOpsEnabled()) {
                try {
                    String inputContent = Files.readString(inputPath);
                    String inputWikiUrl = azureDevOpsIntegrationService.saveAgentInput(
                            workspace.getId(), requirementId, agentName, inputContent, userStoryId);
                    if (inputWikiUrl != null) {
                        workflow.setInputWikiUrl(inputWikiUrl);
                        workflowPort.save(workflow);
                    }
                } catch (Exception wikiEx) {
                    logger.warn("Failed to save agent input to wiki for {}: {}", agentName, wikiEx.getMessage());
                }
            }
        } catch (IOException e) {
            logger.error("Failed to prepare input for agent {}: {}", agentName, e.getMessage(), e);
            workflow.setState(AgentState.FAILED.name());
            workflowPort.save(workflow);
            throw new RuntimeException("Failed to prepare input for " + agentName + ": " + e.getMessage(), e);
        }

        // Invoke agent asynchronously via executor — this returns immediately
        final Long wsId = workspace.getId();
        final Long wfId = workflow.getId();
        agentExecutor.execute(() -> invokeAgentInBackground(wsId, wfId, agentName));

        logger.info("Agent {} initiated: INIT -> IN_PROGRESS (copilot running async)", agentName);
        return workflow;
    }

    /**
     * Run the copilot CLI agent in a background thread.
     * On success: transitions workflow IN_PROGRESS -> IN_REVIEW.
     * On failure: transitions workflow to FAILED.
     * Called via agentExecutor.execute() — NOT via @Async (self-call won't proxy).
     */
    private void invokeAgentInBackground(Long workspaceId, Long workflowId, String agentName) {
        logger.info("Background agent invocation started: agent={}, workflowId={}", agentName, workflowId);

        Workspace workspace = workspacePort.findById(workspaceId)
                .orElseThrow(() -> new IllegalStateException("Workspace not found: " + workspaceId));
        Workflow workflow = workflowPort.findById(workflowId)
                .orElseThrow(() -> new IllegalStateException("Workflow not found: " + workflowId));

        try {
            String result = copilotAgentService.invokeAgent(workspace, agentName, workflow.getUserStoryId());
            logger.info("Copilot agent {} returned {} chars of output", agentName, result != null ? result.length() : 0);

            // IN_PROGRESS -> IN_REVIEW
            workflow.setState(AgentState.IN_REVIEW.name());
            Path outputPath = fileStorageService.getAgentOutputPath(workspace, agentName, workflow.getUserStoryId());
            workflow.setOutputFilePath(outputPath.toString());
            
            // Save agent output to Azure DevOps wiki and store URL
            if (workspace.isAzureDevOpsEnabled()) {
                try {
                    String outputContent = Files.readString(outputPath);
                    String outputWikiUrl = azureDevOpsIntegrationService.saveAgentOutput(
                            workspace.getId(), workflow.getRequirementId(), agentName, 
                            outputContent, workflow.getUserStoryId());
                    if (outputWikiUrl != null) {
                        workflow.setOutputWikiUrl(outputWikiUrl);
                    }
                } catch (Exception wikiEx) {
                    logger.warn("Failed to save agent output to wiki for {}: {}", agentName, wikiEx.getMessage());
                }
            }
            
            logger.info("Saving workflow {} state to IN_REVIEW...", workflowId);
            workflowPort.save(workflow);
            logger.info("Workflow {} saved as IN_REVIEW successfully", workflowId);

            // Post-processing: split UserStoryAgent output into individual files and save to DB
            if ("UserStoryAgent".equals(agentName)) {
                processUserStoryOutput(workspace, workflow, outputPath);
            }

            eventService.recordStateTransition(workspaceId, workflow.getId(),
                    workflow.getRequirementId(), workflow.getUserStoryId(),
                    agentName, AgentState.IN_PROGRESS.name(), AgentState.IN_REVIEW.name());
            recordEvent(workspace, workflow, AgentState.IN_REVIEW.name());

            logger.info("Background agent {} completed: IN_PROGRESS -> IN_REVIEW", agentName);

        } catch (Exception e) {
            logger.error("Background agent invocation failed for {}: {}", agentName, e.getMessage(), e);

            try {
                workflow.setState(AgentState.FAILED.name());
                workflowPort.save(workflow);
                eventService.recordStateTransition(workspaceId, workflow.getId(),
                        workflow.getRequirementId(), workflow.getUserStoryId(),
                        agentName, AgentState.IN_PROGRESS.name(), AgentState.FAILED.name());
                recordEvent(workspace, workflow, AgentState.FAILED.name());
            } catch (Exception saveEx) {
                logger.error("Failed to save FAILED state for workflow {}: {}", workflowId, saveEx.getMessage(), saveEx);
            }
        }
    }

    /**
     * Parse UserStoryAgent output, split into individual .md files,
     * and save each user story to the database.
     * Falls back to scanning the directory for individual US-*.md files
     * when the combined output doesn't contain story markers.
     */
    private void processUserStoryOutput(Workspace workspace, Workflow workflow, Path outputPath) {
        try {
            List<Map<String, String>> stories = List.of();

            // Strategy 1: Try parsing the combined output file
            if (Files.exists(outputPath)) {
                String outputContent = Files.readString(outputPath);
                stories = fileStorageService.parseUserStories(outputContent);
            }

            // Strategy 2: Fallback — scan directory for individual US-*.md files
            if (stories.isEmpty()) {
                logger.info("Combined output parsing yielded no stories; falling back to directory scan for workspace={}",
                        workspace.getId());
                stories = fileStorageService.parseUserStoriesFromDirectory(workspace);
            }

            if (stories.isEmpty()) {
                logger.warn("No user stories parsed from output or directory for workspace={}", workspace.getId());
                return;
            }

            // Clear existing user stories for this workspace/requirement (handles rework)
            userStoryPort.deleteByWorkspaceIdAndRequirementId(
                    workspace.getId(), workflow.getRequirementId());

            boolean fromDirectory = stories.get(0).containsKey("filePath");

            // Save each story to the database (no local files — stories go to DB + work items)
            for (int i = 0; i < stories.size(); i++) {
                Map<String, String> storyData = stories.get(i);
                UserStory userStory = new UserStory();
                userStory.setStoryId(storyData.get("storyId"));
                userStory.setTitle(storyData.get("title"));
                userStory.setPriority(storyData.get("priority"));
                userStory.setWorkspaceId(workspace.getId());
                userStory.setRequirementId(workflow.getRequirementId());
                userStory.setUserStoryText(storyData.get("content"));

                if (fromDirectory) {
                    userStory.setFilePath(storyData.get("filePath"));
                }

                userStory.setCreatedAt(LocalDateTime.now());
                userStoryPort.save(userStory);
            }

            logger.info("Processed {} user stories for workspace={}, requirement={} (source={})",
                    stories.size(), workspace.getId(), workflow.getRequirementId(),
                    fromDirectory ? "directory" : "combined-output");

            // Auto-create User Story work items in Azure DevOps Boards for both pipeline modes
            if (workspace.isAzureDevOpsEnabled()) {
                try {
                    azureDevOpsIntegrationService.onUserStoryAgentApproved(
                            workspace.getId(), workflow.getRequirementId());
                    logger.info("Auto-created Azure DevOps User Story work items for requirement={}",
                            workflow.getRequirementId());
                } catch (Exception e) {
                    logger.error("Failed to auto-create Azure DevOps User Story work items: {}",
                            e.getMessage(), e);
                }
            }

        } catch (Exception e) {
            logger.error("Failed to process UserStoryAgent output: {}", e.getMessage(), e);
            // Non-fatal: the main output file still exists, just individual files/DB not populated
        }
    }

    private void recordEvent(Workspace workspace, Workflow workflow, String state) {
        AgentConfigProperties agentConfig = pipelineProperties.getAgentByName(workflow.getAgentName()).orElse(null);
        eventService.recordEvent(
                workspace.getId(), workflow.getRequirementId(), workflow.getUserStoryId(),
                workflow.getAgentName(), state,
                workflow.getInputFilePath(), workflow.getOutputFilePath(),
                agentConfig != null ? agentConfig.getExecutionOrder() : null,
                agentConfig != null ? agentConfig.getAgentType() : null,
                agentConfig != null ? agentConfig.isEnabled() : null);
    }
}
