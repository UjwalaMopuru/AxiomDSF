package com.mphasis.axiomdsf.persistence.port.out;

import com.mphasis.axiomdsf.persistence.entity.AgentStateTransition;
import java.util.List;
import java.util.Optional;

public interface AgentStateTransitionPersistencePort {
    AgentStateTransition save(AgentStateTransition transition);
    List<AgentStateTransition> findByWorkflowId(Long workflowId);
    Optional<AgentStateTransition> findByWorkflowIdAndAgentName(Long workflowId, String agentName);
    List<AgentStateTransition> findByWorkspaceAndWorkflow(Long workspaceId, Long workflowId);
}
