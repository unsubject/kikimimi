import { Hono } from "hono";
import type { Env } from "./env.js";
import { api } from "./routes/api.js";
import { openDb, closeDb } from "./db.js";
import { runPipeline } from "./content/pipeline.js";
import { sendPush } from "./push.js";
import { isDropDue } from "./time.js";
import { verifyAudioToken, isAudioToken, timingSafeEqual } from "./audiotoken.js";
import type { PushSubscriptionJSON } from "@kikimimi/shared";

const app = new Hono<{ Bindings: Env }>();

app.route("/api", api);

/**
 * Audio proxy. R2 objects are served through the Worker so we don't expose a
 * public bucket. Audio elements can't send Authorization headers, so access is
 * granted by a `?t=` query token — a short-lived HMAC audio token (spec §2
 * "Worker-signed URLs"), with the raw master token accepted only as a fallback
 * for direct/programmatic use. The client always uses the signed token so the
 * master credential never lands in a logged/cached URL.
 */
app.get("/audio/:key{.+}", async (c) => {
  const token = c.req.query("t") ?? "";
  // Fail closed if APP_TOKEN is unset (also keeps verifyAudioToken from ever
  // importing a zero-length HMAC key).
  const ok =
    !!c.env.APP_TOKEN &&
    (isAudioToken(token)
      ? await verifyAudioToken(c.env.APP_TOKEN, token)
      : timingSafeEqual(token, c.env.APP_TOKEN));
  if (!ok) return c.text("unauthorized", 401);
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

    // The cron runs hourly; deliver once the local time reaches the configured
    // drop hour. The once-per-day guard below means only the first qualifying
    // tick actually delivers, so any drop_time (not just 07:00) is honoured.
    if (!isDropDue(new Date(), tz, dropTime)) return;

    // Skip if we already delivered today (idempotent against retries / hourly
    // re-fires). The double `at time zone` yields the correct tz-local midnight
    // as a timestamptz, so the day boundary is the learner's local day.
    const [already] = await sql`
      select 1 from deliveries
      where delivered_at >= (date_trunc('day', now() at time zone ${tz}) at time zone ${tz})
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
    // Log (don't swallow silently) so a failed drop is visible; because the
    // once-per-day guard only trips after a *successful* delivery, the next
    // hourly tick re-attempts the drop — automatic same-day retry.
    ctx.waitUntil(
      runDailyDrop(env).catch((err) => console.error("daily drop failed:", err)),
    );
  },
} satisfies ExportedHandler<Env>;
