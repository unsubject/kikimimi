import { useEffect, useRef, useState } from "react";
import type { Item, Gloss } from "@kikimimi/shared";
import { api, audioUrl, ApiError } from "../api.js";
import { Player } from "../components/Player.js";
import { RubyBody } from "../components/Ruby.js";

// Server /items default page size; a full page implies there may be more (P4).
const PAGE = 30;

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .items()
      .then((r) => {
        setItems(r.items);
        setHasMore(r.items.length === PAGE);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "読み込み失敗"))
      .finally(() => setLoading(false));
  }, []);

  // Page through the rest of the archive: offset = how many we already hold.
  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const r = await api.items(items.length);
      setItems((prev) => [...prev, ...r.items]);
      setHasMore(r.items.length === PAGE);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "読み込み失敗");
    } finally {
      setLoadingMore(false);
    }
  };

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
      {hasMore && (
        <button
          style={{ display: "block", width: "100%" }}
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "読み込み中…" : "もっと見る"}
        </button>
      )}
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
  // Generation counter: only the newest tap may write gloss state, so out-of-
  // order resolutions can't show/save the wrong word (P1).
  const reqId = useRef(0);

  const tapWord = async (word: string) => {
    const w = word.trim();
    if (!w) return;
    const my = ++reqId.current;
    setTapped(w);
    setGloss(null);
    setGlossErr(null);
    setSaved(false);
    setGlossBusy(true);
    try {
      // Send only the sentence containing the tap, not the whole script — bounds
      // per-tap token cost on a cache miss (P2, spec §10).
      const res = await api.gloss(w, sentenceOf(item.script_jp, w));
      if (my !== reqId.current) return;
      setGloss(res.gloss);
    } catch (e) {
      if (my !== reqId.current) return;
      setGlossErr(e instanceof ApiError ? e.message : "意味を取得できませんでした。");
    } finally {
      // Clear busy only if we're still the latest request (a stale one must not
      // reset the flag for a newer in-flight tap).
      if (my === reqId.current) setGlossBusy(false);
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

        <RubyBody segments={item.furigana} furiOff={furiOff} onTap={tapWord} />

        <details className="zh-reveal">
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

/** Isolate the sentence containing the tapped word to send as gloss context —
 * split on Japanese enders (。！？), keeping the ender; fall back to the whole
 * script if no sentence matches (P2). */
function sentenceOf(script: string, word: string): string {
  const sentences = script.split(/(?<=[。！？])/);
  const hit = sentences.find((s) => s.includes(word));
  return (hit ?? script).trim();
}
