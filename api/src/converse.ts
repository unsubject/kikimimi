import type { Env } from "./env.js";
import type { KeigoNote, TalkTurn } from "@kikimimi/shared";
import { generateStructured, type JsonSchema } from "./anthropic.js";

/**
 * Conversation mode (spec §4 Talk; learning plan Sprint 4). The bot asks a
 * question about the day's item; the learner answers by voice; the bot replies
 * in graded, plain Japanese with ONE targeted correction, and tags any 尊敬語/
 * 謙譲語 present for awareness — "recognize 敬語, don't produce it yet" (§5).
 *
 * The exchange is generative, so this uses the generation model. History is
 * held client-side and passed back in, keeping the server stateless per turn.
 */

// Server-only reply shape (adds error-log fields not sent to the client).
export interface ConversationReply {
  reply_jp: string; // the bot's next turn, plain spoken Japanese
  correction: string | null; // one targeted correction of the learner's Japanese, or null if clean
  keigo_notes: KeigoNote[]; // keigo recognised in the exchange (awareness only)
  error_category: string | null; // for the error log (particle | conjugation | vocab | …) or null
  error_detail: string | null;
}

const REPLY_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply_jp", "correction", "keigo_notes", "error_category", "error_detail"],
  properties: {
    reply_jp: {
      type: "string",
      description:
        "Your next conversational turn in plain, spoken Japanese at the learner's level. Keep it short (1-2 sentences) and end with a question to keep the conversation going.",
    },
    correction: {
      type: ["string", "null"],
      description:
        "One targeted correction of the learner's most recent Japanese, phrased kindly and concretely, or null if it was fine. Under 30 words.",
    },
    keigo_notes: {
      type: "array",
      description:
        "Tag only 尊敬語/謙譲語 (honorific/humble) forms ACTUALLY PRESENT in the learner's utterance — do NOT tag です/ます, which the learner already uses correctly; empty if none.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["form", "type", "plain"],
        properties: {
          form: { type: "string" },
          type: { type: "string", enum: ["尊敬", "謙譲"] },
          plain: { type: "string", description: "The plain-form equivalent." },
        },
      },
    },
    error_category: {
      type: ["string", "null"],
      description: "The single most important error type in the learner's turn, or null if clean.",
    },
    error_detail: {
      type: ["string", "null"],
      description: "A short note for the recurring-error log, or null.",
    },
  },
};

export interface OpenerResult {
  question_jp: string;
  usd: number;
}

const OPENER_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question_jp"],
  properties: {
    question_jp: {
      type: "string",
      description:
        "A single friendly opening question in plain spoken Japanese about the item, at the learner's level. One sentence.",
    },
  },
};

// §4 feedback-tone guard: direct/concrete, zero cheerleading, ONE correction/turn.
// Speak plain です/ます — not casual 常体, not keigo (the learner isn't producing keigo yet).
const CONVERSATION_SYSTEM =
  "You are a patient Japanese conversation partner for an advanced-beginner learner (native Cantonese/Chinese speaker). " +
  "Speak plain, functional です/ます-level Japanese at their level (NOT casual 常体, NOT keigo) — simple sentences, common words. This is listening-first practice: your turns will be read aloud by TTS. " +
  "Be direct and concrete, with zero cheerleading filler — no praise like 上手ですね, only natural 相槌. " +
  "Give at most ONE correction per turn, concrete and specific; if their Japanese was fine, give none. " +
  "Recognise and tag any 尊敬語/謙譲語 for their awareness, but keep your own speech plain です/ます. Always end your reply with a question.";

/** The bot's opening question about today's item. */
export async function conversationOpener(
  env: Env,
  item: { title_jp: string; script_jp: string },
): Promise<OpenerResult> {
  const result = await generateStructured<{ question_jp: string }>(env, {
    model: env.GENERATION_MODEL,
    system: CONVERSATION_SYSTEM,
    prompt:
      `Today's item:\n「${item.title_jp}」\n${item.script_jp}\n\n` +
      `Ask the learner one friendly opening question about it, in plain spoken Japanese.`,
    toolName: "emit_opener",
    toolDescription: "Emit the opening conversation question.",
    schema: OPENER_SCHEMA,
    maxTokens: 256,
  });
  return { question_jp: result.data.question_jp, usd: result.usd };
}

export interface TurnResult {
  reply: ConversationReply;
  usd: number;
}

/** One conversation turn: reply to the learner + correct + tag keigo. */
export async function conversationTurn(
  env: Env,
  item: { title_jp: string; script_jp: string },
  history: TalkTurn[],
  userText: string,
): Promise<TurnResult> {
  const transcript = history
    .map((t) => `${t.role === "assistant" ? "先生" : "学習者"}: ${t.text}`)
    .join("\n");

  const prompt =
    `Today's item (the conversation topic):\n「${item.title_jp}」\n${item.script_jp}\n\n` +
    (transcript ? `Conversation so far:\n${transcript}\n\n` : "") +
    `The learner just said:\n${userText}\n\n` +
    `Reply in plain Japanese, give at most one correction, and tag any keigo.`;

  const result = await generateStructured<ConversationReply>(env, {
    model: env.GENERATION_MODEL,
    system: CONVERSATION_SYSTEM,
    prompt,
    toolName: "emit_reply",
    toolDescription: "Emit the conversational reply, correction, and keigo tags.",
    schema: REPLY_SCHEMA,
    maxTokens: 1024,
  });
  return { reply: result.data, usd: result.usd };
}
