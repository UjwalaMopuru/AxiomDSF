package com.mphasis.axiomdsf.persistence.port.out;

import com.mphasis.axiomdsf.persistence.entity.Requirement;
import java.util.List;
import java.util.Optional;

public interface RequirementPersistencePort {
    Requirement save(Requirement requirement);
    Optional<Requirement> findById(Long id);
    List<Requirement> findAll();
    List<Requirement> findByWorkspaceId(Long workspaceId);
}
