import { useEffect, useState } from "react";
import type { ShadowGrade } from "@kikimimi/shared";
import { api, audioUrl, ApiError } from "../api.js";
import { useRecorder } from "../useRecorder.js";
import { Player } from "../components/Player.js";

/**
 * Shadowing drill (spec §4; learning plan Sprint 3). Play a single sentence
 * from today's item, repeat it, and get feedback on the three contrasts Chinese
 * speakers miss: morae, long vowels, gemination. Falls back to a built-in set
 * when there's no item yet.
 *
 * Listening-first: we synthesize audio for THE ONE sentence being graded (via
 * /tts, cached in R2) rather than replaying the whole multi-sentence podcast —
 * grading a split sentence against the full-item audio was the old bug. The
 * sentence TEXT stays hidden behind a reveal so the learner shadows BY EAR
 * first (kanji otherwise lets you fake-read while phonology stays at zero).
 */
const FALLBACK_SENTENCES = [
  "きょうは いい てんきです。",
  "おばあさんは とても げんきです。",
  "きっては つくえの うえに あります。",
  "がっこうまで あるいて いきます。",
];

export function Shadow() {
  // Start empty (not with the fallback) so we don't synthesize a fallback
  // sentence on mount only to immediately replace it once today's item loads.
  const [sentences, setSentences] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [sentenceKey, setSentenceKey] = useState<string | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [grade, setGrade] = useState<ShadowGrade | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRecorder();

  useEffect(() => {
    api
      .today()
      .then((t) => {
        const parts = t.item
          ? t.item.script_jp
              .split(/(?<=。)/)
              .map((s) => s.trim())
              .filter((s) => s.length > 1)
          : [];
        setSentences(parts.length ? parts : FALLBACK_SENTENCES);
      })
      .catch(() => {
        setSentences(FALLBACK_SENTENCES);
      });
  }, []);

  const target = sentences[idx] ?? "";

  // Fetch per-sentence audio whenever the target changes. Hide the text until
  // the learner opts in, so the first pass is ear-only.
  useEffect(() => {
    let cancelled = false;
    setSentenceKey(null);
    setTtsError(null);
    setRevealed(false);
    if (!target) return;
    setTtsLoading(true);
    api
      .tts(target)
      .then((r) => {
        if (!cancelled) setSentenceKey(r.key);
      })
      .catch((e) => {
        if (!cancelled) {
          setTtsError(
            e instanceof ApiError && e.message === "cost_limited"
              ? "本日は音声生成の上限に達しました。文を見て練習できます。"
              : "音声を生成できませんでした。文を見て練習できます。",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTtsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

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
          まず耳だけで真似しましょう。モーラ・長音・促音に注目。文はあとで確認できます。
        </p>
        {sentences.length === 0 && <p className="muted">読み込み中…</p>}
        {ttsLoading && <p className="muted">音声を準備中…</p>}
        {!ttsLoading && sentenceKey && <Player src={audioUrl(sentenceKey)} />}
        {!ttsLoading && !sentenceKey && ttsError && (
          <p className="muted">{ttsError}</p>
        )}

        {revealed ? (
          <p className="jp-body" style={{ fontSize: 22 }}>
            {target}
          </p>
        ) : (
          <button onClick={() => setRevealed(true)} style={{ marginTop: 8 }}>
            文を見る
          </button>
        )}

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
