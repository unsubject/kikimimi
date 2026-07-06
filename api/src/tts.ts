import type { Env } from "./env.js";
import type { TtsVoice } from "@kikimimi/shared";

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
      input: text,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.arrayBuffer();
}
