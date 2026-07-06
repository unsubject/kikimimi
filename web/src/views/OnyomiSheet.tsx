import { useEffect, useState } from "react";
import type { OnyomiRule } from "@kikimimi/shared";
import { api, ApiError } from "../api.js";
import { useTts } from "../useTts.js";

/**
 * The Cantonese→on'yomi cheat sheet (Sprint 3 deliverable). Also seeds the
 * correspondence pack into the SRS deck so the characters get reviewed.
 */
export function OnyomiSheet() {
  const [rules, setRules] = useState<OnyomiRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seedMsg, setSeedMsg] = useState<string>("");
  // Listening-first: each example must be *heard*, not just read (spec anti-bypass).
  const { play, loading: ttsLoading, error: ttsError } = useTts();

  useEffect(() => {
    api
      .onyomi()
      .then((r) => setRules(r.rules))
      .catch((e) => setError(e instanceof ApiError ? e.message : "読み込み失敗"))
      .finally(() => setLoading(false));
  }, []);

  const seed = async () => {
    setSeedMsg("追加中…");
    try {
      const { added } = await api.seedOnyomi();
      setSeedMsg(added > 0 ? `${added} 枚を復習デッキに追加しました。` : "すでに追加済みです。");
    } catch {
      setSeedMsg("追加に失敗しました。");
    }
  };

  if (loading) return <p className="muted">読み込み中…</p>;
  if (error) return <div className="banner stop">{error}</div>;

  return (
    <div>
      <div className="card">
        <strong>広東語 → 音読み 対応表</strong>
        <p className="muted" style={{ fontSize: 13 }}>
          広東語は中古音の入声・鼻音をよく保存しているので、音読みとの対応が規則的です。
          あなたが見て分かる漢字を「聞いて分かる」語へ変換する加速装置。
        </p>
        <button className="primary" onClick={seed}>
          このパックを復習デッキに追加
        </button>
        {seedMsg && <p className="muted">{seedMsg}</p>}
        {ttsError && <p className="muted">{ttsError}</p>}
      </div>

      {rules.map((rule) => (
        <div className="card" key={rule.id}>
          <div className="row-inline">
            <span className="pill">{rule.cantoneseFinal}</span>
            <span style={{ fontSize: 18 }}>→ {rule.japanesePattern}</span>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {rule.note}
          </p>
          <div className="vocab">
            {rule.examples.map((ex) => (
              <div className="row" key={ex.hanzi}>
                <div className="w" style={{ fontSize: 22 }}>
                  {ex.hanzi}
                  <span className="r"> {ex.cantonese}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => play(ex.kana)}
                    disabled={ttsLoading === ex.kana}
                    aria-label={`${ex.kana} を再生`}
                    style={{ padding: "4px 10px" }}
                  >
                    {ttsLoading === ex.kana ? "…" : "▶"}
                  </button>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18 }}>{ex.kana}</div>
                    <div className="r">{ex.romaji}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
