package com.mphasis.axiomdsf.persistence.port.out;

import com.mphasis.axiomdsf.persistence.entity.UserStory;
import java.util.List;
import java.util.Optional;

public interface UserStoryPersistencePort {
    UserStory save(UserStory userStory);
    Optional<UserStory> findById(Long id);
    List<UserStory> findByRequirementId(Long requirementId);
    List<UserStory> findByWorkspaceId(Long workspaceId);
    List<UserStory> findByWorkspaceIdAndRequirementId(Long workspaceId, Long requirementId);
    void deleteByWorkspaceIdAndRequirementId(Long workspaceId, Long requirementId);
}
