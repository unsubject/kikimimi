import { useEffect, useRef, useState } from "react";
import type { KeigoNote, TalkTurn } from "@kikimimi/shared";
import { api, audioUrl, ApiError } from "../api.js";
import { useRecorder } from "../useRecorder.js";

/**
 * Conversation mode (spec §4 Talk; learning plan Sprint 4). The bot asks a
 * question about today's item (JP audio); the learner answers by voice; the bot
 * replies in graded plain Japanese with one correction and tags any keigo for
 * awareness. Listening-first: bot turns auto-play.
 */
interface Exchange {
  role: "assistant" | "user";
  text: string;
  audioKey?: string;
  correction?: string | null;
  keigo?: KeigoNote[];
}

export function Talk() {
  const [itemId, setItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRecorder();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudio = (key: string) => {
    const el = audioRef.current ?? (audioRef.current = new Audio());
    el.src = audioUrl(key);
    el.currentTime = 0;
    void el.play().catch(() => {
      /* autoplay may be blocked; the play button on the bubble still works */
    });
  };

  useEffect(() => {
    (async () => {
      try {
        const t = await api.today();
        if (!t.item) {
          setLoading(false);
          return;
        }
        setItemId(t.item.id);
        const opener = await api.talkOpener(t.item.id);
        setExchanges([{ role: "assistant", text: opener.question_jp, audioKey: opener.audio_key }]);
        playAudio(opener.audio_key);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "会話を開始できませんでした。");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          先生の質問に、日本語の声で答えてみましょう。うまく言えなくて大丈夫。
        </p>
      </div>

      {exchanges.map((ex, i) => (
        <Bubble key={i} ex={ex} onPlay={ex.audioKey ? () => playAudio(ex.audioKey!) : undefined} />
      ))}

      {error && <div className="banner stop">{error}</div>}

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
          <span className="muted" style={{ fontSize: 12 }}>敬語に気づく：</span>
          {ex.keigo.map((k, i) => (
            <span key={i} className="pill" title={`${k.type} ← ${k.plain}`}>
              {k.form}（{k.type}）
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
