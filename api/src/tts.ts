import type { Env } from "./env.js";
import type { TtsVoice } from "@kikimimi/shared";

/** OpenAI tts-1 rejects input longer than 4096 characters — hard cap here so
 * no caller (e.g. a long daily-drop script) trips a 400 and silently loses audio. */
export const TTS_INPUT_LIMIT = 4096;

/**
 * OpenAI tts-1 → MP3 bytes. Voice is the user's Sprint-1 pick
 * (nova / shimmer / coral). Returns raw audio to be stored in R2.
 */
export async function synthesize(
  env: Env,
  text: string,
  voice: TtsVoice,
): Promise<ArrayBuffer> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "tts-1",
      voice,
      input: text.slice(0, TTS_INPUT_LIMIT),
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.arrayBuffer();
}
