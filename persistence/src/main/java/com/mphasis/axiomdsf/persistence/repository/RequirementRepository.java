package com.mphasis.axiomdsf.persistence.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import com.mphasis.axiomdsf.persistence.entity.Requirement;

import java.util.List;

@Repository
public interface RequirementRepository extends JpaRepository<Requirement, Long> {
    List<Requirement> findByWorkspaceId(Long workspaceId);
    void deleteByWorkspaceId(Long workspaceId);
}
