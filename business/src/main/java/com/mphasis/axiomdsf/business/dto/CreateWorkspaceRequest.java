package com.mphasis.axiomdsf.business.dto;

import jakarta.validation.constraints.NotBlank;

public class CreateWorkspaceRequest {

    @NotBlank
    private String projectName;

    private String description;
    private String techStack;
    private boolean status = true;

    // Azure DevOps Configuration
    private String azureDevOpsOrganizationUrl;
    private String azureDevOpsProject;
    private String azureDevOpsRepository;
    private String azureDevOpsPersonalAccessToken;
    
    // Pipeline mode: "per-story" (mode 1) or "full-sequence" (mode 2)
    private String pipelineMode = "per-story";
    
    // Enable Azure DevOps integration
    private boolean azureDevOpsEnabled = false;

    public String getProjectName() { return projectName; }
    public void setProjectName(String projectName) { this.projectName = projectName; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getTechStack() { return techStack; }
    public void setTechStack(String techStack) { this.techStack = techStack; }

    public boolean isStatus() { return status; }
    public void setStatus(boolean status) { this.status = status; }

    public String getAzureDevOpsOrganizationUrl() { return azureDevOpsOrganizationUrl; }
    public void setAzureDevOpsOrganizationUrl(String azureDevOpsOrganizationUrl) { 
        this.azureDevOpsOrganizationUrl = azureDevOpsOrganizationUrl; 
    }

    public String getAzureDevOpsProject() { return azureDevOpsProject; }
    public void setAzureDevOpsProject(String azureDevOpsProject) { 
        this.azureDevOpsProject = azureDevOpsProject; 
    }

    public String getAzureDevOpsRepository() { return azureDevOpsRepository; }
    public void setAzureDevOpsRepository(String azureDevOpsRepository) { 
        this.azureDevOpsRepository = azureDevOpsRepository; 
    }

    public String getAzureDevOpsPersonalAccessToken() { return azureDevOpsPersonalAccessToken; }
    public void setAzureDevOpsPersonalAccessToken(String azureDevOpsPersonalAccessToken) { 
        this.azureDevOpsPersonalAccessToken = azureDevOpsPersonalAccessToken; 
    }

    public String getPipelineMode() { return pipelineMode; }
    public void setPipelineMode(String pipelineMode) { this.pipelineMode = pipelineMode; }

    public boolean isAzureDevOpsEnabled() { return azureDevOpsEnabled; }
    public void setAzureDevOpsEnabled(boolean azureDevOpsEnabled) { 
        this.azureDevOpsEnabled = azureDevOpsEnabled; 
    }

}
