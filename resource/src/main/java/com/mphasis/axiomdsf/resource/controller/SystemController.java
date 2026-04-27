package com.mphasis.axiomdsf.resource.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.mphasis.axiomdsf.business.config.AgentPipelineProperties;
import com.mphasis.axiomdsf.business.port.in.WorkspaceUseCase;
import com.mphasis.axiomdsf.business.port.in.WorkflowUseCase;

import java.lang.management.ManagementFactory;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class SystemController {

    @Autowired
    private WorkspaceUseCase workspaceUseCase;

    @Autowired
    private WorkflowUseCase workflowUseCase;

    @Autowired
    private AgentPipelineProperties pipelineProperties;

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("status", "UP");
        health.put("timestamp", Instant.now().toString());

        // Uptime
        long uptimeMs = ManagementFactory.getRuntimeMXBean().getUptime();
        Duration uptime = Duration.ofMillis(uptimeMs);
        health.put("uptime", String.format("%dd %dh %dm %ds",
                uptime.toDays(), uptime.toHoursPart(), uptime.toMinutesPart(), uptime.toSecondsPart()));
        health.put("uptimeMs", uptimeMs);

        // Memory
        Runtime runtime = Runtime.getRuntime();
        Map<String, Object> memory = new LinkedHashMap<>();
        memory.put("totalMB", runtime.totalMemory() / (1024 * 1024));
        memory.put("freeMB", runtime.freeMemory() / (1024 * 1024));
        memory.put("usedMB", (runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024));
        memory.put("maxMB", runtime.maxMemory() / (1024 * 1024));
        health.put("memory", memory);

        // Counts
        Map<String, Object> stats = new LinkedHashMap<>();
        try {
            stats.put("workspaces", workspaceUseCase.listAllWorkspaces().size());
        } catch (Exception e) {
            stats.put("workspaces", -1);
        }
        try {
            var workflows = workflowUseCase.getAllWorkflows();
            stats.put("totalWorkflows", workflows.size());
            stats.put("activeWorkflows", workflows.stream().filter(w -> !w.isCompletionStatus()).count());
            stats.put("completedWorkflows", workflows.stream().filter(w -> w.isCompletionStatus()).count());
        } catch (Exception e) {
            stats.put("totalWorkflows", -1);
        }
        stats.put("configuredAgents", pipelineProperties.getEnabledAgentsInOrder().size());
        health.put("stats", stats);

        // Java info
        Map<String, String> jvm = new LinkedHashMap<>();
        jvm.put("version", System.getProperty("java.version"));
        jvm.put("vendor", System.getProperty("java.vendor"));
        jvm.put("os", System.getProperty("os.name") + " " + System.getProperty("os.arch"));
        health.put("jvm", jvm);

        return ResponseEntity.ok(health);
    }
}
