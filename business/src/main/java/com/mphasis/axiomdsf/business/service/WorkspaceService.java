package com.mphasis.axiomdsf.business.service;

import com.mphasis.axiomdsf.business.dto.AzureDevOpsConfig;
import com.mphasis.axiomdsf.business.dto.CreateWorkspaceRequest;
import com.mphasis.axiomdsf.business.port.in.WorkspaceUseCase;
import com.mphasis.axiomdsf.persistence.entity.Workspace;
import com.mphasis.axiomdsf.persistence.port.out.WorkspacePersistencePort;
import com.mphasis.axiomdsf.persistence.repository.AgentStateTransitionRepository;
import com.mphasis.axiomdsf.persistence.repository.EventRepository;
import com.mphasis.axiomdsf.persistence.repository.RequirementRepository;
import com.mphasis.axiomdsf.persistence.repository.UserStoryRepository;
import com.mphasis.axiomdsf.persistence.repository.WorkflowRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

@Service
@SuppressWarnings("unused")
public class WorkspaceService implements WorkspaceUseCase {

    private static final Logger logger = LoggerFactory.getLogger(WorkspaceService.class);

    private final WorkspacePersistencePort workspacePort;
    private final FileStorageService fileStorageService;
    private final AzureDevOpsMcpService azureDevOpsMcpService;
    private final AzureDevOpsIntegrationService azureDevOpsIntegrationService;
    private final WorkflowRepository workflowRepository;
    private final RequirementRepository requirementRepository;
    private final UserStoryRepository userStoryRepository;
    private final EventRepository eventRepository;
    private final AgentStateTransitionRepository transitionRepository;

    public WorkspaceService(WorkspacePersistencePort workspacePort,
                            FileStorageService fileStorageService,
                            AzureDevOpsMcpService azureDevOpsMcpService,
                            AzureDevOpsIntegrationService azureDevOpsIntegrationService,
                            WorkflowRepository workflowRepository,
                            RequirementRepository requirementRepository,
                            UserStoryRepository userStoryRepository,
                            EventRepository eventRepository,
                            AgentStateTransitionRepository transitionRepository) {
        this.workspacePort = workspacePort;
        this.fileStorageService = fileStorageService;
        this.azureDevOpsMcpService = azureDevOpsMcpService;
        this.azureDevOpsIntegrationService = azureDevOpsIntegrationService;
        this.workflowRepository = workflowRepository;
        this.requirementRepository = requirementRepository;
        this.userStoryRepository = userStoryRepository;
        this.eventRepository = eventRepository;
        this.transitionRepository = transitionRepository;
    }

    @Override
    public Workspace createWorkspace(CreateWorkspaceRequest request) {
        // Sanitize project name to prevent directory traversal
        String sanitizedName = request.getProjectName()
                .replaceAll("[^A-Za-z0-9_\\-\\s]", "")
                .trim();
        if (sanitizedName.isBlank()) {
            throw new IllegalArgumentException("Project name must contain at least one alphanumeric character");
        }

        Workspace workspace = new Workspace();
        workspace.setProjectName(sanitizedName);
        workspace.setDescription(request.getDescription());
        workspace.setTechStack(request.getTechStack());
        workspace.setStatus(request.isStatus());
        workspace.setPipelineMode(request.getPipelineMode());

        // Set Azure DevOps configuration if enabled
        if (request.isAzureDevOpsEnabled()) {
            workspace.setAzureDevOpsEnabled(true);
            workspace.setAzureDevOpsOrganizationUrl(request.getAzureDevOpsOrganizationUrl());
            workspace.setAzureDevOpsProject(request.getAzureDevOpsProject());
            workspace.setAzureDevOpsRepository(request.getAzureDevOpsRepository());
            String pat = request.getAzureDevOpsPersonalAccessToken();
            workspace.setAzureDevOpsPersonalAccessToken(pat != null ? pat.trim() : pat);
        }

        workspace = workspacePort.save(workspace);

        // Set the location to the workspace directory path
        workspace.setLocation(fileStorageService.getWorkspaceDir(workspace).toString());
        workspace = workspacePort.save(workspace);

        // Create workspace directory structure
        try {
            fileStorageService.createWorkspaceDirectories(workspace);
            fileStorageService.saveMetadata(workspace);
        } catch (IOException e) {
            throw new RuntimeException("Failed to create workspace directories", e);
        }

        // Create Azure DevOps branches if integration is enabled
        if (workspace.isAzureDevOpsEnabled()) {
            try {
                AzureDevOpsConfig config = buildAzureDevOpsConfig(workspace);
                
                // Validate connection first
                if (!azureDevOpsMcpService.validateConnection(config)) {
                    logger.warn("Azure DevOps connection validation failed for workspace: {}. Using default branch 'main'.", workspace.getProjectName());
                    workspace.setAzureDevOpsBranch("main");
                    workspace = workspacePort.save(workspace);
                } else {
                    // Create workspace branch (clean — for REQ-{id} agent I/O only)
                    String branchName = azureDevOpsMcpService.createWorkspaceBranch(config, workspace.getProjectName());
                    if (branchName != null) {
                        workspace.setAzureDevOpsBranch(branchName);
                    } else {
                        logger.warn("Branch creation returned null, using default branch 'main'");
                        workspace.setAzureDevOpsBranch("main");
                    }

                    workspace = workspacePort.save(workspace);
                    logger.info("Created Azure DevOps repo branch: {} for workspace: {}",
                            workspace.getAzureDevOpsBranch(), workspace.getProjectName());

                    // Publish wiki immediately after branch creation
                    try {
                        azureDevOpsIntegrationService.publishWikiForWorkspace(workspace.getId());
                    } catch (Exception wikiEx) {
                        logger.warn("Failed to publish wiki after branch creation for workspace {}: {}",
                                workspace.getProjectName(), wikiEx.getMessage());
                    }
                }
            } catch (Exception e) {
                logger.error("Failed to create Azure DevOps branch: {}. Using default branch 'main'.", e.getMessage());
                workspace.setAzureDevOpsBranch("main");
                workspace = workspacePort.save(workspace);
            }
        }

        logger.info("Workspace created: id={}, name={}, location={}, azureDevOpsEnabled={}",
                workspace.getId(), workspace.getProjectName(), workspace.getLocation(), 
                workspace.isAzureDevOpsEnabled());
        return workspace;
    }

    @Override
    public Workspace getWorkspaceByName(String projectName) {
        logger.info("Looking up workspace by name: {}", projectName);
        return workspacePort.findByProjectName(projectName)
                .orElseThrow(() -> new RuntimeException("Workspace not found with name: " + projectName));
    }

    @Override
    public Workspace getWorkspaceById(Long id) {
        logger.info("Looking up workspace by id: {}", id);
        return workspacePort.findById(id)
                .orElseThrow(() -> new RuntimeException("Workspace not found with id: " + id));
    }

    @Override
    public List<Workspace> listAllWorkspaces() {
        logger.info("Listing all workspaces");
        return workspacePort.findAll();
    }

    @Override
    public Workspace updateWorkspace(Long id, CreateWorkspaceRequest request) {
        Workspace workspace = workspacePort.findById(id)
                .orElseThrow(() -> new RuntimeException("Workspace not found: " + id));

        // Update basic fields
        if (request.getDescription() != null) workspace.setDescription(request.getDescription());
        if (request.getTechStack() != null) workspace.setTechStack(request.getTechStack());
        workspace.setStatus(request.isStatus());
        if (request.getPipelineMode() != null) workspace.setPipelineMode(request.getPipelineMode());

        // Update Azure DevOps configuration
        workspace.setAzureDevOpsEnabled(request.isAzureDevOpsEnabled());
        if (request.isAzureDevOpsEnabled()) {
            if (request.getAzureDevOpsOrganizationUrl() != null)
                workspace.setAzureDevOpsOrganizationUrl(request.getAzureDevOpsOrganizationUrl());
            if (request.getAzureDevOpsProject() != null)
                workspace.setAzureDevOpsProject(request.getAzureDevOpsProject());
            if (request.getAzureDevOpsRepository() != null)
                workspace.setAzureDevOpsRepository(request.getAzureDevOpsRepository());
            if (request.getAzureDevOpsPersonalAccessToken() != null) {
                String pat = request.getAzureDevOpsPersonalAccessToken().trim();
                workspace.setAzureDevOpsPersonalAccessToken(pat);
            }
        }

        workspace = workspacePort.save(workspace);
        logger.info("Workspace updated: id={}, name={}", workspace.getId(), workspace.getProjectName());
        return workspace;
    }

    @Override
    @Transactional
    public void deleteWorkspace(Long id) {
        Workspace workspace = workspacePort.findById(id)
                .orElseThrow(() -> new RuntimeException("Workspace not found: " + id));

        // Cascade delete all related DB entities
        logger.info("Cascade deleting all data for workspace id={}, name={}", id, workspace.getProjectName());
        transitionRepository.deleteByWorkspaceId(id);
        eventRepository.deleteByWorkspaceId(id);
        userStoryRepository.deleteByWorkspaceId(id);
        workflowRepository.deleteByWorkspaceId(id);
        requirementRepository.deleteByWorkspaceId(id);

        // Delete workspace files from disk
        Path wsDir = fileStorageService.getWorkspaceDir(workspace);
        Path absDir = wsDir.isAbsolute() ? wsDir : wsDir.toAbsolutePath();
        if (Files.exists(absDir)) {
            try (Stream<Path> walk = Files.walk(absDir)) {
                walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                    try { Files.deleteIfExists(path); }
                    catch (IOException e) { logger.warn("Failed to delete {}: {}", path, e.getMessage()); }
                });
            } catch (IOException e) {
                logger.warn("Failed to walk workspace directory {}: {}", absDir, e.getMessage());
            }
            logger.info("Deleted workspace directory: {}", absDir);
        }

        workspacePort.deleteById(id);
        logger.info("Workspace fully deleted: id={}, name={}", id, workspace.getProjectName());
    }

    /**
     * Build AzureDevOpsConfig from workspace entity.
     */
    private AzureDevOpsConfig buildAzureDevOpsConfig(Workspace workspace) {
        AzureDevOpsConfig config = new AzureDevOpsConfig();
        config.setOrganizationUrl(workspace.getAzureDevOpsOrganizationUrl());
        config.setProjectName(workspace.getAzureDevOpsProject());
        config.setRepositoryName(workspace.getAzureDevOpsRepository());
        String pat = workspace.getAzureDevOpsPersonalAccessToken();
        config.setPersonalAccessToken(pat != null ? pat.trim() : pat);
        config.setPipelineMode(workspace.getPipelineMode());
        config.setWikiName(workspace.getWikiName());
        return config;
    }
}
