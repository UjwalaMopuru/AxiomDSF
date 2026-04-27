package com.mphasis.axiomdsf.persistence.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import com.mphasis.axiomdsf.persistence.entity.Workflow;

import java.util.List;
import java.util.Optional;

@Repository
public interface WorkflowRepository extends JpaRepository<Workflow, Long> {

    Optional<Workflow> findTopByWorkspaceIdAndRequirementIdOrderByCreatedAtDesc(
            Long workspaceId, Long requirementId);

    List<Workflow> findByWorkspaceIdAndRequirementId(Long workspaceId, Long requirementId);

    List<Workflow> findByUserStoryId(Long userStoryId);

    List<Workflow> findByWorkspaceIdAndRequirementIdAndUserStoryId(
            Long workspaceId, Long requirementId, Long userStoryId);

    Optional<Workflow> findTopByWorkspaceIdAndRequirementIdAndUserStoryIdAndStateOrderByCreatedAtDesc(
            Long workspaceId, Long requirementId, Long userStoryId, String state);

    Optional<Workflow> findTopByWorkspaceIdAndRequirementIdAndSequenceNumberAndStateOrderByCreatedAtDesc(
            Long workspaceId, Long requirementId, int sequenceNumber, String state);

    Optional<Workflow> findTopByWorkspaceIdAndRequirementIdAndUserStoryIdAndSequenceNumberAndStateOrderByCreatedAtDesc(
            Long workspaceId, Long requirementId, Long userStoryId, int sequenceNumber, String state);

    Optional<Workflow> findTopByWorkspaceIdAndRequirementIdAndStateOrderByCreatedAtDesc(
            Long workspaceId, Long requirementId, String state);

    void deleteByWorkspaceId(Long workspaceId);
}
