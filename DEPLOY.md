# Deploying Kikimimi (web-UI / dashboard path)

This is the click-through deployment — no local CLI required. You'll use three
dashboards: **Railway** (Postgres), **Cloudflare** (Worker + Hyperdrive + R2),
and GitHub's web editor for one small config edit.

Two steps aren't pure point-and-click and are called out below: loading the DB
schema (one SQL paste) and — only if you want push notifications — generating
VAPID keys. Push is optional for the first deploy; the app works without it.

Prerequisites: a Cloudflare account, a Railway account, an Anthropic API key,
and an OpenAI API key.

---

## 1. Postgres — Railway

1. **railway.app** → **New Project** → **Deploy PostgreSQL** (or Add → Database → Postgres).
2. Open the Postgres service → **Variables** / **Connect** → copy the **public**
   connection string (`postgres://user:pass@host:port/db`). Keep it handy for
   steps 2 and 4.

## 2. Load the schema — Railway "Data" tab

1. In the Postgres service, open the **Data** tab (query runner).
2. Open [`deploy/schema.sql`](deploy/schema.sql) in this repo, copy the whole
   file, paste it into the query box, and **Run**. It creates every table + the
   seed rows and is idempotent (safe to re-run).
   - *No Data tab on your plan?* Use any web SQL client (e.g. a Postgres GUI)
     pointed at the connection string from step 1, and run the same file.

## 3. Audio bucket — Cloudflare R2

1. Cloudflare dashboard → **R2** → **Create bucket**.
2. Name it exactly **`kikimimi-audio`** (matches `api/wrangler.jsonc`). Create.

## 4. Database accelerator — Cloudflare Hyperdrive

1. Cloudflare dashboard → **Hyperdrive** → **Create configuration**.
2. Paste the Railway connection string from step 1. Save.
3. **Copy the Hyperdrive config ID** (you'll paste it in step 5).

## 5. One config edit — GitHub web editor

1. On github.com open **`api/wrangler.jsonc`** → pencil (Edit).
2. Replace `REPLACE_WITH_HYPERDRIVE_ID` with your Hyperdrive ID from step 4.
3. Commit to `main`. (The Hyperdrive ID is a config identifier, not a secret.)

## 6. Deploy the Worker — Cloudflare "Import a repository"

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a
   repository** → authorize GitHub and select **`unsubject/kikimimi`**.
2. Set the build settings **exactly** as below. This is an npm-workspaces
   monorepo, so Cloudflare must target the app subfolder (`api/`, where
   `wrangler.jsonc` lives) as the project, while the build climbs back to the
   repo root to build everything:

   | Setting | Value |
   |---------|-------|
   | **Root directory** | `api` |
   | **Build command** | `cd .. && npm ci && npm run build` |
   | **Deploy command** | `npx wrangler deploy` |

   - **Root = `api`** so Cloudflare's deploy detection finds one specific Worker.
     Pointing it at the repo root fails with *"application detection … run in the
     root of a workspace … target a specific project"*.
   - **Build** steps up to the repo root to install the whole workspace and build
     the PWA into `web/dist` (which `wrangler.jsonc`'s `assets.directory:
     ../web/dist` then picks up).
   - **Deploy** runs inside `api/`, so `npx wrangler deploy` finds
     `api/wrangler.jsonc` with no `-c` flag.
3. Create / deploy. The R2 binding, the Hyperdrive binding, and the hourly cron
   trigger are all read from `api/wrangler.jsonc` automatically.

> Every push to `main` now redeploys automatically.

## 7. Secrets — in the Worker's dashboard

Open the Worker → **Settings** → **Variables and Secrets** → add each as an
**encrypted secret** (not plaintext), then **Redeploy**:

| Secret | Value |
|--------|-------|
| `APP_TOKEN` | A long random string you invent — this is your single-user login |
| `ANTHROPIC_API_KEY` | Your Anthropic key (script generation + grading) |
| `OPENAI_API_KEY` | Your OpenAI key (TTS + Whisper) |

That's all you need to run. **Never** paste these into the repo or into chat.

## 8. First run

Open the deployed URL → paste your `APP_TOKEN` → **Add to Home Screen**
(required for iOS Web Push) → in **Settings**, pick a TTS voice
(`nova` / `shimmer` / `coral`). The first daily drop lands at your local
`drop_time` (default 07:00); use **もう一本 / More** on Today to generate one now.

---

## Push notifications (optional — add later)

The daily push nudge needs VAPID keys. To enable it:

1. Generate a VAPID keypair — a reputable in-browser generator, or run
   `npm run gen:vapid -w api` on any machine. **Do not paste the private key
   into chat or commit it.**
2. In the Worker → Settings → Variables and Secrets, add three encrypted secrets:
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:you@example.com`).
3. Redeploy. Then in the app → Settings → **通知を有効にする**.

## Cost

Typical day **$0.10–0.20**, heavy burst day **$1.20–1.60**, expected month
**$8–15**. Built-in governor: $1.50/day soft-warn → $2.00/day degrade to no-LLM
mode → $45/month circuit breaker (needs a manual `/reset` acknowledgement).

## CLI alternative

Prefer the terminal? See the **Deployment** section of [`README.md`](README.md)
— `wrangler` for R2/Hyperdrive/secrets/deploy and `npm run db:migrate -w api`
for the schema.
