package com.mphasis.axiomdsf.cli;

import java.util.List;
import java.util.Map;

/**
 * Defines the 10-agent SDLC pipeline with input/output file mappings.
 * Agent sequence, names, and file conventions match the .agent.md definitions
 * and the existing workspace file structure.
 */
public class AgentRegistry {

    // Short name to full name mapping (Task 4)
    private static final Map<String, String> SHORT_NAME_MAP = Map.ofEntries(
        Map.entry("REQ", "RequirementAnalysisRefinementAgent"),
        Map.entry("HLS", "HLSAgent"),
        Map.entry("HLD", "HLDAgent"),
        Map.entry("US", "UserStoryAgent"),
        Map.entry("TDD", "TDDAgent"),
        Map.entry("LLD", "LLDAgent"),
        Map.entry("CODE", "CodingAgent"),
        Map.entry("TR", "TRReviewAgent"),
        Map.entry("SEC", "SecurityAgent"),
        Map.entry("SCA", "StaticCodeAnalysisAgent")
    );

    // Default rework comments per agent (Task 1)
    private static final Map<String, String> DEFAULT_REWORK_COMMENTS = Map.ofEntries(
        Map.entry("RequirementAnalysisRefinementAgent",
            "Rework: Please refine the requirement package further. Ensure clarity, completeness, and alignment with acceptance criteria."),
        Map.entry("HLSAgent",
            "Rework: Please revisit the high-level solution. Ensure architecture decisions are justified and risks are addressed."),
        Map.entry("HLDAgent",
            "Rework: Please improve the high-level design. Ensure component interactions and interfaces are clearly defined."),
        Map.entry("UserStoryAgent",
            "Rework: Please revise user stories. Ensure they are INVEST-compliant with clear acceptance criteria."),
        Map.entry("TDDAgent",
            "Rework: Please refine the test strategy. Ensure comprehensive coverage of happy, negative, and edge cases."),
        Map.entry("LLDAgent",
            "Rework: Please improve the low-level design. Ensure method signatures, data models, and sequences are complete."),
        Map.entry("CodingAgent",
            "Rework: Please fix the implementation. Ensure code compiles, follows coding standards, and passes tests."),
        Map.entry("TRReviewAgent",
            "Rework: Please refine test review scenarios. Ensure scenarios are correct and automatable."),
        Map.entry("SecurityAgent",
            "Rework: Please expand security analysis. Ensure all vulnerabilities are documented with remediation steps."),
        Map.entry("StaticCodeAnalysisAgent",
            "Rework: Please refine static analysis findings. Ensure issues are prioritized with clear fix suggestions.")
    );

    public static class AgentDef {
        private final int sequence;
        private final String name;
        private final String shortName;
        private final String inputFileName;
        private final String outputFileName;
        private final List<String> extraOutputFiles;
        private final List<Integer> inputSourceAgents;

        public AgentDef(int sequence, String name, String shortName, String inputFileName, String outputFileName,
                        List<String> extraOutputFiles, List<Integer> inputSourceAgents) {
            this.sequence = sequence;
            this.name = name;
            this.shortName = shortName;
            this.inputFileName = inputFileName;
            this.outputFileName = outputFileName;
            this.extraOutputFiles = extraOutputFiles;
            this.inputSourceAgents = inputSourceAgents;
        }

        public int getSequence() { return sequence; }
        public String getName() { return name; }
        public String getShortName() { return shortName; }
        public String getInputFileName() { return inputFileName; }
        public String getOutputFileName() { return outputFileName; }
        public List<String> getExtraOutputFiles() { return extraOutputFiles; }
        public List<Integer> getInputSourceAgents() { return inputSourceAgents; }
    }

    private static final List<AgentDef> PIPELINE = List.of(
        new AgentDef(1, "RequirementAnalysisRefinementAgent", "REQ",
            "input_raw_requirement.md", "output_refined_requirement.md",
            List.of(), List.of()),
        new AgentDef(2, "HLSAgent", "HLS",
            "input_refined_requirement.md", "output_high_level_solution.md",
            List.of(), List.of(1)),
        new AgentDef(3, "HLDAgent", "HLD",
            "input_hls_solution.md", "output_high_level_design.md",
            List.of(), List.of(2)),
        new AgentDef(4, "UserStoryAgent", "US",
            "input_hld_blueprint.md", "output_user_stories.md",
            List.of(), List.of(3)),
        new AgentDef(5, "TRReviewAgent", "TR",
            "input_user_stories.md", "output_test_review.md",
            List.of(), List.of(4)),
        new AgentDef(6, "LLDAgent", "LLD",
            "input_trreview_and_hld.md", "output_low_level_design.md",
            List.of(), List.of(5, 3, 4)),
        new AgentDef(7, "TDDAgent", "TDD",
            "input_lld_and_trreview.md", "output_tdd_test_strategy.md",
            List.of(), List.of(6, 5, 4)),
        new AgentDef(8, "CodingAgent", "CODE",
            "input_lld_and_tdd.md", "output_implemented_code.md",
            List.of(), List.of(6, 7)),
        new AgentDef(9, "StaticCodeAnalysisAgent", "SCA",
            "input_source_code.md", "output_static_analysis.md",
            List.of(), List.of(8)),
        new AgentDef(10, "SecurityAgent", "SEC",
            "input_security_code.md", "output_security_analysis.md",
            List.of("security-report.json"), List.of(8))
    );

    public static List<AgentDef> getPipeline() {
        return PIPELINE;
    }

    public static AgentDef getBySequence(int seq) {
        return PIPELINE.stream()
            .filter(a -> a.getSequence() == seq)
            .findFirst()
            .orElse(null);
    }

    public static AgentDef getByName(String name) {
        return PIPELINE.stream()
            .filter(a -> a.getName().equalsIgnoreCase(name))
            .findFirst()
            .orElse(null);
    }

    /**
     * Find agent by short name (e.g., REQ, HLS, HLD, US, TDD, LLD, CODE, TR, SEC, SCA)
     */
    public static AgentDef getByShortName(String shortName) {
        String fullName = SHORT_NAME_MAP.get(shortName.toUpperCase());
        return fullName != null ? getByName(fullName) : null;
    }

    /**
     * Find agent by sequence number, full name, or short name
     */
    public static AgentDef resolve(String agentRef) {
        if (agentRef == null || agentRef.isBlank()) return null;
        
        // Try as sequence number first
        try {
            int seq = Integer.parseInt(agentRef.trim());
            AgentDef agent = getBySequence(seq);
            if (agent != null) return agent;
        } catch (NumberFormatException ignored) {}
        
        // Try as short name
        AgentDef agent = getByShortName(agentRef);
        if (agent != null) return agent;
        
        // Try as full name
        return getByName(agentRef);
    }

    /**
     * Get default rework comments for an agent
     */
    public static String getDefaultReworkComment(String agentName) {
        return DEFAULT_REWORK_COMMENTS.getOrDefault(agentName,
            "Rework: Please revise the output based on feedback.");
    }

    /**
     * Get all short names for help display
     */
    public static String getShortNamesHelp() {
        StringBuilder sb = new StringBuilder();
        sb.append("Agent short names: ");
        PIPELINE.forEach(a -> sb.append(a.getShortName()).append("(").append(a.getSequence()).append(") "));
        return sb.toString().trim();
    }

    public static int getTotalAgents() {
        return PIPELINE.size();
    }
}
