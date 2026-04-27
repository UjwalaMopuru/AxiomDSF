package com.mphasis.axiomdsf.business.config;

import java.util.List;

public class AgentConfigProperties {

    private String agentType;
    private String agentName;
    private String agentFilePath;
    private String outputDirectory;
    private String nextAgent;
    private int executionOrder;
    private boolean enabled;
    private boolean mandatory;
    private List<String> dependencies = List.of();

    public String getAgentType() { return agentType; }
    public void setAgentType(String agentType) { this.agentType = agentType; }

    public String getAgentName() { return agentName; }
    public void setAgentName(String agentName) { this.agentName = agentName; }

    public String getAgentFilePath() { return agentFilePath; }
    public void setAgentFilePath(String agentFilePath) { this.agentFilePath = agentFilePath; }

    public String getOutputDirectory() { return outputDirectory; }
    public void setOutputDirectory(String outputDirectory) { this.outputDirectory = outputDirectory; }

    public String getNextAgent() { return nextAgent; }
    public void setNextAgent(String nextAgent) { this.nextAgent = nextAgent; }

    public int getExecutionOrder() { return executionOrder; }
    public void setExecutionOrder(int executionOrder) { this.executionOrder = executionOrder; }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public boolean isMandatory() { return mandatory; }
    public void setMandatory(boolean mandatory) { this.mandatory = mandatory; }

    public List<String> getDependencies() { return dependencies; }
    public void setDependencies(List<String> dependencies) { this.dependencies = dependencies; }
}
