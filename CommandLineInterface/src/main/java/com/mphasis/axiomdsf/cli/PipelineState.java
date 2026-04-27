package com.mphasis.axiomdsf.cli;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/**
 * Represents the pipeline state for a workspace, persisted as state.json.
 * Tracks workspace metadata and per-requirement agent pipeline progress.
 * Supports parallel per-story pipelines via per-story state tracking.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class PipelineState {

    private int workspaceId;
    private String workspaceName;
    private String description;
    private String techStack;
    private String createdAt;
    private List<RequirementState> requirements = new ArrayList<>();

    public int getWorkspaceId() { return workspaceId; }
    public void setWorkspaceId(int workspaceId) { this.workspaceId = workspaceId; }

    public String getWorkspaceName() { return workspaceName; }
    public void setWorkspaceName(String workspaceName) { this.workspaceName = workspaceName; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getTechStack() { return techStack; }
    public void setTechStack(String techStack) { this.techStack = techStack; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public List<RequirementState> getRequirements() { return requirements; }
    public void setRequirements(List<RequirementState> requirements) { this.requirements = requirements; }

    public RequirementState getRequirement(int requirementId) {
        return requirements.stream()
            .filter(r -> r.getRequirementId() == requirementId)
            .findFirst()
            .orElse(null);
    }

    public int getNextRequirementId() {
        return requirements.stream()
            .mapToInt(RequirementState::getRequirementId)
            .max()
            .orElse(0) + 1;
    }

    /**
     * Per-story pipeline state. Each user story running through TDD→LLD→Coding
     * gets its own instance so multiple stories can run in parallel.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class StoryPipelineState {
        private String storyId;
        private int agentSequence;        // 5=TDD, 6=LLD, 7=CODE
        private String agentState;        // IN_PROGRESS, STORY_TDD_REVIEW, STORY_LLD_REVIEW, COMPLETED
        private String startedAt;

        public StoryPipelineState() {}
        public StoryPipelineState(String storyId, int agentSequence, String agentState) {
            this.storyId = storyId;
            this.agentSequence = agentSequence;
            this.agentState = agentState;
            this.startedAt = java.time.LocalDateTime.now().toString();
        }

        public String getStoryId() { return storyId; }
        public void setStoryId(String storyId) { this.storyId = storyId; }

        public int getAgentSequence() { return agentSequence; }
        public void setAgentSequence(int agentSequence) { this.agentSequence = agentSequence; }

        public String getAgentState() { return agentState; }
        public void setAgentState(String agentState) { this.agentState = agentState; }

        public String getStartedAt() { return startedAt; }
        public void setStartedAt(String startedAt) { this.startedAt = startedAt; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class RequirementState {
        private int requirementId;
        private String text;
        private String userStory;
        private int currentAgentSequence;
        private String state; // INIT, IN_PROGRESS, IN_REVIEW, APPROVED, REJECTED, REWORK, COMPLETED, STORY_READY
        private boolean completionStatus;
        private String startedAt;

        // Legacy single-story fields (kept for backward compat with existing state.json)
        private String activeStoryId;
        private int storyAgentSequence;

        // Parallel per-story tracking: storyId -> StoryPipelineState
        private Map<String, StoryPipelineState> storyPipelines = new LinkedHashMap<>();

        public int getRequirementId() { return requirementId; }
        public void setRequirementId(int requirementId) { this.requirementId = requirementId; }

        public String getText() { return text; }
        public void setText(String text) { this.text = text; }

        public String getUserStory() { return userStory; }
        public void setUserStory(String userStory) { this.userStory = userStory; }

        public int getCurrentAgentSequence() { return currentAgentSequence; }
        public void setCurrentAgentSequence(int currentAgentSequence) { this.currentAgentSequence = currentAgentSequence; }

        public String getState() { return state; }
        public void setState(String state) { this.state = state; }

        public boolean isCompletionStatus() { return completionStatus; }
        public void setCompletionStatus(boolean completionStatus) { this.completionStatus = completionStatus; }

        public String getStartedAt() { return startedAt; }
        public void setStartedAt(String startedAt) { this.startedAt = startedAt; }

        public String getActiveStoryId() { return activeStoryId; }
        public void setActiveStoryId(String activeStoryId) { this.activeStoryId = activeStoryId; }

        public int getStoryAgentSequence() { return storyAgentSequence; }
        public void setStoryAgentSequence(int storyAgentSequence) { this.storyAgentSequence = storyAgentSequence; }

        public Map<String, StoryPipelineState> getStoryPipelines() { return storyPipelines; }
        public void setStoryPipelines(Map<String, StoryPipelineState> storyPipelines) {
            this.storyPipelines = storyPipelines != null ? storyPipelines : new LinkedHashMap<>();
        }

        /** Get or create the pipeline state for a specific story. */
        public StoryPipelineState getStoryPipeline(String storyId) {
            return storyPipelines.get(storyId);
        }

        /** Create/update a story pipeline entry. */
        public StoryPipelineState putStoryPipeline(String storyId, int agentSeq, String agentState) {
            StoryPipelineState sps = storyPipelines.get(storyId);
            if (sps == null) {
                sps = new StoryPipelineState(storyId, agentSeq, agentState);
                storyPipelines.put(storyId, sps);
            } else {
                sps.setAgentSequence(agentSeq);
                sps.setAgentState(agentState);
            }
            return sps;
        }

        /** Remove a completed story from the active pipelines map. */
        public void removeStoryPipeline(String storyId) {
            storyPipelines.remove(storyId);
        }
    }

    // --- Serialization with file locking for cross-terminal safety ---

    private static final ObjectMapper MAPPER = new ObjectMapper();
    static {
        MAPPER.registerModule(new JavaTimeModule());
        MAPPER.enable(SerializationFeature.INDENT_OUTPUT);
    }

    public static PipelineState load(Path stateFile) throws IOException {
        if (!Files.exists(stateFile)) return null;
        return MAPPER.readValue(stateFile.toFile(), PipelineState.class);
    }

    /**
     * Load with file lock — use when you intend to modify and save back.
     * Returns null if file doesn't exist.
     */
    public static PipelineState loadLocked(Path stateFile) throws IOException {
        if (!Files.exists(stateFile)) return null;
        // Lock file to prevent concurrent modification from another terminal
        try (RandomAccessFile raf = new RandomAccessFile(stateFile.toFile(), "rw");
             FileChannel channel = raf.getChannel();
             FileLock lock = channel.lock()) {
            byte[] data = new byte[(int) raf.length()];
            raf.readFully(data);
            return MAPPER.readValue(data, PipelineState.class);
        }
    }

    public void save(Path stateFile) throws IOException {
        Files.createDirectories(stateFile.getParent());
        // Use file lock to prevent concurrent writes from parallel terminals
        try (RandomAccessFile raf = new RandomAccessFile(stateFile.toFile(), "rw");
             FileChannel channel = raf.getChannel();
             FileLock lock = channel.lock()) {
            byte[] data = MAPPER.writeValueAsBytes(this);
            raf.setLength(0);
            raf.write(data);
        }
    }
}
