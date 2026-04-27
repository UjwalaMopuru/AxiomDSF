package com.mphasis.axiomdsf.business.model;

public enum AgentState {
    INIT,
    IN_PROGRESS,
    IN_REVIEW,
    APPROVED,
    REJECTED,
    REWORK,
    FAILED;

    public boolean canTransitionTo(AgentState target) {
        return switch (this) {
            case INIT -> target == IN_PROGRESS;
            case IN_PROGRESS -> target == IN_REVIEW || target == FAILED;
            case IN_REVIEW -> target == APPROVED || target == REJECTED || target == REWORK;
            case REWORK -> target == IN_PROGRESS;
            case APPROVED, REJECTED, FAILED -> false;
        };
    }
}
