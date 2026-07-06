import { useEffect, useState } from "react";
import type { Item, ScaffoldStage, CostSummary } from "@kikimimi/shared";
import { api, audioUrl, ApiError } from "../api.js";
import { Player } from "../components/Player.js";
import { RubyBody, stageLabel } from "../components/Ruby.js";
import { useRecorder } from "../useRecorder.js";

interface GradeState {
  score: number;
  feedback: string;
  missed_points: string[];
  transition: { action: string; toStage: number } | null;
}

export function Today() {
  const [item, setItem] = useState<Item | null>(null);
  const [stage, setStage] = useState<ScaffoldStage>(1);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-item UI state
  const [furiOff, setFuriOff] = useState(false);
  const [textRevealed, setTextRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState<GradeState | null>(null);
  const [bursting, setBursting] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const recorder = useRecorder();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await api.today();
      setItem(t.item);
      setStage(t.stage);
      setCost(t.cost);
      setTextRevealed(t.stage !== 3); // S3 hides text by default
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submitExplainBack = async () => {
    if (!item || !answer.trim()) return;
    setGrading(true);
    setGrade(null);
    try {
      const res = await api.explainBack(item.id, answer);
      setGrade({ ...res.grade, transition: res.transition });
      setCost(res.cost);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "採点に失敗しました。");
    } finally {
      setGrading(false);
    }
  };

  const more = async () => {
    setBursting(true);
    setError(null);
    try {
      const res = await api.more();
      resetItemState();
      setItem(res.item);
      setStage(1);
      setTextRevealed(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "追加取得に失敗しました。");
    } finally {
      setBursting(false);
    }
  };

  const toggleRecording = async () => {
    if (!item) return;
    if (recorder.recording) {
      const blob = await recorder.stop();
      if (!blob) return;
      setGrading(true);
      setGrade(null);
      setTranscript(null);
      try {
        const res = await api.explainBackVoice(item.id, blob);
        setTranscript(res.transcript);
        setGrade({ ...res.grade, transition: res.transition });
        setCost(res.cost);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "音声採点に失敗しました。");
      } finally {
        setGrading(false);
      }
    } else {
      setError(null);
      await recorder.start();
    }
  };

  const resetItemState = () => {
    setAnswer("");
    setGrade(null);
    setTranscript(null);
    setFuriOff(false);
  };

  if (loading) return <p className="muted">読み込み中…</p>;

  return (
    <div>
      {cost && <CostBanner cost={cost} onReset={load} />}
      {error && <div className="banner stop">{error}</div>}

      {!item ? (
        <div className="card">
          <p>今日の一本はまだ届いていません。</p>
          <button className="primary" onClick={more} disabled={bursting}>
            {bursting ? "生成中…" : "今すぐ一本つくる"}
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <div>
              <span className="pill">{stageLabel(stage)}</span>
              <span className="pill">{item.source}</span>
              <span className="pill">Lv.{item.level}</span>
            </div>
            <h2 style={{ margin: "10px 0 6px" }}>
              {stage === 3 && !textRevealed ? "🎧 —" : item.title_jp}
            </h2>

            <Player src={item.audio_r2_key ? audioUrl(item.audio_r2_key) : null} />

            {/* Text: hidden at S3 until revealed */}
            {stage === 3 && !textRevealed ? (
              <button style={{ marginTop: 12 }} onClick={() => setTextRevealed(true)}>
                本文を表示（S3）
              </button>
            ) : (
              <>
                <div className="row-inline" style={{ marginTop: 10 }}>
                  <button onClick={() => setFuriOff((v) => !v)}>
                    {furiOff ? "ふりがな表示" : "ふりがな非表示"}
                  </button>
                </div>
                <RubyBody segments={item.furigana} furiOff={furiOff} />

                {/* Anti-bypass: Chinese gist only via tap-to-reveal */}
                <details className="zh-reveal">
                  <summary>中文でヒントを見る（tap-to-reveal）</summary>
                  <div className="zh">{item.gist_zh}</div>
                </details>
              </>
            )}
          </div>

          {/* Key vocab — meanings behind tap-reveal too */}
          {item.vocab.length > 0 && (
            <div className="card">
              <strong>語彙</strong>
              <div className="vocab">
                {item.vocab.map((v, i) => (
                  <div className="row" key={i}>
                    <div>
                      <div className="w">{v.word}</div>
                      <div className="r">
                        {v.reading} · {v.jlpt}
                      </div>
                    </div>
                    <details className="zh-reveal">
                      <summary>意味</summary>
                      <div className="zh">{v.meaning_zh}</div>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Explain-back — the teach-to-learn core */}
          <div className="card">
            <strong>説明してみよう（explain-back）</strong>
            <p className="muted" style={{ fontSize: 14 }}>
              {item.explain_back_prompt || "この項目を日本語で説明してください。"}
            </p>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="日本語で説明を書いてください…"
            />
            <div className="row-inline" style={{ marginTop: 10 }}>
              <button
                className="primary"
                onClick={submitExplainBack}
                disabled={grading || !answer.trim() || cost?.degraded}
              >
                {grading ? "採点中…" : "テキストで採点"}
              </button>
              {recorder.supported && (
                <button onClick={toggleRecording} disabled={grading || cost?.degraded}>
                  {recorder.recording ? "⏹ 録音停止して採点" : "🎤 声で説明"}
                </button>
              )}
            </div>
            {recorder.recording && (
              <div className="recorder">
                <span className="rec-dot" /> 録音中…
              </div>
            )}
            {recorder.error && <p className="muted" style={{ fontSize: 13 }}>{recorder.error}</p>}
            {cost?.degraded && (
              <p className="muted" style={{ fontSize: 13 }}>
                本日のコスト上限に達したため、採点は深夜まで停止しています。
              </p>
            )}

            {transcript && (
              <div className="transcript">
                <span className="muted" style={{ fontSize: 12 }}>文字起こし：</span> {transcript}
              </div>
            )}
            {grade && <GradeView grade={grade} />}
          </div>

          {/* Comprehension probes */}
          {item.probes.length > 0 && (
            <div className="card">
              <strong>確認クイズ</strong>
              <ul>
                {item.probes.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Burst mode */}
          <button onClick={more} disabled={bursting || cost?.degraded}>
            {bursting ? "生成中…" : "＋ もう一本（More）"}
          </button>
        </>
      )}
    </div>
  );
}

function GradeView({ grade }: { grade: GradeState }) {
  return (
    <div className="grade">
      <div className="score">{grade.score}</div>
      <p>{grade.feedback}</p>
      {grade.missed_points.length > 0 && (
        <ul className="muted" style={{ fontSize: 14 }}>
          {grade.missed_points.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      {grade.transition && grade.transition.action !== "hold" && (
        <div className="card graduation" style={{ marginTop: 10 }}>
          {grade.transition.action === "graduate" ? (
            <>🎉 スキャフォールドが Stage {grade.transition.toStage} に昇格しました。中国語レイヤーが一段はずれます。</>
          ) : (
            <>Stage {grade.transition.toStage} に一段戻しました。焦らずいきましょう。</>
          )}
        </div>
      )}
    </div>
  );
}

function CostBanner({ cost, onReset }: { cost: CostSummary; onReset: () => void }) {
  if (cost.monthly_breaker) {
    return (
      <div className="banner stop">
        今月のコストが $45 の上限に達しました（${cost.month_usd.toFixed(2)}）。
        <button style={{ marginLeft: 8 }} onClick={() => void api.reset().then(onReset)}>
          /reset を確認
        </button>
      </div>
    );
  }
  if (cost.degraded) {
    return (
      <div className="banner stop">
        本日 ${cost.today_usd.toFixed(2)}：上限に達し、深夜まで省コストモード（復習・かな練習は無料で継続）。
      </div>
    );
  }
  if (cost.soft_warn) {
    return <div className="banner warn">本日 ${cost.today_usd.toFixed(2)}：$1.50 を超えました。</div>;
  }
  return null;
}
