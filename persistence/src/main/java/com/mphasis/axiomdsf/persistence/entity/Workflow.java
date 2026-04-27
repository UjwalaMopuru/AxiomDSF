package com.mphasis.axiomdsf.persistence.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "workflow")
public class Workflow {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(columnDefinition = "integer")
    private Long id;

    private Long workspaceId;
    private Long requirementId;
    private Long userStoryId;
    private String agentName;
    private String state;
    private int sequenceNumber;
    private String inputFilePath;
    private String outputFilePath;

    @Column(name = "input_wiki_url")
    private String inputWikiUrl;

    @Column(name = "output_wiki_url")
    private String outputWikiUrl;

    private boolean completionStatus;

    @Column(name = "pipeline_mode")
    private String pipelineMode = "per-story";

    @Column(name = "selected_agents")
    private String selectedAgents;

    private LocalDateTime createdAt = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getWorkspaceId() { return workspaceId; }
    public void setWorkspaceId(Long workspaceId) { this.workspaceId = workspaceId; }

    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }

    public Long getUserStoryId() { return userStoryId; }
    public void setUserStoryId(Long userStoryId) { this.userStoryId = userStoryId; }

    public String getAgentName() { return agentName; }
    public void setAgentName(String agentName) { this.agentName = agentName; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public int getSequenceNumber() { return sequenceNumber; }
    public void setSequenceNumber(int sequenceNumber) { this.sequenceNumber = sequenceNumber; }

    public String getInputFilePath() { return inputFilePath; }
    public void setInputFilePath(String inputFilePath) { this.inputFilePath = inputFilePath; }

    public String getOutputFilePath() { return outputFilePath; }
    public void setOutputFilePath(String outputFilePath) { this.outputFilePath = outputFilePath; }

    public boolean isCompletionStatus() { return completionStatus; }
    public void setCompletionStatus(boolean completionStatus) { this.completionStatus = completionStatus; }

    public String getPipelineMode() { return pipelineMode; }
    public void setPipelineMode(String pipelineMode) { this.pipelineMode = pipelineMode; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public String getInputWikiUrl() { return inputWikiUrl; }
    public void setInputWikiUrl(String inputWikiUrl) { this.inputWikiUrl = inputWikiUrl; }

    public String getOutputWikiUrl() { return outputWikiUrl; }
    public void setOutputWikiUrl(String outputWikiUrl) { this.outputWikiUrl = outputWikiUrl; }

    public String getSelectedAgents() { return selectedAgents; }
    public void setSelectedAgents(String selectedAgents) { this.selectedAgents = selectedAgents; }

    /** Parse the comma-separated selectedAgents into a List. */
    public java.util.List<String> getSelectedAgentsList() {
        if (selectedAgents == null || selectedAgents.isBlank()) return java.util.List.of();
        return java.util.List.of(selectedAgents.split(","));
    }
}
