import type { Env } from "./env.js";

/**
 * OpenAI Whisper (whisper-1) transcription for voice explain-backs (spec §4,
 * §10 cost table). Language hint `ja`. Cost is ~$0.006/min; we log a flat
 * estimate per note since we don't know duration server-side without decoding.
 */
export interface TranscriptionResult {
  text: string;
}

export async function transcribe(env: Env, audio: ArrayBuffer, mime: string): Promise<TranscriptionResult> {
  const form = new FormData();
  const ext = mime.includes("webm") ? "webm" : mime.includes("mp4") ? "mp4" : "ogg";
  form.append("file", new Blob([audio], { type: mime }), `voice.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", "ja");
  form.append("response_format", "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`OpenAI Whisper ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as { text?: string };
  return { text: json.text ?? "" };
}

/** Flat Whisper cost estimate per voice note (spec §10: ~$0.05 with grade). */
export const WHISPER_FLAT_USD = 0.006;
