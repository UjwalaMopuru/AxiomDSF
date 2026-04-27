package com.mphasis.axiomdsf.cli;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Handles local file-based persistence for workflows, events, and logs.
 * Writes JSON tracking files to the workspace's workflows/, events/, and logs/ folders.
 * Also attempts to sync data to the REST API for SQLite DB persistence.
 */
public class LocalPersistenceHelper {

    private static final Logger logger = LoggerFactory.getLogger(LocalPersistenceHelper.class);
    private static final DateTimeFormatter TIMESTAMP_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final DateTimeFormatter FILE_TIMESTAMP_FMT = DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss");

    private final ObjectMapper mapper;
    private final WorkspaceManager workspaceManager;
    private final ApiClient apiClient;

    // Track event sequence per workspace for ordering
    private int eventCounter = 0;

    public LocalPersistenceHelper(WorkspaceManager workspaceManager, ApiClient apiClient) {
        this.workspaceManager = workspaceManager;
        this.apiClient = apiClient;
        this.mapper = new ObjectMapper();
        this.mapper.registerModule(new JavaTimeModule());
        this.mapper.enable(SerializationFeature.INDENT_OUTPUT);
        this.mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    // ─────────────────────────────────────────────
    //  WORKFLOW RECORDS → workflows/ folder
    // ─────────────────────────────────────────────

    /**
     * Write a workflow tracking record as a JSON file in workflows/.
     * File name: workflow_{agentSequence}_{agentName}_{state}.json
     */
    public void writeWorkflow(int workspaceId, int requirementId, String agentName,
                              int agentSequence, String state, String inputPath,
                              String outputPath, boolean completionStatus) {
        try {
            Path wsDir = workspaceManager.findWorkspaceDir(workspaceId);
            if (wsDir == null) return;

            Path workflowsDir = wsDir.resolve("workflows");
            Files.createDirectories(workflowsDir);

            Map<String, Object> record = new LinkedHashMap<>();
            record.put("workspaceId", workspaceId);
            record.put("requirementId", requirementId);
            record.put("agentName", agentName);
            record.put("agentSequence", agentSequence);
            record.put("state", state);
            record.put("inputFilePath", inputPath);
            record.put("outputFilePath", outputPath);
            record.put("completionStatus", completionStatus);
            record.put("timestamp", LocalDateTime.now().format(TIMESTAMP_FMT));

            // Overwrite per agent — latest state wins
            String fileName = String.format("workflow_%02d_%s.json", agentSequence, agentName);
            Path file = workflowsDir.resolve(fileName);
            Files.writeString(file, mapper.writeValueAsString(record));
            logger.debug("Wrote workflow record: {}", file.getFileName());
        } catch (IOException e) {
            logger.warn("Failed to write workflow record for {}: {}", agentName, e.getMessage());
        }
    }

    // ─────────────────────────────────────────────
    //  EVENT RECORDS → events/ folder
    // ─────────────────────────────────────────────

    /**
     * Write a state transition event as a JSON file in events/.
     * File name: event_{sequence}_{agentName}_{state}.json
     */
    public void writeEvent(int workspaceId, int requirementId, String agentName,
                           String previousState, String currentState,
                           int agentSequence, String agentType) {
        try {
            Path wsDir = workspaceManager.findWorkspaceDir(workspaceId);
            if (wsDir == null) return;

            Path eventsDir = wsDir.resolve("events");
            Files.createDirectories(eventsDir);

            eventCounter++;

            Map<String, Object> record = new LinkedHashMap<>();
            record.put("eventId", eventCounter);
            record.put("workspaceId", workspaceId);
            record.put("requirementId", requirementId);
            record.put("agentName", agentName);
            record.put("agentSequence", agentSequence);
            record.put("agentType", agentType);
            record.put("previousState", previousState);
            record.put("currentState", currentState);
            record.put("timestamp", LocalDateTime.now().format(TIMESTAMP_FMT));

            String fileName = String.format("event_%04d_%s_%s.json", eventCounter, agentName, currentState);
            Path file = eventsDir.resolve(fileName);
            Files.writeString(file, mapper.writeValueAsString(record));
            logger.debug("Wrote event record: {}", file.getFileName());
        } catch (IOException e) {
            logger.warn("Failed to write event record for {}: {}", agentName, e.getMessage());
        }
    }

    /**
     * Append an event line to events/events_log.jsonl (newline-delimited JSON).
     * This provides a complete sequential audit trail.
     */
    public void appendEventLog(int workspaceId, int requirementId, String agentName,
                               String previousState, String currentState, int agentSequence) {
        try {
            Path wsDir = workspaceManager.findWorkspaceDir(workspaceId);
            if (wsDir == null) return;

            Path eventsDir = wsDir.resolve("events");
            Files.createDirectories(eventsDir);

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("seq", eventCounter);
            entry.put("agent", agentName);
            entry.put("agentSeq", agentSequence);
            entry.put("from", previousState);
            entry.put("to", currentState);
            entry.put("time", LocalDateTime.now().format(TIMESTAMP_FMT));

            Path logFile = eventsDir.resolve("events_log.jsonl");
            String line = mapper.writeValueAsString(entry) + "\n";
            Files.writeString(logFile, line, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            logger.warn("Failed to append event log: {}", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────
    //  EXECUTION LOGS → logs/ folder
    // ─────────────────────────────────────────────

    /**
     * Write agent execution log (Copilot CLI output) to logs/ folder.
     */
    public void writeAgentLog(int workspaceId, String agentName, int agentSequence,
                              String cliOutput, long elapsedSeconds, int exitCode) {
        try {
            Path wsDir = workspaceManager.findWorkspaceDir(workspaceId);
            if (wsDir == null) return;

            Path logsDir = wsDir.resolve("logs");
            Files.createDirectories(logsDir);

            String timestamp = LocalDateTime.now().format(FILE_TIMESTAMP_FMT);
            String fileName = String.format("agent_%02d_%s_%s.log", agentSequence, agentName, timestamp);
            Path logFile = logsDir.resolve(fileName);

            StringBuilder logContent = new StringBuilder();
            logContent.append("=== Agent Execution Log ===\n");
            logContent.append("Agent: ").append(agentName).append(" (#").append(agentSequence).append(")\n");
            logContent.append("Workspace: ").append(workspaceId).append("\n");
            logContent.append("Timestamp: ").append(LocalDateTime.now().format(TIMESTAMP_FMT)).append("\n");
            logContent.append("Duration: ").append(elapsedSeconds).append("s\n");
            logContent.append("Exit Code: ").append(exitCode).append("\n");
            logContent.append("=".repeat(50)).append("\n\n");
            logContent.append(cliOutput != null ? cliOutput : "(no output captured)");

            Files.writeString(logFile, logContent.toString());
            logger.debug("Wrote agent log: {}", logFile.getFileName());
        } catch (IOException e) {
            logger.warn("Failed to write agent log for {}: {}", agentName, e.getMessage());
        }
    }

    /**
     * Write a general pipeline log entry to logs/pipeline.log
     */
    public void logPipelineAction(int workspaceId, String message) {
        try {
            Path wsDir = workspaceManager.findWorkspaceDir(workspaceId);
            if (wsDir == null) return;

            Path logsDir = wsDir.resolve("logs");
            Files.createDirectories(logsDir);
            Path logFile = logsDir.resolve("pipeline.log");

            String entry = String.format("[%s] %s%n", LocalDateTime.now().format(TIMESTAMP_FMT), message);
            Files.writeString(logFile, entry, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            logger.warn("Failed to write pipeline log: {}", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────
    //  DB SYNC via REST API (best-effort)
    // ─────────────────────────────────────────────

    /**
     * Attempt to sync workspace creation to the DB via the REST API.
     * Fails gracefully if the server isn't running.
     */
    public void syncWorkspaceToApi(String projectName, String description, String techStack) {
        if (apiClient == null) return;
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("projectName", projectName);
            body.put("description", description);
            body.put("techStack", techStack);
            body.put("status", true);

            ApiClient.ApiResponse resp = apiClient.post("/workspace/create", body);
            if (resp.isSuccess()) {
                logger.info("Synced workspace to DB via API");
            } else {
                logger.debug("API sync failed (server may not be running): status={}", resp.getStatusCode());
            }
        } catch (Exception e) {
            logger.debug("API sync failed: {}", e.getMessage());
        }
    }

    /**
     * Attempt to sync workflow start to the DB via the REST API.
     */
    public void syncWorkflowStartToApi(int workspaceId, String requirementText) {
        if (apiClient == null) return;
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("workspaceId", (long) workspaceId);
            body.put("requirementText", requirementText);

            ApiClient.ApiResponse resp = apiClient.post("/workflow/start", body);
            if (resp.isSuccess()) {
                logger.info("Synced workflow start to DB via API");
            } else {
                logger.debug("API workflow sync failed: status={}", resp.getStatusCode());
            }
        } catch (Exception e) {
            logger.debug("API workflow sync failed: {}", e.getMessage());
        }
    }

    /**
     * Attempt to sync approval decision to the DB via the REST API.
     */
    public void syncApprovalToApi(int workspaceId, int requirementId, String decision, String comments) {
        if (apiClient == null) return;
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("workspaceId", (long) workspaceId);
            body.put("requirementId", (long) requirementId);
            body.put("decision", decision);
            if (comments != null) body.put("comments", comments);

            ApiClient.ApiResponse resp = apiClient.post("/workflow/approve", body);
            if (resp.isSuccess()) {
                logger.info("Synced approval to DB via API: decision={}", decision);
            } else {
                logger.debug("API approval sync failed: status={}", resp.getStatusCode());
            }
        } catch (Exception e) {
            logger.debug("API approval sync failed: {}", e.getMessage());
        }
    }

    /**
     * Record a complete state transition: writes workflow, event, event log, pipeline log, and API sync.
     * This is the main entry point for recording any state change.
     */
    public void recordStateChange(int workspaceId, int requirementId,
                                  AgentRegistry.AgentDef agent,
                                  String previousState, String newState,
                                  String inputPath, String outputPath,
                                  boolean completionStatus) {
        String agentType = resolveAgentType(agent);

        writeWorkflow(workspaceId, requirementId, agent.getName(),
                agent.getSequence(), newState, inputPath, outputPath, completionStatus);

        writeEvent(workspaceId, requirementId, agent.getName(),
                previousState, newState, agent.getSequence(), agentType);

        appendEventLog(workspaceId, requirementId, agent.getName(),
                previousState, newState, agent.getSequence());

        logPipelineAction(workspaceId,
                String.format("Agent %s (#%d): %s -> %s",
                        agent.getName(), agent.getSequence(),
                        previousState != null ? previousState : "NULL", newState));
    }

    private String resolveAgentType(AgentRegistry.AgentDef agent) {
        switch (agent.getSequence()) {
            case 1: return "REQUIREMENT";
            case 2: return "HLS";
            case 3: return "HLD";
            case 4: return "USER_STORY";
            case 5: return "TR_REVIEW";
            case 6: return "LLD";
            case 7: return "TDD";
            case 8: return "CODING";
            case 9: return "STATIC_CODE_ANALYSIS";
            case 10: return "SECURITY";
            default: return "UNKNOWN";
        }
    }
}
