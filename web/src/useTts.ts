import { useCallback, useRef, useState } from "react";
import { api, audioUrl, ApiError } from "./api.js";

/**
 * Shared on-demand TTS for the small ▶ "hear it" buttons (on'yomi rows, review
 * cards): text → cached R2 key → bare HTMLAudioElement playback. Keys are
 * memoised for the session so replaying a line is free (mirrors the server-side
 * R2 content cache). Deliberately no <Player> chrome — these are one-tap.
 *
 * `loading` holds the text currently being synthesized so a button can show a
 * pending state; `error` surfaces cost-limited / failure notes.
 */
export function useTts() {
  const cache = useRef(new Map<string, string>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const play = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) return;
    setError(null);
    try {
      let key = cache.current.get(t);
      if (!key) {
        setLoading(t);
        ({ key } = await api.tts(t));
        cache.current.set(t, key);
      }
      const el = audioRef.current ?? (audioRef.current = new Audio());
      el.src = audioUrl(key);
      el.currentTime = 0;
      await el.play();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "音声の再生に失敗しました。");
    } finally {
      setLoading(null);
    }
  }, []);

  return { play, loading, error };
}
