import { useEffect, useRef, useState } from "react";
import type { KeigoNote, TalkTurn } from "@kikimimi/shared";
import { api, audioUrl, ApiError } from "../api.js";
import { useRecorder } from "../useRecorder.js";

/**
 * Conversation mode (spec §4 Talk; learning plan Sprint 4). The bot asks a
 * question about today's item (JP audio); the learner answers by voice; the bot
 * replies in graded plain Japanese with one correction and tags any keigo for
 * awareness. Listening-first: bot turns auto-play once started by a user tap.
 */
interface Exchange {
  role: "assistant" | "user";
  text: string;
  audioKey?: string | null; // null when TTS failed transiently → no replay button
  correction?: string | null;
  keigo?: KeigoNote[];
}

export function Talk() {
  const [itemId, setItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRecorder();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudio = (key: string | null | undefined) => {
    if (!key) return; // no audio (TTS failed) → nothing to play
    const el = audioRef.current ?? (audioRef.current = new Audio());
    el.src = audioUrl(key);
    el.currentTime = 0;
    void el.play().catch(() => {
      /* autoplay may be blocked; the play button on the bubble still works */
    });
  };

  // Fetch today's item on mount only for the item_id + no-item state; defer the
  // opener to a user tap (P12) so its autoplay isn't blocked and we don't bill an
  // opener for a tab that's opened but never used.
  useEffect(() => {
    (async () => {
      try {
        const t = await api.today();
        if (t.item) setItemId(t.item.id);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "会話を開始できませんでした。");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Kick off the conversation within a user gesture, so the opener audio auto-plays.
  const start = async () => {
    if (!itemId) return;
    setBusy(true);
    setError(null);
    try {
      const opener = await api.talkOpener(itemId);
      setStarted(true);
      setExchanges([{ role: "assistant", text: opener.question_jp, audioKey: opener.audio_key }]);
      playAudio(opener.audio_key);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "会話を開始できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const history = (): TalkTurn[] => exchanges.map((e) => ({ role: e.role, text: e.text }));

  const toggle = async () => {
    if (!itemId) return;
    if (recorder.recording) {
      const blob = await recorder.stop();
      if (!blob) return;
      setBusy(true);
      setError(null);
      try {
        const res = await api.talk(itemId, blob, history());
        setExchanges((xs) => [
          ...xs,
          { role: "user", text: res.transcript },
          {
            role: "assistant",
            text: res.reply_jp,
            audioKey: res.reply_audio_key,
            correction: res.correction,
            keigo: res.keigo_notes,
          },
        ]);
        playAudio(res.reply_audio_key);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "返信の生成に失敗しました。");
      } finally {
        setBusy(false);
      }
    } else {
      setError(null);
      await recorder.start();
    }
  };

  if (loading) return <p className="muted">読み込み中…</p>;
  if (!itemId) {
    return (
      <div className="card">
        <strong>会話</strong>
        <p className="muted">今日の項目が届いたら会話を始められます。</p>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <strong>会話</strong>
        <p className="muted" style={{ fontSize: 13 }}>
          先生の質問に、日本語の声で答えてみましょう。うまく言えなくても大丈夫。
        </p>
      </div>

      {error && <div className="banner stop">{error}</div>}

      {!started ? (
        // Gate the opener behind a tap so autoplay works and an unused tab isn't billed (P12).
        <div className="card">
          <div className="row-inline">
            <button className="primary" onClick={start} disabled={busy}>
              会話をはじめる
            </button>
          </div>
          {busy && <p className="muted">先生が質問を考えています…</p>}
        </div>
      ) : (
        <>
          {exchanges.map((ex, i) => (
            <Bubble
              key={i}
              ex={ex}
              onPlay={ex.audioKey ? () => playAudio(ex.audioKey!) : undefined}
            />
          ))}

          <div className="card">
            <div className="row-inline">
              {recorder.supported ? (
                <button className="primary" onClick={toggle} disabled={busy}>
                  {recorder.recording ? "⏹ 停止して送信" : "🎤 声で答える"}
                </button>
              ) : (
                <span className="muted">この端末は録音に対応していません。</span>
              )}
            </div>
            {recorder.recording && (
              <div className="recorder">
                <span className="rec-dot" /> 録音中…
              </div>
            )}
            {busy && <p className="muted">先生が考えています…</p>}
          </div>
        </>
      )}
    </div>
  );
}

function Bubble({ ex, onPlay }: { ex: Exchange; onPlay?: () => void }) {
  const isBot = ex.role === "assistant";
  return (
    <div
      className="card"
      style={{
        borderLeft: `3px solid ${isBot ? "var(--accent)" : "var(--accent-2)"}`,
        marginLeft: isBot ? 0 : 24,
      }}
    >
      <div className="row-inline">
        <span className="pill">{isBot ? "先生" : "あなた"}</span>
        {onPlay && (
          <button onClick={onPlay} aria-label="再生" style={{ padding: "2px 10px" }}>
            ▶
          </button>
        )}
      </div>
      <p className="jp-body" style={{ fontSize: 18, lineHeight: 1.9 }}>
        {ex.text}
      </p>
      {ex.correction && (
        <div className="grade" style={{ marginTop: 6 }}>
          <span className="muted" style={{ fontSize: 12 }}>なおし：</span> {ex.correction}
        </div>
      )}
      {ex.keigo && ex.keigo.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>敬語に注目：</span>
          {ex.keigo.map((k, i) => (
            <span key={i} className="pill" title={`${k.form} → ${k.plain}`}>
              {k.form}（{k.type}）
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
