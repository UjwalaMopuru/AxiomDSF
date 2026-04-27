package com.mphasis.axiomdsf.business.dto;

public class WorkflowRevertRequest {

    private Long workspaceId;
    private Long requirementId;
    private int version;

    public Long getWorkspaceId() { return workspaceId; }
    public void setWorkspaceId(Long workspaceId) { this.workspaceId = workspaceId; }

    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }

    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }
}
