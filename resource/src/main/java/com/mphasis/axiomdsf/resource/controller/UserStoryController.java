package com.mphasis.axiomdsf.resource.controller;

import com.mphasis.axiomdsf.business.service.FileStorageService;
import com.mphasis.axiomdsf.persistence.entity.UserStory;
import com.mphasis.axiomdsf.persistence.entity.Workspace;
import com.mphasis.axiomdsf.persistence.port.out.UserStoryPersistencePort;
import com.mphasis.axiomdsf.persistence.port.out.WorkspacePersistencePort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/userstory")
public class UserStoryController {

    private static final Logger logger = LoggerFactory.getLogger(UserStoryController.class);

    @Autowired
    private UserStoryPersistencePort userStoryPort;

    @Autowired
    private WorkspacePersistencePort workspacePort;

    @Autowired
    private FileStorageService fileStorageService;

    @PostMapping("/save")
    public ResponseEntity<?> saveUserStory(@RequestBody Map<String, Object> request) {
        logger.info("POST /userstory/save - storyId={}", request.get("storyId"));

        try {
            UserStory userStory = new UserStory();
            userStory.setStoryId(request.get("storyId") != null ? String.valueOf(request.get("storyId")) : null);
            userStory.setTitle(request.get("title") != null ? String.valueOf(request.get("title")) : null);
            userStory.setPriority(request.get("priority") != null ? String.valueOf(request.get("priority")) : null);
            userStory.setFilePath(request.get("filePath") != null ? String.valueOf(request.get("filePath")) : null);
            userStory.setUserStoryText(request.get("userStoryText") != null ? String.valueOf(request.get("userStoryText")) : null);

            if (request.get("workspaceId") != null) {
                userStory.setWorkspaceId(((Number) request.get("workspaceId")).longValue());
            }
            if (request.get("requirementId") != null) {
                userStory.setRequirementId(((Number) request.get("requirementId")).longValue());
            }

            userStory.setCreatedAt(LocalDateTime.now());

            UserStory saved = userStoryPort.save(userStory);
            return ResponseEntity.ok(saved);
        } catch (ClassCastException | NullPointerException e) {
            logger.warn("Invalid request body for /userstory/save: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid request: " + e.getMessage()));
        }
    }

    @GetMapping("/workspace/{workspaceId}")
    public ResponseEntity<List<UserStory>> getByWorkspace(@PathVariable Long workspaceId) {
        logger.info("GET /userstory/workspace/{}", workspaceId);
        return ResponseEntity.ok(userStoryPort.findByWorkspaceId(workspaceId));
    }

    @GetMapping("/requirement/{requirementId}")
    public ResponseEntity<List<UserStory>> getByRequirement(@PathVariable Long requirementId) {
        logger.info("GET /userstory/requirement/{}", requirementId);
        return ResponseEntity.ok(userStoryPort.findByRequirementId(requirementId));
    }

    /**
     * Re-process existing UserStoryAgent output files on disk and save to the database.
     * Useful when the agent wrote individual story files but they weren't parsed into the DB.
     */
    @PostMapping("/reprocess/{workspaceId}/{requirementId}")
    public ResponseEntity<Map<String, Object>> reprocessUserStories(
            @PathVariable Long workspaceId, @PathVariable Long requirementId) {
        logger.info("POST /userstory/reprocess/{}/{}", workspaceId, requirementId);

        Workspace workspace = workspacePort.findById(workspaceId)
                .orElse(null);
        if (workspace == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Workspace not found: " + workspaceId));
        }

        // Parse stories from individual files in the directory
        List<Map<String, String>> stories = fileStorageService.parseUserStoriesFromDirectory(workspace);

        if (stories.isEmpty()) {
            return ResponseEntity.ok(Map.of(
                    "message", "No user story files found on disk for workspace " + workspaceId,
                    "count", 0
            ));
        }

        // Clear existing user stories for this workspace/requirement
        userStoryPort.deleteByWorkspaceIdAndRequirementId(workspaceId, requirementId);

        // Save each story to the database
        for (Map<String, String> storyData : stories) {
            UserStory userStory = new UserStory();
            userStory.setStoryId(storyData.get("storyId"));
            userStory.setTitle(storyData.get("title"));
            userStory.setPriority(storyData.get("priority"));
            userStory.setWorkspaceId(workspaceId);
            userStory.setRequirementId(requirementId);
            userStory.setUserStoryText(storyData.get("content"));
            userStory.setFilePath(storyData.get("filePath"));
            userStory.setCreatedAt(LocalDateTime.now());
            userStoryPort.save(userStory);
        }

        logger.info("Reprocessed {} user stories for workspace={}, requirement={}", stories.size(), workspaceId, requirementId);
        return ResponseEntity.ok(Map.of(
                "message", "Successfully reprocessed user stories",
                "count", stories.size(),
                "workspaceId", workspaceId,
                "requirementId", requirementId
        ));
    }
}
