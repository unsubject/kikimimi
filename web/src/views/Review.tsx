import { useEffect, useState } from "react";
import type { ReviewCard, SrsRating } from "@kikimimi/shared";
import { api, ApiError } from "../api.js";
import { useTts } from "../useTts.js";

/**
 * FSRS review surface (spec §5). Listening-first intent: the front shows the
 * Japanese; the reading + Chinese meaning stay hidden until "見せる", so recall
 * is tested before the gloss appears (anti-bypass, same principle as Today).
 */
const RATINGS: { rating: SrsRating; label: string; cls: string }[] = [
  { rating: 1, label: "もう一度", cls: "again" },
  { rating: 2, label: "むずかしい", cls: "hard" },
  { rating: 3, label: "できた", cls: "good" },
  { rating: 4, label: "かんたん", cls: "easy" },
];

export function Review() {
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [cap, setCap] = useState(20);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  // On'yomi cards are about the *reading* — let the learner hear it (listening-first).
  const { play, loading: ttsLoading } = useTts();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = await api.review();
      setCards(q.cards);
      setCap(q.cap);
      setIdx(0);
      setRevealed(false);
      setDone(0);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const current = cards[idx];

  const grade = async (rating: SrsRating) => {
    if (!current) return;
    try {
      await api.gradeCard(current.id, rating);
    } catch {
      /* keep going even if one grade fails to persist */
    }
    setDone((n) => n + 1);
    if (idx + 1 < cards.length) {
      setIdx((i) => i + 1);
      setRevealed(false);
    } else {
      setIdx(cards.length); // finished
    }
  };

  if (loading) return <p className="muted">読み込み中…</p>;
  if (error) return <div className="banner stop">{error}</div>;

  if (cards.length === 0) {
    return (
      <div className="card">
        <strong>復習</strong>
        <p className="muted">今日の復習カードはありません。新しい項目から語彙が追加されます。</p>
      </div>
    );
  }

  if (idx >= cards.length) {
    return (
      <div className="card drill-card">
        <div style={{ fontSize: 48 }}>✓</div>
        <p>{done} 枚を復習しました（上限 {cap}）。</p>
        <button className="primary" onClick={load}>
          もう一度確認
        </button>
      </div>
    );
  }

  const front = renderFront(current!);
  const back = renderBack(current!);

  return (
    <div>
      <div className="row-inline">
        <span className="muted">
          {idx + 1} / {cards.length}
        </span>
        {current!.is_new && <span className="pill">新規</span>}
        {current!.jlpt_level && <span className="pill">{current!.jlpt_level}</span>}
      </div>

      <div className="card drill-card">
        <div className="drill-kana" style={{ fontSize: front.length > 6 ? 40 : 72 }}>
          {front}
        </div>

        {!revealed ? (
          <button className="primary" onClick={() => setRevealed(true)}>
            見せる
          </button>
        ) : (
          <>
            <div className="zh" style={{ fontSize: 18, margin: "10px 0" }}>
              {back}
              {current!.type === "onyomi" && current!.back.kana != null && (
                <button
                  onClick={() => play(String(current!.back.kana))}
                  disabled={ttsLoading === String(current!.back.kana)}
                  aria-label="音読みを再生"
                  style={{ marginLeft: 10, padding: "4px 10px" }}
                >
                  {ttsLoading === String(current!.back.kana) ? "…" : "▶"}
                </button>
              )}
            </div>
            <div className="drill-choices">
              {RATINGS.map((r) => (
                <button key={r.rating} className={`rate-${r.cls}`} onClick={() => grade(r.rating)}>
                  {r.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function renderFront(card: ReviewCard): string {
  if (card.type === "vocab") return String(card.front.word ?? "");
  if (card.type === "onyomi") return String(card.front.hanzi ?? "");
  return String(card.front.prompt ?? "この項目を思い出してください");
}

function renderBack(card: ReviewCard): string {
  if (card.type === "vocab") {
    const reading = card.back.reading ? `${card.back.reading}` : "";
    const meaning = card.back.meaning_zh ? ` — ${card.back.meaning_zh}` : "";
    return `${reading}${meaning}`;
  }
  if (card.type === "onyomi") {
    // hanzi (Cantonese) → on'yomi kana + which correspondence rule
    const canton = card.front.cantonese ? `${card.front.cantonese} → ` : "";
    const kana = card.back.kana ? String(card.back.kana) : "";
    const pattern = card.back.pattern ? ` （${card.back.pattern}）` : "";
    return `${canton}${kana}${pattern}`;
  }
  return String(card.back.note ?? "");
}
