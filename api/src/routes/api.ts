import { Hono } from "hono";
import type { Env } from "../env.js";
import { closeDb, openDb } from "../db.js";
import { readSpend, summarize, logCost } from "../cost.js";
import { runPipeline, rowToItem } from "../content/pipeline.js";
import { gradeExplainBack } from "../grade.js";
import { recordScore } from "../learner.js";
import { sendPush } from "../push.js";
import { monthInZone } from "../time.js";
import { dueCards, dueCount, gradeCard, harvestError, harvestOnyomi } from "../cards.js";
import { transcribe, WHISPER_FLAT_USD } from "../stt.js";
import { gradeShadowing } from "../shadow.js";
import { ONYOMI_RULES } from "../content/onyomi.js";
import type {
  ScaffoldStage,
  TodayResponse,
  PushSubscriptionJSON,
  ReviewQueueResponse,
  SrsRating,
} from "@kikimimi/shared";
import { TTS_VOICES } from "@kikimimi/shared";

const isRating = (n: unknown): n is SrsRating => n === 1 || n === 2 || n === 3 || n === 4;

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

/** Library: past items (metadata only for v0.1). */
api.get("/items", async (c) => {
  const sql = c.get("sql");
  const rows = await sql`
    select i.*, d.stage, d.delivered_at
    from items i left join lateral (
      select stage, delivered_at from deliveries d
      where d.item_id = i.id order by delivered_at desc limit 1
    ) d on true
    order by i.created_at desc limit 30`;
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

  // Governor: if degraded/breaker-tripped, decline grading gracefully.
  const spend = await readSpend(sql, tz);
  const summary = summarize(spend);
  if (summary.degraded || summary.monthly_breaker) {
    return c.json({ error: "cost_limited", cost: summary }, 402);
  }

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

  const summary = summarize(await readSpend(sql, tz));
  if (summary.degraded || summary.monthly_breaker) {
    return c.json({ error: "cost_limited", cost: summary }, 402);
  }

  const form = await c.req.formData();
  const itemId = String(form.get("item_id") ?? "");
  const entry = form.get("audio");
  if (!itemId || !entry || typeof entry === "string") {
    return c.json({ error: "item_id and audio required" }, 400);
  }
  // workers-types under-types FormData file entries; it is a Blob at runtime.
  const blob = entry as unknown as Blob;

  const [item] = await sql`select * from items where id = ${itemId}`;
  if (!item) return c.json({ error: "not found" }, 404);

  const audio = await blob.arrayBuffer();
  const mime = blob.type || "audio/webm";
  const voiceKey = `voice/${crypto.randomUUID()}.${mime.includes("webm") ? "webm" : "ogg"}`;
  await c.env.AUDIO.put(voiceKey, audio, { httpMetadata: { contentType: mime } });

  const { text: transcript } = await transcribe(c.env, audio, mime);
  await logCost(sql, tz, "whisper", WHISPER_FLAT_USD);

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

/** Cantonese→on'yomi cheat sheet (Sprint 3 deliverable). */
api.get("/onyomi", (c) => c.json({ rules: ONYOMI_RULES }));

/** Seed the on'yomi correspondence pack into the SRS deck (idempotent). */
api.post("/onyomi/seed", async (c) => {
  const sql = c.get("sql");
  const added = await harvestOnyomi(sql);
  return c.json({ added });
});

/**
 * Shadowing attempt (spec §4): multipart target_text + audio → Whisper → grade
 * on morae/long-vowel/gemination. Feeds the speaking skill's trailing scores.
 */
api.post("/shadow", async (c) => {
  const sql = c.get("sql");
  const tz = await TZ(sql);

  const summary = summarize(await readSpend(sql, tz));
  if (summary.degraded || summary.monthly_breaker) {
    return c.json({ error: "cost_limited", cost: summary }, 402);
  }

  const form = await c.req.formData();
  const targetText = String(form.get("target_text") ?? "").trim();
  const entry = form.get("audio");
  if (!targetText || !entry || typeof entry === "string") {
    return c.json({ error: "target_text and audio required" }, 400);
  }
  const blob = entry as unknown as Blob;
  const audio = await blob.arrayBuffer();
  const mime = blob.type || "audio/webm";

  const { text: transcript } = await transcribe(c.env, audio, mime);
  await logCost(sql, tz, "whisper", WHISPER_FLAT_USD);

  const { grade, usd } = await gradeShadowing(c.env, targetText, transcript);
  await logCost(sql, tz, "shadow_grade", usd);

  // Shadowing accuracy is a speaking/phonology signal.
  const transition = await recordScore(sql, "speaking", grade.score);

  return c.json({ grade, transcript, transition, cost: summarize(await readSpend(sql, tz)) });
});
