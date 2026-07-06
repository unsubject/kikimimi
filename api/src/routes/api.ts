import { Hono } from "hono";
import type { Env } from "../env.js";
import { closeDb, openDb } from "../db.js";
import { readSpend, summarize, logCost } from "../cost.js";
import { runPipeline, rowToItem } from "../content/pipeline.js";
import { gradeExplainBack } from "../grade.js";
import { recordScore } from "../learner.js";
import { sendPush } from "../push.js";
import { monthInZone } from "../time.js";
import type {
  ScaffoldStage,
  TodayResponse,
  PushSubscriptionJSON,
} from "@kikimimi/shared";
import { TTS_VOICES } from "@kikimimi/shared";

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
  }

  // Explain-back is the listening comprehension signal → drives graduation.
  const transition = await recordScore(sql, "listening", grade.score);

  return c.json({ grade, transition, cost: summarize(await readSpend(sql, tz)) });
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
