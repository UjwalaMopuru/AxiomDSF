package com.mphasis.axiomdsf.persistence.adapter;

import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.mphasis.axiomdsf.persistence.entity.Workspace;
import com.mphasis.axiomdsf.persistence.port.out.WorkspacePersistencePort;
import com.mphasis.axiomdsf.persistence.repository.WorkspaceRepository;

@Component
public class WorkspacePersistenceAdapter implements WorkspacePersistencePort {

    private static final Logger logger = LoggerFactory.getLogger(WorkspacePersistenceAdapter.class);

    @Autowired
    private WorkspaceRepository repository;

    @Override
    public Workspace save(Workspace workspace) {
        logger.debug("Saving workspace: id={}, project={}", workspace.getId(), workspace.getProjectName());
        return repository.save(workspace);
    }

    @Override
    public Optional<Workspace> findById(Long id) {
        logger.debug("Finding workspace by id={}", id);
        return repository.findById(id);
    }

    @Override
    public List<Workspace> findAll() {
        logger.debug("Finding all workspaces");
        return repository.findAll();
    }

    @Override
    public Optional<Workspace> findByProjectName(String projectName) {
        logger.debug("Finding workspace by projectName={}", projectName);
        return repository.findByProjectName(projectName);
    }

    @Override
    public void deleteById(Long id) {
        logger.debug("Deleting workspace by id={}", id);
        repository.deleteById(id);
    }
}
