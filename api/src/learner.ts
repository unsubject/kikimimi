import type { ScaffoldStage, Skill } from "@kikimimi/shared";
import type { Sql } from "./db.js";

/**
 * Graduation / de-graduation logic (spec §8). Pure decision function is
 * exported for unit tests; `recordScore` applies it against the DB.
 *
 *  S1→S2 / S2→S3: trailing-10 mean ≥ 80% AND ≥ 14 days at stage AND ≥ 8 items
 *  De-graduation: trailing-10 mean < 55% → drop one stage
 *  (Level-up is offered, not automatic — deferred past v0.1.)
 */
export interface StageDecision {
  action: "graduate" | "degrade" | "hold";
  fromStage: ScaffoldStage;
  toStage: ScaffoldStage;
}

export function decideStage(
  scores: number[], // 0-100, most recent last
  stage: ScaffoldStage,
  daysAtStage: number,
  itemsAtStage: number,
): StageDecision {
  const trailing = scores.slice(-10);
  const mean = trailing.length ? trailing.reduce((a, b) => a + b, 0) / trailing.length : 0;

  if (trailing.length >= 3 && mean < 55 && stage > 1) {
    return { action: "degrade", fromStage: stage, toStage: (stage - 1) as ScaffoldStage };
  }
  if (
    stage < 3 &&
    trailing.length >= 8 &&
    mean >= 80 &&
    daysAtStage >= 14 &&
    itemsAtStage >= 8
  ) {
    return { action: "graduate", fromStage: stage, toStage: (stage + 1) as ScaffoldStage };
  }
  return { action: "hold", fromStage: stage, toStage: stage };
}

const DAY_MS = 86_400_000;

/**
 * Append a score to a skill's trailing window and apply any stage transition.
 * Returns the transition (or null) so the caller can surface a graduation
 * announcement to the UI.
 */
export async function recordScore(
  sql: Sql,
  skill: Skill,
  score: number,
): Promise<StageDecision | null> {
  const [state] = await sql`select * from learner_state where skill = ${skill}`;
  if (!state) return null;

  const scores: number[] = Array.isArray(state.trailing_scores)
    ? (state.trailing_scores as number[])
    : [];
  // Clamp + coerce: the grading model's `score` is not hard-validated by forced
  // tool use, so a stray >100 / negative / non-finite value must not poison the
  // learner model (NaN would serialize to null → read back as 0 in the mean).
  const s = Number(score);
  scores.push(Number.isFinite(s) ? Math.max(0, Math.min(100, Math.round(s))) : 0);
  const trimmed = scores.slice(-10);

  const stage = Number(state.scaffold_stage) as ScaffoldStage;
  const enteredAt = new Date(state.stage_entered_at as string);
  const daysAtStage = (Date.now() - enteredAt.getTime()) / DAY_MS;

  // "Items at stage" = graded attempts accumulated since entering this stage.
  // We reset the trailing window on every transition (below), so its length is
  // exactly that per-skill count — unlike deliveries.stage, which is always
  // stamped with the *listening* stage and so can't gate the speaking skill.
  const itemsAtStage = trimmed.length;

  const decision = decideStage(trimmed, stage, daysAtStage, itemsAtStage);

  if (decision.action === "hold") {
    await sql`
      update learner_state
      set trailing_scores = ${JSON.stringify(trimmed)}, updated_at = now()
      where skill = ${skill}`;
    return null;
  }

  // On a stage change, clear the trailing window: the next gate must be earned
  // from scratch at the new stage (spec §8 "per skill, per stage"), which also
  // stops one bad run from cascading through multiple degrades in a row.
  await sql`
    update learner_state
    set trailing_scores = '[]'::jsonb,
        scaffold_stage = ${decision.toStage},
        stage_entered_at = now(),
        updated_at = now()
    where skill = ${skill}`;
  await sql`
    insert into graduations (skill, from_stage, to_stage, direction)
    values (${skill}, ${decision.fromStage}, ${decision.toStage}, ${decision.action})`;

  return decision;
}
