package com.mphasis.axiomdsf.business.service.mcp;

import com.fasterxml.jackson.databind.JsonNode;
import com.mphasis.axiomdsf.business.dto.AzureDevOpsConfig;
import com.mphasis.axiomdsf.business.service.AzureDevOpsMcpService;
import com.mphasis.axiomdsf.persistence.entity.Workspace;
import com.mphasis.axiomdsf.persistence.port.out.WorkspacePersistencePort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * MCP Tool Functions for Azure DevOps integration with Spring AI.
 * These functions can be called by AI agents during workflow execution.
 * 
 * MCP (Model Context Protocol) Concepts implemented:
 * 1. Repository Operations - Branch creation, file management
 * 2. Work Item Management - User Stories, Test Cases, Tasks, Bugs
 * 3. Pull Request Operations - Create, list, merge
 * 4. Query Operations - WIQL queries for work items
 */
@Component
public class AzureDevOpsMcpTools {

    private static final Logger logger = LoggerFactory.getLogger(AzureDevOpsMcpTools.class);

    private final AzureDevOpsMcpService azureDevOpsService;
    private final WorkspacePersistencePort workspacePort;

    public AzureDevOpsMcpTools(AzureDevOpsMcpService azureDevOpsService,
                               WorkspacePersistencePort workspacePort) {
        this.azureDevOpsService = azureDevOpsService;
        this.workspacePort = workspacePort;
    }

    // ==================== Repository Tools ====================

    /**
     * Tool: Create workspace branch in Azure DevOps repository.
     */
    public Function<CreateBranchRequest, CreateBranchResponse> createWorkspaceBranch() {
        return request -> {
            try {
                Workspace workspace = getWorkspace(request.workspaceId());
                AzureDevOpsConfig config = getAzureConfig(workspace);
                
                String branchName = azureDevOpsService.createWorkspaceBranch(config, workspace.getProjectName());
                
                return new CreateBranchResponse(true, branchName, "Branch created successfully");
            } catch (Exception e) {
                logger.error("Failed to create branch: {}", e.getMessage());
                return new CreateBranchResponse(false, null, e.getMessage());
            }
        };
    }

    /**
     * Tool: Create requirement folder structure (Mode 1 - Per-Story Pipeline).
     */
    public Function<CreateRequirementFolderRequest, ToolResponse> createRequirementFolder() {
        return request -> {
            try {
                Workspace workspace = getWorkspace(request.workspaceId());
                AzureDevOpsConfig config = getAzureConfig(workspace);
                
                azureDevOpsService.createMode1RequirementStructure(
                    config, 
                    workspace.getAzureDevOpsBranch(), 
                    request.requirementId()
                );
                
                return new ToolResponse(true, "Requirement folder structure created for: " + request.requirementId());
            } catch (Exception e) {
                logger.error("Failed to create requirement folder: {}", e.getMessage());
                return new ToolResponse(false, e.getMessage());
            }
        };
    }

    /**
     * Tool: Create user story folder structure with per-story agents.
     */
    public Function<CreateUserStoryFolderRequest, ToolResponse> createUserStoryFolder() {
        return request -> {
            try {
                Workspace workspace = getWorkspace(request.workspaceId());
                AzureDevOpsConfig config = getAzureConfig(workspace);
                
                azureDevOpsService.createUserStoryStructure(
                    config,
                    workspace.getAzureDevOpsBranch(),
                    request.requirementId(),
                    request.userStoryId()
                );
                
                return new ToolResponse(true, "User story folder created: " + request.userStoryId());
            } catch (Exception e) {
                logger.error("Failed to create user story folder: {}", e.getMessage());
                return new ToolResponse(false, e.getMessage());
            }
        };
    }

    /**
     * Tool: Save agent input/output file to repository.
     */
    public Function<SaveAgentFileRequest, ToolResponse> saveAgentFile() {
        return request -> {
            try {
                Workspace workspace = getWorkspace(request.workspaceId());
                AzureDevOpsConfig config = getAzureConfig(workspace);
                
                String filePath = buildAgentFilePath(
                    request.requirementId(),
                    request.agentName(),
                    request.fileType(),
                    request.userStoryId()
                );
                
                azureDevOpsService.createOrUpdateFile(
                    config,
                    workspace.getAzureDevOpsBranch(),
                    filePath,
                    request.content(),
                    "Update " + request.agentName() + " " + request.fileType()
                );
                
                return new ToolResponse(true, "File saved: " + filePath);
            } catch (Exception e) {
                logger.error("Failed to save agent file: {}", e.getMessage());
                return new ToolResponse(false, e.getMessage());
            }
        };
    }

    /**
     * Tool: Read file content from repository.
     */
    public Function<ReadFileRequest, ReadFileResponse> readFile() {
        return request -> {
            try {
                Workspace workspace = getWorkspace(request.workspaceId());
                AzureDevOpsConfig config = getAzureConfig(workspace);
                
                String content = azureDevOpsService.readFileContent(
                    config,
                    workspace.getAzureDevOpsBranch(),
                    request.filePath()
                );
                
                return new ReadFileResponse(true, content, null);
            } catch (Exception e) {
                logger.error("Failed to read file: {}", e.getMessage());
                return new ReadFileResponse(false, null, e.getMessage());
            }
        };
    }

    // ==================== Work Item Tools ====================

    /**
     * Tool: Create User Story work item in Azure DevOps.
     * Called after UserStoryAgent completes and is approved.
     */
    public Function<CreateUserStoryWorkItemRequest, WorkItemResponse> createUserStoryWorkItem() {
        return request -> {
            try {
                Workspace workspace = getWorkspace(request.workspaceId());
                AzureDevOpsConfig config = getAzureConfig(workspace);
                
                JsonNode workItem = azureDevOpsService.createUserStoryWorkItem(
                    config,
                    request.title(),
                    request.description(),
                    request.acceptanceCriteria(),
                    request.priority(),
                    null
                );
                
                if (workItem != null) {
                    long id = workItem.get("id").asLong();
                    return new WorkItemResponse(true, id, "User Story created: " + id);
                }
                return new WorkItemResponse(false, null, "Failed to create User Story");
            } catch (Exception e) {
                logger.error("Failed to create User Story work item: {}", e.getMessage());
                return new WorkItemResponse(false, null, e.getMessage());
            }
        };
    }

    /**
     * Tool: Create Test Case work item in Azure DevOps.
     * Called after TDDAgent completes.
     */
    public Function<CreateTestCaseWorkItemRequest, WorkItemResponse> createTestCaseWorkItem() {
        return request -> {
            try {
                Workspace workspace = getWorkspace(request.workspaceId());
                AzureDevOpsConfig config = getAzureConfig(workspace);
                
                JsonNode workItem = azureDevOpsService.createTestCaseWorkItem(
                    config,
                    request.title(),
                    request.steps(),
                    request.expectedResults(),
                    request.linkedUserStoryId()
                );
                
                if (workItem != null) {
                    long id = workItem.get("id").asLong();
                    return new WorkItemResponse(true, id, "Test Case created: " + id);
                }
                return new WorkItemResponse(false, null, "Failed to create Test Case");
            } catch (Exception e) {
                logger.error("Failed to create Test Case work item: {}", e.getMessage());
                return new WorkItemResponse(false, null, e.getMessage());
            }
        };
    }

    /**
     * Tool: Create Task work item in Azure DevOps.
     */
    public Function<CreateTaskWorkItemRequest, WorkItemResponse> createTaskWorkItem() {
        return request -> {
            try {
                Workspace workspace = getWorkspace(request.workspaceId());
                AzureDevOpsConfig config = getAzureConfig(workspace);
                
                JsonNode workItem = azureDevOpsService.createTaskWorkItem(
                    config,
                    request.title(),
                    request.description(),
                    request.parentWorkItemId()
                );
                
                if (workItem != null) {
                    long id = workItem.get("id").asLong();
                    return new WorkItemResponse(true, id, "Task created: " + id);
                }
                return new WorkItemResponse(false, null, "Failed to create Task");
            } catch (Exception e) {
                logger.error("Failed to create Task work item: {}", e.getMessage());
                return new WorkItemResponse(false, null, e.getMessage());
            }
        };
    }

    /**
     * Tool: Create Bug work item in Azure DevOps.
     * Can be used by SecurityAgent or SCAAgent to report issues.
     */
    public Function<CreateBugWorkItemRequest, WorkItemResponse> createBugWorkItem() {
        return request -> {
            try {
                Workspace workspace = getWorkspace(request.workspaceId());
                AzureDevOpsConfig config = getAzureConfig(workspace);
                
                JsonNode workItem = azureDevOpsService.createBugWorkItem(
                    config,
                    request.title(),
                    request.reproSteps(),
                    request.severity()
                );
                
                if (workItem != null) {
                    long id = workItem.get("id").asLong();
                    return new WorkItemResponse(true, id, "Bug created: " + id);
                }
                return new WorkItemResponse(false, null, "Failed to create Bug");
            } catch (Exception e) {
                logger.error("Failed to create Bug work item: {}", e.getMessage());
                return new WorkItemResponse(false, null, e.getMessage());
            }
        };
    }

    /**
     * Tool: Create Feature work item in Azure DevOps.
     * Can be used by HLSAgent to create features.
     */
    public Function<CreateFeatureWorkItemRequest, WorkItemResponse> createFeatureWorkItem() {
        return request -> {
            try {
                Workspace workspace = getWorkspace(request.workspaceId());
                AzureDevOpsConfig config = getAzureConfig(workspace);
                
                JsonNode workItem = azureDevOpsService.createFeatureWorkItem(
                    config,
                    request.title(),
                    request.description(),
                    request.acceptanceCriteria()
                );
                
                if (workItem != null) {
                    long id = workItem.get("id").asLong();
                    return new WorkItemResponse(true, id, "Feature created: " + id);
                }
                return new WorkItemResponse(false, null, "Failed to create Feature");
            } catch (Exception e) {
                logger.error("Failed to create Feature work item: {}", e.getMessage());
                return new WorkItemResponse(false, null, e.getMessage());
            }
        };
    }

    /**
     * Tool: Update work item state or fields.
     */
    public Function<UpdateWorkItemRequest, WorkItemResponse> updateWorkItem() {
        return request -> {
            try {
                Workspace workspace = getWorkspace(request.workspaceId());
                AzureDevOpsConfig config = getAzureConfig(workspace);
                
                JsonNode workItem = azureDevOpsService.updateWorkItem(
                    config,
                    request.workItemId(),
                    request.fieldsToUpdate()
                );
                
                if (workItem != null) {
                    return new WorkItemResponse(true, request.workItemId(), "Work item updated");
                }
                return new WorkItemResponse(false, null, "Failed to update work item");
            } catch (Exception e) {
                logger.error("Failed to update work item: {}", e.getMessage());
                return new WorkItemResponse(false, null, e.getMessage());
            }
        };
    }

    /**
     * Tool: Query work items using WIQL.
     */
    public Function<QueryWorkItemsRequest, QueryWorkItemsResponse> queryWorkItems() {
        return request -> {
            try {
                Workspace workspace = getWorkspace(request.workspaceId());
                AzureDevOpsConfig config = getAzureConfig(workspace);
                
                List<JsonNode> workItems = azureDevOpsService.queryWorkItems(config, request.wiqlQuery());
                
                return new QueryWorkItemsResponse(true, workItems, null);
            } catch (Exception e) {
                logger.error("Failed to query work items: {}", e.getMessage());
                return new QueryWorkItemsResponse(false, null, e.getMessage());
            }
        };
    }

    // ==================== Pull Request Tools ====================

    /**
     * Tool: Create Pull Request from workspace branch to main.
     */
    public Function<CreatePullRequestRequest, PullRequestResponse> createPullRequest() {
        return request -> {
            try {
                Workspace workspace = getWorkspace(request.workspaceId());
                AzureDevOpsConfig config = getAzureConfig(workspace);
                
                JsonNode pr = azureDevOpsService.createPullRequest(
                    config,
                    workspace.getAzureDevOpsBranch(),
                    config.getDefaultBranch(),
                    request.title(),
                    request.description()
                );
                
                if (pr != null) {
                    long prId = pr.get("pullRequestId").asLong();
                    return new PullRequestResponse(true, prId, "Pull Request created: " + prId);
                }
                return new PullRequestResponse(false, null, "Failed to create Pull Request");
            } catch (Exception e) {
                logger.error("Failed to create Pull Request: {}", e.getMessage());
                return new PullRequestResponse(false, null, e.getMessage());
            }
        };
    }

    /**
     * Tool: List Pull Requests.
     */
    public Function<ListPullRequestsRequest, ListPullRequestsResponse> listPullRequests() {
        return request -> {
            try {
                Workspace workspace = getWorkspace(request.workspaceId());
                AzureDevOpsConfig config = getAzureConfig(workspace);
                
                List<JsonNode> prs = azureDevOpsService.listPullRequests(config, request.status());
                
                return new ListPullRequestsResponse(true, prs, null);
            } catch (Exception e) {
                logger.error("Failed to list Pull Requests: {}", e.getMessage());
                return new ListPullRequestsResponse(false, null, e.getMessage());
            }
        };
    }

    // ==================== Helper Methods ====================

    private Workspace getWorkspace(Long workspaceId) {
        return workspacePort.findById(workspaceId)
                .orElseThrow(() -> new RuntimeException("Workspace not found: " + workspaceId));
    }

    private AzureDevOpsConfig getAzureConfig(Workspace workspace) {
        if (workspace.getAzureDevOpsOrganizationUrl() == null || 
            workspace.getAzureDevOpsPersonalAccessToken() == null) {
            throw new RuntimeException("Azure DevOps not configured for this workspace");
        }
        
        AzureDevOpsConfig config = new AzureDevOpsConfig();
        config.setOrganizationUrl(workspace.getAzureDevOpsOrganizationUrl());
        config.setProjectName(workspace.getAzureDevOpsProject());
        config.setRepositoryName(workspace.getAzureDevOpsRepository());
        config.setPersonalAccessToken(workspace.getAzureDevOpsPersonalAccessToken());
        config.setDefaultBranch("main");
        return config;
    }

    private String buildAgentFilePath(String requirementId, String agentName, 
                                       String fileType, String userStoryId) {
        StringBuilder path = new StringBuilder();
        path.append(requirementId).append("/");
        
        // Check if it's a per-story agent
        boolean isPerStoryAgent = List.of("TRReviewAgent", "LLDAgent", "TDDAgent", 
                "CodingAgent", "StaticCodeAnalysisAgent", "SecurityAgent").contains(agentName);
        
        // Per-story agents go directly under REQ-{id}/ (flat, same level as shared agents)
        // since each user story has its own dedicated branch
        
        path.append(agentName).append("/");        path.append(fileType.toLowerCase()).append("/");
        path.append(agentName).append("_").append(fileType).append(".md");
        
        return path.toString();
    }

    // ==================== Request/Response Records ====================

    public record CreateBranchRequest(Long workspaceId) {}
    public record CreateBranchResponse(boolean success, String branchName, String message) {}

    public record CreateRequirementFolderRequest(Long workspaceId, String requirementId) {}
    public record CreateUserStoryFolderRequest(Long workspaceId, String requirementId, String userStoryId) {}

    public record SaveAgentFileRequest(Long workspaceId, String requirementId, String agentName, 
                                        String fileType, String content, String userStoryId) {}
    public record ReadFileRequest(Long workspaceId, String filePath) {}
    public record ReadFileResponse(boolean success, String content, String error) {}

    public record CreateUserStoryWorkItemRequest(Long workspaceId, String title, String description,
                                                  String acceptanceCriteria, String priority) {}
    public record CreateTestCaseWorkItemRequest(Long workspaceId, String title, String steps,
                                                 String expectedResults, Long linkedUserStoryId) {}
    public record CreateTaskWorkItemRequest(Long workspaceId, String title, String description,
                                             Long parentWorkItemId) {}
    public record CreateBugWorkItemRequest(Long workspaceId, String title, String reproSteps, String severity) {}
    public record CreateFeatureWorkItemRequest(Long workspaceId, String title, String description,
                                                String acceptanceCriteria) {}

    public record UpdateWorkItemRequest(Long workspaceId, Long workItemId, Map<String, String> fieldsToUpdate) {}
    public record QueryWorkItemsRequest(Long workspaceId, String wiqlQuery) {}
    public record QueryWorkItemsResponse(boolean success, List<JsonNode> workItems, String error) {}

    public record CreatePullRequestRequest(Long workspaceId, String title, String description) {}
    public record PullRequestResponse(boolean success, Long pullRequestId, String message) {}
    public record ListPullRequestsRequest(Long workspaceId, String status) {}
    public record ListPullRequestsResponse(boolean success, List<JsonNode> pullRequests, String error) {}

    public record ToolResponse(boolean success, String message) {}
    public record WorkItemResponse(boolean success, Long workItemId, String message) {}
}
