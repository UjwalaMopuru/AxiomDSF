package com.mphasis.axiomdsf.persistence.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import com.mphasis.axiomdsf.persistence.entity.UserStory;

import java.util.List;

@Repository
public interface UserStoryRepository extends JpaRepository<UserStory, Long> {
    List<UserStory> findByRequirementId(Long requirementId);
    List<UserStory> findByWorkspaceId(Long workspaceId);
    List<UserStory> findByWorkspaceIdAndRequirementId(Long workspaceId, Long requirementId);
    void deleteByWorkspaceIdAndRequirementId(Long workspaceId, Long requirementId);
    void deleteByWorkspaceId(Long workspaceId);
}
