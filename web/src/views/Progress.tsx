import { useEffect, useState } from "react";
import type {
  ProgressResponse,
  SkillProgress,
  JlptCoverage,
  Deliverable,
  GauntletItem,
  GauntletResult,
} from "@kikimimi/shared";
import { api, audioUrl, ApiError } from "../api.js";
import { Player } from "../components/Player.js";

/**
 * 進捗 — the Progress dashboard (spec §7, §11; learning plan Work Gallery).
 * Three panels: the skill/scaffold state, the JLPT coverage bars (a *ruler*,
 * not a syllabus — organic SRS progress translated onto a recognized scale),
 * the Work Gallery of sprint deliverables, and the blind listening gauntlet
 * (the Sprint-6 graduation test). A closing note points at Phase-2 hooks.
 */

const SKILL_JP: Record<string, string> = {
  listening: "聴解",
  reading: "読解",
  speaking: "発話",
  vocab: "語彙",
  grammar: "文法",
};

const STAGE_JP: Record<number, string> = {
  1: "S1 · 音声＋文＋中文",
  2: "S2 · 音声＋文",
  3: "S3 · 音声のみ",
};

export function Progress() {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.progress());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <p className="muted">読み込み中…</p>;
  if (error) return <div className="banner stop">{error}</div>;
  if (!data) return null;

  return (
    <div>
      <div className="card">
        <strong>進捗</strong>
        <p className="muted" style={{ fontSize: 13 }}>
          自然に積み上がった学習を、外部の物差し（JLPT）に翻訳して見える化します。
        </p>
        <div className="totals-row">
          <Total n={data.totals.items} label="項目" />
          <Total n={data.totals.cards} label="復習カード" />
          <Total n={data.totals.deliverables_done} label="成果物" />
        </div>
      </div>

      <SkillPanel skills={data.skills} />
      <JlptPanel jlpt={data.jlpt} />
      {data.recent_accuracy.length > 0 && <AccuracyPanel scores={data.recent_accuracy} />}
      {data.graduations.length > 0 && <GraduationPanel data={data} />}
      <GalleryPanel />
      <GauntletPanel />

      <div className="card">
        <strong>この先（Phase 2）</strong>
        <p className="muted" style={{ fontSize: 13 }}>
          Phase 2 では、複数ソースの横断要約、会話の長文化、産出（発話・作文）の比重増、
          そして「橋渡し」記事の定期公開へと進みます。まずは Sprint 6 のリスニング・
          ガントレット合格が節目です。
        </p>
      </div>
    </div>
  );
}

function Total({ n, label }: { n: number; label: string }) {
  return (
    <div className="total">
      <div className="total-n">{n}</div>
      <div className="total-l muted">{label}</div>
    </div>
  );
}

function SkillPanel({ skills }: { skills: SkillProgress[] }) {
  return (
    <div className="card">
      <strong>スキル</strong>
      <div className="skill-grid">
        {skills.map((s) => (
          <div className="skill-cell" key={s.skill}>
            <div className="skill-name">{SKILL_JP[s.skill] ?? s.skill}</div>
            <div className="skill-lv">Lv.{s.level}</div>
            <div className="skill-stage muted">{STAGE_JP[s.scaffold_stage] ?? `S${s.scaffold_stage}`}</div>
            <div className="skill-meta muted">
              {s.trailing_mean === null ? "採点なし" : `平均 ${s.trailing_mean}`}
              {" · "}
              {s.items_at_stage_days}日
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JlptPanel({ jlpt }: { jlpt: JlptCoverage[] }) {
  return (
    <div className="card">
      <strong>JLPT カバレッジ</strong>
      <p className="muted" style={{ fontSize: 12 }}>
        濃い部分＝定着（記憶が1週間以上安定）、薄い部分＝出会った語。物差しであって課題表ではありません。
      </p>
      <div className="jlpt-bars">
        {jlpt.map((j) => (
          <div className="jlpt-row" key={j.level}>
            <div className="jlpt-lv">{j.level}</div>
            <div className="jlpt-track" title={`${j.matured}/${j.encountered} 語（推定 ${j.total} 語中）`}>
              <div className="jlpt-enc" style={{ width: `${j.encountered_pct}%` }} />
              <div className="jlpt-mat" style={{ width: `${j.matured_pct}%` }} />
            </div>
            <div className="jlpt-num muted">
              {j.matured}/{j.encountered}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccuracyPanel({ scores }: { scores: number[] }) {
  const max = 100;
  return (
    <div className="card">
      <strong>直近の採点</strong>
      <div className="spark">
        {scores.map((v, i) => (
          <div
            className={`spark-bar${v >= 70 ? " ok" : ""}`}
            key={i}
            style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
            title={String(v)}
          />
        ))}
      </div>
    </div>
  );
}

function GraduationPanel({ data }: { data: ProgressResponse }) {
  return (
    <div className="card">
      <strong>昇格の記録</strong>
      <ul className="grad-list">
        {data.graduations.map((g, i) => (
          <li key={i}>
            <span className="pill">{SKILL_JP[g.skill] ?? g.skill}</span>
            {g.direction === "up" || g.to_stage < g.from_stage ? "🎉 " : "↩ "}
            Stage {g.from_stage} → {g.to_stage}
            <span className="muted" style={{ fontSize: 12 }}>
              {" "}
              · {new Date(g.created_at).toLocaleDateString("ja-JP")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GalleryPanel() {
  const [items, setItems] = useState<Deliverable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const r = await api.deliverables();
      setItems(r.deliverables);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "読み込みに失敗しました。");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const attach = async (id: string) => {
    const u = url.trim();
    if (!u) return;
    setSaving(true);
    try {
      await api.updateDeliverable(id, { artifact_url: u });
      setEditing(null);
      setUrl("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <strong>作品ギャラリー</strong>
      <p className="muted" style={{ fontSize: 12 }}>
        各スプリントの成果物。リンクを添えて「出荷」を記録します。
      </p>
      {error && <p className="muted" style={{ fontSize: 13 }}>{error}</p>}
      <ul className="gallery">
        {items.map((d) => (
          <li key={d.id} className={d.artifact_url ? "shipped" : ""}>
            <div className="row-inline">
              <span className="pill">S{d.sprint}</span>
              <span>{d.name}</span>
              {d.artifact_url ? (
                <a
                  className="pill"
                  style={{ marginLeft: "auto" }}
                  href={d.artifact_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  ✓ 開く ↗
                </a>
              ) : (
                <button
                  style={{ marginLeft: "auto" }}
                  onClick={() => {
                    setEditing(editing === d.id ? null : d.id);
                    setUrl("");
                  }}
                >
                  リンク追加
                </button>
              )}
            </div>
            {editing === d.id && (
              <div className="row-inline" style={{ marginTop: 8 }}>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  style={{ flex: 1 }}
                />
                <button className="primary" onClick={() => attach(d.id)} disabled={saving || !url.trim()}>
                  {saving ? "保存中…" : "保存"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Blind listening gauntlet: play audio only (no text), type the gist, grade ≥70% = pass. */
function GauntletPanel() {
  const [item, setItem] = useState<GauntletItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [notReady, setNotReady] = useState(false);
  const [text, setText] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<GauntletResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setNotReady(false);
    setText("");
    try {
      setItem(await api.gauntlet());
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotReady(true);
      else setError(e instanceof ApiError ? e.message : "読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const grade = async () => {
    if (!item || !text.trim()) return;
    setGrading(true);
    setError(null);
    try {
      setResult(await api.gradeGauntlet(item.item_id, text));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "採点に失敗しました。");
    } finally {
      setGrading(false);
    }
  };

  return (
    <div className="card">
      <strong>リスニング・ガントレット</strong>
      <p className="muted" style={{ fontSize: 12 }}>
        本文なしで音声だけを聴き、内容を説明します。要旨の7割が取れれば合格（Sprint 6 の節目）。
      </p>

      {!item ? (
        <>
          <button className="primary" onClick={start} disabled={loading}>
            {loading ? "準備中…" : "挑戦する"}
          </button>
          {notReady && (
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              音声つきの項目がまだありません。まず今日の一本を聴いてから挑戦してください。
            </p>
          )}
        </>
      ) : (
        <>
          {/* Blind: audio only — no title, no text, no gist. */}
          <Player src={item.audio_r2_key ? audioUrl(item.audio_r2_key) : null} />
          <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>
            {item.prompt}
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="聞こえた内容を日本語で説明してください…"
            disabled={!!result}
          />
          {!result && (
            <div className="row-inline" style={{ marginTop: 10 }}>
              <button className="primary" onClick={grade} disabled={grading || !text.trim()}>
                {grading ? "採点中…" : "採点する"}
              </button>
              <button onClick={() => setItem(null)} disabled={grading}>
                やめる
              </button>
            </div>
          )}
          {result && <GauntletResultView result={result} onRetry={start} />}
        </>
      )}
      {error && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  );
}

function GauntletResultView({ result, onRetry }: { result: GauntletResult; onRetry: () => void }) {
  return (
    <div className={`card ${result.pass ? "graduation" : ""}`} style={{ marginTop: 10 }}>
      <div className="row-inline">
        <div className="score">{result.score}</div>
        <strong>{result.pass ? "🎉 合格" : "もう一歩"}</strong>
      </div>
      <p>{result.feedback}</p>
      {result.missed_points.length > 0 && (
        <ul className="muted" style={{ fontSize: 14 }}>
          {result.missed_points.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      <button style={{ marginTop: 8 }} onClick={onRetry}>
        もう一度
      </button>
    </div>
  );
}
