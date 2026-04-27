package com.mphasis.axiomdsf.persistence.port.out;

import com.mphasis.axiomdsf.persistence.entity.Workflow;
import java.util.List;
import java.util.Optional;

public interface WorkflowPersistencePort {
    Workflow save(Workflow workflow);
    Optional<Workflow> findById(Long id);
    List<Workflow> findAll();
    Optional<Workflow> findLatestByWorkspaceAndRequirement(Long workspaceId, Long requirementId);
    List<Workflow> findByWorkspaceAndRequirement(Long workspaceId, Long requirementId);
    List<Workflow> findByUserStoryId(Long userStoryId);
    List<Workflow> findByWorkspaceAndRequirementAndUserStory(Long workspaceId, Long requirementId, Long userStoryId);

    Optional<Workflow> findInReviewWorkflow(Long workspaceId, Long requirementId, Long userStoryId, Integer agentNumber);
}
