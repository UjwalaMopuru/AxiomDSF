package com.mphasis.axiomdsf.business.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.mphasis.axiomdsf.business.config.AgentConfigProperties;
import com.mphasis.axiomdsf.business.config.AgentPipelineProperties;
import com.mphasis.axiomdsf.business.dto.StartWorkflowRequest;
import com.mphasis.axiomdsf.business.dto.WorkflowApprovalRequest;
import com.mphasis.axiomdsf.business.model.AgentState;
import com.mphasis.axiomdsf.business.port.in.WorkflowUseCase;
import com.mphasis.axiomdsf.persistence.entity.Requirement;
import com.mphasis.axiomdsf.persistence.entity.Workflow;
import com.mphasis.axiomdsf.persistence.entity.Workspace;
import com.mphasis.axiomdsf.persistence.port.out.RequirementPersistencePort;
import com.mphasis.axiomdsf.persistence.port.out.WorkflowPersistencePort;
import com.mphasis.axiomdsf.persistence.port.out.WorkspacePersistencePort;

@Service
public class WorkflowService implements WorkflowUseCase {

    private static final Logger logger = LoggerFactory.getLogger(WorkflowService.class);

    private final WorkflowPersistencePort workflowPort;
    private final WorkspacePersistencePort workspacePort;
    private final RequirementPersistencePort requirementPort;
    private final OrchestratorService orchestratorService;
    private final FileStorageService fileStorageService;
    private final EventService eventService;
    private final AgentPipelineProperties pipelineProperties;
    private final AzureDevOpsIntegrationService azureDevOpsService;

    public WorkflowService(WorkflowPersistencePort workflowPort,
                           WorkspacePersistencePort workspacePort,
                           RequirementPersistencePort requirementPort,
                           OrchestratorService orchestratorService,
                           FileStorageService fileStorageService,
                           EventService eventService,
                           AgentPipelineProperties pipelineProperties,
                           AzureDevOpsIntegrationService azureDevOpsService) {
        this.workflowPort = workflowPort;
        this.workspacePort = workspacePort;
        this.requirementPort = requirementPort;
        this.orchestratorService = orchestratorService;
        this.fileStorageService = fileStorageService;
        this.eventService = eventService;
        this.pipelineProperties = pipelineProperties;
        this.azureDevOpsService = azureDevOpsService;
    }

    @Override
    public Workflow startWorkflow(StartWorkflowRequest request) {
        Long workspaceId = request.getWorkspaceId();
        Workspace workspace = workspacePort.findById(workspaceId)
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found: " + workspaceId));

        Long requirementId;
        if (request.getRequirementId() != null) {
            // Reuse existing requirement (for per-story pipelines)
            requirementId = request.getRequirementId();
            logger.info("Reusing existing requirementId={} for workspace={}", requirementId, workspaceId);

            // Ensure requirement text is saved to disk (may have been created via /requirement/create)
            Requirement existing = requirementPort.findById(requirementId).orElse(null);
            if (existing != null && existing.getRequirementText() != null) {
                try {
                    fileStorageService.saveRequirement(workspace, requirementId, existing.getRequirementText());
                } catch (IOException e) {
                    throw new RuntimeException("Failed to save requirement file", e);
                }
            }
        } else {
            // Save new requirement
            Requirement requirement = new Requirement();
            requirement.setWorkspaceId(workspaceId);
            requirement.setRequirementText(request.getRequirementText());
            requirement = requirementPort.save(requirement);
            requirementId = requirement.getId();

            // Store requirement text in workspace filesystem
            try {
                fileStorageService.saveRequirement(workspace, requirementId, request.getRequirementText());
            } catch (IOException e) {
                throw new RuntimeException("Failed to save requirement file", e);
            }

            // Create requirement folder in Azure DevOps if enabled
            azureDevOpsService.onRequirementCreated(workspaceId, requirementId);
        }

        // Validate selected agents if provided
        List<String> selectedAgents = request.getSelectedAgents();
        if (selectedAgents != null && !selectedAgents.isEmpty()) {
            // Validate all agent names are known
            List<String> allAgentNames = pipelineProperties.getAgents().stream()
                    .map(AgentConfigProperties::getAgentName).toList();
            List<String> unknownAgents = selectedAgents.stream()
                    .filter(name -> !allAgentNames.contains(name)).toList();
            if (!unknownAgents.isEmpty()) {
                throw new IllegalArgumentException("Unknown agent names: " + String.join(", ", unknownAgents));
            }
            List<String> missingMandatory = pipelineProperties.validateSelectedAgents(selectedAgents);
            if (!missingMandatory.isEmpty()) {
                throw new IllegalArgumentException("Missing mandatory agents: " + String.join(", ", missingMandatory));
            }
        }

        // Start orchestration — use specific agent if provided (e.g. TRReviewAgent for per-story pipelines)
        String startAgent = request.getAgentName();
        String pipelineMode = request.getPipelineMode() != null ? request.getPipelineMode() : "per-story";
        if (!"per-story".equals(pipelineMode) && !"full-sequence".equals(pipelineMode)) {
            throw new IllegalArgumentException("Invalid pipelineMode: " + pipelineMode + ". Must be 'per-story' or 'full-sequence'");
        }
        // When userStoryId is set but no explicit agent is given, default to first per-story agent
        if (request.getUserStoryId() != null && (startAgent == null || startAgent.isBlank())) {
            // Find the first per-story agent (order >= 5) from selected agents
            if (selectedAgents != null && !selectedAgents.isEmpty()) {
                startAgent = pipelineProperties.buildDynamicPipeline(selectedAgents).stream()
                        .filter(a -> a.getExecutionOrder() >= 5)
                        .map(AgentConfigProperties::getAgentName)
                        .findFirst()
                        .orElse("TRReviewAgent");
            } else {
                startAgent = "TRReviewAgent";
            }
        }
        // Sync workspace pipelineMode so downstream integrations (e.g. branch creation) see the correct mode
        if (!pipelineMode.equals(workspace.getPipelineMode())) {
            workspace.setPipelineMode(pipelineMode);
            workspacePort.save(workspace);
        }

        logger.info("Starting orchestration for workspace={}, requirement={}, userStoryId={}, startAgent={}, pipelineMode={}, selectedAgents={}",
                workspaceId, requirementId, request.getUserStoryId(), startAgent, pipelineMode, selectedAgents);
        Workflow result = orchestratorService.startOrchestration(workspace, requirementId, request.getUserStoryId(), startAgent, pipelineMode, selectedAgents);
        return result;
    }

    @Override
    public Optional<Workflow> getLatestStatus(Long workspaceId, Long requirementId) {
        return workflowPort.findLatestByWorkspaceAndRequirement(workspaceId, requirementId);
    }

    @Override
    public Workflow approveWorkflow(WorkflowApprovalRequest request) {
        Long workspaceId = request.getWorkspaceId();
        Long requirementId = request.getRequirementId();
        String decision = request.getDecision();

        Workspace workspace = workspacePort.findById(workspaceId)
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found: " + workspaceId));

        // Find the correct IN_REVIEW workflow using userStoryId and agentNumber when available
        // This is critical for per-story mode where multiple stories have independent pipelines
        Long userStoryId = request.getUserStoryId();
        Integer agentNumber = request.getAgentNumber();
        Workflow workflow = workflowPort.findInReviewWorkflow(workspaceId, requirementId, userStoryId, agentNumber)
                .orElseThrow(() -> new IllegalArgumentException(
                        "No IN_REVIEW workflow found for workspace=" + workspaceId
                                + ", requirement=" + requirementId
                                + (userStoryId != null ? ", userStory=" + userStoryId : "")
                                + (agentNumber != null ? ", agent=" + agentNumber : "")));

        String currentState = workflow.getState();
        if (!AgentState.IN_REVIEW.name().equals(currentState)) {
            throw new IllegalStateException("Workflow is not in IN_REVIEW state. Current state: " + currentState);
        }

        switch (decision.trim().toUpperCase()) {
            case "APPROVE" -> {
                // Mark current agent as APPROVED
                workflow.setState(AgentState.APPROVED.name());
                workflow.setCompletionStatus(true);
                workflowPort.save(workflow);
                eventService.recordStateTransition(workspaceId, workflow.getId(),
                        requirementId, workflow.getUserStoryId(),
                        workflow.getAgentName(), currentState, AgentState.APPROVED.name());

                // Trigger Azure DevOps integration based on agent type
                triggerAzureDevOpsIntegration(workspace, workflow);

                // Auto-advance to next agent
                Workflow nextWorkflow = orchestratorService.advanceToNextAgent(workflow, workspace);
                return nextWorkflow;
            }
            case "REJECT" -> {
                workflow.setState(AgentState.REJECTED.name());
                workflowPort.save(workflow);
                eventService.recordStateTransition(workspaceId, workflow.getId(),
                        requirementId, workflow.getUserStoryId(),
                        workflow.getAgentName(), currentState, AgentState.REJECTED.name());
                return workflow;
            }
            case "REWORK" -> {
                String comments = request.getComments();
                if (comments == null || comments.isBlank()) {
                    comments = "No comments provided";
                }
                return orchestratorService.reworkAgent(workflow, workspace, comments);
            }
            default -> throw new IllegalArgumentException("Invalid decision: " + decision
                    + ". Must be APPROVE, REJECT, or REWORK");
        }
    }

    @Override
    public List<Workflow> getAllWorkflows() {
        return workflowPort.findAll();
    }

    @Override
    public Workflow revertWorkflow(Long workspaceId, Long requirementId, int version) {
        List<Workflow> workflows = workflowPort.findByWorkspaceAndRequirement(workspaceId, requirementId);
        if (workflows.isEmpty()) {
            throw new IllegalArgumentException("No workflows found for workspace=" + workspaceId
                    + ", requirement=" + requirementId);
        }

        if (version < 1 || version > workflows.size()) {
            throw new IllegalArgumentException("Invalid version: " + version
                    + ". Available versions: 1-" + workflows.size());
        }

        // Versions are ordered by createdAt, so version N is index N-1
        Workflow targetWorkflow = workflows.get(version - 1);
        targetWorkflow.setState(AgentState.IN_REVIEW.name());
        targetWorkflow.setCompletionStatus(false);
        // Clear stale wiki URLs so they get regenerated on next approval
        targetWorkflow.setInputWikiUrl(null);
        targetWorkflow.setOutputWikiUrl(null);
        return workflowPort.save(targetWorkflow);
    }

    @Override
    public String getAgentOutput(int agentNumber, Long workspaceId, Long requirementId, Long userStoryId) {
        Workspace workspace = workspacePort.findById(workspaceId)
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found: " + workspaceId));

        try {
            return fileStorageService.readAgentOutputByOrder(workspace, agentNumber, userStoryId);
        } catch (IOException e) {
            throw new RuntimeException("Failed to read agent output: " + e.getMessage(), e);
        }
    }

    /**
     * Re-trigger Azure DevOps integration for all APPROVED workflows in a requirement.
     * Use this to upload wiki pages that were missed due to missing wiki branch.
     * @return number of workflows synced
     */
    @Override
    public int syncWikiForRequirement(Long workspaceId, Long requirementId) {
        Workspace workspace = workspacePort.findById(workspaceId)
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found: " + workspaceId));

        if (!workspace.isAzureDevOpsEnabled()) {
            logger.info("Azure DevOps not enabled for workspace {}, skipping wiki sync", workspaceId);
            return 0;
        }

        List<Workflow> workflows = workflowPort.findByWorkspaceAndRequirement(workspaceId, requirementId).stream()
                .filter(wf -> "APPROVED".equals(wf.getState()))
                .toList();

        int synced = 0;
        for (Workflow wf : workflows) {
            try {
                triggerAzureDevOpsIntegration(workspace, wf, true);
                synced++;
            } catch (Exception e) {
                logger.warn("Wiki sync failed for workflow {} ({}): {}", wf.getId(), wf.getAgentName(), e.getMessage());
            }
        }
        logger.info("Wiki sync complete for workspace {} requirement {}: {}/{} synced", workspaceId, requirementId, synced, workflows.size());
        return synced;
    }

    /**
     * Trigger Azure DevOps integration based on which agent was approved.
     * - Saves agent output to repo AND creates wiki page with URL tracking
     * - UserStoryAgent: Create User Story work items
     * - TDDAgent: Create Test Case work items
     * - SecurityAgent: Create Bug work items for vulnerabilities
     * - CodingAgent: Trigger build pipeline
     */
    private void triggerAzureDevOpsIntegration(Workspace workspace, Workflow workflow) {
        triggerAzureDevOpsIntegration(workspace, workflow, false);
    }

    /**
     * Trigger Azure DevOps integration with optional forced wiki re-publish.
     * forceWikiRefresh=true rewrites wiki pages even when wiki URLs already exist.
     */
    private void triggerAzureDevOpsIntegration(Workspace workspace, Workflow workflow, boolean forceWikiRefresh) {
        if (!workspace.isAzureDevOpsEnabled()) {
            return;
        }

        String agentName = workflow.getAgentName();
        Long requirementId = workflow.getRequirementId();
        Long userStoryId = workflow.getUserStoryId();

        try {
            // Re-push input wiki URL if missing (e.g., after revert or failed earlier push)
            if (forceWikiRefresh || workflow.getInputWikiUrl() == null || workflow.getInputWikiUrl().isBlank()) {
                try {
                    Path inputPath = fileStorageService.getAgentInputPath(workspace, agentName, userStoryId);
                    if (Files.exists(inputPath)) {
                        String inputContent = Files.readString(inputPath);
                        String inputWikiUrl = azureDevOpsService.saveAgentInput(
                                workspace.getId(), requirementId, agentName, inputContent, userStoryId);
                        if (inputWikiUrl != null) {
                            workflow.setInputWikiUrl(inputWikiUrl);
                            workflowPort.save(workflow);
                        }
                    }
                } catch (Exception inputEx) {
                    logger.warn("Failed to re-push input wiki URL for {}: {}", agentName, inputEx.getMessage());
                }
            }

            // Output was already saved to Azure DevOps in invokeAgentInBackground().
            // Only re-push if outputWikiUrl is missing (e.g., wiki branch was null earlier).
            String output = fileStorageService.readAgentOutput(workspace, agentName, userStoryId);
                if (forceWikiRefresh || workflow.getOutputWikiUrl() == null || workflow.getOutputWikiUrl().isBlank()) {
                String outputWikiUrl = azureDevOpsService.saveAgentOutput(
                        workspace.getId(), requirementId, agentName, output, userStoryId);
                if (outputWikiUrl != null) {
                    workflow.setOutputWikiUrl(outputWikiUrl);
                    workflowPort.save(workflow);
                }
            }

            // Agent-specific integrations
            switch (agentName) {
                case "UserStoryAgent" -> {
                    // Create/sync User Story work items in Azure DevOps (idempotent — skips already-created)
                    // Pass workflow pipelineMode so branch creation only happens in per-story mode
                    String effectivePipelineMode = workflow.getPipelineMode() != null ? workflow.getPipelineMode() : workspace.getPipelineMode();
                    logger.info("Creating Azure DevOps User Story work items for requirement: {} (pipelineMode={})", requirementId, effectivePipelineMode);
                    azureDevOpsService.onUserStoryAgentApproved(workspace.getId(), requirementId, effectivePipelineMode);
                }
                case "TDDAgent" -> {
                    // Create Test Case work items in Azure DevOps
                    logger.info("Creating Azure DevOps Test Case work items for user story: {}", userStoryId);
                    azureDevOpsService.onTddAgentApproved(workspace.getId(), requirementId, userStoryId, output);
                }
                case "SecurityAgent" -> {
                    // Create Bug work items for any security issues found
                    if (output != null && (output.toLowerCase().contains("vulnerability") 
                            || output.toLowerCase().contains("security issue"))) {
                        logger.info("Creating Azure DevOps Bug work items for security issues");
                        azureDevOpsService.onSecurityIssueFound(workspace.getId(), 
                                "Security Vulnerability Found - US-" + userStoryId,
                                output, "2 - High");
                    }
                    // Create summary wiki page after last agent
                    azureDevOpsService.createRequirementSummaryWikiPage(workspace.getId(), requirementId);
                }
                case "CodingAgent" -> {
                    // Save code files to repo AND wiki, then trigger build pipeline
                    logger.info("Saving code files to repo & wiki, then triggering build for user story: {}", userStoryId);
                    azureDevOpsService.saveCodeFilesToRepoAndWiki(
                            workspace.getId(), requirementId, userStoryId, output);
                    azureDevOpsService.triggerBuildPipeline(workspace.getId());
                }
            }
        } catch (Exception e) {
            logger.error("Failed to trigger Azure DevOps integration for agent {}: {}", agentName, e.getMessage());
        }
    }
}
