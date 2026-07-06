# 聞き耳 Kikimimi — App Spec v1.2 (BUILD-READY)

**Listening-first Japanese immersion web app for a single user (Simon / 利世民).**
Daily AI-generated micro-podcast from live Japan news → scaffold-faded comprehension exercises → teach-to-learn evaluation → adaptive difficulty → FSRS review deck. Burst-friendly. Streak-free gamification. JLPT-aligned progress.

Written to be handed to Claude Code. Companion pedagogical document: `learnplan-japanese-20260706.md`. Release milestones v0.1–v1.0 map 1:1 to that plan's Sprints 1–6.

**v1.1 changes from v1.0:** Telegram → installable PWA; SRS added (FSRS); JLPT alignment added; Nikkei replaced with Toyo Keizai + NHK business (decision, see §3); TTS voice = female; audio on Cloudflare R2; cost ceilings confirmed; drop time set to 07:00 ET.
**v1.2 changes from v1.1 (final):** Gamification (XP/levels/achievements) **deferred** to post-v1.0 to simplify the build — graduations and the Work Gallery remain, as they are pedagogy, not gamification. Telegram ping bridge **dropped** — Web Push only. Only remaining open item: TTS voice pick.

---

## 1. Product Principles

1. **Listening-first.** Every content item is audio-primary. Text supports audio, never replaces it.
2. **Scaffold fade.** Three stages per item type; graduation earned from measured performance (user can override both ways).
   - **S1:** JP audio + JP text with furigana (`<ruby>`) + Chinese gist behind tap-to-reveal
   - **S2:** JP audio + JP text (furigana toggle)
   - **S3:** JP audio only; text behind tap-to-reveal
3. **Anti-bypass.** Chinese translation is NEVER visible by default at any stage.
4. **Teach-to-learn.** Core exercise = explain-back: user proves comprehension by explaining the item (text or recorded voice); system grades and gives one targeted correction.
5. **Streak-free.** No streaks, no guilt copy. Progress = scaffold graduations and the Work Gallery. A missed week costs only the week.
6. **Burst-mode elastic.** 10-minute micro-dose always one tap away; "More" keeps serving deeper material within cost limits.
7. **Interest-driven content.** Economics, society, culture, politics of Japan — newest and most interesting first.

## 2. Architecture

```
┌─ Front-end: React PWA (Vite + TypeScript)
│    ├─ Hosted on Cloudflare Workers (static assets)
│    ├─ Service worker: offline cache of recent items + Web Push notifications
│    ├─ Audio: HTML5 player, playbackRate 0.75×/0.85×/1.0× (native — no slow-TTS variant needed)
│    ├─ Voice input: MediaRecorder API → upload to API
│    └─ Installable to home screen (iOS + Android)
├─ API: Cloudflare Worker (Hono), Telegram-free
│    ├─ Cron Triggers: daily content job (07:00 ET), cost rollup, SRS queue build
│    └─ Web Push sender (VAPID)
├─ Postgres (Railway) — learner model, items, SRS state, responses, cost log
├─ Audio storage: Cloudflare R2 (public bucket behind Worker-signed URLs)
├─ LLM: Anthropic API (claude-sonnet-4-6 for generation; haiku for grading passes)
├─ TTS: OpenAI tts-1, female voice — generate samples with "nova", "shimmer", "coral" in Sprint 1; user picks
├─ STT: OpenAI whisper-1 (language hint ja)
└─ Sources: RSS/fetch — see §3
```

Single-user: access via one signed magic link / long-lived token; no auth flows, no multi-tenancy.

**The ambush problem (named explicitly):** Telegram's one killer feature was that it lives where Simon already is — the app could ambush a burst-mode brain. The PWA earns that with **Web Push** (supported on iOS since 16.4; requires home-screen install — make install the very first onboarding step) for the daily drop and SRS-due nudges. Web Push is the sole notification channel by decision. If, after 30 days of real use, drops are being consistently ignored, revisit the notification strategy at a checkpoint — do not silently add channels.

## 3. Content Pipeline (daily job, 07:00 America/New_York)

1. **Fetch** candidates:
   - NHK News Easy (graded Japanese with furigana) — primary until level ≥ 3
   - NHK News main RSS (politics/society/business categories)
   - 東洋経済オンライン (Toyo Keizai Online) RSS — economics/business analysis
   - Yahoo!ニュース business & culture category RSS
   - **Nikkei decision:** excluded. Hard paywall + no public RSS + scraping is a ToS fight not worth having for v1. Toyo Keizai + NHK business cover the econ beat; Nikkei can be added later via licensed API if ever justified.
2. **Select** 1 item scored by interest profile (economics 0.35, society 0.25, culture 0.25, politics 0.15 — editable in settings) + novelty (skip topics covered in last 7 days).
3. **Generate** podcast script with Claude at learner's current level:
   - Level 1–2: 100–200 chars, NHK-Easy vocabulary band | Level 3–4: 250–450 chars | Level 5: near-native
   - Output: title (JP), body (JP), furigana ruby data, ZH gist (2–3 sentences; names of people/places kept in original Japanese), key vocab (3–5 items, each tagged with JLPT level), explain-back prompt, 2 comprehension probes, grammar-point tags (JLPT-levelled).
4. **TTS** body → opus/mp3 → R2. Signed URL served to player.
5. **Deliver:** Web Push ("今日の一本が届きました") + item appears at top of Today view, formatted per scaffold stage. New vocab auto-enters the SRS deck as *unlearned* (activates after first encounter is marked).

**Burst mode:** "More" button runs steps 1–5 with next-ranked candidate. No cap except the cost governor.

## 4. Surfaces & Interaction Modes

| Surface | Contents | Ships in |
|---------|----------|----------|
| **Today** | Daily drop: player (speed control), stage-formatted text, tap-reveal ZH, explain-back box (text/mic), probes, "More" | v0.1 |
| **Review (SRS)** | FSRS queue: vocab & grammar cards harvested from encountered items and the error log. Card front = audio or JP; back = reading + meaning. Listening-first card types preferred | v0.2 |
| **Drills** | Kana drills (Sprint 1); shadowing mode: sentence audio → record imitation → feedback on morae/long vowels/gemination | v0.1/v0.3 |
| **Talk** | Conversation mode: app asks (JP audio) about today's item; user records answer; Claude responds in graded JP + one correction; error log updated | v0.4 |
| **Library** | All past items, full-article long reads, ruby toggle, word-tap gloss | v0.5 |
| **Progress** | Dashboard: level & scaffold stage per skill, accuracy trends, XP & achievements, JLPT coverage, Work Gallery | v1.0 |

**Feedback tone:** direct, concrete, zero cheerleading filler. One primary correction per exchange; full detail behind a "詳細" expander.

## 5. SRS (FSRS)

- Algorithm: **FSRS** (open-source scheduler; better retention modelling than SM-2).
- Card sources: (a) key vocab from daily items, (b) error-log entries (a particle mistake becomes a cloze card), (c) Cantonese→on'yomi correspondence pairs (Sprint 3), (d) manual add from any word-tap in Library.
- Card types, listening-first by default: audio→meaning, audio→transcription, JP text→reading (kana), cloze grammar.
- Daily review cap default 20 cards (setting), due-cards push nudge at user-chosen hour, **no penalty for skipped days** — FSRS handles lateness natively, which is exactly why it fits a streak-free system.

## 6. Gamification — DEFERRED (post-v1.0)

XP, levels, and achievement badges are **out of scope for v1** to simplify the build; user is ambivalent and the decision is parked. Do not build xp/achievement tables, events, or UI.

What remains — and is pedagogy, not gamification: **scaffold graduations** (announced as unlocked capabilities) and the **Work Gallery** (sprint deliverables). These are the plan's core visible-accumulation mechanics and must ship.

If gamification is revisited post-v1.0, the constraint stands: capability-based only (badges/milestones), never continuity-based (no streaks, expiring quests, or decay — these punish absence and break burst-mode brains).

## 7. JLPT Alignment

- All vocab and grammar tags carry JLPT levels (N5–N1) from standard lists (JMdict frequency + JLPT tag data).
- Internal levels map: L1≈N5, L2≈N5–N4, L3≈N4, L4≈N4–N3, L5≈N3+.
- Progress dashboard shows **coverage bars**: % of N5/N4/N3 vocab and grammar encountered and matured in SRS.
- JLPT is a *ruler, not a syllabus*: content selection is never driven by JLPT lists; the bars simply translate organic progress into a recognized external scale (and make a future decision to actually sit N4/N3 an informed one).

## 8. Learner Model

```sql
learner_state (
  skill            text,        -- listening | reading | speaking | vocab | grammar
  level            int,         -- 1..5
  scaffold_stage   int,         -- 1..3, per skill
  trailing_scores  jsonb,       -- last 10 scores for this skill
  stage_entered_at timestamptz,
  updated_at       timestamptz
)
```

**Graduation (S1→S2, S2→S3):** trailing-10 mean ≥ 80% AND ≥ 14 days at stage AND ≥ 8 items at stage → automatic, announced as an unlocked capability. **De-graduation:** trailing-10 mean < 55% → drop one stage, matter-of-fact copy, no shame. **Level-up:** trailing ≥ 85% at S2+ over 20 items → offered, user confirms.

Error log records every corrected mistake (particle, conjugation, vocab, phonology…); daily generation prompt injects top 3 recurring errors so new content quietly re-tests them; each error also spawns an SRS card.

## 9. Data Schema (summary)

```
user_settings(id, tz, drop_time, interest_weights jsonb, srs_daily_cap, push_subs jsonb)
items(id, source, url, title_jp, script_jp, furigana jsonb, gist_zh, vocab jsonb,
      grammar_tags jsonb, level, jlpt_profile jsonb, audio_r2_key, created_at)
deliveries(id, item_id, stage, delivered_at)
responses(id, item_id, mode, raw_text, voice_r2_key, transcript, created_at)
evaluations(id, response_id, score, missed_points jsonb, feedback, model, created_at)
srs_cards(id, type, front jsonb, back jsonb, jlpt_level, source_ref, fsrs_state jsonb, due_at)
error_log(id, category, detail, item_id, created_at, resolved_at)
graduations(id, skill, from_stage, to_stage, direction, created_at)
cost_log(id, day, category, usd)
deliverables(id, sprint, name, artifact_url, notion_url, created_at)  -- Work Gallery
```

## 10. Cost Model & Governor — CONFIRMED

| Activity | Unit cost | Typical/day |
|----------|-----------|-------------|
| Daily podcast: script gen (Sonnet) | ~$0.035 | $0.035 |
| TTS (~400 chars) | ~$0.006 | $0.01 |
| Explain-back grade (Haiku pass) | $0.01–0.04 | $0.06 |
| Voice note (Whisper + grade) | ~$0.05 | $0.10 |
| Burst item (gen+TTS+grade) | ~$0.10 | 0–10× |
| SRS card generation (batched, Haiku) | ~$0.01/item | $0.01 |

Typical micro-dose day $0.10–0.20; heavy burst day $1.20–1.60; p95 ≈ $1.60.

- Soft warn **$1.50/day** (unobtrusive banner)
- Hard ceiling **$2.00/day**: finish current exchange gracefully, then degrade to cached/no-LLM mode (SRS reviews and kana drills run fully client-side, past-item re-listening free) until midnight. Never cut mid-conversation.
- Monthly breaker **$45**, manual `/reset` acknowledgment.
- Expected typical month: **$8–15.**

## 11. Release Milestones

| Version | Ships with Sprint | Scope |
|---------|-------------------|-------|
| v0.1 | 1 | PWA shell + home-screen install, Today view, daily drop pipeline (single sentences), kana drills, tap-to-reveal, audio player with speed control, R2, cost logging, Web Push |
| v0.2 | 2 | Full daily podcast (Stage 1), explain-back grading (text + mic), error log, SRS engine + Review surface |
| v0.3 | 3 | Shadowing mode, graduation logic, Cantonese–on'yomi card pack |
| v0.4 | 4 | Conversation mode (JP voice dialogue), keigo-awareness tagging |
| v0.5 | 5 | Library: long-read surface, ruby furigana, word-tap gloss + add-to-SRS |
| v1.0 | 6 | Progress dashboard, JLPT coverage bars, Work Gallery, listening-gauntlet mode, Phase-2 hooks |

## 12. Non-Goals (v1)

- No multi-user support, no paywall, no auth beyond single-user token
- No gamification of any kind in v1 (deferred; see §6)
- No Telegram integration of any kind — Web Push is the sole notification channel
- No human-tutor marketplace, no social features
- No native app-store builds (PWA only; revisit if iOS push proves unreliable in practice)

## 13. Open Items

1. TTS voice — generate 3 female samples ("nova", "shimmer", "coral") in Sprint 1; user picks in-app
