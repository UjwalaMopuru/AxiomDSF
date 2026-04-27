package com.mphasis.axiomdsf.persistence.adapter;

import com.mphasis.axiomdsf.persistence.port.out.WorkflowPersistencePort;
import com.mphasis.axiomdsf.persistence.entity.Workflow;
import com.mphasis.axiomdsf.persistence.repository.WorkflowRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

@Component
public class WorkflowPersistenceAdapter implements WorkflowPersistencePort {

    private static final Logger logger = LoggerFactory.getLogger(WorkflowPersistenceAdapter.class);

    @Autowired
    private WorkflowRepository repository;

    @Override
    public Workflow save(Workflow workflow) {
        logger.debug("Saving workflow: id={}, state={}, agent={}",
                workflow.getId(), workflow.getState(), workflow.getAgentName());
        return repository.save(workflow);
    }

    @Override
    public Optional<Workflow> findById(Long id) {
        logger.debug("Finding workflow by id={}", id);
        return repository.findById(id);
    }

    @Override
    public List<Workflow> findAll() {
        logger.debug("Finding all workflows");
        return repository.findAll();
    }

    @Override
    public Optional<Workflow> findLatestByWorkspaceAndRequirement(Long workspaceId, Long requirementId) {
        logger.debug("Finding latest workflow: workspaceId={}, requirementId={}", workspaceId, requirementId);
        return repository.findTopByWorkspaceIdAndRequirementIdOrderByCreatedAtDesc(workspaceId, requirementId);
    }

    @Override
    public List<Workflow> findByWorkspaceAndRequirement(Long workspaceId, Long requirementId) {
        logger.debug("Finding workflows: workspaceId={}, requirementId={}", workspaceId, requirementId);
        return repository.findByWorkspaceIdAndRequirementId(workspaceId, requirementId);
    }

    @Override
    public List<Workflow> findByUserStoryId(Long userStoryId) {
        logger.debug("Finding workflows by userStoryId={}", userStoryId);
        return repository.findByUserStoryId(userStoryId);
    }

    @Override
    public List<Workflow> findByWorkspaceAndRequirementAndUserStory(Long workspaceId, Long requirementId, Long userStoryId) {
        logger.debug("Finding workflows: workspaceId={}, requirementId={}, userStoryId={}", workspaceId, requirementId, userStoryId);
        return repository.findByWorkspaceIdAndRequirementIdAndUserStoryId(workspaceId, requirementId, userStoryId);
    }

    @Override
    public Optional<Workflow> findInReviewWorkflow(Long workspaceId, Long requirementId, Long userStoryId, Integer agentNumber) {
        logger.debug("Finding IN_REVIEW workflow: ws={}, req={}, us={}, agent={}", workspaceId, requirementId, userStoryId, agentNumber);
        String state = "IN_REVIEW";
        if (userStoryId != null && agentNumber != null) {
            return repository.findTopByWorkspaceIdAndRequirementIdAndUserStoryIdAndSequenceNumberAndStateOrderByCreatedAtDesc(
                    workspaceId, requirementId, userStoryId, agentNumber, state);
        } else if (userStoryId != null) {
            return repository.findTopByWorkspaceIdAndRequirementIdAndUserStoryIdAndStateOrderByCreatedAtDesc(
                    workspaceId, requirementId, userStoryId, state);
        } else if (agentNumber != null) {
            return repository.findTopByWorkspaceIdAndRequirementIdAndSequenceNumberAndStateOrderByCreatedAtDesc(
                    workspaceId, requirementId, agentNumber, state);
        } else {
            return repository.findTopByWorkspaceIdAndRequirementIdAndStateOrderByCreatedAtDesc(
                    workspaceId, requirementId, state);
        }
    }
}
