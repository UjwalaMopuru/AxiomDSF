package com.mphasis.axiomdsf.business.port.in;

import com.mphasis.axiomdsf.business.dto.StartWorkflowRequest;
import com.mphasis.axiomdsf.business.dto.WorkflowApprovalRequest;
import com.mphasis.axiomdsf.persistence.entity.Workflow;

import java.util.List;
import java.util.Optional;

public interface WorkflowUseCase {

    Workflow startWorkflow(StartWorkflowRequest request);

    Optional<Workflow> getLatestStatus(Long workspaceId, Long requirementId);

    Workflow approveWorkflow(WorkflowApprovalRequest request);

    List<Workflow> getAllWorkflows();

    Workflow revertWorkflow(Long workspaceId, Long requirementId, int version);

    String getAgentOutput(int agentNumber, Long workspaceId, Long requirementId, Long userStoryId);

    int syncWikiForRequirement(Long workspaceId, Long requirementId);
}
