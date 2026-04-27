package com.mphasis.axiomdsf.business.service;

import com.mphasis.axiomdsf.persistence.entity.AgentStateTransition;
import com.mphasis.axiomdsf.persistence.entity.Event;
import com.mphasis.axiomdsf.persistence.port.out.AgentStateTransitionPersistencePort;
import com.mphasis.axiomdsf.persistence.port.out.EventPersistencePort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class EventService {

    private static final Logger logger = LoggerFactory.getLogger(EventService.class);

    private final EventPersistencePort eventPersistencePort;
    private final AgentStateTransitionPersistencePort transitionPort;

    public EventService(EventPersistencePort eventPersistencePort,
                        AgentStateTransitionPersistencePort transitionPort) {
        this.eventPersistencePort = eventPersistencePort;
        this.transitionPort = transitionPort;
    }

    public Event recordEvent(Long workspaceId, Long requirementId, Long userStoryId,
                             String agentName, String state, String inputPath, String outputPath,
                             Integer executionOrder, String agentType, Boolean agentEnabled) {
        Event event = new Event();
        event.setWorkspaceId(workspaceId);
        event.setRequirementId(requirementId);
        event.setUserStoryId(userStoryId);
        event.setAgentName(agentName);
        event.setState(state);
        event.setInputFileLocation(inputPath);
        event.setOutputFileLocation(outputPath);
        event.setExecutionOrder(executionOrder);
        event.setAgentType(agentType);
        event.setAgentEnabled(agentEnabled);
        event.setCreatedAt(LocalDateTime.now());

        Event saved = eventPersistencePort.save(event);
        logger.info("Recorded event: agent={}, state={}, eventId={}", agentName, state, saved.getId());
        return saved;
    }

    public AgentStateTransition recordStateTransition(Long workspaceId, Long workflowId,
                                                       Long requirementId, Long userStoryId,
                                                       String agentName,
                                                       String previousState, String presentState) {
        AgentStateTransition transition = new AgentStateTransition();
        transition.setWorkspaceId(workspaceId);
        transition.setWorkflowId(workflowId);
        transition.setRequirementId(requirementId);
        transition.setUserStoryId(userStoryId);
        transition.setAgentName(agentName);
        transition.setPreviousState(previousState);
        transition.setPresentState(presentState);
        transition.setUpdatedAt(LocalDateTime.now());

        AgentStateTransition saved = transitionPort.save(transition);
        logger.info("State transition: agent={}, {} -> {}", agentName, previousState, presentState);
        return saved;
    }
}
