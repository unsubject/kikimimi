import { Hono, type Context } from "hono";
import type { Env } from "../env.js";
import { closeDb, openDb } from "../db.js";
import { readSpend, summarize, logCost } from "../cost.js";
import { runPipeline, rowToItem } from "../content/pipeline.js";
import { gradeExplainBack } from "../grade.js";
import { recordScore } from "../learner.js";
import { sendPush } from "../push.js";
import { monthInZone } from "../time.js";
import {
  dueCards,
  dueCount,
  gradeCard,
  harvestError,
  harvestOnyomi,
  harvestVocab,
} from "../cards.js";
import { transcribe, WHISPER_FLAT_USD } from "../stt.js";
import { gradeShadowing } from "../shadow.js";
import { ONYOMI_RULES } from "../content/onyomi.js";
import { synthCached, currentVoice, TTS_MAX_CHARS } from "../ttscache.js";
import { conversationOpener, conversationTurn } from "../converse.js";
import { glossWord } from "../gloss.js";
import { computeProgress } from "../progress.js";
import type {
  ScaffoldStage,
  TodayResponse,
  PushSubscriptionJSON,
  ReviewQueueResponse,
  SrsRating,
  TalkTurn,
} from "@kikimimi/shared";
import { TTS_VOICES } from "@kikimimi/shared";

const isRating = (n: unknown): n is SrsRating => n === 1 || n === 2 || n === 3 || n === 4;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accept only http(s) links for stored deliverable URLs (blocks javascript: etc.). */
const isHttpUrl = (u: string): boolean => {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
};

type Vars = { sql: ReturnType<typeof openDb> };

export const api = new Hono<{ Bindings: Env; Variables: Vars }>();

// Single-user bearer auth (spec §2: one signed token, no auth flows).
api.use("*", async (c, next) => {
  const auth = c.req.header("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!c.env.APP_TOKEN || token !== c.env.APP_TOKEN) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

// Open one DB connection per request; always close it.
api.use("*", async (c, next) => {
  const sql = openDb(c.env);
  c.set("sql", sql);
  try {
    await next();
  } finally {
    await closeDb(sql);
  }
});

const TZ = async (sql: Vars["sql"]): Promise<string> => {
  const [s] = await sql`select tz from user_settings where id = 1`;
  return String(s?.tz ?? "America/New_York");
};

/**
 * Cost governor gate (spec §10): if today is degraded or the monthly breaker
 * tripped, decline the paid action with 402. Returns the response to send, or
 * null to proceed — centralises the check duplicated across every paid endpoint.
 */
async function budgetGate(
  c: Context<{ Bindings: Env; Variables: Vars }>,
  sql: Vars["sql"],
  tz: string,
): Promise<Response | null> {
  const summary = summarize(await readSpend(sql, tz));
  if (summary.degraded || summary.monthly_breaker) {
    return c.json({ error: "cost_limited", cost: summary }, 402);
  }
  return null;
}

type AudioBlobResult =
  | { audio: ArrayBuffer; mime: string }
  | { error: string; status: 400 | 413 | 415 };

/**
 * Validate + buffer a multipart audio entry uniformly across the voice routes:
 * presence (400), size ≤10MB (413), and a set-but-non-audio MIME (415). Some
 * MediaRecorder outputs omit a type, so only reject a type that is set.
 */
async function readAudioBlob(entry: unknown): Promise<AudioBlobResult> {
  if (!entry || typeof entry === "string") {
    return { error: "audio required", status: 400 };
  }
  // workers-types under-types FormData file entries; it is a Blob at runtime.
  const blob = entry as unknown as Blob;
  if (blob.size > 10_000_000) return { error: "audio_too_large", status: 413 };
  if (blob.type && !blob.type.startsWith("audio/")) {
    return { error: "unsupported_media_type", status: 415 };
  }
  return { audio: await blob.arrayBuffer(), mime: blob.type || "audio/webm" };
}

/** VAPID public key for the client to subscribe with. */
api.get("/config", (c) =>
  c.json({ vapidPublicKey: c.env.VAPID_PUBLIC_KEY, voices: TTS_VOICES }),
);

/** Today view: most recent delivered item + its scaffold stage + cost banner. */
api.get("/today", async (c) => {
  const sql = c.get("sql");
  const tz = await TZ(sql);
  const [row] = await sql`
    select i.*, d.stage, d.delivered_at
    from deliveries d join items i on i.id = d.item_id
    order by d.delivered_at desc limit 1`;
  const spend = await readSpend(sql, tz);
  const body: TodayResponse = {
    item: row ? rowToItem(row) : null,
    stage: (Number(row?.stage ?? 1) as ScaffoldStage),
    delivered_at: row?.delivered_at
      ? new Date(row.delivered_at as string).toISOString()
      : null,
    cost: summarize(spend),
  };
  return c.json(body);
});

/** Library: past items (metadata only). Offset-paginated so the Library can
 * page through *all* past items (spec §5), not just the newest 30. */
api.get("/items", async (c) => {
  const sql = c.get("sql");
  // Clamp query params so a malformed/huge ?limit can't blow up the query.
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 30, 1), 100);
  const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
  const rows = await sql`
    select i.*, d.stage, d.delivered_at
    from items i left join lateral (
      select stage, delivered_at from deliveries d
      where d.item_id = i.id order by delivered_at desc limit 1
    ) d on true
    order by i.created_at desc limit ${limit} offset ${offset}`;
  return c.json({ items: rows.map((r) => rowToItem(r)) });
});

/** Signed audio URL → we just proxy R2 through the worker (see /audio route). */
api.get("/item/:id", async (c) => {
  const sql = c.get("sql");
  const [row] = await sql`select * from items where id = ${c.req.param("id")}`;
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ item: rowToItem(row) });
});

/** Explain-back grading. Also updates the learner model + error log. */
api.post("/explain-back", async (c) => {
  const sql = c.get("sql");
  const tz = await TZ(sql);
  const body = await c.req.json<{ item_id: string; text: string }>();
  if (!body.item_id || !body.text?.trim()) {
    return c.json({ error: "item_id and text required" }, 400);
  }

  // Governor: if degraded/breaker-tripped, decline grading gracefully (spec §10).
  const gated = await budgetGate(c, sql, tz);
  if (gated) return gated;

  const [item] = await sql`select * from items where id = ${body.item_id}`;
  if (!item) return c.json({ error: "not found" }, 404);

  const [resp] = await sql`
    insert into responses (item_id, mode, raw_text)
    values (${body.item_id}, 'explain_back_text', ${body.text})
    returning id`;

  const { grade, usd } = await gradeExplainBack(
    c.env,
    {
      script_jp: String(item.script_jp),
      gist_zh: String(item.gist_zh ?? ""),
      explain_back_prompt: String(item.explain_back_prompt ?? ""),
    },
    body.text,
  );
  await logCost(sql, tz, "explain_back_grade", usd);

  await sql`
    insert into evaluations (response_id, score, missed_points, feedback, model)
    values (${resp!.id}, ${grade.score}, ${JSON.stringify(grade.missed_points)},
            ${grade.feedback}, ${c.env.GRADING_MODEL})`;

  if (grade.error_category && grade.error_detail) {
    await sql`
      insert into error_log (category, detail, item_id)
      values (${grade.error_category}, ${grade.error_detail}, ${body.item_id})`;
    // A corrected mistake becomes an SRS cloze card (spec §5, §8).
    await harvestError(sql, body.item_id, grade.error_category, grade.error_detail);
  }

  // Explain-back is the listening comprehension signal → drives graduation.
  const transition = await recordScore(sql, "listening", grade.score);

  return c.json({ grade, transition, cost: summarize(await readSpend(sql, tz)) });
});

/**
 * Voice explain-back (spec §4): multipart upload of a recorded answer →
 * Whisper transcription → same grader → learner-model update. Stores the audio
 * in R2 and the transcript alongside.
 */
api.post("/explain-back/voice", async (c) => {
  const sql = c.get("sql");
  const tz = await TZ(sql);

  const gated = await budgetGate(c, sql, tz);
  if (gated) return gated;

  const form = await c.req.formData();
  const itemId = String(form.get("item_id") ?? "");
  if (!itemId) return c.json({ error: "item_id required" }, 400);
  const blobResult = await readAudioBlob(form.get("audio"));
  if ("error" in blobResult) return c.json({ error: blobResult.error }, blobResult.status);
  const { audio, mime } = blobResult;

  const [item] = await sql`select * from items where id = ${itemId}`;
  if (!item) return c.json({ error: "not found" }, 404);

  const voiceKey = `voice/${crypto.randomUUID()}.${mime.includes("webm") ? "webm" : "ogg"}`;

  const { text: transcript } = await transcribe(c.env, audio, mime);
  await logCost(sql, tz, "whisper", WHISPER_FLAT_USD);

  // No speech detected → don't spend on grading or pollute the learner model.
  if (!transcript.trim()) {
    return c.json({ error: "empty_transcript" }, 422);
  }

  // Persist the recording only now we know there's speech (no orphan R2 object on silence, P8).
  await c.env.AUDIO.put(voiceKey, audio, { httpMetadata: { contentType: mime } });

  const [resp] = await sql`
    insert into responses (item_id, mode, voice_r2_key, transcript)
    values (${itemId}, 'explain_back_voice', ${voiceKey}, ${transcript})
    returning id`;

  const { grade, usd } = await gradeExplainBack(
    c.env,
    {
      script_jp: String(item.script_jp),
      gist_zh: String(item.gist_zh ?? ""),
      explain_back_prompt: String(item.explain_back_prompt ?? ""),
    },
    transcript,
  );
  await logCost(sql, tz, "explain_back_grade", usd);

  await sql`
    insert into evaluations (response_id, score, missed_points, feedback, model)
    values (${resp!.id}, ${grade.score}, ${JSON.stringify(grade.missed_points)},
            ${grade.feedback}, ${c.env.GRADING_MODEL})`;

  if (grade.error_category && grade.error_detail) {
    await sql`
      insert into error_log (category, detail, item_id)
      values (${grade.error_category}, ${grade.error_detail}, ${itemId})`;
    await harvestError(sql, itemId, grade.error_category, grade.error_detail);
  }

  const transition = await recordScore(sql, "listening", grade.score);

  return c.json({
    grade,
    transcript,
    transition,
    cost: summarize(await readSpend(sql, tz)),
  });
});

/** Review queue: due FSRS cards up to the daily cap (spec §5). */
api.get("/review", async (c) => {
  const sql = c.get("sql");
  const [s] = await sql`select srs_daily_cap from user_settings where id = 1`;
  const cap = Number(s?.srs_daily_cap ?? 20);
  const [cards, count] = await Promise.all([dueCards(sql, cap), dueCount(sql)]);
  const body: ReviewQueueResponse = { cards, due_count: count, cap };
  return c.json(body);
});

/** Grade one review card (1=Again 2=Hard 3=Good 4=Easy) → advance FSRS state. */
api.post("/review/:id", async (c) => {
  const sql = c.get("sql");
  const body = await c.req.json<{ rating: number }>();
  if (!isRating(body.rating)) {
    return c.json({ error: "rating must be 1-4" }, 400);
  }
  const result = await gradeCard(sql, c.req.param("id"), body.rating);
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

/** Burst: generate the next-ranked item on demand ("More" button). */
api.post("/more", async (c) => {
  const sql = c.get("sql");
  const tz = await TZ(sql);
  const outcome = await runPipeline(c.env, sql, { tz, force: true });
  if (!outcome.item) return c.json({ error: outcome.reason ?? "no item" }, 429);
  return c.json({ item: outcome.item, cost: summarize(await readSpend(sql, tz)) });
});

/** Settings read/update (interest weights, TTS voice, srs cap, drop time). */
api.get("/settings", async (c) => {
  const sql = c.get("sql");
  const [s] = await sql`select * from user_settings where id = 1`;
  return c.json({ settings: s });
});

api.put("/settings", async (c) => {
  const sql = c.get("sql");
  const b = await c.req.json<Record<string, unknown>>();
  const [cur] = await sql`select * from user_settings where id = 1`;
  const next = {
    tz: b.tz ?? cur!.tz,
    drop_time: b.drop_time ?? cur!.drop_time,
    interest_weights: b.interest_weights ?? cur!.interest_weights,
    srs_daily_cap: b.srs_daily_cap ?? cur!.srs_daily_cap,
    tts_voice: b.tts_voice ?? cur!.tts_voice,
  };
  await sql`
    update user_settings set
      tz = ${next.tz as string},
      drop_time = ${next.drop_time as string},
      interest_weights = ${JSON.stringify(next.interest_weights)},
      srs_daily_cap = ${Number(next.srs_daily_cap)},
      tts_voice = ${next.tts_voice as string}
    where id = 1`;
  return c.json({ ok: true });
});

/** Monthly circuit-breaker acknowledgement (spec §10). */
api.post("/reset", async (c) => {
  const sql = c.get("sql");
  const tz = await TZ(sql);
  const month = monthInZone(new Date(), tz);
  await sql`update user_settings set monthly_reset_ack = ${month} where id = 1`;
  return c.json({ ok: true, acknowledged_month: month });
});

/** Register a Web Push subscription (dedup by endpoint). */
api.post("/push/subscribe", async (c) => {
  const sql = c.get("sql");
  const sub = await c.req.json<PushSubscriptionJSON>();
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return c.json({ error: "invalid subscription" }, 400);
  }
  const [s] = await sql`select push_subs from user_settings where id = 1`;
  const subs: PushSubscriptionJSON[] = Array.isArray(s?.push_subs)
    ? (s!.push_subs as PushSubscriptionJSON[])
    : [];
  const deduped = subs.filter((x) => x.endpoint !== sub.endpoint);
  deduped.push(sub);
  await sql`update user_settings set push_subs = ${JSON.stringify(deduped)} where id = 1`;
  return c.json({ ok: true });
});

/** Fire a test push to all registered subscriptions. */
api.post("/push/test", async (c) => {
  const sql = c.get("sql");
  const [s] = await sql`select push_subs from user_settings where id = 1`;
  const subs: PushSubscriptionJSON[] = Array.isArray(s?.push_subs)
    ? (s!.push_subs as PushSubscriptionJSON[])
    : [];
  const results = await Promise.all(
    subs.map((sub) =>
      sendPush(c.env, sub, {
        title: "聞き耳 Kikimimi",
        body: "テスト通知です。",
        url: "/",
      }).catch((e) => ({ endpoint: sub.endpoint, status: 0, gone: false, error: String(e) })),
    ),
  );
  return c.json({ sent: results.length, results });
});

/**
 * Word-tap gloss for the Library long-read (spec §5). Cache-checked by the
 * tapped surface form so repeat taps are free; a miss calls the grading model
 * once (governor-gated) and caches the result.
 */
api.post("/gloss", async (c) => {
  const sql = c.get("sql");
  const { word, context } = await c.req.json<{ word: string; context?: string }>();
  const w = (word ?? "").trim();
  if (!w) return c.json({ error: "word required" }, 400);
  if (w.length > 40) return c.json({ error: "word too long" }, 400);

  // Cached by surface form; return the stored lemma as `word` so add-to-SRS
  // saves the dictionary form, not the inflected surface (P3).
  const [cached] = await sql`
    select reading, meaning_zh, jlpt, lemma from glosses where word = ${w}`;
  if (cached) {
    return c.json({
      gloss: {
        word: cached.lemma ? String(cached.lemma) : w,
        reading: String(cached.reading),
        meaning_zh: String(cached.meaning_zh),
        jlpt: cached.jlpt ? String(cached.jlpt) : "N3",
      },
      cached: true,
    });
  }

  // Only a cache miss is billed, so read tz (a user_settings query) lazily here (P7).
  const tz = await TZ(sql);
  const gated = await budgetGate(c, sql, tz);
  if (gated) return gated;

  // Defensively cap the context — the client sends one sentence, but bound it
  // regardless so a runaway payload can't inflate per-tap token cost (P2).
  const ctx = (context ?? "").slice(0, 400);
  const { gloss, usd } = await glossWord(c.env, w, ctx);
  await logCost(sql, tz, "gloss", usd);
  await sql`
    insert into glosses (word, lemma, reading, meaning_zh, jlpt)
    values (${w}, ${gloss.word}, ${gloss.reading}, ${gloss.meaning_zh}, ${gloss.jlpt})
    on conflict (word) do nothing`;
  // gloss.word is the model's lemma → returning it makes /gloss/save store the lemma (P3).
  return c.json({ gloss, cached: false });
});

/** Add a tapped/glossed word to the SRS deck as a vocab card (spec §5). */
api.post("/gloss/save", async (c) => {
  const sql = c.get("sql");
  const b = await c.req.json<{ word: string; reading: string; meaning_zh?: string; jlpt?: string }>();
  if (!b.word?.trim() || !b.reading?.trim()) {
    return c.json({ error: "word and reading required" }, 400);
  }
  const jlpt = (["N5", "N4", "N3", "N2", "N1"].includes(b.jlpt ?? "") ? b.jlpt : "N3") as
    | "N5"
    | "N4"
    | "N3"
    | "N2"
    | "N1";
  const added = await harvestVocab(sql, "manual", [
    { word: b.word.trim(), reading: b.reading.trim(), meaning_zh: b.meaning_zh ?? "", jlpt },
  ]);
  return c.json({ added });
});

/** Progress dashboard: per-skill state, JLPT coverage, graduations (spec §7, v1.0). */
api.get("/progress", async (c) => {
  const sql = c.get("sql");
  return c.json(await computeProgress(sql));
});

/** Work Gallery: the six sprint deliverables and their artifact links (spec §7). */
api.get("/deliverables", async (c) => {
  const sql = c.get("sql");
  const rows = await sql`select * from deliverables order by sprint`;
  return c.json({ deliverables: rows });
});

/** Attach an artifact / Notion link to a deliverable (mark it shipped). */
api.put("/deliverables/:id", async (c) => {
  const sql = c.get("sql");
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "invalid id" }, 400);
  const b = await c.req.json<{ artifact_url?: string | null; notion_url?: string | null }>();
  for (const u of [b.artifact_url, b.notion_url]) {
    if (typeof u === "string" && u.trim() && !isHttpUrl(u)) {
      return c.json({ error: "links must be http(s) URLs" }, 400);
    }
  }
  // PATCH semantics via coalesce: only a provided key overwrites its column, so
  // attaching an artifact link can't silently wipe an existing notion_url (an
  // absent key binds null → coalesce keeps the current value).
  const [row] = await sql`
    update deliverables set
      artifact_url = coalesce(${b.artifact_url === undefined ? null : b.artifact_url}, artifact_url),
      notion_url   = coalesce(${b.notion_url === undefined ? null : b.notion_url}, notion_url)
    where id = ${id}
    returning id`;
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

/**
 * Listening gauntlet (spec §11 Sprint 6): a blind listening test. Serve an
 * item's AUDIO ONLY (no text); the learner explains what it was about, graded
 * ≥70% gist = pass. To keep it genuinely blind we exclude the single newest
 * item — that is today's drop, just seen with full text on the Today view — and
 * pick at random, so this tests retention of previously-heard audio rather than
 * a re-listen of just-read material. Falls back to the newest only when it is
 * the sole item with audio.
 */
api.get("/gauntlet", async (c) => {
  const sql = c.get("sql");
  let [row] = await sql`
    select id, audio_r2_key from items
    where audio_r2_key is not null
      and id <> (select id from items where audio_r2_key is not null
                 order by created_at desc limit 1)
    order by random() limit 1`;
  if (!row) {
    [row] = await sql`
      select id, audio_r2_key from items
      where audio_r2_key is not null order by created_at desc limit 1`;
  }
  if (!row) return c.json({ error: "no items with audio yet" }, 404);
  return c.json({
    item_id: String(row.id),
    audio_r2_key: row.audio_r2_key ? String(row.audio_r2_key) : null,
    // Deliberately generic: the item's own explain_back_prompt can name the
    // topic and would leak the gist before the audio plays, breaking blindness.
    prompt: "聞こえた内容を、覚えている範囲で日本語で説明してください。",
  });
});

/** Grade a gauntlet attempt: blind explain-back → pass at ≥70% gist. */
api.post("/gauntlet/grade", async (c) => {
  const sql = c.get("sql");
  const tz = await TZ(sql);
  const body = await c.req.json<{ item_id: string; text: string }>();
  if (!body.item_id || !body.text?.trim()) {
    return c.json({ error: "item_id and text required" }, 400);
  }
  const gated = await budgetGate(c, sql, tz);
  if (gated) return gated;

  const [item] = await sql`select * from items where id = ${body.item_id}`;
  if (!item) return c.json({ error: "not found" }, 404);

  const [resp] = await sql`
    insert into responses (item_id, mode, raw_text)
    values (${body.item_id}, 'gauntlet', ${body.text}) returning id`;

  const { grade, usd } = await gradeExplainBack(
    c.env,
    {
      script_jp: String(item.script_jp),
      gist_zh: String(item.gist_zh ?? ""),
      explain_back_prompt: String(item.explain_back_prompt ?? ""),
    },
    body.text,
  );
  await logCost(sql, tz, "gauntlet_grade", usd);
  await sql`
    insert into evaluations (response_id, score, missed_points, feedback, model)
    values (${resp!.id}, ${grade.score}, ${JSON.stringify(grade.missed_points)},
            ${grade.feedback}, ${c.env.GRADING_MODEL})`;

  // The gauntlet is a listening assessment → feeds the listening skill.
  await recordScore(sql, "listening", grade.score);

  return c.json({
    score: grade.score,
    pass: grade.score >= 70,
    feedback: grade.feedback,
    missed_points: grade.missed_points,
  });
});

/** Cantonese→on'yomi cheat sheet (Sprint 3 deliverable). */
api.get("/onyomi", (c) => c.json({ rules: ONYOMI_RULES }));

/** Seed the on'yomi correspondence pack into the SRS deck (idempotent). */
api.post("/onyomi/seed", async (c) => {
  const sql = c.get("sql");
  const added = await harvestOnyomi(sql);
  return c.json({ added });
});

/**
 * On-demand TTS (listening-first): synthesize a short line and cache it in R2 by
 * content hash. Powers per-sentence shadowing and on'yomi playback. Cache hits
 * cost nothing; only a miss calls OpenAI + logs cost, so replays are free.
 */
api.post("/tts", async (c) => {
  const sql = c.get("sql");
  const tz = await TZ(sql);
  const { text } = await c.req.json<{ text: string }>();
  const trimmed = (text ?? "").trim();
  if (!trimmed || trimmed.length > TTS_MAX_CHARS) {
    return c.json({ error: `text must be 1–${TTS_MAX_CHARS} chars` }, 400);
  }

  // Governor: TTS is a paid action, so gate it like /explain-back (spec §10).
  const gated = await budgetGate(c, sql, tz);
  if (gated) return gated;

  const key = await synthCached(c.env, sql, tz, trimmed, await currentVoice(sql));
  return c.json({ key });
});

/**
 * Shadowing attempt (spec §4): multipart target_text + audio → Whisper → grade
 * on morae/long-vowel/gemination. Feeds the speaking skill's trailing scores.
 */
api.post("/shadow", async (c) => {
  const sql = c.get("sql");
  const tz = await TZ(sql);

  const gated = await budgetGate(c, sql, tz);
  if (gated) return gated;

  const form = await c.req.formData();
  const targetText = String(form.get("target_text") ?? "").trim();
  if (!targetText) return c.json({ error: "target_text required" }, 400);
  const blobResult = await readAudioBlob(form.get("audio"));
  if ("error" in blobResult) return c.json({ error: blobResult.error }, blobResult.status);
  // Shadowing does not persist the recording — only the grade matters.
  const { audio, mime } = blobResult;

  const { text: transcript } = await transcribe(c.env, audio, mime);
  await logCost(sql, tz, "whisper", WHISPER_FLAT_USD);

  // No speech detected → don't spend on grading or pollute the learner model.
  if (!transcript.trim()) {
    return c.json({ error: "empty_transcript" }, 422);
  }

  const { grade, usd } = await gradeShadowing(c.env, targetText, transcript);
  await logCost(sql, tz, "shadow_grade", usd);

  // Shadowing accuracy is a speaking/phonology signal.
  const transition = await recordScore(sql, "speaking", grade.score);

  return c.json({ grade, transcript, transition, cost: summarize(await readSpend(sql, tz)) });
});

/**
 * Conversation opener (spec §4 Talk): the bot asks a question about today's
 * item, returned as text + synthesized audio (listening-first). POST because it
 * has a paid, non-idempotent side effect (Sonnet generation on a cache miss).
 */
api.post("/talk/opener", async (c) => {
  const sql = c.get("sql");
  const tz = await TZ(sql);
  const itemId = c.req.query("item_id");
  if (!itemId) return c.json({ error: "item_id required" }, 400);

  const gated = await budgetGate(c, sql, tz);
  if (gated) return gated;

  const [item] = await sql`select title_jp, script_jp from items where id = ${itemId}`;
  if (!item) return c.json({ error: "not found" }, 404);

  // Cache the opener server-side so re-entering 会話 doesn't re-bill Sonnet (P4).
  // On reuse the TTS below is a cache hit on the identical text → free.
  const [cached] = await sql`
    select raw_text from responses
    where item_id = ${itemId} and mode = 'conversation_opener' limit 1`;
  let question_jp: string;
  if (cached) {
    question_jp = String(cached.raw_text);
  } else {
    const opener = await conversationOpener(c.env, {
      title_jp: String(item.title_jp),
      script_jp: String(item.script_jp),
    });
    question_jp = opener.question_jp;
    await logCost(sql, tz, "conversation", opener.usd);
    await sql`
      insert into responses (item_id, mode, raw_text)
      values (${itemId}, 'conversation_opener', ${question_jp})`;
  }

  // A transient TTS failure must not discard the (paid) question — return it with a null key (P1).
  let audio_key: string | null = null;
  try {
    audio_key = await synthCached(c.env, sql, tz, question_jp, await currentVoice(sql));
  } catch {
    audio_key = null;
  }
  return c.json({ question_jp, audio_key });
});

/**
 * One conversation turn (spec §4): the learner's voice answer → Whisper →
 * graded Japanese reply + one correction + keigo tags → reply audio. History
 * is held client-side and posted back, keeping the server stateless per turn.
 */
api.post("/talk", async (c) => {
  const sql = c.get("sql");
  const tz = await TZ(sql);

  const gated = await budgetGate(c, sql, tz);
  if (gated) return gated;

  const form = await c.req.formData();
  const itemId = String(form.get("item_id") ?? "");
  if (!itemId) return c.json({ error: "item_id required" }, 400);
  const blobResult = await readAudioBlob(form.get("audio"));
  if ("error" in blobResult) return c.json({ error: blobResult.error }, blobResult.status);
  const { audio, mime } = blobResult;

  let history: TalkTurn[] = [];
  try {
    const raw = form.get("history");
    if (typeof raw === "string" && raw) history = JSON.parse(raw) as TalkTurn[];
  } catch {
    history = [];
  }
  // Bound the client-supplied history: coerce non-arrays and cap to the last 12 turns (P6).
  if (!Array.isArray(history)) history = [];
  history = history.slice(-12);

  const [item] = await sql`select title_jp, script_jp from items where id = ${itemId}`;
  if (!item) return c.json({ error: "not found" }, 404);

  const voiceKey = `voice/${crypto.randomUUID()}.${mime.includes("webm") ? "webm" : "ogg"}`;

  const { text: transcript } = await transcribe(c.env, audio, mime);
  await logCost(sql, tz, "whisper", WHISPER_FLAT_USD);
  if (!transcript.trim()) return c.json({ error: "empty_transcript" }, 422);

  // Persist the recording only now we know there's speech (no orphan R2 object on silence, P8).
  await c.env.AUDIO.put(voiceKey, audio, { httpMetadata: { contentType: mime } });

  await sql`
    insert into responses (item_id, mode, voice_r2_key, transcript)
    values (${itemId}, 'conversation', ${voiceKey}, ${transcript})`;

  const { reply, usd } = await conversationTurn(
    c.env,
    { title_jp: String(item.title_jp), script_jp: String(item.script_jp) },
    history,
    transcript,
  );
  await logCost(sql, tz, "conversation", usd);

  if (reply.error_category && reply.error_detail) {
    await sql`
      insert into error_log (category, detail, item_id)
      values (${reply.error_category}, ${reply.error_detail}, ${itemId})`;
    await harvestError(sql, itemId, reply.error_category, reply.error_detail);
  }

  // A transient TTS failure must not discard the already-paid reply or (via client
  // retry) double-bill + double-harvest — return the reply with a null key (P1/§4).
  let audio_key: string | null = null;
  try {
    audio_key = await synthCached(c.env, sql, tz, reply.reply_jp, await currentVoice(sql));
  } catch {
    audio_key = null;
  }

  return c.json({
    transcript,
    reply_jp: reply.reply_jp,
    reply_audio_key: audio_key,
    correction: reply.correction,
    keigo_notes: reply.keigo_notes,
    cost: summarize(await readSpend(sql, tz)),
  });
});
