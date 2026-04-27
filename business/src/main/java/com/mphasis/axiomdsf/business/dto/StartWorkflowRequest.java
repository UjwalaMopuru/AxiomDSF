package com.mphasis.axiomdsf.business.dto;

import jakarta.validation.constraints.NotNull;
import java.util.List;

public class StartWorkflowRequest {

    @NotNull
    private Long workspaceId;

    private Long requirementId;
    private String requirementText;
    private String inputFilePath;
    private String userStoryText;
    private String agentName;
    private Long userStoryId;
    private String pipelineMode; // "per-story" (default) or "full-sequence"
    private List<String> selectedAgents; // user-selected agents for the pipeline

    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }

    public Long getWorkspaceId() { return workspaceId; }
    public void setWorkspaceId(Long workspaceId) { this.workspaceId = workspaceId; }

    public String getRequirementText() { return requirementText; }
    public void setRequirementText(String requirementText) { this.requirementText = requirementText; }

    public String getInputFilePath() { return inputFilePath; }
    public void setInputFilePath(String inputFilePath) { this.inputFilePath = inputFilePath; }

    public String getUserStoryText() { return userStoryText; }
    public void setUserStoryText(String userStoryText) { this.userStoryText = userStoryText; }

    public String getAgentName() { return agentName; }
    public void setAgentName(String agentName) { this.agentName = agentName; }

    public Long getUserStoryId() { return userStoryId; }
    public void setUserStoryId(Long userStoryId) { this.userStoryId = userStoryId; }

    public String getPipelineMode() { return pipelineMode; }
    public void setPipelineMode(String pipelineMode) { this.pipelineMode = pipelineMode; }

    public List<String> getSelectedAgents() { return selectedAgents; }
    public void setSelectedAgents(List<String> selectedAgents) { this.selectedAgents = selectedAgents; }
}
