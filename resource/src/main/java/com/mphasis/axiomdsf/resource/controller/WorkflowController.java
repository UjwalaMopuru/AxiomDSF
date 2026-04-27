package com.mphasis.axiomdsf.resource.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

import com.mphasis.axiomdsf.business.config.AgentConfigProperties;
import com.mphasis.axiomdsf.business.config.AgentPipelineProperties;
import com.mphasis.axiomdsf.business.port.in.WorkflowUseCase;
import com.mphasis.axiomdsf.business.dto.*;
import com.mphasis.axiomdsf.persistence.entity.Workflow;
import com.mphasis.axiomdsf.persistence.port.out.WorkflowPersistencePort;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@RestController
@RequestMapping("/workflow")
public class WorkflowController {

    private static final Logger logger = LoggerFactory.getLogger(WorkflowController.class);

    @Autowired
    private WorkflowUseCase workflowUseCase;

    @Autowired
    private AgentPipelineProperties pipelineProperties;

    @Autowired
    private WorkflowPersistencePort workflowPersistencePort;

    // START WORKFLOW
    @PostMapping("/start")
    public ResponseEntity<?> startWorkflow(
            @Valid @RequestBody StartWorkflowRequest request) {

        logger.info("POST /workflow/start - workspaceId={}", request.getWorkspaceId());
        try {
            Workflow result = workflowUseCase.startWorkflow(request);
            logger.info("Workflow started: workflowId={}", result.getId());
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            logger.warn("Bad request on /workflow/start: {}", e.getMessage());
            return ResponseEntity.badRequest().body(errorMap(e.getMessage()));
        } catch (RuntimeException e) {
            logger.error("Error on /workflow/start: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().body(errorMap(e.getMessage()));
        }
    }

    // GET WORKFLOW STATUS
    @GetMapping("/status/{workspaceId}/{requirementId}")
    public ResponseEntity<?> getStatus(
            @PathVariable Long workspaceId,
            @PathVariable Long requirementId) {

        logger.debug("GET /workflow/status/{}/{}", workspaceId, requirementId);

        Optional<Workflow> workflow =
                workflowUseCase.getLatestStatus(workspaceId, requirementId);

        return workflow.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // APPROVE / REWORK WORKFLOW
    @PostMapping("/approve")
    public ResponseEntity<?> approveWorkflow(
            @Valid @RequestBody WorkflowApprovalRequest request) {

        logger.info("POST /workflow/approve - workspaceId={}, decision={}", request.getWorkspaceId(), request.getDecision());
        try {
            Workflow result = workflowUseCase.approveWorkflow(request);
            logger.info("Workflow approval processed: workflowId={}, newState={}", result.getId(), result.getState());
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            logger.warn("Bad request on /workflow/approve: {}", e.getMessage());
            return ResponseEntity.badRequest().body(errorMap(e.getMessage()));
        } catch (RuntimeException e) {
            logger.error("Error on /workflow/approve: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().body(errorMap(e.getMessage()));
        }
    }

    // GET ALL WORKFLOWS
    @GetMapping("/all")
    public ResponseEntity<?> getAllWorkflows() {
        logger.debug("GET /workflow/all");
        return ResponseEntity.ok(workflowUseCase.getAllWorkflows());
    }

    // SYNC WIKI — re-push wiki pages for approved workflows that have no wiki URL yet
    @PostMapping("/sync-wiki")
    public ResponseEntity<?> syncWiki(
            @RequestParam Long workspaceId,
            @RequestParam Long requirementId) {
        logger.info("POST /workflow/sync-wiki ws={} req={}", workspaceId, requirementId);
        try {
            int synced = workflowUseCase.syncWikiForRequirement(workspaceId, requirementId);
            return ResponseEntity.ok(Map.of("synced", synced, "message", synced + " workflow(s) wiki-synced"));
        } catch (Exception e) {
            logger.error("Error on /workflow/sync-wiki: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().body(errorMap(e.getMessage()));
        }
    }

    // REVERT WORKFLOW VERSION
    @PostMapping("/revert")
    public ResponseEntity<?> revertWorkflow(
            @RequestBody WorkflowRevertRequest request) {

        logger.info("POST /workflow/revert - workspaceId={}, version={}", request.getWorkspaceId(), request.getVersion());
        try {
            Workflow workflow = workflowUseCase.revertWorkflow(
                    request.getWorkspaceId(),
                    request.getRequirementId(),
                    request.getVersion());
            return ResponseEntity.ok(workflow);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(errorMap(e.getMessage()));
        } catch (RuntimeException e) {
            return ResponseEntity.internalServerError().body(errorMap(e.getMessage()));
        }
    }

    // GET AGENT OUTPUT - View intermediate agent output file contents
    @GetMapping("/agent-output")
    public ResponseEntity<?> getAgentOutput(
            @RequestParam int agentNumber,
            @RequestParam Long workspaceId,
            @RequestParam Long requirementId,
            @RequestParam(required = false) Long userStoryId) {

        logger.debug("GET /workflow/agent-output - agentNumber={}, workspaceId={}", agentNumber, workspaceId);
        try {
            String output = workflowUseCase.getAgentOutput(
                    agentNumber, workspaceId, requirementId, userStoryId);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("agentNumber", agentNumber);
            response.put("workspaceId", workspaceId);
            response.put("requirementId", requirementId);
            if (userStoryId != null) {
                response.put("userStoryId", userStoryId);
            }
            response.put("content", output);

            // Include wiki URLs from workflow if available
            List<Workflow> wfs = userStoryId != null
                    ? workflowPersistencePort.findByWorkspaceAndRequirementAndUserStory(workspaceId, requirementId, userStoryId)
                    : workflowPersistencePort.findByWorkspaceAndRequirement(workspaceId, requirementId);
            wfs.stream()
                    .filter(w -> w.getSequenceNumber() == agentNumber)
                    .findFirst()
                    .ifPresent(wf -> {
                        response.put("inputWikiUrl", wf.getInputWikiUrl());
                        response.put("outputWikiUrl", wf.getOutputWikiUrl());
                        response.put("state", wf.getState());
                    });

            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(errorMap(e.getMessage()));
        } catch (RuntimeException e) {
            return ResponseEntity.internalServerError().body(errorMap(e.getMessage()));
        }
    }

    // GET AGENT PIPELINE CONFIG
    @GetMapping("/agents/config")
    public ResponseEntity<?> getAgentPipelineConfig() {
        logger.debug("GET /workflow/agents/config");
        List<AgentConfigProperties> agents = pipelineProperties.getEnabledAgentsInOrder();
        return ResponseEntity.ok(agents);
    }

    // GET WORKFLOWS BY USER STORY
    @GetMapping("/by-userstory/{userStoryId}")
    public ResponseEntity<?> getWorkflowsByUserStory(@PathVariable Long userStoryId) {
        logger.debug("GET /workflow/by-userstory/{}", userStoryId);
        return ResponseEntity.ok(workflowPersistencePort.findByUserStoryId(userStoryId));
    }

    // GET WORKFLOWS BY WORKSPACE + REQUIREMENT + USER STORY
    @GetMapping("/by-context")
    public ResponseEntity<?> getWorkflowsByContext(
            @RequestParam Long workspaceId,
            @RequestParam Long requirementId,
            @RequestParam(required = false) Long userStoryId) {
        logger.debug("GET /workflow/by-context ws={} req={} us={}", workspaceId, requirementId, userStoryId);
        if (userStoryId != null) {
            return ResponseEntity.ok(workflowPersistencePort.findByWorkspaceAndRequirementAndUserStory(workspaceId, requirementId, userStoryId));
        }
        return ResponseEntity.ok(workflowPersistencePort.findByWorkspaceAndRequirement(workspaceId, requirementId));
    }

    // GET WIKI URLs for agent workflows
    @GetMapping("/wiki-urls")
    public ResponseEntity<?> getWikiUrls(
            @RequestParam Long workspaceId,
            @RequestParam Long requirementId,
            @RequestParam(required = false) Long userStoryId) {
        logger.debug("GET /workflow/wiki-urls ws={} req={} us={}", workspaceId, requirementId, userStoryId);
        
        List<Workflow> workflows;
        if (userStoryId != null) {
            workflows = workflowPersistencePort.findByWorkspaceAndRequirementAndUserStory(workspaceId, requirementId, userStoryId);
        } else {
            workflows = workflowPersistencePort.findByWorkspaceAndRequirement(workspaceId, requirementId);
        }
        
        List<Map<String, Object>> result = workflows.stream().map(wf -> {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("workflowId", wf.getId());
            entry.put("agentName", wf.getAgentName());
            entry.put("sequenceNumber", wf.getSequenceNumber());
            entry.put("state", wf.getState());
            entry.put("inputWikiUrl", wf.getInputWikiUrl());
            entry.put("outputWikiUrl", wf.getOutputWikiUrl());
            entry.put("inputFilePath", wf.getInputFilePath());
            entry.put("outputFilePath", wf.getOutputFilePath());
            entry.put("userStoryId", wf.getUserStoryId());
            return entry;
        }).toList();
        
        return ResponseEntity.ok(result);
    }

    // DOWNLOAD CODE AS ZIP
    @GetMapping("/code-download")
    public void downloadCode(
            @RequestParam Long workspaceId,
            @RequestParam Long requirementId,
            @RequestParam(required = false) Long userStoryId,
            HttpServletResponse response) throws IOException {

        logger.info("GET /workflow/code-download ws={} req={} us={}", workspaceId, requirementId, userStoryId);
        try {
            String codeOutput = workflowUseCase.getAgentOutput(8, workspaceId, requirementId, userStoryId);
            if (codeOutput == null || codeOutput.isBlank()) {
                response.setStatus(404);
                return;
            }

            String zipName = userStoryId != null ? "code-US-" + userStoryId + ".zip" : "code-output.zip";
            response.setContentType("application/zip");
            response.setHeader("Content-Disposition", "attachment; filename=\"" + zipName + "\"");

            try (ZipOutputStream zos = new ZipOutputStream(response.getOutputStream())) {
                // Strategy 1: Try ### FILE: path/file.ext patterns (CodingAgent format)
                Pattern fileHeaderPattern = Pattern.compile("### FILE:\\s*(.+?)\\s*\\n```(\\w*)\\s*\\n([\\s\\S]*?)```");
                Matcher fileHeaderMatcher = fileHeaderPattern.matcher(codeOutput);
                int snippetIndex = 0;
                boolean foundFileHeaders = false;

                while (fileHeaderMatcher.find()) {
                    foundFileHeaders = true;
                    snippetIndex++;
                    String fileName = fileHeaderMatcher.group(1).trim();
                    String content = fileHeaderMatcher.group(3);

                    fileName = sanitizeFilePath(fileName);
                    if (fileName == null) continue;
                    zos.putNextEntry(new ZipEntry(fileName));
                    zos.write(content.trim().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    zos.closeEntry();
                }

                // Strategy 2: Fall back to ```lang\n// file: path\n... patterns
                if (!foundFileHeaders) {
                    Pattern codeBlockPattern = Pattern.compile("```(\\w*)\\s*\\n([\\s\\S]*?)```");
                    Matcher matcher = codeBlockPattern.matcher(codeOutput);
                    while (matcher.find()) {
                        snippetIndex++;
                        String lang = matcher.group(1);
                        String block = matcher.group(2);
                        String[] blockLines = block.split("\n");

                        String fileName = null;
                        String content = block;
                        for (int i = 0; i < Math.min(3, blockLines.length); i++) {
                            java.util.regex.Matcher fm = Pattern.compile(
                                    "(?://|#|--|/\\*)\\s*(?:file(?:name)?|path)\\s*:\\s*(.+)", Pattern.CASE_INSENSITIVE
                            ).matcher(blockLines[i]);
                            if (fm.find()) {
                                fileName = fm.group(1).trim().replaceAll("\\*/", "").trim();
                                StringBuilder sb = new StringBuilder();
                                for (int j = i + 1; j < blockLines.length; j++) {
                                    sb.append(blockLines[j]).append("\n");
                                }
                                content = sb.toString();
                                break;
                            }
                        }

                        if (fileName == null) {
                            java.util.regex.Matcher cm = Pattern.compile("(?:public\\s+)?class\\s+(\\w+)").matcher(block);
                            java.util.regex.Matcher im = Pattern.compile("(?:public\\s+)?interface\\s+(\\w+)").matcher(block);
                            String name = cm.find() ? cm.group(1) : (im.find() ? im.group(1) : null);
                            if (name != null) {
                                String ext = "java".equals(lang) ? ".java" : "typescript".equals(lang) ? ".ts" : "." + (lang.isEmpty() ? "txt" : lang);
                                fileName = "src/" + name + ext;
                            } else {
                                fileName = "snippet-" + snippetIndex + "." + (lang.isEmpty() ? "txt" : lang);
                            }
                        }

                        fileName = sanitizeFilePath(fileName);
                        if (fileName == null) continue;
                        zos.putNextEntry(new ZipEntry(fileName));
                        zos.write(content.trim().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                        zos.closeEntry();
                    }
                }
            }
        } catch (Exception e) {
            logger.error("Error generating code zip: {}", e.getMessage(), e);
            response.setStatus(500);
        }
    }

    /** Sanitize file path to prevent directory traversal */
    private String sanitizeFilePath(String fileName) {
        if (fileName == null) return null;
        fileName = fileName.replace("\\", "/");
        // Repeatedly strip .. until stable
        String prev;
        do {
            prev = fileName;
            fileName = fileName.replaceAll("\\.\\./", "").replaceAll("^\\.\\.", "");
        } while (!fileName.equals(prev));
        // Remove leading slashes
        fileName = fileName.replaceAll("^/+", "");
        if (fileName.isBlank() || fileName.contains("..")) return null;
        return fileName;
    }

    private Map<String, String> errorMap(String message) {
        Map<String, String> error = new LinkedHashMap<>();
        error.put("error", message);
        return error;
    }
}
