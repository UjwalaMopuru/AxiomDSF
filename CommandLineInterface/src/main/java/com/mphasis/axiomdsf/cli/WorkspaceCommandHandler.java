package com.mphasis.axiomdsf.cli;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.*;

/**
 * Handles workspace-related CLI commands using local file operations.
 */
public class WorkspaceCommandHandler {

    private static final Logger logger = LoggerFactory.getLogger(WorkspaceCommandHandler.class);

    private final WorkspaceManager workspaceManager;
    private final LocalPersistenceHelper persistence;

    public WorkspaceCommandHandler(WorkspaceManager workspaceManager, LocalPersistenceHelper persistence) {
        this.workspaceManager = workspaceManager;
        this.persistence = persistence;
    }

    public void handle(CommandParser cmd) {
        switch (cmd.getAction()) {
            case "create":
                handleCreate(cmd);
                break;
            case "list":
                handleList();
                break;
            case "get":
                handleGetByName(cmd);
                break;
            default:
                System.out.println("Unknown workspace command: " + cmd.getAction());
                System.out.println("Available: create | list | get");
                break;
        }
    }

    private void handleCreate(CommandParser cmd) {
        String name = cmd.requireArg("name");
        String description = cmd.hasArg("desc") ? cmd.getArg("desc") : "";
        String techStack = cmd.hasArg("tech") ? cmd.getArg("tech") : "";

        logger.info("Creating workspace: name={}, desc={}, tech={}", name, description, techStack);

        try {
            PipelineState state = workspaceManager.createWorkspace(name, description, techStack);

            Map<String, String> info = new LinkedHashMap<>();
            info.put("Workspace ID", String.valueOf(state.getWorkspaceId()));
            info.put("Name", state.getWorkspaceName());
            info.put("Description", state.getDescription());
            info.put("Tech Stack", state.getTechStack());
            ConsolePrinter.printSuccess("WORKSPACE CREATED SUCCESSFULLY", info);

            // Show suggested next commands
            int wsId = state.getWorkspaceId();
            System.out.println("  Suggested commands:");
            System.out.println("    workflow start --workspace " + wsId + " --text \"<your requirement>\"");
            System.out.println("    workflow start --workspace " + wsId + " --file <path-to-requirement.txt>");
            System.out.println("    workspace list");
            System.out.println();

            // Sync to DB via REST API (best-effort)
            persistence.syncWorkspaceToApi(name, description, techStack);
            persistence.logPipelineAction(state.getWorkspaceId(), "Workspace created: " + name);
        } catch (IOException e) {
            logger.error("Failed to create workspace", e);
            ConsolePrinter.printError("Failed to create workspace: " + e.getMessage());
        }
    }

    private void handleList() {
        try {
            List<PipelineState> workspaces = workspaceManager.listWorkspaces();
            if (workspaces.isEmpty()) {
                System.out.println("\nNo workspaces found. Use 'workspace create' to create one.");
                return;
            }
            System.out.println();
            System.out.println("  ╔══════════════════════════════════════════════════════╗");
            System.out.printf("  ║  WORKSPACES (%d found)%-32s║%n", workspaces.size(), "");
            System.out.println("  ╠══════════════════════════════════════════════════════╣");
            for (PipelineState ws : workspaces) {
                String line = String.format("  #%-3d %-25s [%s] reqs: %d",
                    ws.getWorkspaceId(), ws.getWorkspaceName(),
                    ws.getTechStack(), ws.getRequirements().size());
                System.out.printf("  ║  %-52s║%n", line);
            }
            System.out.println("  ╚══════════════════════════════════════════════════════╝");
        } catch (IOException e) {
            ConsolePrinter.printError("Failed to list workspaces: " + e.getMessage());
        }
    }

    private void handleGetByName(CommandParser cmd) {
        String name = cmd.requireArg("name");

        try {
            PipelineState state = workspaceManager.findWorkspaceByName(name);
            if (state == null) {
                ConsolePrinter.printError("Workspace not found with name: " + name);
                return;
            }

            System.out.println();
            System.out.println("  ╔══════════════════════════════════════════════════════╗");
            System.out.println("  ║  Workspace Details                                   ║");
            System.out.println("  ╠══════════════════════════════════════════════════════╣");
            System.out.printf("  ║  ID          : %-37s║%n", state.getWorkspaceId());
            System.out.printf("  ║  Name        : %-37s║%n", state.getWorkspaceName());
            System.out.printf("  ║  Description : %-37s║%n", state.getDescription() != null ? state.getDescription() : "");
            System.out.printf("  ║  Tech Stack  : %-37s║%n", state.getTechStack() != null ? state.getTechStack() : "");
            System.out.printf("  ║  Created At  : %-37s║%n", state.getCreatedAt() != null ? state.getCreatedAt() : "");
            System.out.printf("  ║  Requirements: %-37s║%n", state.getRequirements().size());
            System.out.println("  ╚══════════════════════════════════════════════════════╝");

            // Show requirement details if any
            if (!state.getRequirements().isEmpty()) {
                System.out.println();
                System.out.println("  Requirements:");
                for (PipelineState.RequirementState req : state.getRequirements()) {
                    AgentRegistry.AgentDef agent = AgentRegistry.getBySequence(req.getCurrentAgentSequence());
                    String agentName = agent != null ? agent.getName() : "?";
                    System.out.printf("    #%-3d  agent=%-30s  state=%s%n",
                            req.getRequirementId(), agentName, req.getState());
                }
            }
        } catch (IOException e) {
            ConsolePrinter.printError("Failed to get workspace: " + e.getMessage());
        }
    }
}
