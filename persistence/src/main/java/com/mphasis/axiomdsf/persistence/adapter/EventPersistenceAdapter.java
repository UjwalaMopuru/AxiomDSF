package com.mphasis.axiomdsf.persistence.adapter;

import com.mphasis.axiomdsf.persistence.port.out.EventPersistencePort;
import com.mphasis.axiomdsf.persistence.entity.Event;
import com.mphasis.axiomdsf.persistence.repository.EventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class EventPersistenceAdapter implements EventPersistencePort {

    private static final Logger logger = LoggerFactory.getLogger(EventPersistenceAdapter.class);

    @Autowired
    private EventRepository repository;

    @Override
    public Event save(Event event) {
        logger.debug("Saving event: workspaceId={}, agent={}, state={}",
                event.getWorkspaceId(), event.getAgentName(), event.getState());
        return repository.save(event);
    }

    @Override
    public List<Event> findByWorkspaceId(Long workspaceId) {
        logger.debug("Finding events by workspaceId={}", workspaceId);
        return repository.findByWorkspaceId(workspaceId);
    }

    @Override
    public List<Event> findByWorkspaceAndRequirement(Long workspaceId, Long requirementId) {
        logger.debug("Finding events: workspaceId={}, requirementId={}", workspaceId, requirementId);
        return repository.findByWorkspaceIdAndRequirementId(workspaceId, requirementId);
    }
}
