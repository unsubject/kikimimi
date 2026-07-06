import type { Sql } from "./db.js";
import type {
  ProgressResponse,
  SkillProgress,
  JlptCoverage,
  GraduationEntry,
} from "@kikimimi/shared";

/**
 * Progress dashboard data (spec §7, §11, v1.0). Per-skill level + scaffold
 * stage, trailing accuracy, JLPT coverage bars, and recent graduations.
 *
 * JLPT is a *ruler, not a syllabus* (spec §7): the bars translate organic SRS
 * progress into a recognized external scale. "Encountered" = a card of that
 * level exists; "matured" = it has real memory stability (FSRS stability ≥ the
 * threshold below, i.e. an interval of roughly a week+).
 */

/**
 * Approximate NEW-word count introduced *at* each JLPT level (non-cumulative),
 * used only as coverage-bar denominators. JMdict/JLPT tags are per-level, so the
 * numerators (cards tagged exactly this level) must divide by per-level counts,
 * not the cumulative list sizes — otherwise the higher bars read low.
 * Derived from the common cumulative figures (800/1500/3700/6000/10000).
 */
const JLPT_VOCAB_TOTALS: Record<string, number> = {
  N5: 800,
  N4: 700,
  N3: 2200,
  N2: 2300,
  N1: 4000,
};

/** FSRS stability (days) at which a card counts as "matured" for coverage. */
const MATURE_STABILITY_DAYS = 7;

const DAY_MS = 86_400_000;

export async function computeProgress(sql: Sql): Promise<ProgressResponse> {
  const stateRows = await sql`select * from learner_state order by skill`;
  const skills: SkillProgress[] = stateRows.map((r) => {
    const scores = Array.isArray(r.trailing_scores) ? (r.trailing_scores as number[]) : [];
    const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const entered = new Date(r.stage_entered_at as string).getTime();
    return {
      skill: String(r.skill),
      level: Number(r.level),
      scaffold_stage: Number(r.scaffold_stage),
      trailing_mean: mean === null ? null : Math.round(mean),
      days_at_stage: Math.floor((Date.now() - entered) / DAY_MS),
    };
  });

  // JLPT coverage from the SRS deck, per level.
  const cardRows = await sql`
    select jlpt_level, fsrs_state from srs_cards where jlpt_level is not null`;
  const enc: Record<string, number> = {};
  const mat: Record<string, number> = {};
  for (const row of cardRows) {
    const lvl = String(row.jlpt_level);
    enc[lvl] = (enc[lvl] ?? 0) + 1;
    const stability = Number((row.fsrs_state as { stability?: number })?.stability ?? 0);
    if (stability >= MATURE_STABILITY_DAYS) mat[lvl] = (mat[lvl] ?? 0) + 1;
  }
  const jlpt: JlptCoverage[] = ["N5", "N4", "N3", "N2", "N1"].map((level) => {
    const total = JLPT_VOCAB_TOTALS[level] ?? 1000;
    const encountered = enc[level] ?? 0;
    const matured = mat[level] ?? 0;
    return {
      level,
      encountered,
      matured,
      total,
      encountered_pct: Math.min(100, Math.round((encountered / total) * 1000) / 10),
      matured_pct: Math.min(100, Math.round((matured / total) * 1000) / 10),
    };
  });

  const gradRows = await sql`
    select skill, from_stage, to_stage, direction, created_at
    from graduations order by created_at desc limit 10`;
  const graduations: GraduationEntry[] = gradRows.map((r) => ({
    skill: String(r.skill),
    from_stage: Number(r.from_stage),
    to_stage: Number(r.to_stage),
    direction: String(r.direction),
    created_at:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  const accRows = await sql`
    select e.score from evaluations e order by e.created_at desc limit 20`;
  const recent_accuracy = accRows.map((r) => Number(r.score)).reverse();

  const [itemCount] = await sql`select count(*)::int as n from items`;
  const [cardCount] = await sql`select count(*)::int as n from srs_cards`;
  const [delivDone] = await sql`
    select count(*)::int as n from deliverables where artifact_url is not null`;

  return {
    skills,
    jlpt,
    graduations,
    recent_accuracy,
    totals: {
      items: Number(itemCount?.n ?? 0),
      cards: Number(cardCount?.n ?? 0),
      deliverables_done: Number(delivDone?.n ?? 0),
    },
  };
}
