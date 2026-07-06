import { useEffect, useState } from "react";
import type { ShadowGrade } from "@kikimimi/shared";
import { api, audioUrl, ApiError } from "../api.js";
import { useRecorder } from "../useRecorder.js";
import { Player } from "../components/Player.js";

/**
 * Shadowing drill (spec §4; learning plan Sprint 3). Play a sentence from
 * today's item, repeat it, and get feedback on the three contrasts Chinese
 * speakers miss: morae, long vowels, gemination. Falls back to a built-in set
 * when there's no item yet.
 */
const FALLBACK_SENTENCES = [
  "きょうは いい てんきです。",
  "おばあさんは とても げんきです。",
  "きっては つくえの うえに あります。",
  "がっこうまで あるいて いきます。",
];

export function Shadow() {
  const [sentences, setSentences] = useState<string[]>(FALLBACK_SENTENCES);
  const [audioKey, setAudioKey] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [grade, setGrade] = useState<ShadowGrade | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRecorder();

  useEffect(() => {
    api
      .today()
      .then((t) => {
        if (t.item) {
          const parts = t.item.script_jp
            .split(/(?<=。)/)
            .map((s) => s.trim())
            .filter((s) => s.length > 1);
          if (parts.length) setSentences(parts);
          setAudioKey(t.item.audio_r2_key);
        }
      })
      .catch(() => {
        /* keep fallback sentences */
      });
  }, []);

  const target = sentences[idx] ?? "";

  const toggle = async () => {
    if (recorder.recording) {
      const blob = await recorder.stop();
      if (!blob) return;
      setBusy(true);
      setGrade(null);
      setTranscript(null);
      setError(null);
      try {
        const res = await api.shadow(target, blob);
        setGrade(res.grade);
        setTranscript(res.transcript);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "採点に失敗しました。");
      } finally {
        setBusy(false);
      }
    } else {
      setError(null);
      await recorder.start();
    }
  };

  const next = () => {
    setIdx((i) => (i + 1) % sentences.length);
    setGrade(null);
    setTranscript(null);
  };

  return (
    <div>
      <div className="card">
        <strong>シャドーイング</strong>
        <p className="muted" style={{ fontSize: 13 }}>
          お手本を聞いて、そのまま真似して話します。モーラ・長音・促音に注目。
        </p>
        {audioKey && <Player src={audioUrl(audioKey)} />}
        <p className="jp-body" style={{ fontSize: 22 }}>
          {target}
        </p>

        <div className="row-inline">
          {recorder.supported ? (
            <button className="primary" onClick={toggle} disabled={busy}>
              {recorder.recording ? "⏹ 停止して採点" : "🎤 真似して録音"}
            </button>
          ) : (
            <span className="muted">この端末は録音に対応していません。</span>
          )}
          <button onClick={next} disabled={busy}>
            次の文 →
          </button>
        </div>
        {recorder.recording && (
          <div className="recorder">
            <span className="rec-dot" /> 録音中…
          </div>
        )}
        {busy && <p className="muted">採点中…</p>}
        {error && <div className="banner stop">{error}</div>}
      </div>

      {grade && (
        <div className="card">
          <div className="grade">
            <div className="score">{grade.score}</div>
            <div className="row-inline" style={{ gap: 14, margin: "6px 0" }}>
              <Flag ok={grade.mora_ok} label="モーラ" />
              <Flag ok={grade.long_vowel_ok} label="長音" />
              <Flag ok={grade.gemination_ok} label="促音" />
            </div>
            <p>{grade.feedback}</p>
            {transcript && (
              <div className="transcript">
                <span className="muted" style={{ fontSize: 12 }}>認識：</span> {transcript}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="pill" style={{ color: ok ? "var(--accent-2)" : "var(--danger)" }}>
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}
