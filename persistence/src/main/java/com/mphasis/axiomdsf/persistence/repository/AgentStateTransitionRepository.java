package com.mphasis.axiomdsf.persistence.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import com.mphasis.axiomdsf.persistence.entity.AgentStateTransition;

import java.util.List;
import java.util.Optional;

@Repository
public interface AgentStateTransitionRepository extends JpaRepository<AgentStateTransition, Long> {

    List<AgentStateTransition> findByWorkflowId(Long workflowId);

    Optional<AgentStateTransition> findByWorkflowIdAndAgentName(Long workflowId, String agentName);

    List<AgentStateTransition> findByWorkspaceIdAndWorkflowId(Long workspaceId, Long workflowId);

    void deleteByWorkspaceId(Long workspaceId);
}
