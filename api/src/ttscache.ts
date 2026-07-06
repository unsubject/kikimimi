import type { Env } from "./env.js";
import type { Sql } from "./db.js";
import type { TtsVoice } from "@kikimimi/shared";
import { synthesize } from "./tts.js";
import { logCost, ttsCostUsd } from "./cost.js";

/** SHA-256 → lowercase hex, for content-addressing cached TTS in R2. */
export async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const TTS_MAX_CHARS = 400;

/**
 * Synthesize `text` to speech, content-addressed by (voice, text) in R2 so the
 * same line is generated at most once. Returns the R2 key. Shared by the
 * `/tts` endpoint (short lines: on'yomi, shadow sentences) and conversation
 * replies (§4 Talk). The caller is responsible for the cost-governor gate;
 * this only logs the TTS cost on a cache miss.
 */
export async function synthCached(
  env: Env,
  sql: Sql,
  tz: string,
  text: string,
  voice: TtsVoice,
): Promise<string> {
  const key = `tts/${await sha256hex(`${voice}:${text}`)}.mp3`;
  if (await env.AUDIO.head(key)) return key; // cache hit — no synthesis, no cost
  const audio = await synthesize(env, text, voice);
  await env.AUDIO.put(key, audio, { httpMetadata: { contentType: "audio/mpeg" } });
  await logCost(sql, tz, "tts", ttsCostUsd(text.length));
  return key;
}

/** Read the single-user TTS voice preference. */
export async function currentVoice(sql: Sql): Promise<TtsVoice> {
  const [s] = await sql`select tts_voice from user_settings where id = 1`;
  return (String(s?.tts_voice ?? "nova") as TtsVoice) ?? "nova";
}
