package com.mphasis.axiomdsf.persistence.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "event")
public class Event {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(columnDefinition = "integer")
    private Long id;

    private Long workspaceId;
    private Long requirementId;
    private Long userStoryId;
    private String agentName;
    private String state;
    private String inputFileLocation;
    private String outputFileLocation;

    @Column(name = "input_wiki_url")
    private String inputWikiUrl;

    @Column(name = "output_wiki_url")
    private String outputWikiUrl;

    private Integer executionOrder;
    private String agentType;
    private Boolean agentEnabled;
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

    public String getInputFileLocation() { return inputFileLocation; }
    public void setInputFileLocation(String inputFileLocation) { this.inputFileLocation = inputFileLocation; }

    public String getOutputFileLocation() { return outputFileLocation; }
    public void setOutputFileLocation(String outputFileLocation) { this.outputFileLocation = outputFileLocation; }

    public Integer getExecutionOrder() { return executionOrder; }
    public void setExecutionOrder(Integer executionOrder) { this.executionOrder = executionOrder; }

    public String getAgentType() { return agentType; }
    public void setAgentType(String agentType) { this.agentType = agentType; }

    public Boolean getAgentEnabled() { return agentEnabled; }
    public void setAgentEnabled(Boolean agentEnabled) { this.agentEnabled = agentEnabled; }

    public String getInputWikiUrl() { return inputWikiUrl; }
    public void setInputWikiUrl(String inputWikiUrl) { this.inputWikiUrl = inputWikiUrl; }

    public String getOutputWikiUrl() { return outputWikiUrl; }
    public void setOutputWikiUrl(String outputWikiUrl) { this.outputWikiUrl = outputWikiUrl; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
