package com.mphasis.axiomdsf.resource.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.mphasis.axiomdsf.persistence.entity.Requirement;
import com.mphasis.axiomdsf.persistence.entity.Workspace;
import com.mphasis.axiomdsf.persistence.port.out.RequirementPersistencePort;
import com.mphasis.axiomdsf.persistence.port.out.WorkspacePersistencePort;
import com.mphasis.axiomdsf.business.service.FileStorageService;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/requirement")
public class RequirementController {

    private static final Logger logger = LoggerFactory.getLogger(RequirementController.class);

    @Autowired
    private RequirementPersistencePort requirementPort;

    @Autowired
    private WorkspacePersistencePort workspacePort;

    @Autowired
    private FileStorageService fileStorageService;

    @GetMapping("/workspace/{workspaceId}")
    public ResponseEntity<List<Requirement>> getByWorkspace(@PathVariable Long workspaceId) {
        logger.info("GET /requirement/workspace/{}", workspaceId);
        List<Requirement> requirements = requirementPort.findByWorkspaceId(workspaceId);
        return ResponseEntity.ok(requirements);
    }

    @PostMapping("/create")
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        logger.info("POST /requirement/create");
        try {
            Long workspaceId = Long.valueOf(body.get("workspaceId").toString());
            String requirementText = (String) body.get("requirementText");
            if (workspaceId == null || requirementText == null || requirementText.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "workspaceId and requirementText are required"));
            }
            Requirement requirement = new Requirement();
            requirement.setWorkspaceId(workspaceId);
            requirement.setRequirementText(requirementText);
            requirement = requirementPort.save(requirement);
            logger.info("Requirement created: id={}", requirement.getId());

            // Save requirement text to disk for agent pipeline consumption
            Workspace workspace = workspacePort.findById(workspaceId)
                    .orElseThrow(() -> new RuntimeException("Workspace not found: " + workspaceId));
            fileStorageService.saveRequirement(workspace, requirement.getId(), requirementText);
            logger.info("Requirement text saved to disk for requirement: {}", requirement.getId());

            return ResponseEntity.ok(requirement);
        } catch (Exception e) {
            logger.error("Error creating requirement: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
