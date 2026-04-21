/**
 * AgentGoals - Self-directed goal system
 *
 * Allows the agent to set, track, and achieve its own objectives.
 * Goals can be short-term (tasks), medium-term (projects), or long-term (visions).
 */
export interface GoalSubgoal {
    id: string;
    title: string;
    status: 'pending' | 'active' | 'done' | 'blocked';
}
export interface Goal {
    id: string;
    type: 'short' | 'medium' | 'long';
    title: string;
    description: string;
    status: 'active' | 'in_progress' | 'completed' | 'abandoned';
    priority: number;
    progress: number;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
    subgoals: GoalSubgoal[];
    blockers: string[];
    objectiveTags: string[];
    reasoning: string;
}
export declare const GOAL_TEMPLATES: {
    chain_health: {
        title: string;
        description: string;
        type: "long";
        priority: number;
        subgoals: string[];
        objectiveTags: string[];
    };
    security: {
        title: string;
        description: string;
        type: "long";
        priority: number;
        subgoals: string[];
        objectiveTags: string[];
    };
    tooling: {
        title: string;
        description: string;
        type: "medium";
        priority: number;
        subgoals: string[];
        objectiveTags: string[];
    };
    optimization: {
        title: string;
        description: string;
        type: "medium";
        priority: number;
        subgoals: string[];
        objectiveTags: string[];
    };
    governance: {
        title: string;
        description: string;
        type: "long";
        priority: number;
        subgoals: string[];
        objectiveTags: string[];
    };
    documentation: {
        title: string;
        description: string;
        type: "short";
        priority: number;
        subgoals: string[];
        objectiveTags: string[];
    };
};
declare class AgentGoalsSystem {
    private goals;
    private initialized;
    private normalizeSubgoals;
    initialize(): Promise<void>;
    private loadGoals;
    private setDefaultGoals;
    createGoal(title: string, description: string, type: Goal['type'], reasoning: string, priority?: number, subgoals?: Array<string | GoalSubgoal>, objectiveTags?: string[]): Promise<Goal>;
    updateProgress(goalId: string, progress: number, note?: string): Promise<void>;
    addBlocker(goalId: string, blocker: string): Promise<void>;
    removeBlocker(goalId: string, blocker: string): Promise<void>;
    getActiveGoals(): Goal[];
    getCurrentFocus(): Goal | null;
    getGoalsByType(type: Goal['type']): Goal[];
    getGoalForObjectiveTags(objectiveTags: string[]): Goal | null;
    taskContributesToGoal(taskTitle: string): Goal | null;
    proposeGoal(context: string): Promise<Goal | null>;
    getSummary(): string;
    private makeProgressBar;
    suggestNextAction(): {
        goal: Goal;
        action: string;
    } | null;
    recordVerifiedProgressByTags(objectiveTags: string[], note: string): Promise<Goal | null>;
}
export declare const agentGoals: AgentGoalsSystem;
export {};
//# sourceMappingURL=AgentGoals.d.ts.map