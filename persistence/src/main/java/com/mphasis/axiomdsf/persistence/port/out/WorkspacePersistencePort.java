package com.mphasis.axiomdsf.persistence.port.out;

import java.util.List;
import java.util.Optional;

import com.mphasis.axiomdsf.persistence.entity.Workspace;

public interface WorkspacePersistencePort {
    Workspace save(Workspace workspace);
    Optional<Workspace> findById(Long id);
    List<Workspace> findAll();
    Optional<Workspace> findByProjectName(String projectName);
    void deleteById(Long id);
}
