-- Word-gloss cache for the Library word-tap dictionary (spec §5, Sprint 5).
-- Tapping a word looks it up here first; a miss calls the model once and
-- caches the result, so repeat taps of the same word are free.
create table if not exists glosses (
  word       text primary key,
  reading    text not null default '',
  meaning_zh text not null default '',
  jlpt       text,
  created_at timestamptz not null default now()
);
