/**
 * Agent skill registry.
 *
 * Phase-agent / skills / step-2. Skills are reusable procedures
 * the agent can call — "run the verification suite", "deploy to
 * railway", "open a PR". Registering a skill associates a trigger
 * (task shape) with a handler.
 */

export interface Skill {
  readonly id: string;
  readonly description: string;
  readonly triggers: ReadonlyArray<SkillTrigger>;
  readonly handler: SkillHandler;
  readonly cooldownMs?: number;
}

export interface SkillTrigger {
  readonly taskType?: string;
  readonly scopePrefix?: string;
  readonly titleContains?: string;
}

export type SkillHandler = (ctx: SkillContext) => Promise<SkillResult>;

export interface SkillContext {
  readonly taskId: string;
  readonly title: string;
  readonly scopes: readonly string[];
  readonly log: (message: string) => void;
}

export interface SkillResult {
  readonly ok: boolean;
  readonly details?: string;
}

export class SkillRegistry {
  private readonly skills = new Map<string, Skill>();
  private readonly lastRunAt = new Map<string, number>();

  register(skill: Skill): void {
    if (this.skills.has(skill.id)) {
      throw new Error(`skills: duplicate id "${skill.id}"`);
    }
    this.skills.set(skill.id, skill);
  }

  /** Find the first matching skill for a task. null if none match. */
  match(task: { type: string; scope: string; title: string }, now = Date.now()): Skill | null {
    for (const skill of this.skills.values()) {
      const onCooldown =
        skill.cooldownMs !== undefined &&
        (now - (this.lastRunAt.get(skill.id) ?? 0) < skill.cooldownMs);
      if (onCooldown) continue;
      for (const trigger of skill.triggers) {
        if (
          (trigger.taskType === undefined || trigger.taskType === task.type) &&
          (trigger.scopePrefix === undefined || task.scope.startsWith(trigger.scopePrefix)) &&
          (trigger.titleContains === undefined || task.title.includes(trigger.titleContains))
        ) {
          return skill;
        }
      }
    }
    return null;
  }

  markRan(skillId: string, now = Date.now()): void {
    this.lastRunAt.set(skillId, now);
  }
}
