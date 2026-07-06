# 聞き耳 Kikimimi

**Listening-first Japanese immersion PWA for a single user.** A daily
AI-generated micro-podcast from live Japan news → scaffold-faded comprehension
exercises → teach-to-learn (explain-back) grading → adaptive difficulty.
Burst-friendly, streak-free, JLPT-aligned.

This repo implements **v0.1** of the app described in
[`docs/kikimimi-app-spec-v1.2.md`](docs/kikimimi-app-spec-v1.2.md), the delivery
system for the learning plan in
[`docs/learnplan-japanese-20260706.md`](docs/learnplan-japanese-20260706.md).
Release milestones v0.1–v1.0 map 1:1 to that plan's Sprints 1–6.

## What ships in v0.1 (Sprint 1)

| Area | Delivered |
|------|-----------|
| PWA shell | Installable to home screen (iOS + Android), offline cache of recent items/audio |
| Today view | Daily drop with audio player (0.75×/0.85×/1.0×), furigana `<ruby>` text, tap-to-reveal ZH gist, explain-back box |
| Daily drop pipeline | Fetch (NHK Easy/RSS + Toyo Keizai) → interest+novelty select → **Claude structured generation** → **OpenAI tts-1** → R2 → deliver |
| Explain-back grading | Haiku grades comprehension, returns one correction, updates the learner model + error log |
| Kana drills | Hiragana/katakana automaticity — fully client-side (works offline / in cost-degraded mode) |
| Web Push | VAPID + aes128gcm, the sole notification channel (07:00 ET daily drop nudge) |
| Cost governor | $1.50 soft warn, $2.00/day hard ceiling → degrade to no-LLM mode, $45/month breaker |
| Scaffold graduation | S1→S2→S3 auto-graduation from measured performance, announced as an unlocked capability |

Deferred per spec §6/§11: gamification (XP/levels), full FSRS SRS, conversation
mode, long-read Library, Progress dashboard — the schema for them exists in
`api/migrations/0001_init.sql` but v0.1 does not write those tables.

## Architecture

```
web/     React PWA (Vite + TS)         → built to web/dist, served by the Worker
api/     Cloudflare Worker (Hono)       → API + daily cron + Web Push + audio proxy
shared/  Shared TypeScript types        → the §8–9 data schema, imported by both
```

- **Front-end**: React PWA, service worker (push + offline), installable.
- **API**: one Cloudflare Worker (Hono) serving `/api/*`, `/audio/*`, and the
  static PWA. Cron triggers the 07:00 ET daily job.
- **DB**: Postgres (Railway) reached through Cloudflare Hyperdrive.
- **Audio**: Cloudflare R2, served through a Worker-gated `/audio/:key` route.
- **LLM**: Anthropic API — `claude-sonnet-4-6` (generation), `claude-haiku-4-5`
  (grading). See the note on structured output below.
- **TTS / STT**: OpenAI `tts-1` (voice picked in-app); Whisper reserved for v0.4.

### Structured output via tool use (the core generation primitive)

Both the content generator (`api/src/content/generate.ts`) and the explain-back
grader (`api/src/grade.ts`) need guaranteed-shape JSON from the model. From the
Worker we call the Anthropic Messages API with plain `fetch` and force a single
tool call whose `input_schema` **is** the JSON Schema we want back
(`api/src/anthropic.ts`):

```ts
tool_choice: { type: "tool", name: "emit_item" }   // model must call this tool
tools: [{ name: "emit_item", input_schema: SCHEMA }] // schema = the shape we want
// → read the validated object off the tool_use block's `input`
```

This is the recommended way to get schema-conformant JSON out of the model
without pulling the SDK into the Worker bundle.

## Local development

```bash
npm install                 # installs all three workspaces
npm test                    # api unit tests (governor, graduation, selection,
                            #   feed parsing, and the web-push encrypt→decrypt round-trip)
npm run typecheck           # shared + api + web (app & service worker)
npm run build               # build the PWA + typecheck the Worker

npm run dev:web             # Vite dev server (proxies /api, /audio to :8787)
npm run dev:api             # wrangler dev (needs .dev.vars + a local/tunnelled Postgres)
```

## Deployment

### 1. Postgres (Railway) + Hyperdrive

```bash
# Create a Railway Postgres, grab its connection string, then run migrations:
DATABASE_URL="postgres://…railway…" npm run db:migrate -w api

# Put it behind Hyperdrive and paste the returned id into api/wrangler.jsonc:
npx wrangler hyperdrive create kikimimi-db --connection-string="postgres://…railway…"
```

### 2. R2 bucket

```bash
npx wrangler r2 bucket create kikimimi-audio
```

### 3. VAPID keys for Web Push

```bash
npm run gen:vapid -w api    # prints VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

### 4. Secrets

```bash
cd api
npx wrangler secret put APP_TOKEN          # any long random string (single-user auth)
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT      # mailto:you@example.com
```

For local `wrangler dev`, put the same keys in `api/.dev.vars` (git-ignored).

### 5. Deploy

```bash
npm run deploy              # builds shared + PWA, then `wrangler deploy` the Worker
```

Open the deployed URL, paste your `APP_TOKEN`, **add to home screen** (required
for iOS Web Push — it's the first onboarding step), then enable notifications in
Settings.

## Cost model (spec §10 — confirmed)

Typical micro-dose day **$0.10–0.20**; heavy burst day **$1.20–1.60**; expected
month **$8–15**. The governor enforces the ceilings:

- **$1.50/day** — unobtrusive soft-warn banner.
- **$2.00/day** — hard ceiling; finishes the current exchange, then degrades to
  no-LLM mode (kana drills + past-item re-listening stay free) until midnight.
- **$45/month** — circuit breaker; requires a manual `/reset` acknowledgement.

## Open item

**TTS voice** — three OpenAI voices (`nova`, `shimmer`, `coral`) are selectable
in Settings; pick your preferred one during Sprint 1 (spec §13).

## Layout

```
docs/    the app spec + the learning plan
shared/  src/types.ts — the shared data model
api/     src/            Worker: routes, pipeline, anthropic, tts, push, cost, learner
         migrations/     SQL schema
         scripts/        migrate.mjs, gen-vapid.mjs
         test/           vitest suites
web/     src/            React app, views, components, drills, service worker
         scripts/        gen-icons.mjs
         public/         manifest + icons
```
