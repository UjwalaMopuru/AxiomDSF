package com.mphasis.axiomdsf.persistence.port.out;

import com.mphasis.axiomdsf.persistence.entity.Event;
import java.util.List;

public interface EventPersistencePort {
    Event save(Event event);
    List<Event> findByWorkspaceId(Long workspaceId);
    List<Event> findByWorkspaceAndRequirement(Long workspaceId, Long requirementId);
}
