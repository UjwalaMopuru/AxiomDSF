package com.mphasis.axiomdsf.persistence.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import com.mphasis.axiomdsf.persistence.entity.Event;

import java.util.List;

@Repository
public interface EventRepository extends JpaRepository<Event, Long> {
    List<Event> findByWorkspaceId(Long workspaceId);
    List<Event> findByWorkspaceIdAndRequirementId(Long workspaceId, Long requirementId);
    void deleteByWorkspaceId(Long workspaceId);
}
