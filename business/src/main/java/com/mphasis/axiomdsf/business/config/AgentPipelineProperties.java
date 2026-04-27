package com.mphasis.axiomdsf.business.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@ConfigurationProperties(prefix = "agent.pipeline")
public class AgentPipelineProperties {

    private List<AgentConfigProperties> agents = new ArrayList<>();

    public List<AgentConfigProperties> getAgents() { return agents; }
    public void setAgents(List<AgentConfigProperties> agents) { this.agents = agents; }

    public List<AgentConfigProperties> getEnabledAgentsInOrder() {
        return agents.stream()
                .filter(AgentConfigProperties::isEnabled)
                .sorted(Comparator.comparingInt(AgentConfigProperties::getExecutionOrder))
                .toList();
    }

    public Optional<AgentConfigProperties> getAgentByName(String agentName) {
        return agents.stream()
                .filter(a -> a.getAgentName().equals(agentName))
                .findFirst();
    }

    public Optional<AgentConfigProperties> getAgentByOrder(int executionOrder) {
        return agents.stream()
                .filter(a -> a.getExecutionOrder() == executionOrder && a.isEnabled())
                .findFirst();
    }

    public Optional<AgentConfigProperties> getNextAgent(String currentAgentName) {
        return getNextAgent(currentAgentName, null);
    }

    /**
     * Get the next agent in the pipeline, respecting selected agents.
     * If selectedAgentNames is null, uses the default nextAgent chain.
     * If selectedAgentNames is provided, skips agents not in the selection,
     * following the execution order to find the next selected agent.
     */
    public Optional<AgentConfigProperties> getNextAgent(String currentAgentName, List<String> selectedAgentNames) {
        if (selectedAgentNames == null || selectedAgentNames.isEmpty()) {
            // Default behavior: follow nextAgent chain
            Optional<AgentConfigProperties> current = getAgentByName(currentAgentName);
            if (current.isEmpty() || current.get().getNextAgent() == null || current.get().getNextAgent().isBlank()) {
                return Optional.empty();
            }
            return getAgentByName(current.get().getNextAgent());
        }

        // Dynamic: find the next agent by execution order that is in the selected set
        Optional<AgentConfigProperties> current = getAgentByName(currentAgentName);
        if (current.isEmpty()) return Optional.empty();

        int currentOrder = current.get().getExecutionOrder();
        return getEnabledAgentsInOrder().stream()
                .filter(a -> a.getExecutionOrder() > currentOrder)
                .filter(a -> selectedAgentNames.contains(a.getAgentName()))
                .findFirst();
    }

    /**
     * Get the first agent for a given set of selected agents.
     * Falls back to the overall first agent if no selection.
     */
    public Optional<AgentConfigProperties> getFirstAgent(List<String> selectedAgentNames) {
        if (selectedAgentNames == null || selectedAgentNames.isEmpty()) {
            return getFirstAgent();
        }
        return getEnabledAgentsInOrder().stream()
                .filter(a -> selectedAgentNames.contains(a.getAgentName()))
                .findFirst();
    }

    public Optional<AgentConfigProperties> getFirstAgent() {
        return getEnabledAgentsInOrder().stream().findFirst();
    }

    /**
     * Get the list of mandatory agent names.
     */
    public List<String> getMandatoryAgentNames() {
        return agents.stream()
                .filter(AgentConfigProperties::isMandatory)
                .map(AgentConfigProperties::getAgentName)
                .toList();
    }

    /**
     * Validate a set of selected agents: all mandatory agents must be included.
     * Returns the list of missing mandatory agents (empty if valid).
     */
    public List<String> validateSelectedAgents(List<String> selectedAgentNames) {
        if (selectedAgentNames == null) return List.of();
        return getMandatoryAgentNames().stream()
                .filter(name -> !selectedAgentNames.contains(name))
                .toList();
    }

    /**
     * Build a filtered, ordered pipeline for the given selected agents.
     */
    public List<AgentConfigProperties> buildDynamicPipeline(List<String> selectedAgentNames) {
        if (selectedAgentNames == null || selectedAgentNames.isEmpty()) {
            return getEnabledAgentsInOrder();
        }
        return getEnabledAgentsInOrder().stream()
                .filter(a -> selectedAgentNames.contains(a.getAgentName()))
                .toList();
    }
}
