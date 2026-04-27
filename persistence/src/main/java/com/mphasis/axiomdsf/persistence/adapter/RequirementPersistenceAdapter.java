package com.mphasis.axiomdsf.persistence.adapter;

import com.mphasis.axiomdsf.persistence.port.out.RequirementPersistencePort;
import com.mphasis.axiomdsf.persistence.entity.Requirement;
import com.mphasis.axiomdsf.persistence.repository.RequirementRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

@Component
public class RequirementPersistenceAdapter implements RequirementPersistencePort {

    private static final Logger logger = LoggerFactory.getLogger(RequirementPersistenceAdapter.class);

    @Autowired
    private RequirementRepository repository;

    @Override
    public Requirement save(Requirement requirement) {
        logger.debug("Saving requirement: id={}, workspaceId={}", requirement.getId(), requirement.getWorkspaceId());
        return repository.save(requirement);
    }

    @Override
    public Optional<Requirement> findById(Long id) {
        logger.debug("Finding requirement by id={}", id);
        return repository.findById(id);
    }

    @Override
    public List<Requirement> findAll() {
        logger.debug("Finding all requirements");
        return repository.findAll();
    }

    @Override
    public List<Requirement> findByWorkspaceId(Long workspaceId) {
        logger.debug("Finding requirements by workspaceId={}", workspaceId);
        return repository.findByWorkspaceId(workspaceId);
    }
}
