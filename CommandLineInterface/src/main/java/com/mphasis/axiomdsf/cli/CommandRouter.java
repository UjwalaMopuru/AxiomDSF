package com.mphasis.axiomdsf.cli;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Routes parsed CLI commands to the appropriate handler logic.
 * Acts as the central dispatcher for all CLI operations.
 */
public class CommandRouter {

    private static final Logger logger = LoggerFactory.getLogger(CommandRouter.class);

    private final WorkspaceCommandHandler workspaceHandler;
    private final WorkflowCommandHandler workflowHandler;

    public CommandRouter(WorkspaceManager workspaceManager) {
        // Create API client for DB sync (best-effort, fails gracefully if server not running)
        ApiClient apiClient = new ApiClient("http://localhost:8080");
        LocalPersistenceHelper persistence = new LocalPersistenceHelper(workspaceManager, apiClient);

        this.workspaceHandler = new WorkspaceCommandHandler(workspaceManager, persistence);
        this.workflowHandler = new WorkflowCommandHandler(workspaceManager, persistence);
    }

    public void execute(String line) {
        logger.debug("Executing command: {}", line);
        try {
            CommandParser cmd = CommandParser.parse(line);

            switch (cmd.getGroup()) {
                case "help":
                    printHelp();
                    break;
                case "workspace":
                    workspaceHandler.handle(cmd);
                    break;
                case "workflow":
                    workflowHandler.handle(cmd);
                    break;
                default:
                    System.out.println("Unknown command: " + cmd.getGroup());
                    System.out.println("Type 'help' to see available commands.");
                    break;
            }
        } catch (IllegalArgumentException e) {
            logger.warn("Invalid command argument: {}", e.getMessage());
            System.out.println("\n[ERROR] " + e.getMessage());
        } catch (Exception e) {
            logger.error("Unexpected error executing command: {}", line, e);
            System.out.println("\n[ERROR] Unexpected error: " + e.getMessage());
        }
    }

    private void printHelp() {
        System.out.println();
        System.out.println("  ╔══════════════════════════════════════════════════════════════════════════╗");
        System.out.println("  ║                  SDLC PIPELINE ~ AVAILABLE COMMANDS                     ║");
        System.out.println("  ╠══════════════════════════════════════════════════════════════════════════╣");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  1. CREATE WORKSPACE                                                   ║");
        System.out.println("  ║     workspace create --name <name> --desc <description> --tech <stack>  ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  2. LIST WORKSPACES                                                    ║");
        System.out.println("  ║     workspace list                                                     ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  3. GET WORKSPACE BY NAME                                              ║");
        System.out.println("  ║     workspace get --name <name>                                        ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  4. START WORKFLOW                                                     ║");
        System.out.println("  ║     workflow start --workspace <id> --text <requirement>                ║");
        System.out.println("  ║     workflow start --workspace <id> --file <filePath>                   ║");
        System.out.println("  ║       Optional: --userstory <text>  --agent <agentName>                ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  5. WORKFLOW STATUS                                                    ║");
        System.out.println("  ║     workflow status --workspace <id> --requirement <id>                 ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  6. APPROVE / REJECT / REWORK                                         ║");
        System.out.println("  ║     workflow approve --workspace <id> --requirement <id>                ║");
        System.out.println("  ║       Optional: --decision <APPROVE|REJECT|REWORK> --comments <text>   ║");
        System.out.println("  ║       Optional: --ADD \"<content>\" (prepend to agent output)            ║");
        System.out.println("  ║       (Interactive prompt if --decision is omitted)                     ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  7. VIEW AGENT OUTPUT                                                  ║");
        System.out.println("  ║     workflow output --agent <1-10> --workspace <id>                     ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  8. LIST ALL WORKFLOWS                                                 ║");
        System.out.println("  ║     workflow all                                                       ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  9. RUN SINGLE AGENT (directly, skip pipeline)                         ║");
        System.out.println("  ║     workflow run-agent --workspace <id> --agent <name>                  ║");
        System.out.println("  ║       Example: workflow run-agent --workspace 1 --agent CodingAgent    ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  AGENT PIPELINE (10 agents):                                           ║");
        System.out.println("  ║   1. RequirementAnalysisRefinementAgent  6. LLDAgent                   ║");
        System.out.println("  ║   2. HLSAgent                           7. TDDAgent                   ║");
        System.out.println("  ║   3. HLDAgent                           8. CodingAgent                ║");
        System.out.println("  ║   4. UserStoryAgent                     9. StaticCodeAnalysisAgent     ║");
        System.out.println("  ║   5. TRReviewAgent                     10. SecurityAgent               ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  PER-STORY PIPELINE (after UserStoryAgent):                            ║");
        System.out.println("  ║  10. PICK A STORY                                                      ║");
        System.out.println("  ║      workflow pick-story --workspace <id> --requirement <id>            ║");
        System.out.println("  ║        --story US-001                                                  ║");
        System.out.println("  ║      (runs TDD, then waits for approval before LLD, then Code)         ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  11. APPROVE STORY AGENT OUTPUT                                        ║");
        System.out.println("  ║      workflow approve-story --workspace <id> --requirement <id>         ║");
        System.out.println("  ║        --story US-001                                                  ║");
        System.out.println("  ║      Optional: --decision <APPROVE|REWORK> --comments <text>           ║");
        System.out.println("  ║      (approve TDD→run LLD, approve LLD→run CodingAgent)               ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  12. VIEW STORY PIPELINE STATUS (all parallel stories)                 ║");
        System.out.println("  ║      workflow story-status --workspace <id> --requirement <id>          ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  NOTE: Multiple stories can run in parallel from different terminals!   ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ║  OTHER:  help | exit                                                   ║");
        System.out.println("  ║                                                                        ║");
        System.out.println("  ╚══════════════════════════════════════════════════════════════════════════╝");
    }
}
