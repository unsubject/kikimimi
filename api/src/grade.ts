import type { Env } from "./env.js";
import { generateStructured, type JsonSchema } from "./anthropic.js";
import type { Item } from "@kikimimi/shared";

/**
 * Explain-back grading (spec §1.4, §8) — teach-to-learn core. The learner
 * explains the item back; Haiku grades comprehension and returns exactly one
 * targeted correction. Structured output via forced tool use, same pattern as
 * generation.
 */
export interface Grade {
  score: number; // 0-100 comprehension
  feedback: string; // one primary correction, direct, no cheerleading
  missed_points: string[];
  error_category: string | null; // particle | conjugation | vocab | phonology | comprehension | null
  error_detail: string | null; // short note for the error log, or null if clean
}

const GRADE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["score", "feedback", "missed_points", "error_category", "error_detail"],
  properties: {
    score: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description: "Comprehension score 0-100 based on whether the explanation captured the item.",
    },
    feedback: {
      type: "string",
      description:
        "One primary correction. Direct and concrete, zero cheerleading filler. Under 40 words.",
    },
    missed_points: {
      type: "array",
      description: "Key points from the item the learner missed or got wrong.",
      items: { type: "string" },
    },
    error_category: {
      type: ["string", "null"],
      description:
        "The single most important error type, or null if the explanation was clean.",
    },
    error_detail: {
      type: ["string", "null"],
      description: "A short note for the recurring-error log, or null.",
    },
  },
};

export interface GradeResult {
  grade: Grade;
  usd: number;
}

export async function gradeExplainBack(
  env: Env,
  item: Pick<Item, "script_jp" | "gist_zh" | "explain_back_prompt">,
  learnerText: string,
): Promise<GradeResult> {
  const system =
    "You grade a Japanese learner's explain-back. The learner heard/read a short Japanese item and is explaining it back to prove comprehension. " +
    "Judge whether they understood the content — not their production polish. Give exactly one targeted correction, direct and concrete, no praise filler.";

  const prompt =
    `Item (Japanese):\n${item.script_jp}\n\n` +
    `Reference gist (Chinese):\n${item.gist_zh}\n\n` +
    `Explain-back prompt they answered:\n${item.explain_back_prompt}\n\n` +
    `The learner's explanation:\n${learnerText}\n\n` +
    `Grade their comprehension and return one correction.`;

  const result = await generateStructured<Grade>(env, {
    model: env.GRADING_MODEL,
    system,
    prompt,
    toolName: "emit_grade",
    toolDescription: "Emit the comprehension grade and one targeted correction.",
    schema: GRADE_SCHEMA,
    maxTokens: 1024,
  });

  // Forced tool use does not hard-enforce the schema's 0-100 bound (or even that
  // score is a number), so clamp AND coerce a non-finite value to 0 before it
  // reaches evaluations / pass-fail / the learner model (NaN would poison all three).
  const grade = result.data;
  const s = Number(grade.score);
  grade.score = Number.isFinite(s) ? Math.max(0, Math.min(100, Math.round(s))) : 0;
  return { grade, usd: result.usd };
}
