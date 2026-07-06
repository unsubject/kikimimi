import type { VocabEntry } from "@kikimimi/shared";
import type { Sql } from "./db.js";
import { scheduleNew, scheduleReview, type FsrsState, type Rating } from "./srs.js";
import { onyomiCards } from "./content/onyomi.js";

/**
 * SRS card persistence for the Review surface (spec §5). FSRS memory state and
 * bookkeeping live in the `srs_cards.fsrs_state` jsonb; `due_at` is the column
 * we query the daily queue by. New cards carry `{status:"new"}` (no memory
 * state yet) and become due immediately.
 */

interface StoredState extends Partial<FsrsState> {
  status: "new" | "review";
  last_reviewed_at?: string;
}

const DAY_MS = 86_400_000;

/** Harvest an item's key vocab into the deck as new cards (deduped by word). */
export async function harvestVocab(
  sql: Sql,
  itemId: string,
  vocab: VocabEntry[],
): Promise<number> {
  let added = 0;
  for (const v of vocab) {
    const [existing] = await sql`
      select 1 from srs_cards
      where type = 'vocab' and front->>'word' = ${v.word} limit 1`;
    if (existing) continue;
    await sql`
      insert into srs_cards (type, front, back, jlpt_level, source_ref, fsrs_state, due_at)
      values (
        'vocab',
        ${JSON.stringify({ word: v.word })},
        ${JSON.stringify({ reading: v.reading, meaning_zh: v.meaning_zh })},
        ${v.jlpt}, ${itemId}, ${JSON.stringify({ status: "new" })}, now()
      )`;
    added += 1;
  }
  return added;
}

/**
 * Seed the Cantonese→on'yomi correspondence pack into the deck (Sprint 3).
 * Front = character + Cantonese reading; back = on'yomi + which rule. Idempotent
 * (deduped by hanzi). Returns how many new cards were added.
 */
export async function harvestOnyomi(sql: Sql): Promise<number> {
  let added = 0;
  for (const card of onyomiCards()) {
    const [existing] = await sql`
      select 1 from srs_cards
      where type = 'onyomi' and front->>'hanzi' = ${card.hanzi} limit 1`;
    if (existing) continue;
    await sql`
      insert into srs_cards (type, front, back, jlpt_level, source_ref, fsrs_state, due_at)
      values (
        'onyomi',
        ${JSON.stringify({ hanzi: card.hanzi, cantonese: card.cantonese })},
        ${JSON.stringify({ kana: card.kana, romaji: card.romaji, pattern: card.pattern, rule: card.ruleId })},
        null, ${card.ruleId}, ${JSON.stringify({ status: "new" })}, now()
      )`;
    added += 1;
  }
  return added;
}

/** Turn a corrected mistake into a cloze-style recall card (spec §5, §8). */
export async function harvestError(
  sql: Sql,
  itemId: string,
  category: string,
  detail: string,
): Promise<void> {
  await sql`
    insert into srs_cards (type, front, back, jlpt_level, source_ref, fsrs_state, due_at)
    values (
      'error_cloze',
      ${JSON.stringify({ prompt: detail, category })},
      ${JSON.stringify({ note: detail })},
      null, ${itemId}, ${JSON.stringify({ status: "new" })}, now()
    )`;
}

export interface DueCard {
  id: string;
  type: string;
  front: Record<string, unknown>;
  back: Record<string, unknown>;
  jlpt_level: string | null;
  is_new: boolean;
}

/** The review queue: due cards, oldest-due first, capped by the daily setting. */
export async function dueCards(sql: Sql, cap: number): Promise<DueCard[]> {
  const rows = await sql`
    select id, type, front, back, jlpt_level, fsrs_state
    from srs_cards
    where due_at is not null and due_at <= now()
    order by due_at asc
    limit ${cap}`;
  return rows.map((r) => ({
    id: String(r.id),
    type: String(r.type),
    front: (r.front as Record<string, unknown>) ?? {},
    back: (r.back as Record<string, unknown>) ?? {},
    jlpt_level: r.jlpt_level ? String(r.jlpt_level) : null,
    is_new: !(r.fsrs_state as StoredState)?.stability,
  }));
}

export interface GradeCardResult {
  interval_days: number;
  due_at: string;
}

/** Apply a rating to a card, advancing its FSRS state and next due date. */
export async function gradeCard(
  sql: Sql,
  id: string,
  rating: Rating,
  now = new Date(),
): Promise<GradeCardResult | null> {
  const [card] = await sql`select fsrs_state from srs_cards where id = ${id}`;
  if (!card) return null;
  const stored = (card.fsrs_state as StoredState) ?? { status: "new" };

  const result =
    stored.stability === undefined
      ? scheduleNew(rating)
      : scheduleReview(
          {
            stability: stored.stability,
            difficulty: stored.difficulty ?? 5,
            reps: stored.reps ?? 1,
            lapses: stored.lapses ?? 0,
          },
          rating,
          stored.last_reviewed_at
            ? Math.max(0, (now.getTime() - new Date(stored.last_reviewed_at).getTime()) / DAY_MS)
            : 0,
        );

  const nextState: StoredState = {
    ...result.state,
    status: "review",
    last_reviewed_at: now.toISOString(),
  };
  const dueAt = new Date(now.getTime() + result.intervalDays * DAY_MS).toISOString();

  await sql`
    update srs_cards set fsrs_state = ${JSON.stringify(nextState)}, due_at = ${dueAt}
    where id = ${id}`;

  return { interval_days: result.intervalDays, due_at: dueAt };
}

/** Count of currently-due cards — for the Review badge / progress. */
export async function dueCount(sql: Sql): Promise<number> {
  const [row] = await sql`
    select count(*)::int as n from srs_cards
    where due_at is not null and due_at <= now()`;
  return Number(row?.n ?? 0);
}
