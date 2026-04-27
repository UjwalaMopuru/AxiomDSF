package com.mphasis.axiomdsf.persistence.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "workspace")
public class Workspace {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(columnDefinition = "integer")
    private Long id;

    private String projectName;
    private String techStack;
    private String location;
    private String description;
    private boolean status = true;

    // Azure DevOps Configuration
    @Column(name = "azure_devops_organization_url")
    private String azureDevOpsOrganizationUrl;

    @Column(name = "azure_devops_project")
    private String azureDevOpsProject;

    @Column(name = "azure_devops_repository")
    private String azureDevOpsRepository;

    @Column(name = "azure_devops_pat")
    private String azureDevOpsPersonalAccessToken;

    @Column(name = "azure_devops_branch")
    private String azureDevOpsBranch;

    @Column(name = "azure_devops_wiki_branch")
    private String azureDevOpsWikiBranch;

    // Pipeline mode: "per-story" (mode 1) or "full-sequence" (mode 2)
    @Column(name = "pipeline_mode")
    private String pipelineMode = "per-story";

    // Flag to indicate if Azure DevOps integration is enabled
    @Column(name = "azure_devops_enabled")
    private boolean azureDevOpsEnabled = false;

    // Wiki name (auto-generated, not user-input)
    @Column(name = "wiki_name")
    private String wikiName;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getProjectName() { return projectName; }
    public void setProjectName(String projectName) { this.projectName = projectName; }

    public String getTechStack() { return techStack; }
    public void setTechStack(String techStack) { this.techStack = techStack; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

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

    public String getAzureDevOpsBranch() { return azureDevOpsBranch; }
    public void setAzureDevOpsBranch(String azureDevOpsBranch) { 
        this.azureDevOpsBranch = azureDevOpsBranch; 
    }

    public String getAzureDevOpsWikiBranch() { return azureDevOpsWikiBranch; }
    public void setAzureDevOpsWikiBranch(String azureDevOpsWikiBranch) { 
        this.azureDevOpsWikiBranch = azureDevOpsWikiBranch; 
    }

    public String getPipelineMode() { return pipelineMode; }
    public void setPipelineMode(String pipelineMode) { this.pipelineMode = pipelineMode; }

    public boolean isAzureDevOpsEnabled() { return azureDevOpsEnabled; }
    public void setAzureDevOpsEnabled(boolean azureDevOpsEnabled) { 
        this.azureDevOpsEnabled = azureDevOpsEnabled; 
    }

    public String getWikiName() { return wikiName; }
    public void setWikiName(String wikiName) { this.wikiName = wikiName; }
}
