package com.mphasis.axiomdsf.cli;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Main entry point for the SDLC Pipeline Command Line Orchestrator.
 * Provides an interactive REPL that manages workspaces and orchestrates
 * the 10-agent SDLC pipeline via local file operations.
 */
public class AxiomDsfCli {

    private static final Logger logger = LoggerFactory.getLogger(AxiomDsfCli.class);

    private static final String BANNER =
            "\n" +
            "  ╔════════════════════════════════════════════════════════╗\n" +
            "  ║       SDLC PIPELINE ~ Command Line Orchestrator       ║\n" +
            "  ╠════════════════════════════════════════════════════════╣\n" +
            "  ║  Type 'help' to see all available commands             ║\n" +
            "  ║  Type 'exit' to quit                                   ║\n" +
            "  ╚════════════════════════════════════════════════════════╝\n";

    private final CommandRouter router;

    public AxiomDsfCli(Path projectRoot) {
        WorkspaceManager workspaceManager = new WorkspaceManager(projectRoot);
        this.router = new CommandRouter(workspaceManager);
    }

    public void run() {
        logger.info("Starting CLI REPL");
        System.out.println(BANNER);

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in))) {
            String line;
            while (true) {
                System.out.print("\npipeline> ");
                System.out.flush();
                line = reader.readLine();

                if (line == null) {
                    break;
                }

                line = line.trim();

                if (line.isEmpty()) {
                    continue;
                }

                if (line.equalsIgnoreCase("exit") || line.equalsIgnoreCase("quit")) {
                    System.out.println("Goodbye!");
                    break;
                }

                router.execute(line);
            }
        } catch (IOException e) {
            logger.error("Error reading input", e);
            System.err.println("Error reading input: " + e.getMessage());
        }
    }

    public static void main(String[] args) {
        Path projectRoot;

        if (args.length > 0) {
            projectRoot = Paths.get(args[0]);
        } else {
            String envRoot = System.getenv("SURYA_PROJECT_ROOT");
            if (envRoot != null && !envRoot.isBlank()) {
                projectRoot = Paths.get(envRoot);
            } else {
                projectRoot = Paths.get(System.getProperty("user.dir"));
            }
        }

        logger.info("Project root: {}", projectRoot.toAbsolutePath());
        new AxiomDsfCli(projectRoot).run();
    }
}
