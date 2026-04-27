package com.mphasis.axiomdsf.business.service;

import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mphasis.axiomdsf.business.dto.AzureDevOpsConfig;

/**
 * MCP (Model Context Protocol) Service for Azure DevOps integration.
 * Provides operations for:
 * - Branch management (create workspace branches)
 * - Repository file/folder operations (dynamic folder structure)
 * - Work Item management (User Stories, Test Cases, Tasks, Bugs)
 * - Pull Request operations
 * - Build/Pipeline triggers
 */
@Service
public class AzureDevOpsMcpService {

    private static final Logger logger = LoggerFactory.getLogger(AzureDevOpsMcpService.class);
    private static final String API_VERSION = "7.0";
    private static final String GIT_API_VERSION = "7.0";
    private static final String WIT_API_VERSION = "7.0";

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public AzureDevOpsMcpService() {
        this.restTemplate = createSslTrustingRestTemplate();
        this.objectMapper = new ObjectMapper();
    }

    /**
     * Creates a RestTemplate that trusts all SSL certificates.
     * Required for environments with corporate proxies or self-signed certs.
     */
    private RestTemplate createSslTrustingRestTemplate() {
        try {
            TrustManager[] trustAllCerts = new TrustManager[]{
                new X509TrustManager() {
                    public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                    public void checkClientTrusted(X509Certificate[] certs, String authType) {}
                    public void checkServerTrusted(X509Certificate[] certs, String authType) {}
                }
            };

            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(null, trustAllCerts, new java.security.SecureRandom());

            SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory() {
                @Override
                protected void prepareConnection(HttpURLConnection connection, String httpMethod) throws java.io.IOException {
                    if (connection instanceof HttpsURLConnection httpsConn) {
                        httpsConn.setSSLSocketFactory(sslContext.getSocketFactory());
                        httpsConn.setHostnameVerifier((hostname, session) -> true);
                    }
                    super.prepareConnection(connection, httpMethod);
                }
            };

            logger.info("Created SSL-trusting RestTemplate for Azure DevOps integration");
            return new RestTemplate(factory);
        } catch (Exception e) {
            logger.warn("Failed to create SSL-trusting RestTemplate, falling back to default: {}", e.getMessage());
            return new RestTemplate();
        }
    }

    // ==================== Connection & Validation ====================

    /**
     * Validate Azure DevOps connection with provided PAT.
     */
    public boolean validateConnection(AzureDevOpsConfig config) {
        return validateConnectionDetailed(config).valid();
    }

    /**
     * Validate Azure DevOps connection and return a detailed reason on failure.
     * Checks repository access first; if that fails, checks project access to separate
     * PAT/project errors from repository name/permission issues.
     */
    public ValidationResult validateConnectionDetailed(AzureDevOpsConfig config) {
        try {
            String repoUrl = config.getGitApiUrl() + "?api-version=" + GIT_API_VERSION;
            HttpEntity<String> entity = new HttpEntity<>(createHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(repoUrl, HttpMethod.GET, entity, String.class);
            if (response.getStatusCode().is2xxSuccessful()) {
                return new ValidationResult(true, "Connection successful");
            }
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            int status = e.getStatusCode().value();
            if (status == 401 || status == 403) {
                return new ValidationResult(false, "PAT is invalid or missing required permissions (Code Read/Write, Wiki Read/Write).");
            }
            // Repo can be wrong while PAT/project are valid. Check project-level access next.
            ValidationResult projectValidation = validateProjectConnection(config);
            if (!projectValidation.valid()) {
                return projectValidation;
            }
            return new ValidationResult(false, "PAT and project are valid, but repository '" + config.getRepositoryName() + "' was not found or is not accessible.");
        } catch (Exception e) {
            logger.error("Failed to validate Azure DevOps connection: {}", e.getMessage());
            return new ValidationResult(false, "Failed to connect to Azure DevOps: " + e.getMessage());
        }

        return new ValidationResult(false, "Failed to connect to Azure DevOps.");
    }

    /**
     * Validate organization + project access using the projects API.
     */
    private ValidationResult validateProjectConnection(AzureDevOpsConfig config) {
        try {
            String orgUrl = config.getOrganizationUrl().endsWith("/")
                    ? config.getOrganizationUrl()
                    : config.getOrganizationUrl() + "/";
            String url = orgUrl + "_apis/projects?api-version=" + API_VERSION;
            HttpEntity<String> entity = new HttpEntity<>(createHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.GET, entity, String.class);
            if (!response.getStatusCode().is2xxSuccessful()) {
                return new ValidationResult(false, "Unable to access Azure DevOps organization/projects.");
            }
            JsonNode body = objectMapper.readTree(response.getBody());
            if (body != null && body.has("value")) {
                for (JsonNode p : body.get("value")) {
                    if (config.getProjectName().equalsIgnoreCase(p.path("name").asText())) {
                        return new ValidationResult(true, "Project access verified");
                    }
                }
            }
            return new ValidationResult(false, "Project '" + config.getProjectName() + "' was not found in organization.");
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            int status = e.getStatusCode().value();
            if (status == 401 || status == 403) {
                return new ValidationResult(false, "PAT is invalid or missing permissions for organization/project access.");
            }
            return new ValidationResult(false, "Failed to validate organization/project: HTTP " + status);
        } catch (Exception e) {
            return new ValidationResult(false, "Failed to validate organization/project: " + e.getMessage());
        }
    }

    public record ValidationResult(boolean valid, String message) {}

    /**
     * Get repository information.
     */
    public JsonNode getRepositoryInfo(AzureDevOpsConfig config) {
        String url = config.getGitApiUrl() + "?api-version=" + GIT_API_VERSION;
        return executeGet(url, config);
    }

    // ==================== Branch Operations ====================

    /**
     * Create a new clean branch for the workspace.
     * Creates the branch from main, then immediately deletes all inherited files
     * so the branch starts empty (only wiki + agent output folders will be added later).
     */
    public String createWorkspaceBranch(AzureDevOpsConfig config, String workspaceName) {
        String shortName = sanitizeBranchName(workspaceName);
        String branchName = "refs/heads/" + shortName;

        // Check if branch already exists (idempotent)
        String existingCommit = getLatestCommitId(config, shortName);
        if (existingCommit != null) {
            logger.info("Workspace branch already exists: {}", shortName);
            return shortName;
        }

        // Get the latest commit SHA from the default branch; seed repo if it's empty
        String latestCommitId = getLatestCommitId(config, config.getDefaultBranch());
        if (latestCommitId == null) {
            logger.info("Repo appears empty — creating initial commit before workspace branch");
            latestCommitId = createInitialCommit(config);
            if (latestCommitId == null) {
                throw new RuntimeException("Could not create initial commit on default branch — repo may be inaccessible");
            }
        }

        // Create the branch ref
        String url = config.getGitApiUrl() + "/refs?api-version=" + GIT_API_VERSION;
        
        ArrayNode payload = objectMapper.createArrayNode();
        ObjectNode refUpdate = objectMapper.createObjectNode();
        refUpdate.put("name", branchName);
        refUpdate.put("oldObjectId", "0000000000000000000000000000000000000000");
        refUpdate.put("newObjectId", latestCommitId);
        payload.add(refUpdate);

        try {
            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(payload), 
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
            
            if (response.getStatusCode().is2xxSuccessful()) {
                logger.info("Created workspace branch: {}", branchName);
                
                // Clean the branch by deleting all inherited files from main
                cleanBranch(config, shortName);
                
                return shortName;
            }
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            if (e.getStatusCode().value() == 409) {
                logger.info("Workspace branch already exists (409): {}", shortName);
                return shortName;
            }
            logger.error("Failed to create branch: {}", e.getMessage());
            throw new RuntimeException("Failed to create workspace branch: " + e.getMessage());
        } catch (Exception e) {
            logger.error("Failed to create branch: {}", e.getMessage());
            throw new RuntimeException("Failed to create workspace branch: " + e.getMessage());
        }
        return null;
    }

    /**
     * Create a separate branch for a user story, branched from the workspace branch.
     * Branch name format: {workspaceBranch}_US-{storyId}
     * @return The branch short name, or null on failure
     */
    public String createUserStoryBranch(AzureDevOpsConfig config, String workspaceBranch, String storyId) {
        String shortName = sanitizeBranchName(workspaceBranch + "_" + storyId);
        String branchName = "refs/heads/" + shortName;

        // Check if branch already exists (idempotent)
        String existingCommit = getLatestCommitId(config, shortName);
        if (existingCommit != null) {
            logger.info("User story branch already exists: {}", shortName);
            return shortName;
        }

        // Get the latest commit SHA from the workspace branch
        String latestCommitId = getLatestCommitId(config, workspaceBranch);
        if (latestCommitId == null) {
            logger.warn("Workspace branch '{}' not found, falling back to default branch", workspaceBranch);
            latestCommitId = getLatestCommitId(config, config.getDefaultBranch());
            if (latestCommitId == null) {
                throw new RuntimeException("Could not get latest commit from workspace or default branch");
            }
        }

        String url = config.getGitApiUrl() + "/refs?api-version=" + GIT_API_VERSION;

        ArrayNode payload = objectMapper.createArrayNode();
        ObjectNode refUpdate = objectMapper.createObjectNode();
        refUpdate.put("name", branchName);
        refUpdate.put("oldObjectId", "0000000000000000000000000000000000000000");
        refUpdate.put("newObjectId", latestCommitId);
        payload.add(refUpdate);

        try {
            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(payload),
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                logger.info("Created user story branch: {}", shortName);
                return shortName;
            }
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            if (e.getStatusCode().value() == 409) {
                logger.info("User story branch already exists (409): {}", shortName);
                return shortName;
            }
            logger.error("Failed to create user story branch: {}", e.getMessage());
        } catch (Exception e) {
            logger.error("Failed to create user story branch: {}", e.getMessage());
        }
        return null;
    }

    /**
     * Create the very first commit on an empty repo (no branches yet).
     * Uses the push API with oldObjectId all-zeros so no base tree is needed.
     * @return The new commit SHA, or null on failure
     */
    private String createInitialCommit(AzureDevOpsConfig config) {
        String defaultBranch = config.getDefaultBranch();
        String url = config.getGitApiUrl() + "/pushes?api-version=" + GIT_API_VERSION;
        try {
            ObjectNode pushPayload = objectMapper.createObjectNode();

            ArrayNode refUpdates = objectMapper.createArrayNode();
            ObjectNode refUpdate = objectMapper.createObjectNode();
            refUpdate.put("name", "refs/heads/" + defaultBranch);
            refUpdate.put("oldObjectId", "0000000000000000000000000000000000000000");
            refUpdates.add(refUpdate);
            pushPayload.set("refUpdates", refUpdates);

            ArrayNode commits = objectMapper.createArrayNode();
            ObjectNode commit = objectMapper.createObjectNode();
            commit.put("comment", "Initial commit — initialized by AxiomDSF");

            ArrayNode changes = objectMapper.createArrayNode();
            ObjectNode change = objectMapper.createObjectNode();
            change.put("changeType", "add");
            ObjectNode item = objectMapper.createObjectNode();
            item.put("path", "/README.md");
            change.set("item", item);
            ObjectNode newContent = objectMapper.createObjectNode();
            newContent.put("content", "# " + config.getRepositoryName() + "\n\nInitialized by AxiomDSF.");
            newContent.put("contentType", "rawtext");
            change.set("newContent", newContent);
            changes.add(change);

            commit.set("changes", changes);
            commits.add(commit);
            pushPayload.set("commits", commits);

            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(pushPayload),
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                JsonNode result = objectMapper.readTree(response.getBody());
                String commitId = result.path("commits").path(0).path("commitId").asText(null);
                logger.info("Created initial commit on '{}': {}", defaultBranch, commitId);
                return commitId;
            }
        } catch (Exception e) {
            logger.error("Failed to create initial commit: {}", e.getMessage());
        }
        return null;
    }

    /**
     * Create a wiki branch. The caller provides the full branch name
     * (e.g., "MyWorkspace_req_1_wiki"). Branch is created from main.
     * @return The branch short name, or null on failure
     */
    public String createWikiBranch(AzureDevOpsConfig config, String wikiBranchName) {
        String shortName = sanitizeBranchName(wikiBranchName);
        String branchName = "refs/heads/" + shortName;

        // Check if branch already exists
        String existingCommit = getLatestCommitId(config, shortName);
        if (existingCommit != null) {
            logger.info("Wiki branch already exists: {}", shortName);
            return shortName;
        }

        // If the repo is empty (no commits yet), create an initial commit on main first
        String latestCommitId = getLatestCommitId(config, config.getDefaultBranch());
        if (latestCommitId == null) {
            logger.info("Repo appears empty — creating initial commit on default branch before wiki branch");
            latestCommitId = createInitialCommit(config);
            if (latestCommitId == null) {
                throw new RuntimeException("Could not create initial commit on default branch — repo may be inaccessible");
            }
        }

        String url = config.getGitApiUrl() + "/refs?api-version=" + GIT_API_VERSION;

        ArrayNode payload = objectMapper.createArrayNode();
        ObjectNode refUpdate = objectMapper.createObjectNode();
        refUpdate.put("name", branchName);
        refUpdate.put("oldObjectId", "0000000000000000000000000000000000000000");
        refUpdate.put("newObjectId", latestCommitId);
        payload.add(refUpdate);

        try {
            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(payload),
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                logger.info("Created wiki branch: {}", shortName);
                return shortName;
            }
        } catch (Exception e) {
            logger.error("Failed to create wiki branch: {}", e.getMessage());
        }
        return null;
    }

    /**
     * Delete all files on a branch (inherited from main) to make it clean.
     * Lists all blobs via the items API and pushes a single delete-all commit.
     */
    public void cleanBranch(AzureDevOpsConfig config, String branchName) {
        try {
            // List all items on the branch recursively
            String listUrl = config.getGitApiUrl() + "/items?recursionLevel=full"
                    + "&versionDescriptor.version=" + branchName
                    + "&api-version=" + GIT_API_VERSION;
            JsonNode itemsResponse = executeGet(listUrl, config);

            if (itemsResponse == null || !itemsResponse.has("value")) {
                logger.warn("No items found on branch {} to clean", branchName);
                return;
            }

            // Collect all blob (file) paths
            List<String> filePaths = new java.util.ArrayList<>();
            for (JsonNode item : itemsResponse.get("value")) {
                if ("blob".equals(item.path("gitObjectType").asText())) {
                    filePaths.add(item.get("path").asText());
                }
            }

            if (filePaths.isEmpty()) {
                logger.info("Branch {} has no files to clean", branchName);
                return;
            }

            logger.info("Cleaning branch {}: deleting {} inherited files", branchName, filePaths.size());

            // Push a single commit that deletes all files
            String latestCommitId = getLatestCommitId(config, branchName);
            if (latestCommitId == null) return;

            String pushUrl = config.getGitApiUrl() + "/pushes?api-version=" + GIT_API_VERSION;

            ObjectNode pushPayload = objectMapper.createObjectNode();

            ArrayNode refUpdates = objectMapper.createArrayNode();
            ObjectNode ref = objectMapper.createObjectNode();
            ref.put("name", "refs/heads/" + branchName);
            ref.put("oldObjectId", latestCommitId);
            refUpdates.add(ref);
            pushPayload.set("refUpdates", refUpdates);

            ArrayNode commits = objectMapper.createArrayNode();
            ObjectNode commit = objectMapper.createObjectNode();
            commit.put("comment", "Clean branch: remove inherited files from main");

            ArrayNode changes = objectMapper.createArrayNode();
            for (String path : filePaths) {
                ObjectNode change = objectMapper.createObjectNode();
                change.put("changeType", "delete");
                ObjectNode itemNode = objectMapper.createObjectNode();
                itemNode.put("path", path);
                change.set("item", itemNode);
                changes.add(change);
            }

            commit.set("changes", changes);
            commits.add(commit);
            pushPayload.set("commits", commits);

            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(pushPayload),
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(pushUrl, HttpMethod.POST, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                logger.info("Cleaned branch {}: deleted {} files", branchName, filePaths.size());
            }
        } catch (Exception e) {
            logger.warn("Failed to clean branch {}: {}", branchName, e.getMessage());
            // Non-fatal — branch still works, just has extra files
        }
    }

    /**
     * Get the latest commit ID from a branch.
     */
    public String getLatestCommitId(AzureDevOpsConfig config, String branchName) {
        String url = config.getGitApiUrl() + "/refs?filter=heads/" + branchName + "&api-version=" + GIT_API_VERSION;
        JsonNode response = executeGet(url, config);
        
        if (response != null && response.has("value") && response.get("value").size() > 0) {
            return response.get("value").get(0).get("objectId").asText();
        }
        return null;
    }

    /**
     * List all branches in the repository.
     */
    public List<String> listBranches(AzureDevOpsConfig config) {
        String url = config.getGitApiUrl() + "/refs?filter=heads&api-version=" + GIT_API_VERSION;
        JsonNode response = executeGet(url, config);
        
        List<String> branches = new ArrayList<>();
        if (response != null && response.has("value")) {
            for (JsonNode ref : response.get("value")) {
                String name = ref.get("name").asText();
                branches.add(name.replace("refs/heads/", ""));
            }
        }
        return branches;
    }

    // ==================== Folder/File Operations ====================

    /**
     * Create a folder structure in the repository branch.
     * Uses Git push to create a placeholder file in each folder.
     */
    public void createFolderStructure(AzureDevOpsConfig config, String branchName, 
                                       String basePath, List<String> folders) {
        String latestCommitId = getLatestCommitId(config, branchName);
        if (latestCommitId == null) {
            throw new RuntimeException("Could not get latest commit from branch: " + branchName);
        }

        String url = config.getGitApiUrl() + "/pushes?api-version=" + GIT_API_VERSION;

        try {
            ObjectNode pushPayload = objectMapper.createObjectNode();
            
            // Reference update
            ArrayNode refUpdates = objectMapper.createArrayNode();
            ObjectNode refUpdate = objectMapper.createObjectNode();
            refUpdate.put("name", "refs/heads/" + branchName);
            refUpdate.put("oldObjectId", latestCommitId);
            refUpdates.add(refUpdate);
            pushPayload.set("refUpdates", refUpdates);

            // Commits
            ArrayNode commits = objectMapper.createArrayNode();
            ObjectNode commit = objectMapper.createObjectNode();
            commit.put("comment", "Create folder structure for " + basePath);
            
            ArrayNode changes = objectMapper.createArrayNode();
            for (String folder : folders) {
                ObjectNode change = objectMapper.createObjectNode();
                change.put("changeType", "add");
                
                ObjectNode item = objectMapper.createObjectNode();
                String path = "/" + basePath + "/" + folder + "/.gitkeep";
                item.put("path", path);
                change.set("item", item);
                
                ObjectNode newContent = objectMapper.createObjectNode();
                newContent.put("content", "# Placeholder for folder structure");
                newContent.put("contentType", "rawtext");
                change.set("newContent", newContent);
                
                changes.add(change);
            }
            
            commit.set("changes", changes);
            commits.add(commit);
            pushPayload.set("commits", commits);

            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(pushPayload), 
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
            
            if (response.getStatusCode().is2xxSuccessful()) {
                logger.info("Created folder structure in {}/{}", branchName, basePath);
            }
        } catch (Exception e) {
            logger.error("Failed to create folder structure: {}", e.getMessage());
            throw new RuntimeException("Failed to create folder structure: " + e.getMessage());
        }
    }

    /**
     * Create requirement folder structure for Mode 1 (Per-Story Pipeline).
     * Structure:
     * /{requirementId}/
     *   ├── RequirementAnalysisRefinementAgent/
     *   │   ├── input/
     *   │   └── output/
     *   ├── HLSAgent/
     *   │   ├── input/
     *   │   └── output/
     *   ├── HLDAgent/
     *   │   ├── input/
     *   │   └── output/
     *   └── UserStoryAgent/
     *       ├── input/
     *       └── output/
     */
    public void createMode1RequirementStructure(AzureDevOpsConfig config, String branchName, 
                                                 String requirementId) {
        List<String> folders = new ArrayList<>();
        
        // Shared agents (1-4)
        String[] sharedAgents = {"RequirementAnalysisRefinementAgent", "HLSAgent", "HLDAgent", "UserStoryAgent"};
        for (String agent : sharedAgents) {
            folders.add(agent + "/input");
            folders.add(agent + "/output");
        }
        
        createFolderStructure(config, branchName, requirementId, folders);
        logger.info("Created Mode 1 requirement structure for: {}", requirementId);
    }

    /**
     * Create user story folder structure with 6 per-story agents.
     */
    public void createUserStoryStructure(AzureDevOpsConfig config, String branchName, 
                                          String requirementId, String userStoryId) {
        List<String> folders = new ArrayList<>();
        
        // Per-story agents (5-10) — placed directly under REQ folder (flat, like shared agents)
        String[] perStoryAgents = {"TRReviewAgent", "LLDAgent", "TDDAgent", "CodingAgent", "StaticCodeAnalysisAgent", "SecurityAgent"};
        for (String agent : perStoryAgents) {
            folders.add(agent + "/input");
            folders.add(agent + "/output");
        }
        
        createFolderStructure(config, branchName, requirementId, folders);
        logger.info("Created user story structure for: {}/{}", requirementId, userStoryId);
    }

    /**
     * Create or update a file in the repository.
     */
    public void createOrUpdateFile(AzureDevOpsConfig config, String branchName, 
                                    String filePath, String content, String commitMessage) {
        String latestCommitId = getLatestCommitId(config, branchName);
        if (latestCommitId == null) {
            throw new RuntimeException("Could not get latest commit from branch: " + branchName);
        }

        // Check if file exists
        boolean fileExists = checkFileExists(config, branchName, filePath);

        String url = config.getGitApiUrl() + "/pushes?api-version=" + GIT_API_VERSION;

        try {
            ObjectNode pushPayload = objectMapper.createObjectNode();
            
            ArrayNode refUpdates = objectMapper.createArrayNode();
            ObjectNode refUpdate = objectMapper.createObjectNode();
            refUpdate.put("name", "refs/heads/" + branchName);
            refUpdate.put("oldObjectId", latestCommitId);
            refUpdates.add(refUpdate);
            pushPayload.set("refUpdates", refUpdates);

            ArrayNode commits = objectMapper.createArrayNode();
            ObjectNode commit = objectMapper.createObjectNode();
            commit.put("comment", commitMessage);
            
            ArrayNode changes = objectMapper.createArrayNode();
            ObjectNode change = objectMapper.createObjectNode();
            change.put("changeType", fileExists ? "edit" : "add");
            
            ObjectNode item = objectMapper.createObjectNode();
            item.put("path", filePath.startsWith("/") ? filePath : "/" + filePath);
            change.set("item", item);
            
            ObjectNode newContent = objectMapper.createObjectNode();
            newContent.put("content", content);
            newContent.put("contentType", "rawtext");
            change.set("newContent", newContent);
            
            changes.add(change);
            commit.set("changes", changes);
            commits.add(commit);
            pushPayload.set("commits", commits);

            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(pushPayload), 
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
            
            if (response.getStatusCode().is2xxSuccessful()) {
                logger.info("Created/updated file: {} in branch: {}", filePath, branchName);
            }
        } catch (Exception e) {
            logger.error("Failed to create/update file: {}", e.getMessage());
            throw new RuntimeException("Failed to create/update file: " + e.getMessage());
        }
    }

    /**
     * Push multiple files in a single commit (efficient for wiki + repo file pushes).
     * @param files Map of filePath -> content
     */
    public void pushMultipleFiles(AzureDevOpsConfig config, String branchName,
                                   Map<String, String> files, String commitMessage) {
        String latestCommitId = getLatestCommitId(config, branchName);
        if (latestCommitId == null) {
            throw new RuntimeException("Could not get latest commit from branch: " + branchName);
        }

        String url = config.getGitApiUrl() + "/pushes?api-version=" + GIT_API_VERSION;

        try {
            ObjectNode pushPayload = objectMapper.createObjectNode();

            ArrayNode refUpdates = objectMapper.createArrayNode();
            ObjectNode refUpdate = objectMapper.createObjectNode();
            refUpdate.put("name", "refs/heads/" + branchName);
            refUpdate.put("oldObjectId", latestCommitId);
            refUpdates.add(refUpdate);
            pushPayload.set("refUpdates", refUpdates);

            ArrayNode commits = objectMapper.createArrayNode();
            ObjectNode commit = objectMapper.createObjectNode();
            commit.put("comment", commitMessage);

            ArrayNode changes = objectMapper.createArrayNode();
            for (Map.Entry<String, String> entry : files.entrySet()) {
                String filePath = entry.getKey();
                String content = entry.getValue();
                boolean fileExists = checkFileExists(config, branchName, filePath);

                ObjectNode change = objectMapper.createObjectNode();
                change.put("changeType", fileExists ? "edit" : "add");

                ObjectNode item = objectMapper.createObjectNode();
                item.put("path", filePath.startsWith("/") ? filePath : "/" + filePath);
                change.set("item", item);

                ObjectNode newContent = objectMapper.createObjectNode();
                newContent.put("content", content);
                newContent.put("contentType", "rawtext");
                change.set("newContent", newContent);

                changes.add(change);
            }

            commit.set("changes", changes);
            commits.add(commit);
            pushPayload.set("commits", commits);

            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(pushPayload),
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                logger.info("Pushed {} files to branch: {}", files.size(), branchName);
            }
        } catch (Exception e) {
            logger.error("Failed to push multiple files: {}", e.getMessage());
            throw new RuntimeException("Failed to push multiple files: " + e.getMessage());
        }
    }

    /**
     * Check if a file exists in the repository.
     */
    public boolean checkFileExists(AzureDevOpsConfig config, String branchName, String filePath) {
        try {
            String path = filePath.startsWith("/") ? filePath.substring(1) : filePath;
            String url = config.getGitApiUrl() + "/items?path=" + path + 
                        "&versionDescriptor.version=" + branchName + 
                        "&api-version=" + GIT_API_VERSION;
            JsonNode response = executeGet(url, config);
            return response != null && !response.has("error");
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Read file content from repository.
     */
    public String readFileContent(AzureDevOpsConfig config, String branchName, String filePath) {
        try {
            String path = filePath.startsWith("/") ? filePath.substring(1) : filePath;
            String url = config.getGitApiUrl() + "/items?path=" + path + 
                        "&versionDescriptor.version=" + branchName + 
                        "&includeContent=true" +
                        "&api-version=" + GIT_API_VERSION;
            
            HttpEntity<String> entity = new HttpEntity<>(createHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.GET, entity, String.class);
            
            if (response.getStatusCode().is2xxSuccessful()) {
                return response.getBody();
            }
        } catch (Exception e) {
            logger.error("Failed to read file: {}", e.getMessage());
        }
        return null;
    }

    // ==================== Work Item Operations ====================

    /**
     * Create a User Story work item in Azure DevOps.
     */
    public JsonNode createUserStoryWorkItem(AzureDevOpsConfig config, String title, 
                                             String description, String acceptanceCriteria,
                                             String priority, Map<String, String> additionalFields) {
        return createWorkItem(config, "User Story", title, description, 
                buildUserStoryFields(acceptanceCriteria, priority, additionalFields));
    }

    /**
     * Create a Test Case work item in Azure DevOps.
     */
    public JsonNode createTestCaseWorkItem(AzureDevOpsConfig config, String title, 
                                            String steps, String expectedResults,
                                            Long linkedUserStoryId) {
        Map<String, String> fields = new HashMap<>();
        if (steps != null) fields.put("/fields/Microsoft.VSTS.TCM.Steps", formatTestSteps(steps));
        if (expectedResults != null) fields.put("/fields/Microsoft.VSTS.TCM.ExpectedResult", expectedResults);
        
        JsonNode workItem = createWorkItem(config, "Test Case", title, null, fields);
        
        // Link to parent user story if provided
        if (linkedUserStoryId != null && workItem != null) {
            linkWorkItems(config, workItem.get("id").asLong(), linkedUserStoryId, "Tests");
        }
        
        return workItem;
    }

    /**
     * Create a Task work item in Azure DevOps.
     */
    public JsonNode createTaskWorkItem(AzureDevOpsConfig config, String title, 
                                        String description, Long parentWorkItemId) {
        JsonNode workItem = createWorkItem(config, "Task", title, description, null);
        
        // Link to parent if provided
        if (parentWorkItemId != null && workItem != null) {
            linkWorkItems(config, workItem.get("id").asLong(), parentWorkItemId, "Parent");
        }
        
        return workItem;
    }

    /**
     * Create a Bug work item in Azure DevOps.
     */
    public JsonNode createBugWorkItem(AzureDevOpsConfig config, String title, 
                                       String reproSteps, String severity) {
        Map<String, String> fields = new HashMap<>();
        if (reproSteps != null) fields.put("/fields/Microsoft.VSTS.TCM.ReproSteps", reproSteps);
        if (severity != null) fields.put("/fields/Microsoft.VSTS.Common.Severity", severity);
        
        return createWorkItem(config, "Bug", title, null, fields);
    }

    /**
     * Create a Feature work item in Azure DevOps.
     */
    public JsonNode createFeatureWorkItem(AzureDevOpsConfig config, String title, 
                                           String description, String acceptanceCriteria) {
        Map<String, String> fields = new HashMap<>();
        if (acceptanceCriteria != null) {
            fields.put("/fields/Microsoft.VSTS.Common.AcceptanceCriteria", acceptanceCriteria);
        }
        return createWorkItem(config, "Feature", title, description, fields);
    }

    /**
     * Create an Epic work item in Azure DevOps.
     */
    public JsonNode createEpicWorkItem(AzureDevOpsConfig config, String title, String description) {
        return createWorkItem(config, "Epic", title, description, null);
    }

    /**
     * Generic method to create a work item.
     */
    public JsonNode createWorkItem(AzureDevOpsConfig config, String workItemType, 
                                    String title, String description, 
                                    Map<String, String> additionalFields) {
        String url = config.getWorkItemsApiUrl() + "/$" + workItemType + "?api-version=" + WIT_API_VERSION;

        try {
            ArrayNode patchDocument = objectMapper.createArrayNode();
            
            // Title (required)
            addPatchOperation(patchDocument, "add", "/fields/System.Title", title);
            
            // Description
            if (description != null && !description.isEmpty()) {
                addPatchOperation(patchDocument, "add", "/fields/System.Description", description);
            }
            
            // Additional fields
            if (additionalFields != null) {
                for (Map.Entry<String, String> entry : additionalFields.entrySet()) {
                    addPatchOperation(patchDocument, "add", entry.getKey(), entry.getValue());
                }
            }

            HttpHeaders headers = createJsonHeaders(config);
            headers.setContentType(MediaType.valueOf("application/json-patch+json"));
            
            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(patchDocument), headers);
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
            
            if (response.getStatusCode().is2xxSuccessful()) {
                JsonNode workItem = objectMapper.readTree(response.getBody());
                logger.info("Created {} work item: {} (ID: {})", workItemType, title, 
                        workItem.get("id").asLong());
                return workItem;
            }
        } catch (Exception e) {
            logger.error("Failed to create work item: {}", e.getMessage());
            throw new RuntimeException("Failed to create work item: " + e.getMessage());
        }
        return null;
    }

    /**
     * Update a work item.
     */
    public JsonNode updateWorkItem(AzureDevOpsConfig config, Long workItemId, 
                                    Map<String, String> fieldsToUpdate) {
        String url = config.getWorkItemsApiUrl() + "/" + workItemId + "?api-version=" + WIT_API_VERSION;

        try {
            ArrayNode patchDocument = objectMapper.createArrayNode();
            
            for (Map.Entry<String, String> entry : fieldsToUpdate.entrySet()) {
                addPatchOperation(patchDocument, "replace", entry.getKey(), entry.getValue());
            }

            HttpHeaders headers = createJsonHeaders(config);
            headers.setContentType(MediaType.valueOf("application/json-patch+json"));
            
            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(patchDocument), headers);
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.PATCH, entity, String.class);
            
            if (response.getStatusCode().is2xxSuccessful()) {
                return objectMapper.readTree(response.getBody());
            }
        } catch (Exception e) {
            logger.error("Failed to update work item: {}", e.getMessage());
        }
        return null;
    }

    /**
     * Get a work item by ID.
     */
    public JsonNode getWorkItem(AzureDevOpsConfig config, Long workItemId) {
        String url = config.getWorkItemsApiUrl() + "/" + workItemId + "?api-version=" + WIT_API_VERSION;
        return executeGet(url, config);
    }

    /**
     * Query work items using WIQL.
     */
    public List<JsonNode> queryWorkItems(AzureDevOpsConfig config, String wiqlQuery) {
        String url = config.getApiBaseUrl() + "/wit/wiql?api-version=" + WIT_API_VERSION;
        
        try {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("query", wiqlQuery);
            
            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(payload), 
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
            
            if (response.getStatusCode().is2xxSuccessful()) {
                JsonNode result = objectMapper.readTree(response.getBody());
                List<JsonNode> workItems = new ArrayList<>();
                
                if (result.has("workItems")) {
                    for (JsonNode wi : result.get("workItems")) {
                        Long id = wi.get("id").asLong();
                        workItems.add(getWorkItem(config, id));
                    }
                }
                return workItems;
            }
        } catch (Exception e) {
            logger.error("Failed to query work items: {}", e.getMessage());
        }
        return Collections.emptyList();
    }

    /**
     * Link two work items together.
     */
    public void linkWorkItems(AzureDevOpsConfig config, Long sourceId, Long targetId, String linkType) {
        String url = config.getWorkItemsApiUrl() + "/" + sourceId + "?api-version=" + WIT_API_VERSION;

        try {
            ArrayNode patchDocument = objectMapper.createArrayNode();
            ObjectNode relation = objectMapper.createObjectNode();
            relation.put("op", "add");
            relation.put("path", "/relations/-");
            
            ObjectNode value = objectMapper.createObjectNode();
            String orgUrl = config.getOrganizationUrl();
            value.put("rel", "System.LinkTypes.Hierarchy-Reverse"); // Parent
            if ("Tests".equals(linkType)) {
                value.put("rel", "Microsoft.VSTS.Common.TestedBy-Reverse");
            } else if ("Related".equals(linkType)) {
                value.put("rel", "System.LinkTypes.Related");
            }
            value.put("url", orgUrl + "/" + config.getProjectName() + "/_apis/wit/workItems/" + targetId);
            relation.set("value", value);
            
            patchDocument.add(relation);

            HttpHeaders headers = createJsonHeaders(config);
            headers.setContentType(MediaType.valueOf("application/json-patch+json"));
            
            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(patchDocument), headers);
            restTemplate.exchange(url, HttpMethod.PATCH, entity, String.class);
            
            logger.info("Linked work items {} -> {} with type {}", sourceId, targetId, linkType);
        } catch (Exception e) {
            logger.error("Failed to link work items: {}", e.getMessage());
        }
    }

    // ==================== Pull Request Operations ====================

    // ==================== Wiki Operations ====================

    /**
     * Create or update a wiki page. Returns the wiki page URL.
     * Uses: PUT {org}/{project}/_apis/wiki/wikis/{wikiName}/pages?path={pagePath}
     */
    public String createOrUpdateWikiPage(AzureDevOpsConfig config, String pagePath, String content) {
        String wikiName = config.getWikiName();
        if (wikiName == null || wikiName.isBlank()) {
            logger.warn("Wiki name not configured, skipping wiki page creation for: {}", pagePath);
            return null;
        }

        String encodedPath = pagePath.startsWith("/") ? pagePath : "/" + pagePath;
        String url = config.getWikiApiUrl() + "/" + wikiName + "/pages?path=" + 
                     encodedPath.replace(" ", "%20") + "&api-version=7.1-preview.1";

        try {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("content", content);

            HttpHeaders headers = createJsonHeaders(config);
            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(payload), headers);
            
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.PUT, entity, String.class);
            
            if (response.getStatusCode().is2xxSuccessful()) {
                logger.info("Created/updated wiki page: {}", encodedPath);
                return config.getWikiPageBrowserUrl(encodedPath);
            }
        } catch (Exception e) {
            logger.error("Failed to create/update wiki page {}: {}", pagePath, e.getMessage());
        }
        return null;
    }

    /**
     * Get wiki page content by path.
     */
    public String getWikiPageContent(AzureDevOpsConfig config, String pagePath) {
        String wikiName = config.getWikiName();
        if (wikiName == null) return null;

        String encodedPath = pagePath.startsWith("/") ? pagePath : "/" + pagePath;
        String url = config.getWikiApiUrl() + "/" + wikiName + "/pages?path=" + 
                     encodedPath.replace(" ", "%20") + "&includeContent=true&api-version=7.1-preview.1";

        try {
            JsonNode page = executeGet(url, config);
            if (page != null && page.has("content")) {
                return page.get("content").asText();
            }
        } catch (Exception e) {
            logger.error("Failed to get wiki page {}: {}", pagePath, e.getMessage());
        }
        return null;
    }

    /**
     * Delete a wiki page by path.
     */
    public void deleteWikiPage(AzureDevOpsConfig config, String pagePath) {
        String wikiName = config.getWikiName();
        if (wikiName == null) return;

        String encodedPath = pagePath.startsWith("/") ? pagePath : "/" + pagePath;
        String url = config.getWikiApiUrl() + "/" + wikiName + "/pages?path=" + 
                     encodedPath.replace(" ", "%20") + "&api-version=7.1-preview.1";

        try {
            HttpEntity<String> entity = new HttpEntity<>(createHeaders(config));
            restTemplate.exchange(url, HttpMethod.DELETE, entity, String.class);
            logger.info("Deleted wiki page: {}", encodedPath);
        } catch (Exception e) {
            logger.error("Failed to delete wiki page {}: {}", pagePath, e.getMessage());
        }
    }

    // ==================== Build Pipeline Operations ====================

    /**
     * Queue a build pipeline run.
     */
    public JsonNode triggerBuildPipeline(AzureDevOpsConfig config, String sourceBranch) {
        Integer pipelineId = config.getPipelineDefinitionId();
        if (pipelineId == null) {
            logger.warn("Pipeline definition ID not configured, skipping build trigger");
            return null;
        }

        String url = config.getBuildApiUrl() + "?api-version=7.1-preview.7";

        try {
            ObjectNode payload = objectMapper.createObjectNode();
            ObjectNode definition = objectMapper.createObjectNode();
            definition.put("id", pipelineId);
            payload.set("definition", definition);
            payload.put("sourceBranch", "refs/heads/" + sourceBranch);

            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(payload),
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                JsonNode build = objectMapper.readTree(response.getBody());
                logger.info("Triggered build pipeline {} on branch {}, buildId={}",
                        pipelineId, sourceBranch, build.get("id").asInt());
                return build;
            }
        } catch (Exception e) {
            logger.error("Failed to trigger build pipeline: {}", e.getMessage());
        }
        return null;
    }

    /**
     * Get build status by build ID.
     */
    public JsonNode getBuildStatus(AzureDevOpsConfig config, int buildId) {
        String url = config.getBuildApiUrl() + "/" + buildId + "?api-version=7.1-preview.7";
        return executeGet(url, config);
    }

    // ==================== Release Management Operations ====================

    /**
     * Create a new release from a release definition.
     */
    public JsonNode createRelease(AzureDevOpsConfig config, String description) {
        Integer releaseDefId = config.getReleaseDefinitionId();
        if (releaseDefId == null) {
            logger.warn("Release definition ID not configured, skipping release creation");
            return null;
        }

        String url = config.getReleaseApiUrl() + "?api-version=7.1-preview.8";

        try {
            ObjectNode payload = objectMapper.createObjectNode();
            ObjectNode releaseDefNode = objectMapper.createObjectNode();
            releaseDefNode.put("id", releaseDefId);
            payload.set("definitionId", releaseDefNode);
            payload.put("description", description);
            payload.put("isDraft", false);

            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(payload),
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                JsonNode release = objectMapper.readTree(response.getBody());
                logger.info("Created release from definition {}, releaseId={}",
                        releaseDefId, release.get("id").asInt());
                return release;
            }
        } catch (Exception e) {
            logger.error("Failed to create release: {}", e.getMessage());
        }
        return null;
    }

    // ==================== Board Automation Operations ====================

    /**
     * Move a work item to a different board column by updating its state.
     */
    public JsonNode moveWorkItemToState(AzureDevOpsConfig config, Long workItemId, String newState) {
        Map<String, String> fields = new HashMap<>();
        fields.put("/fields/System.State", newState);
        return updateWorkItem(config, workItemId, fields);
    }

    /**
     * Assign a work item to a team member.
     */
    public JsonNode assignWorkItemToUser(AzureDevOpsConfig config, Long workItemId, String email) {
        Map<String, String> fields = new HashMap<>();
        fields.put("/fields/System.AssignedTo", email);
        return updateWorkItem(config, workItemId, fields);
    }

    // ==================== Artifact Storage Operations ====================

    /**
     * Get artifact feed info. Lists packages in a feed.
     */
    public JsonNode getArtifactFeedPackages(AzureDevOpsConfig config) {
        String feedName = config.getArtifactsFeedName();
        if (feedName == null || feedName.isBlank()) {
            logger.warn("Artifacts feed name not configured");
            return null;
        }

        String url = config.getArtifactsFeedApiUrl() + "/" + feedName + 
                     "/packages?api-version=7.1-preview.1";
        return executeGet(url, config);
    }

    // ==================== Service Hooks / Webhook Operations ====================

    /**
     * Create a service hook subscription for webhook notifications.
     */
    public JsonNode createServiceHookSubscription(AzureDevOpsConfig config, 
                                                    String eventType, String callbackUrl) {
        String url = config.getServiceHooksApiUrl() + "?api-version=7.1-preview.1";

        try {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("publisherId", "tfs");
            payload.put("eventType", eventType);
            payload.put("resourceVersion", "1.0");
            
            ObjectNode publisherInputs = objectMapper.createObjectNode();
            publisherInputs.put("projectId", config.getProjectName());
            payload.set("publisherInputs", publisherInputs);
            
            ObjectNode consumerInputs = objectMapper.createObjectNode();
            consumerInputs.put("url", callbackUrl);
            payload.set("consumerInputs", consumerInputs);
            
            payload.put("consumerId", "webHooks");
            payload.put("consumerActionId", "httpRequest");

            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(payload),
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                JsonNode hook = objectMapper.readTree(response.getBody());
                logger.info("Created service hook for event: {}, id={}", eventType, hook.get("id").asText());
                return hook;
            }
        } catch (Exception e) {
            logger.error("Failed to create service hook: {}", e.getMessage());
        }
        return null;
    }

    // ==================== Dashboard Operations ====================

    /**
     * List dashboards for the project.
     */
    public JsonNode listDashboards(AzureDevOpsConfig config, String teamName) {
        String url = config.getApiBaseUrl() + "/" + teamName + "/dashboard/dashboards?api-version=7.1-preview.3";
        return executeGet(url, config);
    }

    // ==================== Code Review Operations ====================

    /**
     * Add a reviewer to a pull request.
     */
    public void addPullRequestReviewer(AzureDevOpsConfig config, int prId, String reviewerId) {
        String url = config.getGitApiUrl() + "/pullrequests/" + prId + 
                     "/reviewers/" + reviewerId + "?api-version=" + GIT_API_VERSION;

        try {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("vote", 0); // 0 = no vote, waiting for review

            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(payload),
                    createJsonHeaders(config));
            restTemplate.exchange(url, HttpMethod.PUT, entity, String.class);
            logger.info("Added reviewer {} to PR {}", reviewerId, prId);
        } catch (Exception e) {
            logger.error("Failed to add reviewer to PR {}: {}", prId, e.getMessage());
        }
    }

    /**
     * Add a comment thread to a pull request.
     */
    public JsonNode addPullRequestComment(AzureDevOpsConfig config, int prId, String comment) {
        String url = config.getGitApiUrl() + "/pullrequests/" + prId + 
                     "/threads?api-version=" + GIT_API_VERSION;

        try {
            ObjectNode payload = objectMapper.createObjectNode();
            ArrayNode comments = objectMapper.createArrayNode();
            ObjectNode commentNode = objectMapper.createObjectNode();
            commentNode.put("parentCommentId", 0);
            commentNode.put("content", comment);
            commentNode.put("commentType", 1); // 1 = text
            comments.add(commentNode);
            payload.set("comments", comments);
            payload.put("status", 1); // 1 = active

            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(payload),
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                return objectMapper.readTree(response.getBody());
            }
        } catch (Exception e) {
            logger.error("Failed to add comment to PR {}: {}", prId, e.getMessage());
        }
        return null;
    }

    // ==================== Metrics & Analytics Operations ====================

    /**
     * Get build metrics (recent builds summary).
     */
    public JsonNode getBuildMetrics(AzureDevOpsConfig config, String branchName) {
        String url = config.getBuildApiUrl() + "?branchName=refs/heads/" + branchName + 
                     "&$top=20&api-version=7.1-preview.7";
        return executeGet(url, config);
    }

    /**
     * Get work item count by query (e.g., for dashboards/metrics).
     */
    public int getWorkItemCount(AzureDevOpsConfig config, String workItemType, String state) {
        String wiql = "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '" +
                config.getProjectName() + "' AND [System.WorkItemType] = '" + workItemType +
                "' AND [System.State] = '" + state + "'";
        List<JsonNode> items = queryWorkItems(config, wiql);
        return items.size();
    }

    /**
     * Create a Pull Request.
     */
    public JsonNode createPullRequest(AzureDevOpsConfig config, String sourceBranch, 
                                       String targetBranch, String title, String description) {
        String url = config.getGitApiUrl() + "/pullrequests?api-version=" + GIT_API_VERSION;

        try {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("sourceRefName", "refs/heads/" + sourceBranch);
            payload.put("targetRefName", "refs/heads/" + targetBranch);
            payload.put("title", title);
            payload.put("description", description);

            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(payload), 
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
            
            if (response.getStatusCode().is2xxSuccessful()) {
                JsonNode pr = objectMapper.readTree(response.getBody());
                logger.info("Created Pull Request: {} (ID: {})", title, pr.get("pullRequestId").asLong());
                return pr;
            }
        } catch (Exception e) {
            logger.error("Failed to create pull request: {}", e.getMessage());
        }
        return null;
    }

    /**
     * List Pull Requests for a repository.
     */
    public List<JsonNode> listPullRequests(AzureDevOpsConfig config, String status) {
        String url = config.getGitApiUrl() + "/pullrequests?searchCriteria.status=" + status + 
                    "&api-version=" + GIT_API_VERSION;
        JsonNode response = executeGet(url, config);
        
        List<JsonNode> pullRequests = new ArrayList<>();
        if (response != null && response.has("value")) {
            for (JsonNode pr : response.get("value")) {
                pullRequests.add(pr);
            }
        }
        return pullRequests;
    }

    // ==================== Helper Methods ====================

    private HttpHeaders createHeaders(AzureDevOpsConfig config) {
        HttpHeaders headers = new HttpHeaders();
        String auth = ":" + config.getPersonalAccessToken();
        String encodedAuth = Base64.getEncoder().encodeToString(auth.getBytes(StandardCharsets.UTF_8));
        headers.set("Authorization", "Basic " + encodedAuth);
        return headers;
    }

    private HttpHeaders createJsonHeaders(AzureDevOpsConfig config) {
        HttpHeaders headers = createHeaders(config);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    private JsonNode executeGet(String url, AzureDevOpsConfig config) {
        try {
            HttpEntity<String> entity = new HttpEntity<>(createHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.GET, entity, String.class);
            
            if (response.getStatusCode().is2xxSuccessful()) {
                return objectMapper.readTree(response.getBody());
            }
        } catch (Exception e) {
            logger.error("GET request failed for {}: {}", url, e.getMessage());
        }
        return null;
    }

    private void addPatchOperation(ArrayNode patchDocument, String op, String path, String value) {
        ObjectNode operation = objectMapper.createObjectNode();
        operation.put("op", op);
        operation.put("path", path);
        operation.put("value", value);
        patchDocument.add(operation);
    }

    private Map<String, String> buildUserStoryFields(String acceptanceCriteria, String priority, 
                                                      Map<String, String> additional) {
        Map<String, String> fields = new HashMap<>();
        if (acceptanceCriteria != null) {
            fields.put("/fields/Microsoft.VSTS.Common.AcceptanceCriteria", acceptanceCriteria);
        }
        if (priority != null) {
            fields.put("/fields/Microsoft.VSTS.Common.Priority", priority);
        }
        if (additional != null) {
            fields.putAll(additional);
        }
        return fields;
    }

    private String formatTestSteps(String steps) {
        // Format steps for Azure DevOps Test Case format
        StringBuilder formatted = new StringBuilder("<steps id=\"0\">");
        String[] stepLines = steps.split("\n");
        int stepNum = 1;
        for (String step : stepLines) {
            if (!step.trim().isEmpty()) {
                formatted.append("<step id=\"").append(stepNum++).append("\" type=\"ActionStep\">");
                formatted.append("<parameterizedString isformatted=\"true\">").append(escapeXml(step.trim())).append("</parameterizedString>");
                formatted.append("<parameterizedString isformatted=\"true\"></parameterizedString>");
                formatted.append("<description/></step>");
            }
        }
        formatted.append("</steps>");
        return formatted.toString();
    }

    private String escapeXml(String text) {
        return text.replace("&", "&amp;")
                   .replace("<", "&lt;")
                   .replace(">", "&gt;")
                   .replace("\"", "&quot;")
                   .replace("'", "&apos;");
    }

    private String sanitizeBranchName(String name) {
        return name.replaceAll("[^A-Za-z0-9_\\-]", "_").toLowerCase();
    }

    // ==================== Wiki Publishing Operations ====================

    /**
     * Publish a folder in the code repository as a code wiki.
     * This makes .md files in the mapped path appear under the Azure DevOps Wiki section.
     *
     * API: POST {org}/{project}/_apis/wiki/wikis?api-version=7.0
     *
     * @param config Azure DevOps configuration
     * @param wikiName Name for the published wiki (e.g., "Hospital DMS-Wiki")
     * @param branchName Branch containing the wiki files
     * @param mappedPath Folder path in the repo to map as wiki root (e.g., "/Hospital DMS-Wiki")
     * @return The created wiki's JSON response, or null if creation failed
     */
    public JsonNode publishCodeAsWiki(AzureDevOpsConfig config, String wikiName,
                                       String branchName, String mappedPath) {
        // First, get repository info to obtain repoId and projectId
        JsonNode repoInfo = getRepositoryInfo(config);
        if (repoInfo == null) {
            logger.error("Cannot publish wiki - failed to get repository info");
            return null;
        }

        String repoId = repoInfo.get("id").asText();
        String projectId = repoInfo.has("project") 
                ? repoInfo.get("project").get("id").asText() 
                : config.getProjectName();

        String url = config.getWikiApiUrl() + "?api-version=" + API_VERSION;

        try {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("name", wikiName);
            payload.put("type", "codeWiki");
            payload.put("projectId", projectId);
            payload.put("repositoryId", repoId);
            payload.put("mappedPath", mappedPath.startsWith("/") ? mappedPath : "/" + mappedPath);

            ObjectNode version = objectMapper.createObjectNode();
            version.put("version", branchName);
            payload.set("version", version);

            String payloadStr = objectMapper.writeValueAsString(payload);
            logger.info("Publishing code wiki: url={}, payload={}", url, payloadStr);

            HttpEntity<String> entity = new HttpEntity<>(payloadStr,
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                JsonNode wiki = objectMapper.readTree(response.getBody());
                logger.info("Published code as wiki: {} (ID: {}) on branch: {}, mappedPath: {}",
                        wikiName, wiki.has("id") ? wiki.get("id").asText() : "unknown",
                        branchName, mappedPath);
                return wiki;
            } else {
                logger.error("Wiki publish non-2xx status: {} body: {}", response.getStatusCode(), response.getBody());
            }
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            String statusCode = String.valueOf(e.getStatusCode().value());
            String responseBody = e.getResponseBodyAsString();
            if (statusCode.equals("409")) {
                logger.info("Wiki '{}' already exists (409 Conflict) - skipping creation", wikiName);
                return objectMapper.createObjectNode().put("name", wikiName).put("status", "already_exists");
            }
            logger.error("Wiki publish HTTP error {} for '{}': {}", statusCode, wikiName, responseBody);
        } catch (Exception e) {
            logger.error("Failed to publish code as wiki '{}': {}", wikiName, e.getMessage(), e);
        }
        return null;
    }

    /**
     * Create a project wiki (not code wiki). This creates a wiki directly in the Wiki tab
     * without needing any repo files.
     * @return The wiki name if created or already exists, null on failure
     */
    public String createProjectWiki(AzureDevOpsConfig config, String wikiName) {
        // Check if already exists
        if (wikiExists(config, wikiName)) {
            logger.info("Project wiki '{}' already exists", wikiName);
            return wikiName;
        }

        JsonNode repoInfo = getRepositoryInfo(config);
        String projectId = (repoInfo != null && repoInfo.has("project"))
                ? repoInfo.get("project").get("id").asText()
                : config.getProjectName();

        String url = config.getWikiApiUrl() + "?api-version=" + API_VERSION;

        try {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("name", wikiName);
            payload.put("type", "projectWiki");
            payload.put("projectId", projectId);

            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(payload),
                    createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                logger.info("Created project wiki: {}", wikiName);
                return wikiName;
            }
        } catch (Exception e) {
            String message = e.getMessage();
            if (message != null && message.contains("409")) {
                logger.info("Wiki '{}' already exists (409)", wikiName);
                return wikiName;
            }
            // Project wiki might not be supported, fallback to code wiki approach
            logger.warn("Failed to create project wiki '{}': {}. Will try code wiki fallback.", wikiName, message);
        }
        return null;
    }

    /**
     * List all wikis in the project.
     */
    public List<JsonNode> listWikis(AzureDevOpsConfig config) {
        String url = config.getWikiApiUrl() + "?api-version=" + API_VERSION;
        JsonNode response = executeGet(url, config);

        List<JsonNode> wikis = new ArrayList<>();
        if (response != null && response.has("value")) {
            for (JsonNode wiki : response.get("value")) {
                wikis.add(wiki);
            }
        }
        return wikis;
    }

    /**
     * Check if a wiki with the given name already exists.
     */
    public boolean wikiExists(AzureDevOpsConfig config, String wikiName) {
        List<JsonNode> wikis = listWikis(config);
        for (JsonNode wiki : wikis) {
            if (wiki.has("name") && wiki.get("name").asText().equals(wikiName)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Find or create a project wiki. Azure DevOps only allows ONE project wiki per project.
     * If a project wiki already exists (with any name), reuse it.
     * If none exists, create one with the preferred name.
     * @return The wiki name (found or created), or null on failure.
     */
    public String findOrCreateProjectWiki(AzureDevOpsConfig config, String preferredName) {
        // First check if a project wiki already exists
        List<JsonNode> wikis = listWikis(config);
        for (JsonNode wiki : wikis) {
            if (wiki.has("type") && "projectWiki".equals(wiki.get("type").asText())) {
                String existingName = wiki.get("name").asText();
                logger.info("Found existing project wiki: '{}' (reusing for this workspace)", existingName);
                return existingName;
            }
        }

        // No project wiki exists, create one
        return createProjectWiki(config, preferredName);
    }

    /**
     * Delete a code wiki by name. Needed because Azure DevOps only allows one code wiki
     * per mappedPath ("/") per repository. Old wikis must be removed before creating new ones.
     */
    public boolean deleteWiki(AzureDevOpsConfig config, String wikiName) {
        String url = config.getWikiApiUrl() + "/" + wikiName + "?api-version=" + API_VERSION;
        try {
            HttpEntity<String> entity = new HttpEntity<>(createJsonHeaders(config));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.DELETE, entity, String.class);
            if (response.getStatusCode().is2xxSuccessful()) {
                logger.info("Deleted wiki: {}", wikiName);
                return true;
            }
        } catch (Exception e) {
            logger.warn("Failed to delete wiki '{}': {}", wikiName, e.getMessage());
        }
        return false;
    }

    /**
     * Delete all existing code wikis that use mappedPath "/" in this repository.
     * This is required because Azure DevOps only allows one code wiki per mappedPath per repo.
     */
    public void deleteConflictingCodeWikis(AzureDevOpsConfig config) {
        List<JsonNode> wikis = listWikis(config);
        for (JsonNode wiki : wikis) {
            if (wiki.has("type") && "codeWiki".equals(wiki.get("type").asText())) {
                String name = wiki.get("name").asText();
                String mappedPath = wiki.has("mappedPath") ? wiki.get("mappedPath").asText() : "/";
                if ("/".equals(mappedPath)) {
                    logger.info("Deleting conflicting code wiki '{}' (mappedPath=/)", name);
                    deleteWiki(config, name);
                }
            }
        }
    }
}
