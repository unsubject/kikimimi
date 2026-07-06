import { Hono } from "hono";
import type { Env } from "./env.js";
import { api } from "./routes/api.js";
import { openDb, closeDb } from "./db.js";
import { runPipeline } from "./content/pipeline.js";
import { sendPush } from "./push.js";
import { isDropHour } from "./time.js";
import type { PushSubscriptionJSON } from "@kikimimi/shared";

const app = new Hono<{ Bindings: Env }>();

app.route("/api", api);

/**
 * Audio proxy. R2 objects are served through the Worker so we don't expose a
 * public bucket; the app token gates access via query param (audio elements
 * can't send Authorization headers). Spec §2: "public bucket behind
 * Worker-signed URLs" — here the Worker is the gate.
 */
app.get("/audio/:key{.+}", async (c) => {
  const token = c.req.query("t");
  if (!c.env.APP_TOKEN || token !== c.env.APP_TOKEN) {
    return c.text("unauthorized", 401);
  }
  const key = c.req.param("key");
  const obj = await c.env.AUDIO.get(key);
  if (!obj) return c.text("not found", 404);
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "audio/mpeg",
      "cache-control": "private, max-age=86400",
      etag: obj.httpEtag,
    },
  });
});

// Everything else → the built PWA (static assets binding handles SPA fallback).
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

/** Run the daily drop and push a notification to all subscriptions. */
async function runDailyDrop(env: Env): Promise<void> {
  const sql = openDb(env);
  try {
    const [settings] = await sql`select tz, drop_time, push_subs from user_settings where id = 1`;
    const tz = String(settings?.tz ?? "America/New_York");
    const dropTime = String(settings?.drop_time ?? "07:00");

    // Cron fires at 11:00 and 12:00 UTC; only proceed at the one that is the
    // configured local drop hour (handles EST/EDT).
    if (!isDropHour(new Date(), tz, dropTime)) return;

    // Skip if we already delivered today (idempotent against the double cron).
    const [already] = await sql`
      select 1 from deliveries
      where delivered_at >= date_trunc('day', now() at time zone ${tz})
      limit 1`;
    if (already) return;

    const outcome = await runPipeline(env, sql, { tz });
    if (!outcome.item) return;

    const subs: PushSubscriptionJSON[] = Array.isArray(settings?.push_subs)
      ? (settings!.push_subs as PushSubscriptionJSON[])
      : [];
    const gone: string[] = [];
    await Promise.all(
      subs.map(async (sub) => {
        try {
          const r = await sendPush(env, sub, {
            title: "聞き耳 Kikimimi",
            body: "今日の一本が届きました",
            url: "/",
          });
          if (r.gone) gone.push(sub.endpoint);
        } catch {
          /* ignore individual push failures */
        }
      }),
    );
    if (gone.length) {
      const kept = subs.filter((s) => !gone.includes(s.endpoint));
      await sql`update user_settings set push_subs = ${JSON.stringify(kept)} where id = 1`;
    }
  } finally {
    await closeDb(sql);
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDailyDrop(env));
  },
} satisfies ExportedHandler<Env>;
