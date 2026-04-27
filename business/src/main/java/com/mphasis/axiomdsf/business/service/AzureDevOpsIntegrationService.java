package com.mphasis.axiomdsf.business.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.mphasis.axiomdsf.business.dto.AzureDevOpsConfig;
import com.mphasis.axiomdsf.persistence.entity.UserStory;
import com.mphasis.axiomdsf.persistence.entity.Workspace;
import com.mphasis.axiomdsf.persistence.port.out.UserStoryPersistencePort;
import com.mphasis.axiomdsf.persistence.port.out.WorkspacePersistencePort;

/**
 * Service to integrate agent workflow operations with Azure DevOps.
 * Handles automatic creation of:
 * - Folder structures for requirements and user stories
 * - Work items (User Stories, Test Cases) after agent completion
 * - File storage in repository
 * - Wiki pages for all agent input/output with URL tracking
 * - Build pipeline triggers, Release management, Board automation
 * - Service Hooks, Dashboard, Code Review, Metrics
 */
@Service
public class AzureDevOpsIntegrationService {

    private static final Logger logger = LoggerFactory.getLogger(AzureDevOpsIntegrationService.class);

    private final AzureDevOpsMcpService azureDevOpsService;
    private final WorkspacePersistencePort workspacePort;
    private final UserStoryPersistencePort userStoryPort;

    public AzureDevOpsIntegrationService(AzureDevOpsMcpService azureDevOpsService,
                                          WorkspacePersistencePort workspacePort,
                                          UserStoryPersistencePort userStoryPort) {
        this.azureDevOpsService = azureDevOpsService;
        this.workspacePort = workspacePort;
        this.userStoryPort = userStoryPort;
    }

    /**
     * Publish wikis immediately after a workspace branch is created.
     * Ensures the project wiki exists and creates the home page.
     * Called from WorkspaceService.createWorkspace() right after branch creation.
     */
    public void publishWikiForWorkspace(Long workspaceId) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) {
            return;
        }

        AzureDevOpsConfig config = buildConfig(workspace);
        try {
            String wikiName = ensureProjectWiki(workspace, config);
            if (wikiName != null) {
                config.setWikiName(wikiName);
                createWikiHomePage(workspaceId);
                logger.info("Wiki published immediately after branch creation for workspace {}", workspaceId);
            } else {
                logger.error("Failed to publish wiki after branch creation for workspace {}", workspaceId);
            }
        } catch (Exception e) {
            logger.error("Failed to publish wiki after branch creation for workspace {}: {}", workspaceId, e.getMessage());
        }
    }

    /**
     * Called when a new requirement is added (workflow start).
     * 1. Cleans the repo branch (removes any previous files)
     * 2. Creates the REQ-{id} folder structure on the repo branch
     * 3. Creates a wiki branch ({name}_req_{id}_wiki), cleans it, publishes as code wiki
     * 4. Creates wiki home page
     */
    public void onRequirementCreated(Long workspaceId, Long requirementId) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) {
            return;
        }

        AzureDevOpsConfig config = buildConfig(workspace);
        String repoBranch = workspace.getAzureDevOpsBranch();

        // 1. Clean the repo branch (empty it before adding new agent I/O)
        try {
            if (repoBranch != null && !"main".equals(repoBranch)) {
                azureDevOpsService.cleanBranch(config, repoBranch);
                logger.info("Cleaned repo branch: {}", repoBranch);
            }
        } catch (Exception e) {
            logger.warn("Failed to clean repo branch '{}': {} (continuing)", repoBranch, e.getMessage());
        }

        // 2. Create requirement folder structure on repo branch
        try {
            String reqFolder = "REQ-" + requirementId;
            azureDevOpsService.createMode1RequirementStructure(config, repoBranch, reqFolder);
            logger.info("Created Azure DevOps folder structure for requirement: {}", requirementId);
        } catch (Exception e) {
            logger.warn("Failed to create folder structure for requirement {}: {} (continuing)", requirementId, e.getMessage());
        }

        // 3. Ensure project wiki exists and create home page
        try {
            String wikiName = ensureProjectWiki(workspace, config);
            if (wikiName != null) {
                config.setWikiName(wikiName);
                createWikiHomePage(workspaceId);
                logger.info("Project wiki ensured for requirement {}: {}", requirementId, wikiName);
            } else {
                logger.error("Failed to ensure project wiki for requirement {} — wiki publishing will not work", requirementId);
            }
        } catch (Exception e) {
            logger.error("Failed to ensure project wiki for requirement {}: {}", requirementId, e.getMessage());
        }
    }

    /**
     * Save agent input to repo branch AND wiki branch.
     * Repo branch: raw agent I/O file. Wiki branch: formatted .md for wiki rendering.
     * Returns the wiki page URL for UI consumption.
     */
    public String saveAgentInput(Long workspaceId, Long requirementId, String agentName, 
                                String content, Long userStoryId) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) {
            return null;
        }

        AzureDevOpsConfig config = buildConfig(workspace);
        String branch = resolveRepoBranch(workspace, agentName, userStoryId);

        // Ensure project wiki is available
        String wikiName = workspace.getWikiName();
        if (wikiName == null) {
            wikiName = ensureProjectWiki(workspace, config);
        }
        config.setWikiName(wikiName);

        if (branch == null) {
            logger.warn("Skipping repo file write for {} input - no branch configured", agentName);
            return null;
        }

        String repoUrl = null;
        String wikiUrl = null;

        try {
            // Push repo file to workspace repo branch
            String repoFilePath = buildAgentFilePath(requirementId, agentName, "Input", userStoryId);
            azureDevOpsService.createOrUpdateFile(config, branch, repoFilePath, content,
                    "Save " + agentName + " input");
            logger.info("Saved agent input to repo: {}", repoFilePath);
            repoUrl = config.getFileBrowseUrl(repoFilePath, branch);

            // Write wiki page via project wiki API (no git branch needed)
            if (config.getWikiName() != null) {
                String wikiFilePath = buildWikiFilePath(workspace.getProjectName(), agentName, "Input", userStoryId, requirementId);
                // Remove .md extension — wiki API uses logical page paths
                if (wikiFilePath.endsWith(".md")) {
                    wikiFilePath = wikiFilePath.substring(0, wikiFilePath.length() - 3);
                }
                String wikiContent = "# " + getAgentDisplayName(agentName) + " - Input\n\n" + content;
                wikiContent = convertMermaidForWiki(wikiContent);
                wikiUrl = azureDevOpsService.createOrUpdateWikiPage(config, wikiFilePath, wikiContent);
                if (wikiUrl != null) {
                    logger.info("Saved agent input to project wiki: {}", wikiFilePath);
                }
            }
        } catch (Exception e) {
            logger.error("Failed to save agent input for {}: {}", agentName, e.getMessage());
        }

        // Prefer wiki URL, fall back to repo browse URL
        return wikiUrl != null ? wikiUrl : repoUrl;
    }

    /**
     * Save agent output to repo branch AND wiki branch.
     * Repo branch: raw agent I/O file. Wiki branch: formatted .md for wiki rendering.
     * Returns the wiki page URL for UI consumption.
     */
    public String saveAgentOutput(Long workspaceId, Long requirementId, String agentName, 
                                 String content, Long userStoryId) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) {
            return null;
        }

        AzureDevOpsConfig config = buildConfig(workspace);
        String branch = resolveRepoBranch(workspace, agentName, userStoryId);

        // Ensure project wiki is available
        String wikiName = workspace.getWikiName();
        if (wikiName == null) {
            wikiName = ensureProjectWiki(workspace, config);
        }
        config.setWikiName(wikiName);

        if (branch == null) {
            logger.warn("Skipping repo file write for {} output - no branch configured", agentName);
            return null;
        }

        String repoUrl = null;
        String wikiUrl = null;

        try {
            // Push repo file to workspace repo branch
            String repoFilePath = buildAgentFilePath(requirementId, agentName, "Output", userStoryId);
            azureDevOpsService.createOrUpdateFile(config, branch, repoFilePath, content,
                    "Save " + agentName + " output");
            logger.info("Saved agent output to repo: {}", repoFilePath);
            repoUrl = config.getFileBrowseUrl(repoFilePath, branch);

            // Write wiki page via project wiki API (no git branch needed)
            if (config.getWikiName() != null) {
                String wikiFilePath = buildWikiFilePath(workspace.getProjectName(), agentName, "Output", userStoryId, requirementId);
                // Remove .md extension — wiki API uses logical page paths
                if (wikiFilePath.endsWith(".md")) {
                    wikiFilePath = wikiFilePath.substring(0, wikiFilePath.length() - 3);
                }
                String wikiContent = "# " + getAgentDisplayName(agentName) + " - Output\n\n" + content;
                wikiContent = convertMermaidForWiki(wikiContent);
                wikiUrl = azureDevOpsService.createOrUpdateWikiPage(config, wikiFilePath, wikiContent);
                if (wikiUrl != null) {
                    logger.info("Saved agent output to project wiki: {}", wikiFilePath);
                }
            }
        } catch (Exception e) {
            logger.error("Failed to save agent output for {}: {}", agentName, e.getMessage());
        }

        // Prefer wiki URL, fall back to repo browse URL
        return wikiUrl != null ? wikiUrl : repoUrl;
    }

    /**
     * Create User Story work items in Azure DevOps when UserStoryAgent is approved.
     * Works for both per-story and full-sequence pipeline modes.
     * Also creates a wiki page summarizing all created work items.
     */
    public void onUserStoryAgentApproved(Long workspaceId, Long requirementId) {
        onUserStoryAgentApproved(workspaceId, requirementId, null);
    }

    /**
     * Create User Story work items in Azure DevOps when UserStoryAgent is approved.
     * @param pipelineMode explicit pipeline mode from the workflow; if null, falls back to workspace setting
     */
    public void onUserStoryAgentApproved(Long workspaceId, Long requirementId, String pipelineMode) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) {
            return;
        }
        String effectiveMode = (pipelineMode != null) ? pipelineMode : workspace.getPipelineMode();

        try {
            AzureDevOpsConfig config = buildConfig(workspace);
            
            // Get all user stories for this requirement from DB
            List<UserStory> stories = userStoryPort.findByRequirementId(requirementId);
            
            if (stories.isEmpty()) {
                logger.warn("No user stories found in DB for requirement {}. " +
                        "Work items will not be created.", requirementId);
                return;
            }

            // Count how many already have work items (idempotency)
            long alreadyCreated = stories.stream().filter(s -> s.getAzureWorkItemId() != null).count();
            long toCreate = stories.size() - alreadyCreated;
            logger.info("Creating Azure DevOps User Story work items for requirement {}: " +
                    "{} total, {} already created, {} to create",
                    requirementId, stories.size(), alreadyCreated, toCreate);

            StringBuilder wikiSummary = new StringBuilder();
            wikiSummary.append("# User Story Work Items - REQ-").append(requirementId).append("\n\n");
            wikiSummary.append("| # | Story ID | Title | Priority | Work Item ID | Status |\n");
            wikiSummary.append("|---|----------|-------|----------|-------------|--------|\n");

            int count = 0;
            int created = 0;
            int failed = 0;
            for (UserStory story : stories) {
                count++;

                // Skip stories that already have an Azure DevOps work item (idempotent)
                if (story.getAzureWorkItemId() != null) {
                    logger.debug("Skipping {} — already has work item ID {}", 
                            story.getStoryId(), story.getAzureWorkItemId());
                    wikiSummary.append("| ").append(count)
                            .append(" | ").append(story.getStoryId() != null ? story.getStoryId() : "-")
                            .append(" | ").append(story.getTitle() != null ? story.getTitle() : "-")
                            .append(" | ").append(story.getPriority() != null ? story.getPriority() : "-")
                            .append(" | ").append(story.getAzureWorkItemId())
                            .append(" | Already Created |\n");
                    created++;
                    continue;
                }

                // Retry up to 2 times for transient API failures
                Long workItemId = null;
                Exception lastError = null;
                for (int attempt = 1; attempt <= 2; attempt++) {
                    try {
                        String title = story.getTitle();
                        if (title == null || title.isBlank()) {
                            title = story.getStoryId() != null ? story.getStoryId() : "User Story " + count;
                        }

                        String description = story.getUserStoryText();
                        String acceptanceCriteria = extractAcceptanceCriteria(description);
                        String priority = story.getPriority();
                        String azurePriority = mapPriority(priority);

                        JsonNode workItem = azureDevOpsService.createUserStoryWorkItem(
                            config, title, description, acceptanceCriteria, azurePriority, null);
                        
                        if (workItem != null && workItem.has("id")) {
                            workItemId = workItem.get("id").asLong();
                        }
                        lastError = null;
                        break; // success
                    } catch (Exception e) {
                        lastError = e;
                        if (attempt < 2) {
                            logger.warn("Attempt {} failed for story {}, retrying: {}", 
                                    attempt, story.getStoryId(), e.getMessage());
                            try { Thread.sleep(1000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
                        }
                    }
                }

                if (workItemId != null) {
                    // Save work item ID back to UserStory for idempotency
                    story.setAzureWorkItemId(workItemId);
                    userStoryPort.save(story);
                    created++;
                    logger.info("Created Azure DevOps User Story work item: {} for {} - '{}'", 
                            workItemId, story.getStoryId(), story.getTitle());
                    wikiSummary.append("| ").append(count)
                            .append(" | ").append(story.getStoryId() != null ? story.getStoryId() : "-")
                            .append(" | ").append(story.getTitle() != null ? story.getTitle() : "-")
                            .append(" | ").append(story.getPriority() != null ? story.getPriority() : "-")
                            .append(" | ").append(workItemId)
                            .append(" | Created |\n");
                } else {
                    failed++;
                    logger.error("Failed to create work item for story {} after retries: {}", 
                            story.getStoryId(), lastError != null ? lastError.getMessage() : "null response");
                    wikiSummary.append("| ").append(count)
                            .append(" | ").append(story.getStoryId() != null ? story.getStoryId() : "-")
                            .append(" | ").append(story.getTitle() != null ? story.getTitle() : "-")
                            .append(" | ").append(story.getPriority() != null ? story.getPriority() : "-")
                            .append(" | - | Failed |\n");
                }

                // Small delay between API calls to avoid rate limiting
                try { Thread.sleep(300); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            }

            wikiSummary.append("\n---\n*").append(count).append(" work items processed (")
                    .append(created).append(" created, ").append(failed).append(" failed)*\n");
            logger.info("User Story work items summary: {} total, {} created, {} failed for requirement {}",
                    count, created, failed, requirementId);

            // Create a separate branch for each user story (ONLY in per-story mode)
            // In full-sequence mode, all agents use the single workspace branch — no per-story branches
            String workspaceBranch = workspace.getAzureDevOpsBranch();
            if (workspaceBranch != null && "per-story".equals(effectiveMode)) {
                String reqFolder = "REQ-" + requirementId;
                for (UserStory story : stories) {
                    if (story.getAzureBranchName() != null) {
                        logger.debug("Skipping branch creation for {} — already has branch {}", 
                                story.getStoryId(), story.getAzureBranchName());
                        continue;
                    }
                    try {
                        String storyId = story.getStoryId() != null ? story.getStoryId() : "US-" + story.getId();
                        String branchName = azureDevOpsService.createUserStoryBranch(config, workspaceBranch, storyId);
                        if (branchName != null) {
                            story.setAzureBranchName(branchName);
                            userStoryPort.save(story);
                            logger.info("Created branch '{}' for user story {}", branchName, storyId);

                            // Create skeleton folder structure on the per-story branch
                            try {
                                azureDevOpsService.createUserStoryStructure(
                                        config, branchName, reqFolder, storyId);
                                logger.info("Created skeleton folder structure on branch '{}' for {}", branchName, storyId);
                            } catch (Exception folderEx) {
                                logger.warn("Failed to create skeleton folders on branch '{}' for {}: {}" ,
                                        branchName, storyId, folderEx.getMessage());
                            }

                            // Publish wiki page for this user story branch immediately
                            try {
                                String wikiNameForStory = workspace.getWikiName();
                                if (wikiNameForStory == null) {
                                    wikiNameForStory = ensureProjectWiki(workspace, config);
                                }
                                if (wikiNameForStory != null) {
                                    config.setWikiName(wikiNameForStory);
                                    String storyWikiPath = "/" + reqFolder + "/" + storyId;
                                    String storyWikiContent = "# " + storyId + " - " + (story.getTitle() != null ? story.getTitle() : storyId) + "\n\n"
                                            + "Branch: `" + branchName + "`\n\n"
                                            + "Agent outputs for this user story will appear below as the pipeline progresses.\n";
                                    azureDevOpsService.createOrUpdateWikiPage(config, storyWikiPath, storyWikiContent);
                                    logger.info("Published wiki page for user story {} on branch '{}'", storyId, branchName);
                                }
                            } catch (Exception wikiEx) {
                                logger.warn("Failed to publish wiki for story {} after branch creation: {}",
                                        storyId, wikiEx.getMessage());
                            }
                        }
                    } catch (Exception e) {
                        logger.warn("Failed to create branch for story {}: {}", story.getStoryId(), e.getMessage());
                    }
                    try { Thread.sleep(300); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
                }
            }

            // Push work items summary to project wiki
            String wikiNameForWorkItems = workspace.getWikiName();
            if (wikiNameForWorkItems == null) {
                wikiNameForWorkItems = ensureProjectWiki(workspace, config);
            }
            config.setWikiName(wikiNameForWorkItems);
            if (config.getWikiName() != null) {
                try {
                    azureDevOpsService.createOrUpdateWikiPage(config, "/04-User-Story/Work-Items",
                            wikiSummary.toString());
                    logger.info("Saved user story work items summary to project wiki");
                } catch (Exception e) {
                    logger.warn("Failed to save work items summary to project wiki: {}", e.getMessage());
                }
            }
        } catch (Exception e) {
            logger.error("Failed to create User Story work items in Azure DevOps: {}", e.getMessage(), e);
        }
    }

    /**
     * Map user story priority (P0/P1/P2) to Azure DevOps priority (1-4).
     */
    private String mapPriority(String priority) {
        if (priority == null) return "3";
        return switch (priority.toUpperCase()) {
            case "P0" -> "1";  // Critical
            case "P1" -> "2";  // High
            case "P2" -> "3";  // Medium
            default -> "3";
        };
    }

    /**
     * Create Test Case work items in Azure DevOps when TDDAgent is completed.
     * Called after workflow approval for TDDAgent.
     */
    public void onTddAgentApproved(Long workspaceId, Long requirementId, Long userStoryId, 
                                    String tddOutput) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) {
            return;
        }

        try {
            AzureDevOpsConfig config = buildConfig(workspace);
            
            // Parse test cases from TDD output
            List<TestCaseInfo> testCases = parseTestCasesFromTddOutput(tddOutput);
            
            for (TestCaseInfo testCase : testCases) {
                // Create Test Case work item in Azure DevOps
                JsonNode workItem = azureDevOpsService.createTestCaseWorkItem(
                    config,
                    testCase.title(),
                    testCase.steps(),
                    testCase.expectedResults(),
                    null // Could link to user story work item if we store the ID
                );
                
                if (workItem != null) {
                    Long workItemId = workItem.get("id").asLong();
                    logger.info("Created Azure DevOps Test Case work item: {} for user story {}", 
                            workItemId, userStoryId);
                }
            }
        } catch (Exception e) {
            logger.error("Failed to create Test Case work items in Azure DevOps: {}", e.getMessage());
        }
    }

    /**
     * Create Bug work items when SecurityAgent or SCAAgent finds issues.
     */
    public void onSecurityIssueFound(Long workspaceId, String title, String description, 
                                      String severity) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) {
            return;
        }

        try {
            AzureDevOpsConfig config = buildConfig(workspace);
            
            JsonNode workItem = azureDevOpsService.createBugWorkItem(
                config,
                title,
                description,
                severity
            );
            
            if (workItem != null) {
                logger.info("Created Azure DevOps Bug work item for security issue: {}", 
                        workItem.get("id").asLong());
            }
        } catch (Exception e) {
            logger.error("Failed to create Bug work item in Azure DevOps: {}", e.getMessage());
        }
    }

    /**
     * Parse CodingAgent output for ### FILE: patterns. Push each file as actual code to the repo
     * (under a /code folder on the workspace branch) AND push a wiki summary page listing all files.
     * Works for both per-story mode (userStoryId != null) and full-sequence mode (userStoryId == null).
     */
    public void saveCodeFilesToRepoAndWiki(Long workspaceId, Long requirementId,
                                            Long userStoryId, String codingOutput) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled() || codingOutput == null || codingOutput.isBlank()) {
            return;
        }

        try {
            AzureDevOpsConfig config = buildConfig(workspace);
            String branch = resolveRepoBranch(workspace, "CodingAgent", userStoryId);
            if (branch == null) return;

            // Parse ## FILE: or ### FILE: patterns from CodingAgent output
            // Pattern: ##(#)? FILE: path/to/file.ext\n```lang\ncontent\n```
            Pattern filePattern = Pattern.compile(
                    "#{2,3} FILE:\\s*(.+?)\\s*\\n```(?:\\w*)\\s*\\n([\\s\\S]*?)```");
            Matcher matcher = filePattern.matcher(codingOutput);

            Map<String, String> repoFiles = new LinkedHashMap<>();
            List<String[]> fileSummary = new java.util.ArrayList<>();

            while (matcher.find()) {
                String filePath = matcher.group(1).trim();
                String fileContent = matcher.group(2);

                // Clean up the file path (remove leading slashes/dots)
                if (filePath.startsWith("./")) filePath = filePath.substring(2);
                if (filePath.startsWith("/")) filePath = filePath.substring(1);

                // Store code files at the branch root so users can pull and run directly
                String fullRepoPath = "/" + filePath;
                repoFiles.put(fullRepoPath, fileContent);

                // Track for summary
                String lang = filePath.contains(".") 
                        ? filePath.substring(filePath.lastIndexOf('.') + 1) : "";
                int lineCount = fileContent.split("\n").length;
                fileSummary.add(new String[]{filePath, lang, String.valueOf(lineCount)});
            }

            if (repoFiles.isEmpty()) {
                logger.warn("No FILE: patterns found in CodingAgent output for REQ-{}, US-{}",
                        requirementId, userStoryId);
                return;
            }

            // Push all code files to repo in a single commit
            String commitMsg = userStoryId != null
                    ? "Generated code for REQ-" + requirementId + " / US-" + userStoryId
                    : "Generated code for REQ-" + requirementId;
            azureDevOpsService.pushMultipleFiles(config, branch, repoFiles, commitMsg);
            logger.info("Pushed {} code files to branch '{}'", repoFiles.size(), branch);

            // Build wiki summary page for the code files
            StringBuilder wikiPage = new StringBuilder();
            wikiPage.append("# Generated Code Files\n\n");
            if (userStoryId != null) {
                wikiPage.append("**Requirement**: REQ-").append(requirementId)
                        .append("  |  **User Story**: US-").append(userStoryId).append("\n\n");
            } else {
                wikiPage.append("**Requirement**: REQ-").append(requirementId).append("\n\n");
            }
            wikiPage.append("## Files\n\n");
            wikiPage.append("| # | File | Language | Lines |\n");
            wikiPage.append("|---|------|----------|-------|\n");
            int idx = 0;
            for (String[] f : fileSummary) {
                idx++;
                wikiPage.append("| ").append(idx)
                        .append(" | `").append(f[0]).append("`")
                        .append(" | ").append(f[1])
                        .append(" | ").append(f[2]).append(" |\n");
            }
            wikiPage.append("\n---\n");
            wikiPage.append("## Source Code\n\n");

            // Also include full code in wiki for easy browsing
            for (String[] f : fileSummary) {
                String fp = f[0];
                String lang = f[1];
                String code = repoFiles.get("/" + fp);
                wikiPage.append("### ").append(fp).append("\n\n");
                wikiPage.append("```").append(lang).append("\n");
                wikiPage.append(code);
                if (!code.endsWith("\n")) wikiPage.append("\n");
                wikiPage.append("```\n\n");
            }

            // Write wiki summary page via project wiki API (no git branch needed)
            String wikiName = workspace.getWikiName();
            if (wikiName == null) {
                wikiName = ensureProjectWiki(workspace, config);
            }
            config.setWikiName(wikiName);
            if (config.getWikiName() != null) {
                String wikiPath;
                if (userStoryId != null) {
                    wikiPath = "/08-Code-Generation/US-" + userStoryId + "/Code-Files";
                } else {
                    wikiPath = "/08-Code-Generation/Code-Files";
                }
                try {
                    azureDevOpsService.createOrUpdateWikiPage(config, wikiPath, wikiPage.toString());
                    logger.info("Saved code files wiki summary to project wiki: {}", wikiPath);
                } catch (Exception wikiEx) {
                    logger.warn("Failed to save wiki summary for code files: {}", wikiEx.getMessage());
                }
            }

        } catch (Exception e) {
            logger.error("Failed to save code files to repo and wiki: {}", e.getMessage());
        }
    }

    /**
     * Create a Pull Request after all agents complete for a requirement.
     */
    public void createPullRequestForRequirement(Long workspaceId, Long requirementId) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) {
            return;
        }

        try {
            AzureDevOpsConfig config = buildConfig(workspace);
            
            String title = "REQ-" + requirementId + ": " + workspace.getProjectName();
            String description = "Pull request for requirement " + requirementId + 
                                " from workspace " + workspace.getProjectName();
            
            JsonNode pr = azureDevOpsService.createPullRequest(
                config,
                workspace.getAzureDevOpsBranch(),
                "main",
                title,
                description
            );
            
            if (pr != null) {
                logger.info("Created Pull Request: {}", pr.get("pullRequestId").asLong());
            }
        } catch (Exception e) {
            logger.error("Failed to create Pull Request: {}", e.getMessage());
        }
    }

    // ==================== Helper Methods ====================

    /**
     * Convert standard markdown mermaid fenced code blocks to Azure DevOps Wiki syntax.
     * Azure DevOps Wiki uses ::: mermaid ... ::: instead of ```mermaid ... ```
     */
    private String convertMermaidForWiki(String content) {
        if (content == null) return null;
        // Match fenced mermaid blocks and ensure Azure DevOps block format:
        // ::: mermaid
        // <diagram>
        // :::
        return content.replaceAll("(?is)```\\s*mermaid\\s*\\r?\\n(.*?)```", "::: mermaid\n$1\n:::\n");
    }

    /**
     * Ensure a project wiki is available for this workspace.
     * Creates the project wiki on first use — no git repo or branch required.
     * @return The wiki name, or null on failure
     */
    private String ensureProjectWiki(Workspace workspace, AzureDevOpsConfig config) {
        try {
            String preferredWikiName = workspace.getProjectName() + "-Wiki";
            String wikiName = azureDevOpsService.findOrCreateProjectWiki(config, preferredWikiName);
            if (wikiName == null) {
                logger.warn("Project wiki creation returned null for workspace {}", workspace.getId());
                return null;
            }
            workspace.setWikiName(wikiName);
            workspacePort.save(workspace);
            logger.info("Project wiki ensured for workspace {}: {}", workspace.getId(), wikiName);
            return wikiName;
        } catch (Exception e) {
            logger.warn("Failed to ensure project wiki for workspace {}: {}",
                    workspace.getId(), e.getMessage());
            return null;
        }
    }

    /**
     * Resolve the correct repo branch for saving agent I/O.
     * Per-story mode with a per-story agent: use the user story's dedicated branch.
     * Full-sequence mode or shared agents: use the workspace branch.
     */
    private String resolveRepoBranch(Workspace workspace, String agentName, Long userStoryId) {
        boolean isPerStoryAgent = List.of("TRReviewAgent", "TDDAgent", "LLDAgent",
                "CodingAgent", "StaticCodeAnalysisAgent", "SecurityAgent").contains(agentName);

        if (isPerStoryAgent && userStoryId != null && "per-story".equals(workspace.getPipelineMode())) {
            UserStory story = userStoryPort.findById(userStoryId).orElse(null);
            if (story != null && story.getAzureBranchName() != null) {
                logger.debug("Using per-story branch '{}' for agent {} / US-{}",
                        story.getAzureBranchName(), agentName, userStoryId);
                return story.getAzureBranchName();
            }
        }
        return workspace.getAzureDevOpsBranch();
    }

    private Workspace getWorkspace(Long workspaceId) {
        return workspacePort.findById(workspaceId)
                .orElseThrow(() -> new RuntimeException("Workspace not found: " + workspaceId));
    }

    private AzureDevOpsConfig buildConfig(Workspace workspace) {
        AzureDevOpsConfig config = new AzureDevOpsConfig();
        config.setOrganizationUrl(workspace.getAzureDevOpsOrganizationUrl());
        config.setProjectName(workspace.getAzureDevOpsProject());
        config.setRepositoryName(workspace.getAzureDevOpsRepository());
        String pat = workspace.getAzureDevOpsPersonalAccessToken();
        config.setPersonalAccessToken(pat != null ? pat.trim() : pat);
        config.setWikiName(workspace.getWikiName());
        return config;
    }

    private String buildAgentFilePath(Long requirementId, String agentName, 
                                       String fileType, Long userStoryId) {
        StringBuilder path = new StringBuilder();
        path.append("REQ-").append(requirementId).append("/");
        
        // Check if it's a per-story agent
        boolean isPerStoryAgent = List.of("TRReviewAgent", "TDDAgent", "LLDAgent", 
                "CodingAgent", "StaticCodeAnalysisAgent", "SecurityAgent").contains(agentName);
        
        // Per-story agents go directly under REQ-{id}/ (flat, same level as shared agents)
        // since each user story has its own dedicated branch
        
        path.append(agentName).append("/");
        path.append(fileType.toLowerCase()).append("/");
        path.append(agentName).append("_").append(fileType).append(".md");
        
        return path.toString();
    }

    /**
     * Build wiki page path for agent input/output.
     * Pattern: /AgentOutputs/REQ-{id}/{agentName}/{Input|Output}
     * Per-story: /AgentOutputs/REQ-{id}/US-{usId}/{agentName}/{Input|Output}
     */
    /**
     * Build wiki file path for agent I/O on the wiki branch.
     * Format includes requirement ID and user story ID for proper identification.
     * Shared agents: /{NN}-{AgentDisplayName}/REQ-{reqId}_{AgentName}_{Type}.md
     * Per-story agents: /{NN}-{AgentDisplayName}/REQ-{reqId}_US-{storyId}_{AgentName}_{Type}.md
     */
    private String buildWikiFilePath(String workspaceName, String agentName, String fileType, 
                                      Long userStoryId, Long requirementId) {
        String displayName = getAgentDisplayName(agentName);
        int order = getAgentOrder(agentName);
        String paddedOrder = String.format("%02d", order);
        String folderName = paddedOrder + "-" + displayName.replace(" ", "-");
        String reqTag = requirementId != null ? "REQ-" + requirementId + "_" : "";
        
        boolean isPerStoryAgent = List.of("TRReviewAgent", "TDDAgent", "LLDAgent", 
                "CodingAgent", "StaticCodeAnalysisAgent", "SecurityAgent").contains(agentName);
        
        if (isPerStoryAgent && userStoryId != null) {
            return "/" + folderName + "/" + reqTag + "US-" + userStoryId + "_" + agentName + "_" + fileType + ".md";
        }
        return "/" + folderName + "/" + reqTag + agentName + "_" + fileType + ".md";
    }

    /**
     * Get a human-readable display name for an agent.
     */
    private String getAgentDisplayName(String agentName) {
        return switch (agentName) {
            case "RequirementAnalysisRefinementAgent" -> "Requirement Analysis";
            case "HLSAgent" -> "High Level Solution";
            case "HLDAgent" -> "High Level Design";
            case "UserStoryAgent" -> "User Story";
            case "TRReviewAgent" -> "Test Review Agent";
            case "TDDAgent" -> "TDD Test Cases";
            case "LLDAgent" -> "Low Level Design";
            case "CodingAgent" -> "Code Generation";
            case "StaticCodeAnalysisAgent" -> "Static Code Analysis";
            case "SecurityAgent" -> "Security Analysis";
            default -> agentName;
        };
    }

    /**
     * Get the execution order number for an agent (for wiki sidebar ordering).
     */
    private int getAgentOrder(String agentName) {
        return switch (agentName) {
            case "RequirementAnalysisRefinementAgent" -> 1;
            case "HLSAgent" -> 2;
            case "HLDAgent" -> 3;
            case "UserStoryAgent" -> 4;
            case "TRReviewAgent" -> 5;
            case "LLDAgent" -> 6;
            case "TDDAgent" -> 7;
            case "CodingAgent" -> 8;
            case "StaticCodeAnalysisAgent" -> 9;
            case "SecurityAgent" -> 10;
            default -> 99;
        };
    }

    /**
     * Create the initial wiki when a workspace is created.
     * Pushes Home.md and .order to the wiki branch, then publishes it as a code wiki.
     * Each workspace gets its own wiki entry in Azure DevOps Wiki tab.
     */
    public void createWikiHomePage(Long workspaceId) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) return;

        AzureDevOpsConfig config = buildConfig(workspace);

        // Ensure project wiki exists
        String wikiName = workspace.getWikiName();
        if (wikiName == null) {
            wikiName = ensureProjectWiki(workspace, config);
        }
        config.setWikiName(wikiName);

        if (wikiName == null) {
            logger.error("Failed to ensure project wiki for workspace {}, skipping home page creation", workspaceId);
            return;
        }

        try {
            // Build Home page content
            StringBuilder home = new StringBuilder();
            home.append("# ").append(workspace.getProjectName()).append(" - Agent Outputs Wiki\n\n");
            home.append("This wiki contains all agent input/output from the AxiomDSF pipeline.\n\n");
            home.append("## Agents\n\n");
            home.append("| # | Agent | Input | Output |\n");
            home.append("|---|-------|-------|--------|\n");

            String[][] agents = {
                {"1", "RequirementAnalysisRefinementAgent", "Requirement Analysis"},
                {"2", "HLSAgent", "High Level Solution"},
                {"3", "HLDAgent", "High Level Design"},
                {"4", "UserStoryAgent", "User Story"},
                {"5", "TRReviewAgent", "Test Review Agent"},
                {"6", "LLDAgent", "Low Level Design"},
                {"7", "TDDAgent", "TDD Test Cases"},
                {"8", "CodingAgent", "Code Generation"},
                {"9", "StaticCodeAnalysisAgent", "Static Code Analysis"},
                {"10", "SecurityAgent", "Security Analysis"}
            };

            for (String[] agent : agents) {
                String num = agent[0];
                String displayName = agent[2];
                String paddedNum = String.format("%02d", Integer.parseInt(num));
                String folderName = paddedNum + "-" + displayName.replace(" ", "-");
                home.append("| ").append(num).append(" | ").append(displayName)
                    .append(" | [Input](").append(folderName).append("/Input) | ")
                    .append("[Output](").append(folderName).append("/Output) |\n");
            }

            home.append("\n---\n*Generated by AxiomDSF AI Pipeline*\n");

            // Write home page directly to project wiki via API
            azureDevOpsService.createOrUpdateWikiPage(config, "/Home", home.toString());
            logger.info("Created/updated wiki home page for workspace {}", workspaceId);

        } catch (Exception e) {
            logger.error("Failed to create wiki home page: {}", e.getMessage());
        }
    }

    // ==================== Additional MCP Integration Methods ====================

    /**
     * Trigger a build pipeline for the workspace branch.
     * Called after CodingAgent completes to validate generated code.
     */
    public JsonNode triggerBuildPipeline(Long workspaceId) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) return null;

        try {
            AzureDevOpsConfig config = buildConfig(workspace);
            return azureDevOpsService.triggerBuildPipeline(config, workspace.getAzureDevOpsBranch());
        } catch (Exception e) {
            logger.error("Failed to trigger build pipeline: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Create a release after all agents complete for a requirement.
     */
    public JsonNode createRelease(Long workspaceId, Long requirementId) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) return null;

        try {
            AzureDevOpsConfig config = buildConfig(workspace);
            String description = "Release for REQ-" + requirementId + " in " + workspace.getProjectName();
            return azureDevOpsService.createRelease(config, description);
        } catch (Exception e) {
            logger.error("Failed to create release: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Move work item to a specific board state (Board Automation).
     */
    public void moveWorkItemToState(Long workspaceId, Long workItemId, String state) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) return;

        try {
            AzureDevOpsConfig config = buildConfig(workspace);
            azureDevOpsService.moveWorkItemToState(config, workItemId, state);
        } catch (Exception e) {
            logger.error("Failed to move work item to state: {}", e.getMessage());
        }
    }

    /**
     * Create a service hook subscription for webhook notifications.
     */
    public JsonNode setupWebhook(Long workspaceId, String eventType, String callbackUrl) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) return null;

        try {
            AzureDevOpsConfig config = buildConfig(workspace);
            return azureDevOpsService.createServiceHookSubscription(config, eventType, callbackUrl);
        } catch (Exception e) {
            logger.error("Failed to setup webhook: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Get build metrics for the workspace branch.
     */
    public JsonNode getBuildMetrics(Long workspaceId) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) return null;

        try {
            AzureDevOpsConfig config = buildConfig(workspace);
            return azureDevOpsService.getBuildMetrics(config, workspace.getAzureDevOpsBranch());
        } catch (Exception e) {
            logger.error("Failed to get build metrics: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Add a PR comment with agent analysis summary (Code Review).
     */
    public void addCodeReviewComment(Long workspaceId, int prId, String agentName, String summary) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) return;

        try {
            AzureDevOpsConfig config = buildConfig(workspace);
            String comment = "## " + agentName + " Analysis\n\n" + summary;
            azureDevOpsService.addPullRequestComment(config, prId, comment);
        } catch (Exception e) {
            logger.error("Failed to add code review comment: {}", e.getMessage());
        }
    }

    /**
     * Get artifact feed packages.
     */
    public JsonNode getArtifactPackages(Long workspaceId) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) return null;

        try {
            AzureDevOpsConfig config = buildConfig(workspace);
            return azureDevOpsService.getArtifactFeedPackages(config);
        } catch (Exception e) {
            logger.error("Failed to get artifact packages: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Create a summary page for a requirement showing all agent outputs.
     * Stored as a markdown file in the repository.
     */
    public String createRequirementSummaryWikiPage(Long workspaceId, Long requirementId) {
        Workspace workspace = getWorkspace(workspaceId);
        if (!workspace.isAzureDevOpsEnabled()) return null;
        String branch = workspace.getAzureDevOpsBranch();
        if (branch == null) return null;

        try {
            AzureDevOpsConfig config = buildConfig(workspace);
            StringBuilder content = new StringBuilder();
            content.append("# Requirement REQ-").append(requirementId).append(" Summary\n\n");
            content.append("| Agent | Input | Output |\n");
            content.append("|-------|-------|--------|\n");

            String[] allAgents = {"RequirementAnalysisRefinementAgent", "HLSAgent", "HLDAgent", "UserStoryAgent",
                    "TRReviewAgent", "LLDAgent", "TDDAgent", "CodingAgent", 
                    "StaticCodeAnalysisAgent", "SecurityAgent"};

            for (String agent : allAgents) {
                String inputPath = buildAgentFilePath(requirementId, agent, "Input", null);
                String outputPath = buildAgentFilePath(requirementId, agent, "Output", null);
                content.append("| ").append(agent).append(" | ")
                       .append("[Input](").append(config.getFileBrowseUrl(inputPath, branch)).append(") | ")
                       .append("[Output](").append(config.getFileBrowseUrl(outputPath, branch)).append(") |\n");
            }

            String summaryPath = "REQ-" + requirementId + "/Summary.md";
            String wikiSummaryPath = "/" + workspace.getProjectName() + "-Wiki/Summary.md";

            Map<String, String> files = new java.util.LinkedHashMap<>();
            files.put(summaryPath, content.toString());
            files.put(wikiSummaryPath, content.toString());

            azureDevOpsService.pushMultipleFiles(config, branch, files,
                    "Create requirement summary for REQ-" + requirementId + " (repo + wiki)");
            return config.getCodeWikiPageUrl(wikiSummaryPath, branch);
        } catch (Exception e) {
            logger.error("Failed to create summary page: {}", e.getMessage());
            return null;
        }
    }

    private String extractAcceptanceCriteria(String userStoryText) {
        if (userStoryText == null) return null;
        
        // Try to extract acceptance criteria section
        int criteriaStart = userStoryText.toLowerCase().indexOf("acceptance criteria");
        if (criteriaStart == -1) {
            criteriaStart = userStoryText.toLowerCase().indexOf("acceptance:");
        }
        
        if (criteriaStart != -1) {
            return userStoryText.substring(criteriaStart);
        }
        
        return null;
    }

    private List<TestCaseInfo> parseTestCasesFromTddOutput(String tddOutput) {
        // Parse TDD output to extract individual test cases
        // This is a simplified implementation - real parsing would be more sophisticated
        java.util.List<TestCaseInfo> testCases = new java.util.ArrayList<>();
        
        if (tddOutput == null) return testCases;
        
        String[] sections = tddOutput.split("(?=##\\s*Test Case|(?=\\*\\*Test Case))");
        
        for (String section : sections) {
            if (section.toLowerCase().contains("test case")) {
                String title = extractTestTitle(section);
                String steps = extractTestSteps(section);
                String expected = extractExpectedResults(section);
                
                if (title != null) {
                    testCases.add(new TestCaseInfo(title, steps, expected));
                }
            }
        }
        
        return testCases;
    }

    private String extractTestTitle(String section) {
        // Extract title from ## Test Case: Title or **Test Case: Title**
        int colonIndex = section.indexOf(":");
        int newlineIndex = section.indexOf("\n");
        
        if (colonIndex != -1 && newlineIndex != -1 && colonIndex < newlineIndex) {
            return section.substring(colonIndex + 1, newlineIndex).trim()
                    .replaceAll("\\*+", "").trim();
        }
        
        return "Test Case";
    }

    private String extractTestSteps(String section) {
        int stepsStart = section.toLowerCase().indexOf("steps:");
        if (stepsStart == -1) stepsStart = section.toLowerCase().indexOf("given");
        
        int expectedStart = section.toLowerCase().indexOf("expected");
        
        if (stepsStart != -1) {
            int endIndex = expectedStart != -1 ? expectedStart : section.length();
            return section.substring(stepsStart, endIndex).trim();
        }
        
        return section;
    }

    private String extractExpectedResults(String section) {
        int expectedStart = section.toLowerCase().indexOf("expected");
        if (expectedStart != -1) {
            return section.substring(expectedStart).trim();
        }
        return null;
    }

    private record TestCaseInfo(String title, String steps, String expectedResults) {}
}
