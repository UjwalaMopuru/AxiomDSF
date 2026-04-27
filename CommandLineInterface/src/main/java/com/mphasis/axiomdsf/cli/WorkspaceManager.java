package com.mphasis.axiomdsf.cli;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Manages workspace directories and pipeline state files.
 * Handles creation, lookup, and state persistence for workspaces.
 */
public class WorkspaceManager {

    private final Path workspacesRoot;

    public WorkspaceManager(Path projectRoot) {
        this.workspacesRoot = projectRoot.resolve("workspaces");
    }

    public Path getWorkspacesRoot() { return workspacesRoot; }

    /**
     * Create a new workspace with directory structure and initial state.
     */
    public PipelineState createWorkspace(String name, String description, String techStack) throws IOException {
        int nextId = getNextWorkspaceId();
        String sanitizedName = sanitize(name);
        String folderName = "workspace-" + nextId + "_" + sanitizedName;
        Path wsDir = workspacesRoot.resolve(folderName);

        // Create directory structure
        Files.createDirectories(wsDir.resolve("orchestrator"));
        Files.createDirectories(wsDir.resolve("events"));
        Files.createDirectories(wsDir.resolve("logs"));
        Files.createDirectories(wsDir.resolve("requirements"));
        Files.createDirectories(wsDir.resolve("workflows"));

        // Create agent directories (only for agents 1-4; TDD/LLD/Coding are per-story)
        String agentRoot = sanitizedName + "_agents";
        for (AgentRegistry.AgentDef agent : AgentRegistry.getPipeline()) {
            if (agent.getSequence() <= 4 || agent.getSequence() >= 8) {
                Files.createDirectories(wsDir.resolve(agentRoot).resolve(agent.getName()));
            }
        }

        // Create and save initial state
        PipelineState state = new PipelineState();
        state.setWorkspaceId(nextId);
        state.setWorkspaceName(sanitizedName);
        state.setDescription(description);
        state.setTechStack(techStack);
        state.setCreatedAt(LocalDateTime.now().toString());
        state.setRequirements(new ArrayList<>());

        state.save(getStateFile(wsDir));
        return state;
    }

    /**
     * Find the workspace directory by ID.
     */
    public Path findWorkspaceDir(int workspaceId) throws IOException {
        if (!Files.exists(workspacesRoot)) return null;
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(workspacesRoot, "workspace-" + workspaceId + "_*")) {
            for (Path p : stream) {
                if (Files.isDirectory(p)) return p;
            }
        }
        return null;
    }

    /**
     * Load the pipeline state for a workspace.
     */
    public PipelineState loadState(int workspaceId) throws IOException {
        Path wsDir = findWorkspaceDir(workspaceId);
        if (wsDir == null) return null;
        return PipelineState.load(getStateFile(wsDir));
    }

    /**
     * Save the pipeline state back to disk.
     */
    public void saveState(PipelineState state) throws IOException {
        Path wsDir = findWorkspaceDir(state.getWorkspaceId());
        if (wsDir == null) throw new IOException("Workspace not found: " + state.getWorkspaceId());
        state.save(getStateFile(wsDir));
    }

    /**
     * Get the directory for a specific agent in a workspace.
     */
    public Path getAgentDir(int workspaceId, String agentName) throws IOException {
        Path wsDir = findWorkspaceDir(workspaceId);
        if (wsDir == null) return null;
        PipelineState state = loadState(workspaceId);
        return wsDir.resolve(state.getWorkspaceName() + "_agents").resolve(agentName);
    }

    /**
     * List all workspaces.
     */
    public List<PipelineState> listWorkspaces() throws IOException {
        List<PipelineState> result = new ArrayList<>();
        if (!Files.exists(workspacesRoot)) return result;
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(workspacesRoot, "workspace-*")) {
            for (Path p : stream) {
                if (Files.isDirectory(p)) {
                    PipelineState state = PipelineState.load(getStateFile(p));
                    if (state != null) result.add(state);
                }
            }
        }
        result.sort(Comparator.comparingInt(PipelineState::getWorkspaceId));
        return result;
    }

    /**
     * Find a workspace by its name.
     */
    public PipelineState findWorkspaceByName(String name) throws IOException {
        if (!Files.exists(workspacesRoot)) return null;
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(workspacesRoot, "workspace-*")) {
            for (Path p : stream) {
                if (Files.isDirectory(p)) {
                    PipelineState state = PipelineState.load(getStateFile(p));
                    if (state != null && name.equalsIgnoreCase(state.getWorkspaceName())) {
                        return state;
                    }
                }
            }
        }
        return null;
    }

    private Path getStateFile(Path wsDir) {
        return wsDir.resolve("orchestrator").resolve("state.json");
    }

    private int getNextWorkspaceId() throws IOException {
        if (!Files.exists(workspacesRoot)) {
            Files.createDirectories(workspacesRoot);
            return 1;
        }
        int max = 0;
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(workspacesRoot, "workspace-*")) {
            for (Path p : stream) {
                String dirName = p.getFileName().toString();
                try {
                    int id = Integer.parseInt(dirName.split("-")[1].split("_")[0]);
                    max = Math.max(max, id);
                } catch (Exception ignored) {}
            }
        }
        return max + 1;
    }

    private String sanitize(String name) {
        return name.replaceAll("[^a-zA-Z0-9_-]", "");
    }
}
