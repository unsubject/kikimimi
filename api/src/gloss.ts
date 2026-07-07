import type { Env } from "./env.js";
import { generateStructured, type JsonSchema } from "./anthropic.js";

/**
 * Word-tap gloss for the Library long-read surface (spec §5; learning plan
 * Sprint 5 — "Dictionary workflow: Yomitan pop-up dictionary"). Given a
 * Japanese word (and its sentence for disambiguation), return its reading and
 * a concise Chinese gloss. Graded (Haiku) structured output; the caller caches
 * the result so repeat taps are free.
 */
export interface Gloss {
  word: string;
  reading: string; // kana reading
  meaning_zh: string; // concise Chinese gloss
  jlpt: "N5" | "N4" | "N3" | "N2" | "N1";
}

const GLOSS_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["word", "reading", "meaning_zh", "jlpt"],
  properties: {
    word: { type: "string", description: "The dictionary (lemma) form of the word." },
    reading: {
      type: "string",
      description:
        "Kana reading of the returned dictionary form (word), so word/reading form a consistent saved-card pair.",
    },
    meaning_zh: {
      type: "string",
      description: "Concise gloss in Traditional Chinese (繁體中文, never Simplified) — a few words.",
    },
    jlpt: { type: "string", enum: ["N5", "N4", "N3", "N2", "N1"] },
  },
};

export interface GlossResult {
  gloss: Gloss;
  usd: number;
}

export async function glossWord(
  env: Env,
  word: string,
  context: string,
): Promise<GlossResult> {
  const system =
    "You are a Japanese→Chinese pop-up dictionary for a Cantonese-native learner. " +
    "Given a word tapped in a sentence, return its dictionary form, reading, a concise gloss in Traditional Chinese (繁體中文, never Simplified), and JLPT level. Disambiguate by the sentence.";

  const prompt =
    `Sentence:\n${context}\n\nTapped word: ${word}\n\nGloss it.`;

  const result = await generateStructured<Gloss>(env, {
    model: env.GRADING_MODEL,
    system,
    prompt,
    toolName: "emit_gloss",
    toolDescription: "Emit the word gloss.",
    schema: GLOSS_SCHEMA,
    maxTokens: 256,
  });
  return { gloss: result.data, usd: result.usd };
}
