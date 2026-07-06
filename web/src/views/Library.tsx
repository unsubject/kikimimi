import { useEffect, useState } from "react";
import type { Item, FuriganaSegment, Gloss } from "@kikimimi/shared";
import { api, audioUrl, ApiError } from "../api.js";
import { Player } from "../components/Player.js";

/**
 * Library (spec §5; learning plan Sprint 5). Past items become long reads: the
 * full text with a furigana toggle, tap-any-word pop-up gloss (Yomitan-style),
 * and add-to-SRS from the gloss — the bridge from graded listening to real
 * reading.
 */
export function Library() {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .items()
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : "読み込み失敗"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">読み込み中…</p>;
  if (error) return <div className="banner stop">{error}</div>;
  if (open) return <LongRead item={open} onBack={() => setOpen(null)} />;

  return (
    <div>
      <div className="card">
        <strong>文庫</strong>
        <p className="muted" style={{ fontSize: 13 }}>
          これまでの項目。タップして精読モードへ。言葉をタップすると意味が出ます。
        </p>
      </div>
      {items.length === 0 && <p className="muted">まだ項目がありません。</p>}
      {items.map((it) => (
        <button
          key={it.id}
          className="card"
          style={{ display: "block", width: "100%", textAlign: "left" }}
          onClick={() => setOpen(it)}
        >
          <div>
            <span className="pill">{it.source}</span>
            <span className="pill">Lv.{it.level}</span>
          </div>
          <div style={{ fontSize: 17, marginTop: 6 }}>{it.title_jp}</div>
        </button>
      ))}
    </div>
  );
}

function LongRead({ item, onBack }: { item: Item; onBack: () => void }) {
  const [furiOff, setFuriOff] = useState(false);
  const [tapped, setTapped] = useState<string | null>(null);
  const [gloss, setGloss] = useState<Gloss | null>(null);
  const [glossBusy, setGlossBusy] = useState(false);
  const [glossErr, setGlossErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [zhOpen, setZhOpen] = useState(false);

  const tapWord = async (word: string) => {
    const w = word.trim();
    if (!w) return;
    setTapped(w);
    setGloss(null);
    setGlossErr(null);
    setSaved(false);
    setGlossBusy(true);
    try {
      const res = await api.gloss(w, item.script_jp);
      setGloss(res.gloss);
    } catch (e) {
      setGlossErr(e instanceof ApiError ? e.message : "意味を取得できませんでした。");
    } finally {
      setGlossBusy(false);
    }
  };

  const save = async () => {
    if (!gloss) return;
    try {
      await api.saveGloss(gloss);
      setSaved(true);
    } catch {
      setGlossErr("追加に失敗しました。");
    }
  };

  return (
    <div>
      <div className="card">
        <button onClick={onBack}>← 文庫へ戻る</button>
        <h2 style={{ margin: "10px 0 6px" }}>{item.title_jp}</h2>
        <div>
          <span className="pill">{item.source}</span>
          <a className="pill" href={item.url} target="_blank" rel="noreferrer">
            出典 ↗
          </a>
        </div>
        {item.audio_r2_key && <Player src={audioUrl(item.audio_r2_key)} />}
        <div className="row-inline" style={{ marginTop: 10 }}>
          <button onClick={() => setFuriOff((v) => !v)}>
            {furiOff ? "ふりがな表示" : "ふりがな非表示"}
          </button>
        </div>

        <TappableBody segments={item.furigana} furiOff={furiOff} onTap={tapWord} />

        <details className="zh-reveal" open={zhOpen} onToggle={(e) => setZhOpen(e.currentTarget.open)}>
          <summary>中文の要旨（tap-to-reveal）</summary>
          <div className="zh">{item.gist_zh}</div>
        </details>
      </div>

      {tapped && (
        <div className="card gloss-pop">
          <div className="row-inline">
            <strong style={{ fontSize: 20 }}>{tapped}</strong>
            <button style={{ marginLeft: "auto" }} onClick={() => setTapped(null)}>
              ✕
            </button>
          </div>
          {glossBusy && <p className="muted">調べています…</p>}
          {glossErr && <p className="muted">{glossErr}</p>}
          {gloss && (
            <>
              <div style={{ fontSize: 15, marginTop: 4 }}>
                <span className="muted">{gloss.reading}</span> · {gloss.jlpt}
              </div>
              <details className="zh-reveal">
                <summary>意味</summary>
                <div className="zh">{gloss.meaning_zh}</div>
              </details>
              <button className="primary" style={{ marginTop: 10 }} onClick={save} disabled={saved}>
                {saved ? "追加しました ✓" : "＋ 復習デッキに追加"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Render the body with tappable word runs. Kanji runs (with ruby) are the
 * meaningful words; kana runs are still tappable for particles/verbs. */
function TappableBody({
  segments,
  furiOff,
  onTap,
}: {
  segments: FuriganaSegment[];
  furiOff: boolean;
  onTap: (word: string) => void;
}) {
  return (
    <p className={`jp-body long-read${furiOff ? " furi-hidden" : ""}`}>
      {segments.map((seg, i) =>
        seg.ruby ? (
          <ruby key={i} className="tap-word" onClick={() => onTap(seg.text)}>
            {seg.text}
            <rt>{seg.ruby}</rt>
          </ruby>
        ) : (
          <span key={i} className="tap-word" onClick={() => onTap(seg.text)}>
            {seg.text}
          </span>
        ),
      )}
    </p>
  );
}
