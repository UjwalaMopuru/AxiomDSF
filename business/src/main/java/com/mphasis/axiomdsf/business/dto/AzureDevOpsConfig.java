package com.mphasis.axiomdsf.business.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Configuration for Azure DevOps integration.
 * Contains PAT and organization details for API access.
 */
public class AzureDevOpsConfig {

    @NotBlank(message = "Organization URL is required")
    private String organizationUrl;  // e.g., https://dev.azure.com/NextSTEP2

    @NotBlank(message = "Project name is required")
    private String projectName;      // e.g., AxiomDSF

    @NotBlank(message = "Repository name is required")
    private String repositoryName;   // e.g., AxiomDSF

    @NotBlank(message = "Personal Access Token is required")
    private String personalAccessToken;

    private String defaultBranch = "main";

    // Pipeline mode: "per-story" or "full-sequence"
    private String pipelineMode = "per-story";

    // Extended MCP Config
    private Integer pipelineDefinitionId;
    private Integer releaseDefinitionId;
    private String wikiName;
    private String artifactsFeedName;

    public AzureDevOpsConfig() {}

    public AzureDevOpsConfig(String organizationUrl, String projectName, 
                             String repositoryName, String personalAccessToken) {
        this.organizationUrl = organizationUrl;
        this.projectName = projectName;
        this.repositoryName = repositoryName;
        this.personalAccessToken = personalAccessToken;
    }

    public String getOrganizationUrl() { return organizationUrl; }
    public void setOrganizationUrl(String organizationUrl) { this.organizationUrl = organizationUrl; }

    public String getProjectName() { return projectName; }
    public void setProjectName(String projectName) { this.projectName = projectName; }

    public String getRepositoryName() { return repositoryName; }
    public void setRepositoryName(String repositoryName) { this.repositoryName = repositoryName; }

    public String getPersonalAccessToken() { return personalAccessToken; }
    public void setPersonalAccessToken(String personalAccessToken) { this.personalAccessToken = personalAccessToken; }

    public String getDefaultBranch() { return defaultBranch; }
    public void setDefaultBranch(String defaultBranch) { this.defaultBranch = defaultBranch; }

    public String getPipelineMode() { return pipelineMode; }
    public void setPipelineMode(String pipelineMode) { this.pipelineMode = pipelineMode; }

    public Integer getPipelineDefinitionId() { return pipelineDefinitionId; }
    public void setPipelineDefinitionId(Integer pipelineDefinitionId) { this.pipelineDefinitionId = pipelineDefinitionId; }

    public Integer getReleaseDefinitionId() { return releaseDefinitionId; }
    public void setReleaseDefinitionId(Integer releaseDefinitionId) { this.releaseDefinitionId = releaseDefinitionId; }

    public String getWikiName() { return wikiName; }
    public void setWikiName(String wikiName) { this.wikiName = wikiName; }

    public String getArtifactsFeedName() { return artifactsFeedName; }
    public void setArtifactsFeedName(String artifactsFeedName) { this.artifactsFeedName = artifactsFeedName; }

    /**
     * Get the base API URL for Azure DevOps REST API.
     */
    public String getApiBaseUrl() {
        String url = organizationUrl.endsWith("/") ? organizationUrl : organizationUrl + "/";
        return url + projectName + "/_apis";
    }

    /**
     * Get the Git API URL for repository operations.
     */
    public String getGitApiUrl() {
        return getApiBaseUrl() + "/git/repositories/" + repositoryName;
    }

    /**
     * Get the Work Items API URL.
     */
    public String getWorkItemsApiUrl() {
        return getApiBaseUrl() + "/wit/workitems";
    }

    /**
     * Get the Wiki API URL.
     */
    public String getWikiApiUrl() {
        return getApiBaseUrl() + "/wiki/wikis";
    }

    /**
     * Get the Build API URL.
     */
    public String getBuildApiUrl() {
        return getApiBaseUrl() + "/build/builds";
    }

    /**
     * Get the Release API URL (uses vsrm subdomain).
     */
    public String getReleaseApiUrl() {
        String url = organizationUrl.endsWith("/") ? organizationUrl : organizationUrl + "/";
        // Release API uses vsrm.dev.azure.com
        url = url.replace("dev.azure.com", "vsrm.dev.azure.com");
        return url + projectName + "/_apis/release/releases";
    }

    /**
     * Get the Service Hooks API URL.
     */
    public String getServiceHooksApiUrl() {
        String url = organizationUrl.endsWith("/") ? organizationUrl : organizationUrl + "/";
        return url + "_apis/hooks/subscriptions";
    }

    /**
     * Get the Artifacts Feed API URL.
     */
    public String getArtifactsFeedApiUrl() {
        String url = organizationUrl.endsWith("/") ? organizationUrl : organizationUrl + "/";
        return url + projectName + "/_apis/packaging/feeds";
    }

    /**
     * Get the Dashboard API URL.
     */
    public String getDashboardApiUrl() {
        return getApiBaseUrl() + "/dashboard/dashboards";
    }

    /**
     * Get the wiki page URL for UI navigation.
     */
    public String getWikiPageBrowserUrl(String pagePath) {
        String url = organizationUrl.endsWith("/") ? organizationUrl : organizationUrl + "/";
        return url + projectName + "/_wiki/wikis/" + wikiName + "?pagePath=" + pagePath;
    }

    /**
     * Get the browse URL for a file in the repository.
     * Used as wiki-like URL when the wiki API is not available.
     */
    public String getFileBrowseUrl(String filePath, String branchName) {
        String url = organizationUrl.endsWith("/") ? organizationUrl : organizationUrl + "/";
        String path = filePath.startsWith("/") ? filePath : "/" + filePath;
        return url + projectName + "/_git/" + repositoryName + "?path=" + path + "&version=GB" + branchName;
    }

    /**
     * Get the code wiki page URL for browsing a wiki page.
     * Uses the published wiki name (wikiName field) for correct URL generation.
     * Converts hyphens to spaces in folder names since Azure DevOps code wiki 
     * displays hyphens as spaces in the page path.
     *
     * @param pagePath Full repo path like "/Hospital DMS-Wiki/01-Requirement-Analysis/Output.md"
     * @param branchName Branch the wiki is published on
     */
    public String getCodeWikiPageUrl(String pagePath, String branchName) {
        String url = organizationUrl.endsWith("/") ? organizationUrl : organizationUrl + "/";
        String path = pagePath.startsWith("/") ? pagePath : "/" + pagePath;
        
        // Remove .md extension for wiki page path
        if (path.endsWith(".md")) {
            path = path.substring(0, path.length() - 3);
        }
        
        // Strip the wiki base folder (mappedPath) from the path, since the wiki root already points there.
        // e.g., "/Hospital DMS-Wiki/01-Requirement-Analysis/Output" -> "/01-Requirement-Analysis/Output"
        if (wikiName != null && !wikiName.isBlank()) {
            // Try to strip any base path that matches the wiki folder name
            int idx = path.indexOf("/", 1); // find second slash
            if (idx > 0) {
                String firstSegment = path.substring(1, idx);
                // If the first segment matches or resembles the wiki base folder, strip it
                if (path.startsWith("/" + firstSegment + "/")) {
                    path = path.substring(idx);
                }
            }
        }

        // Use the published wiki name if available, otherwise fallback to repo.wiki
        String publishedWikiName = (wikiName != null && !wikiName.isBlank()) 
                ? wikiName 
                : repositoryName + ".wiki";

        return url + projectName + "/_wiki/wikis/" + 
               publishedWikiName.replace(" ", "%20") + 
               "?wikiVersion=GB" + branchName + 
               "&pagePath=" + path.replace(" ", "%20");
    }
}
