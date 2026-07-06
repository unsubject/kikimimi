import { useMemo, useState } from "react";
import { KANA, choicesFor, shuffle, type Kana, type KanaSet } from "../drills/kana.js";

/**
 * Kana automaticity drill (Sprint 1). Runs fully client-side so it works in
 * the cost-degraded / offline modes (spec §10). Recognition target: sub-1s.
 */
export function Drills() {
  const [set, setSet] = useState<KanaSet>("hiragana");
  const [queue, setQueue] = useState<Kana[]>(() => shuffle(KANA));
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [seen, setSeen] = useState(0);

  const current = queue[idx];
  const choices = useMemo(() => (current ? choicesFor(current) : []), [current]);

  const restart = (nextSet: KanaSet = set) => {
    setSet(nextSet);
    setQueue(shuffle(KANA));
    setIdx(0);
    setPicked(null);
    setCorrect(0);
    setSeen(0);
  };

  const pick = (choice: string) => {
    if (picked || !current) return;
    setPicked(choice);
    setSeen((n) => n + 1);
    if (choice === current.romaji) setCorrect((n) => n + 1);
  };

  const next = () => {
    setPicked(null);
    setIdx((i) => (i + 1) % queue.length);
  };

  if (!current) return null;
  const glyph = set === "hiragana" ? current.hira : current.kata;

  return (
    <div>
      <div className="row-inline" style={{ marginTop: 8 }}>
        <button className={set === "hiragana" ? "primary" : ""} onClick={() => restart("hiragana")}>
          ひらがな
        </button>
        <button className={set === "katakana" ? "primary" : ""} onClick={() => restart("katakana")}>
          カタカナ
        </button>
        <span className="muted" style={{ marginLeft: "auto" }}>
          {correct}/{seen} 正解
        </span>
      </div>

      <div className="card drill-card">
        <div className="drill-kana">{glyph}</div>
        {picked && (
          <div className="drill-answer">
            {current.romaji} {picked === current.romaji ? "✓" : "✗"}
          </div>
        )}
        <div className="drill-choices">
          {choices.map((c) => {
            const cls =
              picked == null
                ? ""
                : c === current.romaji
                  ? "correct"
                  : c === picked
                    ? "wrong"
                    : "";
            return (
              <button key={c} className={cls} onClick={() => pick(c)}>
                {c}
              </button>
            );
          })}
        </div>
        {picked && (
          <button className="primary" style={{ marginTop: 14 }} onClick={next}>
            次へ →
          </button>
        )}
      </div>

      <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>
        目標：1秒以内で認識。これはあなたが作った楽器の較正です。
      </p>
    </div>
  );
}
