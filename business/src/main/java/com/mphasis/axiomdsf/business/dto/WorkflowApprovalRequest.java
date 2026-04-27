package com.mphasis.axiomdsf.business.dto;

import jakarta.validation.constraints.NotNull;

public class WorkflowApprovalRequest {

    @NotNull
    private Long workspaceId;

    @NotNull
    private Long requirementId;

    private Integer agentNumber;

    @NotNull
    private String decision;

    private String comments;
    private Long userStoryId;

    public Long getWorkspaceId() { return workspaceId; }
    public void setWorkspaceId(Long workspaceId) { this.workspaceId = workspaceId; }

    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }

    public Integer getAgentNumber() { return agentNumber; }
    public void setAgentNumber(Integer agentNumber) { this.agentNumber = agentNumber; }

    public String getDecision() { return decision; }
    public void setDecision(String decision) { this.decision = decision; }

    public String getComments() { return comments; }
    public void setComments(String comments) { this.comments = comments; }

    public Long getUserStoryId() { return userStoryId; }
    public void setUserStoryId(Long userStoryId) { this.userStoryId = userStoryId; }
}
