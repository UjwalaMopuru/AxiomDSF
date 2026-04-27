package com.mphasis.axiomdsf.resource.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;

import com.mphasis.axiomdsf.business.dto.AzureDevOpsConfig;
import com.mphasis.axiomdsf.business.dto.CreateWorkspaceRequest;
import com.mphasis.axiomdsf.business.port.in.WorkspaceUseCase;
import com.mphasis.axiomdsf.business.service.AzureDevOpsIntegrationService;
import com.mphasis.axiomdsf.business.service.AzureDevOpsMcpService;
import com.mphasis.axiomdsf.persistence.entity.Workspace;

@RestController
@RequestMapping("/workspace")
public class WorkspaceController {

    private static final Logger logger = LoggerFactory.getLogger(WorkspaceController.class);

    @Autowired
    private WorkspaceUseCase workspaceUseCase;

    @Autowired
    private AzureDevOpsMcpService azureDevOpsMcpService;

    @Autowired
    private AzureDevOpsIntegrationService azureDevOpsIntegrationService;

    @PostMapping("/create")
    public ResponseEntity<?> createWorkspace(
            @Valid @RequestBody CreateWorkspaceRequest request) {

        logger.info("POST /workspace/create - projectName={}", request.getProjectName());
        logger.debug("CreateWorkspaceRequest: {}", request);

        try {
            Workspace workspace = workspaceUseCase.createWorkspace(request);
            logger.info("Workspace created: id={}", workspace.getId());
            return ResponseEntity.status(201).body(toSafeMap(workspace));
        } catch (Exception e) {
            // Check for duplicate name constraint violation (SQLite wraps in GenericJDBCException)
            String rootMessage = getRootCauseMessage(e);
            if (rootMessage.contains("UNIQUE constraint failed") || rootMessage.contains("project_name")
                    || e instanceof DataIntegrityViolationException) {
                logger.warn("Duplicate workspace name: {}", request.getProjectName());
                Map<String, String> error = new HashMap<>();
                error.put("error", "Workspace with name '" + request.getProjectName() + "' already exists. Please choose a different name.");
                error.put("message", "Workspace with name '" + request.getProjectName() + "' already exists. Please choose a different name.");
                return ResponseEntity.status(409).body(error);
            }
            logger.error("Failed to create workspace: {}", e.getMessage(), e);
            Map<String, String> error = new HashMap<>();
            error.put("error", "Failed to create workspace: " + e.getMessage());
            error.put("message", "Failed to create workspace: " + e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }

    private String getRootCauseMessage(Throwable t) {
        StringBuilder sb = new StringBuilder();
        while (t != null) {
            if (t.getMessage() != null) sb.append(t.getMessage()).append(" ");
            t = t.getCause();
        }
        return sb.toString();
    }

    @GetMapping("/list")
    public ResponseEntity<List<Map<String, Object>>> listWorkspaces() {
        logger.info("GET /workspace/list");
        List<Workspace> workspaces = workspaceUseCase.listAllWorkspaces();
        List<Map<String, Object>> safe = workspaces.stream().map(this::toSafeMap).toList();
        return ResponseEntity.ok(safe);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getWorkspaceById(@PathVariable Long id) {
        logger.info("GET /workspace/{}", id);
        try {
            Workspace workspace = workspaceUseCase.getWorkspaceById(id);
            return ResponseEntity.ok(toSafeMap(workspace));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/getByName")
    public ResponseEntity<?> getWorkspaceByName(@RequestParam String name) {
        logger.info("GET /workspace/getByName - name={}", name);
        try {
            Workspace workspace = workspaceUseCase.getWorkspaceByName(name);
            return ResponseEntity.ok(toSafeMap(workspace));
        } catch (RuntimeException e) {
            logger.warn("Workspace not found: name={}", name);
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateWorkspace(
            @PathVariable Long id,
            @Valid @RequestBody CreateWorkspaceRequest request) {
        logger.info("PUT /workspace/{} - projectName={}", id, request.getProjectName());
        try {
            Workspace workspace = workspaceUseCase.updateWorkspace(id, request);
            return ResponseEntity.ok(toSafeMap(workspace));
        } catch (RuntimeException e) {
            logger.error("Failed to update workspace {}: {}", id, e.getMessage());
            return ResponseEntity.badRequest().body(errorMap(e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteWorkspace(@PathVariable Long id) {
        logger.info("DELETE /workspace/{}", id);
        try {
            workspaceUseCase.deleteWorkspace(id);
            return ResponseEntity.ok(Map.of("message", "Workspace deleted successfully"));
        } catch (RuntimeException e) {
            logger.error("Failed to delete workspace {}: {}", id, e.getMessage());
            return ResponseEntity.badRequest().body(errorMap(e.getMessage()));
        }
    }

    /** Build a safe response map that masks the PAT. */
    private Map<String, Object> toSafeMap(Workspace ws) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", ws.getId());
        m.put("projectName", ws.getProjectName());
        m.put("description", ws.getDescription());
        m.put("techStack", ws.getTechStack());
        m.put("location", ws.getLocation());
        m.put("status", ws.isStatus());
        m.put("pipelineMode", ws.getPipelineMode());
        m.put("azureDevOpsEnabled", ws.isAzureDevOpsEnabled());
        m.put("azureDevOpsOrganizationUrl", ws.getAzureDevOpsOrganizationUrl());
        m.put("azureDevOpsProject", ws.getAzureDevOpsProject());
        m.put("azureDevOpsRepository", ws.getAzureDevOpsRepository());
        m.put("azureDevOpsBranch", ws.getAzureDevOpsBranch());
        m.put("azureDevOpsWikiBranch", ws.getAzureDevOpsWikiBranch());
        m.put("wikiName", ws.getWikiName());
        // Mask PAT: show only last 4 chars
        String pat = ws.getAzureDevOpsPersonalAccessToken();
        m.put("azureDevOpsPatConfigured", pat != null && !pat.isBlank());
        return m;
    }

    private Map<String, String> errorMap(String msg) {
        Map<String, String> e = new HashMap<>();
        e.put("error", msg);
        e.put("message", msg);
        return e;
    }

    /**
     * Validate Azure DevOps connection with provided credentials.
     */
    @PostMapping("/validate-azure-devops")
    public ResponseEntity<Map<String, Object>> validateAzureDevOpsConnection(
            @RequestBody Map<String, String> request) {
        
        logger.info("POST /workspace/validate-azure-devops");
        
        Map<String, Object> response = new HashMap<>();
        
        try {
            AzureDevOpsConfig config = new AzureDevOpsConfig();
            config.setOrganizationUrl(request.get("organizationUrl"));
            config.setProjectName(request.get("project"));
            config.setRepositoryName(request.get("repository"));
            String pat = request.get("pat");
            config.setPersonalAccessToken(pat != null ? pat.trim() : null);

            var validation = azureDevOpsMcpService.validateConnectionDetailed(config);

            if (validation.valid()) {
                // Also fetch branches for display
                List<String> branches = azureDevOpsMcpService.listBranches(config);
                response.put("valid", true);
                response.put("message", validation.message());
                response.put("branches", branches);
            } else {
                response.put("valid", false);
                response.put("message", validation.message());
            }
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Azure DevOps validation failed: {}", e.getMessage());
            response.put("valid", false);
            response.put("message", e.getMessage());
            return ResponseEntity.ok(response);
        }
    }

    /**
     * Webhook endpoint for Azure DevOps Service Hook callbacks.
     * Receives events like build.complete, git.push, workitem.updated, etc.
     */
    @PostMapping("/webhooks/azure-devops")
    public ResponseEntity<Map<String, String>> handleAzureDevOpsWebhook(
            @RequestBody Map<String, Object> payload) {
        
        String eventType = payload.containsKey("eventType") ? 
                payload.get("eventType").toString() : "unknown";
        logger.info("Received Azure DevOps webhook: eventType={}", eventType);
        
        Map<String, String> result = new HashMap<>();
        result.put("status", "received");
        result.put("eventType", eventType);
        
        return ResponseEntity.ok(result);
    }

    /**
     * Get build metrics for a workspace's Azure DevOps branch.
     */
    @GetMapping("/{workspaceId}/metrics/builds")
    public ResponseEntity<?> getBuildMetrics(@PathVariable Long workspaceId) {
        logger.info("GET /workspace/{}/metrics/builds", workspaceId);
        try {
            var metrics = azureDevOpsIntegrationService.getBuildMetrics(workspaceId);
            if (metrics != null) {
                return ResponseEntity.ok(metrics.toString());
            }
            return ResponseEntity.ok(Map.of("message", "Azure DevOps not enabled or no metrics available"));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Trigger a build pipeline for a workspace.
     */
    @PostMapping("/{workspaceId}/trigger-build")
    public ResponseEntity<?> triggerBuild(@PathVariable Long workspaceId) {
        logger.info("POST /workspace/{}/trigger-build", workspaceId);
        try {
            var build = azureDevOpsIntegrationService.triggerBuildPipeline(workspaceId);
            if (build != null) {
                return ResponseEntity.ok(build.toString());
            }
            return ResponseEntity.ok(Map.of("message", "Azure DevOps not enabled or pipeline not configured"));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Setup a webhook subscription for Azure DevOps events.
     */
    @PostMapping("/{workspaceId}/setup-webhook")
    public ResponseEntity<?> setupWebhook(
            @PathVariable Long workspaceId,
            @RequestBody Map<String, String> request) {
        
        logger.info("POST /workspace/{}/setup-webhook", workspaceId);
        String eventType = request.getOrDefault("eventType", "build.complete");
        String callbackUrl = request.get("callbackUrl");
        
        if (callbackUrl == null || callbackUrl.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "callbackUrl is required"));
        }
        
        try {
            var hook = azureDevOpsIntegrationService.setupWebhook(workspaceId, eventType, callbackUrl);
            if (hook != null) {
                return ResponseEntity.ok(hook.toString());
            }
            return ResponseEntity.ok(Map.of("message", "Azure DevOps not enabled"));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Publish the workspace's wiki folder as a code wiki in Azure DevOps.
     * This creates the wiki under Azure DevOps > Wiki section.
     * Requires PAT with 'Wiki (Read & Write)' scope.
     */
    @PostMapping("/{workspaceId}/publish-wiki")
    public ResponseEntity<Map<String, Object>> publishWiki(@PathVariable Long workspaceId) {
        logger.info("POST /workspace/{}/publish-wiki", workspaceId);
        Map<String, Object> response = new HashMap<>();
        
        try {
            Workspace workspace = workspaceUseCase.getWorkspaceById(workspaceId);
            if (!workspace.isAzureDevOpsEnabled()) {
                response.put("success", false);
                response.put("message", "Azure DevOps is not enabled for this workspace");
                return ResponseEntity.ok(response);
            }

            AzureDevOpsConfig config = new AzureDevOpsConfig(
                workspace.getAzureDevOpsOrganizationUrl(),
                workspace.getAzureDevOpsProject(),
                workspace.getAzureDevOpsRepository(),
                workspace.getAzureDevOpsPersonalAccessToken() != null 
                    ? workspace.getAzureDevOpsPersonalAccessToken().trim() : null
            );

            String wikiName = workspace.getProjectName() + "-Wiki";
            String branch = workspace.getAzureDevOpsBranch();
            String mappedPath = "/" + workspace.getProjectName() + "-Wiki";

            // Check if wiki already exists
            if (azureDevOpsMcpService.wikiExists(config, wikiName)) {
                response.put("success", true);
                response.put("message", "Wiki '" + wikiName + "' is already published");
                response.put("wikiUrl", config.getCodeWikiPageUrl(mappedPath + "/Home.md", branch));
                return ResponseEntity.ok(response);
            }

            // Publish the code wiki
            var result = azureDevOpsMcpService.publishCodeAsWiki(config, wikiName, branch, mappedPath);
            if (result != null) {
                response.put("success", true);
                response.put("message", "Wiki '" + wikiName + "' published successfully!");
                response.put("wikiUrl", config.getCodeWikiPageUrl(mappedPath + "/Home.md", branch));
                return ResponseEntity.ok(response);
            } else {
                response.put("success", false);
                response.put("message", "Failed to publish wiki. Ensure your PAT has 'Wiki (Read & Write)' scope. " +
                        "You can also manually publish from Azure DevOps: Go to Wiki > 'Publish code as wiki' > " +
                        "Repository: " + workspace.getAzureDevOpsRepository() + " > Branch: " + branch + 
                        " > Folder: " + mappedPath);
                return ResponseEntity.ok(response);
            }
        } catch (Exception e) {
            logger.error("Failed to publish wiki: {}", e.getMessage());
            response.put("success", false);
            response.put("message", "Error: " + e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }

    /**
     * Check if the PAT has wiki scope.
     */
    @PostMapping("/check-wiki-scope")
    public ResponseEntity<Map<String, Object>> checkWikiScope(@RequestBody Map<String, String> request) {
        logger.info("POST /workspace/check-wiki-scope");
        Map<String, Object> response = new HashMap<>();
        
        try {
            AzureDevOpsConfig config = new AzureDevOpsConfig();
            config.setOrganizationUrl(request.get("organizationUrl"));
            config.setProjectName(request.get("project"));
            config.setRepositoryName(request.get("repository"));
            String pat = request.get("pat");
            config.setPersonalAccessToken(pat != null ? pat.trim() : null);

            List<com.fasterxml.jackson.databind.JsonNode> wikis = azureDevOpsMcpService.listWikis(config);
            response.put("hasWikiScope", true);
            response.put("existingWikis", wikis.size());
            response.put("message", "PAT has wiki scope");
        } catch (Exception e) {
            response.put("hasWikiScope", false);
            response.put("message", "PAT does not have Wiki (Read & Write) scope. Please update your PAT.");
        }
        
        return ResponseEntity.ok(response);
    }
}
