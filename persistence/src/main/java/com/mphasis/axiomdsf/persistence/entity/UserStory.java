package com.mphasis.axiomdsf.persistence.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "user_story")
public class UserStory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(columnDefinition = "integer")
    private Long id;

    private String storyId;
    private String title;
    private String priority;
    private Long workspaceId;
    private Long requirementId;
    private String filePath;

    @Column(columnDefinition = "TEXT")
    private String userStoryText;

    private Long azureWorkItemId;

    private String azureBranchName;

    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getStoryId() { return storyId; }
    public void setStoryId(String storyId) { this.storyId = storyId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }

    public Long getWorkspaceId() { return workspaceId; }
    public void setWorkspaceId(Long workspaceId) { this.workspaceId = workspaceId; }

    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }

    public String getFilePath() { return filePath; }
    public void setFilePath(String filePath) { this.filePath = filePath; }

    public String getUserStoryText() { return userStoryText; }
    public void setUserStoryText(String userStoryText) { this.userStoryText = userStoryText; }

    public Long getAzureWorkItemId() { return azureWorkItemId; }
    public void setAzureWorkItemId(Long azureWorkItemId) { this.azureWorkItemId = azureWorkItemId; }

    public String getAzureBranchName() { return azureBranchName; }
    public void setAzureBranchName(String azureBranchName) { this.azureBranchName = azureBranchName; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
