package com.mphasis.axiomdsf.persistence.adapter;

import com.mphasis.axiomdsf.persistence.port.out.UserStoryPersistencePort;
import com.mphasis.axiomdsf.persistence.entity.UserStory;
import com.mphasis.axiomdsf.persistence.repository.UserStoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Component
public class UserStoryPersistenceAdapter implements UserStoryPersistencePort {

    private static final Logger logger = LoggerFactory.getLogger(UserStoryPersistenceAdapter.class);

    @Autowired
    private UserStoryRepository repository;

    @Override
    public UserStory save(UserStory userStory) {
        logger.debug("Saving user story: id={}, storyId={}, requirementId={}",
                userStory.getId(), userStory.getStoryId(), userStory.getRequirementId());
        return repository.save(userStory);
    }

    @Override
    public Optional<UserStory> findById(Long id) {
        logger.debug("Finding user story by id={}", id);
        return repository.findById(id);
    }

    @Override
    public List<UserStory> findByRequirementId(Long requirementId) {
        logger.debug("Finding user stories by requirementId={}", requirementId);
        return repository.findByRequirementId(requirementId);
    }

    @Override
    public List<UserStory> findByWorkspaceId(Long workspaceId) {
        logger.debug("Finding user stories by workspaceId={}", workspaceId);
        return repository.findByWorkspaceId(workspaceId);
    }

    @Override
    public List<UserStory> findByWorkspaceIdAndRequirementId(Long workspaceId, Long requirementId) {
        logger.debug("Finding user stories by workspaceId={}, requirementId={}", workspaceId, requirementId);
        return repository.findByWorkspaceIdAndRequirementId(workspaceId, requirementId);
    }

    @Override
    @Transactional
    public void deleteByWorkspaceIdAndRequirementId(Long workspaceId, Long requirementId) {
        logger.debug("Deleting user stories for workspaceId={}, requirementId={}", workspaceId, requirementId);
        repository.deleteByWorkspaceIdAndRequirementId(workspaceId, requirementId);
    }
}
