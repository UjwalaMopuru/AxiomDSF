package com.mphasis.axiomdsf.cli;

import java.util.Map;

/**
 * Utility for formatted console output.
 */
public class ConsolePrinter {

    public static void printSuccess(String title, Map<String, String> fields) {
        System.out.println();
        System.out.println("  ╔══════════════════════════════════════════════════════╗");
        System.out.printf("  ║  [OK] %-48s║%n", title);
        System.out.println("  ╠══════════════════════════════════════════════════════╣");
        for (Map.Entry<String, String> entry : fields.entrySet()) {
            System.out.printf("  ║    %-14s: %-36s║%n", entry.getKey(), entry.getValue());
        }
        System.out.println("  ╚══════════════════════════════════════════════════════╝");
    }

    public static void printError(String message) {
        System.out.println();
        System.out.println("  [ERROR] " + message);
    }

    public static void printInfo(String message) {
        System.out.println("  [INFO] " + message);
    }

    public static void printWarning(String message) {
        System.out.println("  [WARN] " + message);
    }

    /**
     * Display the full pipeline status showing all 10 agents with progress markers.
     */
    public static void printPipelineStatus(int currentSequence, String state, boolean isComplete) {
        System.out.println();
        System.out.println("  ╔══════════════════════════════════════════════════════╗");
        System.out.println("  ║  Pipeline Status                                    ║");
        System.out.println("  ╠══════════════════════════════════════════════════════╣");
        for (AgentRegistry.AgentDef agent : AgentRegistry.getPipeline()) {
            String marker;
            String status;
            if (isComplete) {
                marker = "[OK]";
                status = "COMPLETED";
            } else if (agent.getSequence() < currentSequence) {
                marker = "[OK]";
                status = "APPROVED";
            } else if (agent.getSequence() == currentSequence) {
                marker = "[>>]";
                status = state;
            } else {
                marker = "[  ]";
                status = "PENDING";
            }
            String line = String.format("%s %2d. %-33s %s", marker, agent.getSequence(), agent.getName(), status);
            System.out.printf("  ║  %-52s║%n", line);
        }
        System.out.println("  ╚══════════════════════════════════════════════════════╝");
    }

    /**
     * Print the current state.
     */
    public static void printStateFlow(String currentState) {
        System.out.println("    State: " + currentState);
    }
}
