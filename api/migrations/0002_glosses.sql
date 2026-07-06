-- Word-gloss cache for the Library word-tap dictionary (spec §5, Sprint 5).
-- Tapping a word looks it up here first; a miss calls the model once and
-- caches the result, so repeat taps of the same word are free.
-- Cached by tapped surface form (word); `lemma` is the model's dictionary form,
-- returned so add-to-SRS saves 食べる not 食べました (P3). Homographs sharing a
-- surface form collide — an accepted single-user tradeoff.
create table if not exists glosses (
  word       text primary key,
  lemma      text,
  reading    text not null default '',
  meaning_zh text not null default '',
  jlpt       text,
  created_at timestamptz not null default now()
);
