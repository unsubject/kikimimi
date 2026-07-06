import type { Env } from "./env.js";
import type { ShadowGrade } from "@kikimimi/shared";
import { generateStructured, type JsonSchema } from "./anthropic.js";

/**
 * Shadowing feedback (spec §4 Drills; learning plan Sprint 3). The learner
 * repeats a target sentence; we transcribe the recording (Whisper, upstream)
 * and grade the imitation against the target, focused on the three contrasts
 * Chinese speakers miss: mora count, long vowels (おばさん vs おばあさん),
 * and double consonants / gemination (きて vs きって).
 *
 * Text-only signal has limits (Whisper normalises some detail), so the grader
 * is told to judge conservatively and only flag clear discrepancies.
 *
 * ShadowGrade is defined in @kikimimi/shared so the client renders the same shape.
 */
const SHADOW_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["score", "mora_ok", "long_vowel_ok", "gemination_ok", "feedback"],
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    mora_ok: { type: "boolean", description: "Mora count matches the target." },
    long_vowel_ok: { type: "boolean", description: "Long vowels preserved (no おばさん/おばあさん slip)." },
    gemination_ok: { type: "boolean", description: "Double consonants preserved (no きて/きって slip)." },
    feedback: {
      type: "string",
      description: "One concrete correction focused on morae/long-vowel/gemination. Under 30 words, no praise filler.",
    },
  },
};

export interface ShadowResult {
  grade: ShadowGrade;
  usd: number;
}

export async function gradeShadowing(
  env: Env,
  targetText: string,
  transcript: string,
): Promise<ShadowResult> {
  const system =
    "You grade a Japanese shadowing attempt for a Cantonese-native learner. You are given a target sentence and a transcript of the learner's spoken imitation. " +
    "Judge how faithfully the imitation reproduces the target's SOUND, focusing on the three contrasts Chinese speakers miss: mora count, long vowels, and double consonants (gemination). " +
    "The transcript comes from ASR and may normalise minor detail — only flag clear discrepancies. One concrete correction, no praise.";

  const prompt =
    `Target sentence:\n${targetText}\n\nLearner's spoken imitation (ASR transcript):\n${transcript}\n\n` +
    `Grade the imitation.`;

  const result = await generateStructured<ShadowGrade>(env, {
    model: env.GRADING_MODEL,
    system,
    prompt,
    toolName: "emit_shadow_grade",
    toolDescription: "Emit the shadowing imitation grade.",
    schema: SHADOW_SCHEMA,
    maxTokens: 512,
  });
  // Clamp + coerce: the schema's 0-100 bound (and that score is a number) is a
  // hint, not a guarantee (forced tool use); a non-finite value becomes 0.
  const grade = result.data;
  const s = Number(grade.score);
  grade.score = Number.isFinite(s) ? Math.max(0, Math.min(100, Math.round(s))) : 0;
  return { grade, usd: result.usd };
}
