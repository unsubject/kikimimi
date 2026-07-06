-- Kikimimi — full database schema, all migrations concatenated in order
-- (0001_init → 0002_glosses → 0003_deliverables_seed → 0004_srs_due_index).
--
-- For the web-UI deploy path (see DEPLOY.md): paste this whole file into the
-- Railway Postgres "Data" query runner and run it once. Everything is
-- `create ... if not exists` plus guarded seeds, so it is idempotent — safe to
-- run more than once and safe to run again after adding future migrations.
--
-- If you use the CLI instead (`npm run db:migrate -w api`), ignore this file —
-- the runner applies the numbered files in api/migrations/ individually.

-- ========================================================================
-- 0001_init.sql
-- ========================================================================

create table if not exists user_settings (
  id               int primary key default 1 check (id = 1),
  tz               text not null default 'America/New_York',
  drop_time        text not null default '07:00',
  interest_weights jsonb not null default '{"economics":0.35,"society":0.25,"culture":0.25,"politics":0.15}',
  srs_daily_cap    int not null default 20,
  tts_voice        text not null default 'nova',
  monthly_reset_ack text,
  push_subs        jsonb not null default '[]'
);

create table if not exists learner_state (
  skill            text primary key,
  level            int not null default 1,
  scaffold_stage   int not null default 1,
  trailing_scores  jsonb not null default '[]',
  stage_entered_at timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists items (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,
  url           text not null,
  category      text not null,
  title_jp      text not null,
  script_jp     text not null,
  furigana      jsonb not null default '[]',
  gist_zh       text not null default '',
  vocab         jsonb not null default '[]',
  grammar_tags  jsonb not null default '[]',
  level         int not null default 1,
  jlpt_profile  jsonb not null default '{}',
  explain_back_prompt text not null default '',
  probes        jsonb not null default '[]',
  audio_r2_key  text,
  created_at    timestamptz not null default now()
);

create table if not exists deliveries (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references items(id),
  stage        int not null,
  delivered_at timestamptz not null default now()
);

create table if not exists responses (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references items(id),
  mode         text not null,
  raw_text     text,
  voice_r2_key text,
  transcript   text,
  created_at   timestamptz not null default now()
);

create table if not exists evaluations (
  id            uuid primary key default gen_random_uuid(),
  response_id   uuid not null references responses(id),
  score         numeric,
  missed_points jsonb not null default '[]',
  feedback      text,
  model         text,
  created_at    timestamptz not null default now()
);

create table if not exists srs_cards (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,
  front       jsonb not null,
  back        jsonb not null,
  jlpt_level  text,
  source_ref  text,
  fsrs_state  jsonb not null default '{}',
  due_at      timestamptz
);

create table if not exists error_log (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,
  detail      text not null,
  item_id     uuid references items(id),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists graduations (
  id          uuid primary key default gen_random_uuid(),
  skill       text not null,
  from_stage  int not null,
  to_stage    int not null,
  direction   text not null,
  created_at  timestamptz not null default now()
);

create table if not exists cost_log (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  category   text not null,
  usd        numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists cost_log_day_idx on cost_log(day);

create table if not exists deliverables (
  id           uuid primary key default gen_random_uuid(),
  sprint       int not null,
  name         text not null,
  artifact_url text,
  notion_url   text,
  created_at   timestamptz not null default now()
);

-- Seed: single-user settings row and learner-model rows (all skills at L1/S1).
insert into user_settings (id) values (1) on conflict (id) do nothing;
insert into learner_state (skill) values
  ('listening'), ('reading'), ('speaking'), ('vocab'), ('grammar')
on conflict (skill) do nothing;

-- ========================================================================
-- 0002_glosses.sql — word-gloss cache for the Library word-tap dictionary
-- ========================================================================

create table if not exists glosses (
  word       text primary key,
  lemma      text,
  reading    text not null default '',
  meaning_zh text not null default '',
  jlpt       text,
  created_at timestamptz not null default now()
);

-- ========================================================================
-- 0003_deliverables_seed.sql — seed the six Work Gallery deliverables
-- (guarded so re-running can't duplicate)
-- ========================================================================

insert into deliverables (sprint, name)
select v.sprint, v.name
from (values
  (1, 'Kana-accurate voice note + app v0.1 shipped'),
  (2, '"Japanese grammar for Chinese speakers" explainer'),
  (3, 'Stage-2 graduation + Cantonese–on''yomi cheat sheet'),
  (4, '2-min Japanese voice explanation of an econ story'),
  (5, 'Bilingual annotated commentary (Bridge Artifact #1)'),
  (6, 'Listening gauntlet passed + published bridge piece')
) as v(sprint, name)
where not exists (select 1 from deliverables);

-- ========================================================================
-- 0004_srs_due_index.sql — partial index for the review-queue hot path
-- ========================================================================

create index if not exists srs_cards_due_at_idx
  on srs_cards (due_at)
  where due_at is not null;
