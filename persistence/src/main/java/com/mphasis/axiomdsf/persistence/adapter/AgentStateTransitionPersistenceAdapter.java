package com.mphasis.axiomdsf.persistence.adapter;

import com.mphasis.axiomdsf.persistence.port.out.AgentStateTransitionPersistencePort;
import com.mphasis.axiomdsf.persistence.entity.AgentStateTransition;
import com.mphasis.axiomdsf.persistence.repository.AgentStateTransitionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

@Component
public class AgentStateTransitionPersistenceAdapter implements AgentStateTransitionPersistencePort {

    private static final Logger logger = LoggerFactory.getLogger(AgentStateTransitionPersistenceAdapter.class);

    @Autowired
    private AgentStateTransitionRepository repository;

    @Override
    public AgentStateTransition save(AgentStateTransition transition) {
        logger.debug("Saving agent state transition: workflowId={}, agent={}, state={}",
                transition.getWorkflowId(), transition.getAgentName(), transition.getPresentState());
        return repository.save(transition);
    }

    @Override
    public List<AgentStateTransition> findByWorkflowId(Long workflowId) {
        logger.debug("Finding agent state transitions by workflowId={}", workflowId);
        return repository.findByWorkflowId(workflowId);
    }

    @Override
    public Optional<AgentStateTransition> findByWorkflowIdAndAgentName(Long workflowId, String agentName) {
        logger.debug("Finding agent state transition: workflowId={}, agentName={}", workflowId, agentName);
        return repository.findByWorkflowIdAndAgentName(workflowId, agentName);
    }

    @Override
    public List<AgentStateTransition> findByWorkspaceAndWorkflow(Long workspaceId, Long workflowId) {
        logger.debug("Finding agent state transitions: workspaceId={}, workflowId={}", workspaceId, workflowId);
        return repository.findByWorkspaceIdAndWorkflowId(workspaceId, workflowId);
    }
}
