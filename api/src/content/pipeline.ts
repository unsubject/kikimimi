import type { Item, InterestWeights, ScaffoldStage } from "@kikimimi/shared";
import type { Env } from "../env.js";
import type { Sql } from "../db.js";
import { checkGovernor, logCost, readSpend, ttsCostUsd } from "../cost.js";
import { synthesize } from "../tts.js";
import { currentVoice } from "../ttscache.js";
import { fetchSource, SOURCES, type Candidate } from "./sources.js";
import { selectItem } from "./select.js";
import { generateItem } from "./generate.js";
import { harvestVocab } from "../cards.js";

export interface PipelineOutcome {
  item: Item | null;
  reason?: string;
  usd: number;
}

/**
 * Run one full daily-drop pipeline (spec §3). Used by the cron handler and by
 * the "More" burst button. Respects the cost governor: if the daily ceiling
 * or monthly breaker is tripped, it does not spend and returns a reason.
 */
export async function runPipeline(
  env: Env,
  sql: Sql,
  opts: { tz: string; force?: boolean } = { tz: "America/New_York" },
): Promise<PipelineOutcome> {
  // Governor gate before spending anything.
  const spend = await readSpend(sql, opts.tz);
  try {
    checkGovernor(spend);
  } catch (err) {
    return { item: null, reason: (err as Error).message, usd: 0 };
  }

  const [settings] = await sql`select * from user_settings where id = 1`;
  const weights = settings?.interest_weights as InterestWeights;
  const voice = await currentVoice(sql); // allow-list validated (never a raw stored string)

  const [listening] = await sql`select level from learner_state where skill = 'listening'`;
  const [reading] = await sql`select level from learner_state where skill = 'reading'`;
  const level = Math.min(
    Number(listening?.level ?? 1),
    Number(reading?.level ?? 1),
  );

  // Fetch candidates from every source in parallel.
  const lists = await Promise.all(SOURCES.map(fetchSource));
  const candidates: Candidate[] = lists.flat();
  if (candidates.length === 0) {
    return { item: null, reason: "no candidates fetched from any source", usd: 0 };
  }

  // Novelty: titles from the last 7 days.
  const recent = await sql`
    select title_jp from items where created_at > now() - interval '7 days'`;
  const recentTitles = recent.map((r) => String(r.title_jp));

  const chosen = selectItem(candidates, weights, recentTitles, level);
  if (!chosen) return { item: null, reason: "no candidate passed selection", usd: 0 };

  // Top 3 recurring errors feed back into generation (spec §8).
  const errors = await sql`
    select detail from error_log where resolved_at is null
    order by created_at desc limit 3`;
  const recentErrors = errors.map((e) => String(e.detail));

  const gen = await generateItem(env, chosen, level, recentErrors);
  await logCost(sql, opts.tz, "script_gen", gen.usd);

  // TTS → R2.
  let audioKey: string | null = null;
  let ttsUsd = 0;
  try {
    const audio = await synthesize(env, gen.item.script_jp, voice);
    audioKey = `items/${crypto.randomUUID()}.mp3`;
    await env.AUDIO.put(audioKey, audio, {
      httpMetadata: { contentType: "audio/mpeg" },
    });
    ttsUsd = ttsCostUsd(gen.chars);
    await logCost(sql, opts.tz, "tts", ttsUsd);
  } catch (err) {
    // Audio failure is non-fatal in v0.1 — the item still ships (text + retry later).
    audioKey = null;
  }

  // Deliver at the learner's current listening scaffold stage.
  const [ls] = await sql`select scaffold_stage from learner_state where skill = 'listening'`;
  const stage = Number(ls?.scaffold_stage ?? 1) as ScaffoldStage;

  // Write the item and its delivery ATOMICALLY: a mid-write failure must not
  // leave an item with no delivery row — that item would be invisible to /today
  // while the daily-drop idempotency guard (which keys on deliveries) wouldn't
  // see it either, so the next cron would generate (and pay for) a duplicate.
  const row = (await sql.begin(async (tx) => {
    const [r] = await tx`
      insert into items (
        source, url, category, title_jp, script_jp, furigana, gist_zh,
        vocab, grammar_tags, level, jlpt_profile, explain_back_prompt, probes, audio_r2_key
      ) values (
        ${chosen.source}, ${chosen.url}, ${chosen.category},
        ${gen.item.title_jp}, ${gen.item.script_jp},
        ${JSON.stringify(gen.item.furigana)}, ${gen.item.gist_zh},
        ${JSON.stringify(gen.item.vocab)}, ${JSON.stringify(gen.item.grammar_tags)},
        ${level}, ${JSON.stringify(jlptProfile(gen.item.vocab))},
        ${gen.item.explain_back_prompt}, ${JSON.stringify(gen.item.probes)}, ${audioKey}
      ) returning *`;
    if (!r) throw new Error("item insert returned no row");
    await tx`insert into deliveries (item_id, stage) values (${r.id}, ${stage})`;
    return r;
  })) as Record<string, unknown>;

  // New vocab auto-enters the SRS deck as unlearned (spec §3.5, §5). Non-critical
  // and idempotent (deduped), so it stays outside the item/delivery transaction.
  await harvestVocab(sql, String(row.id), gen.item.vocab);

  return { item: rowToItem(row), reason: undefined, usd: gen.usd + ttsUsd };
}

function jlptProfile(vocab: { jlpt: string }[]): Record<string, number> {
  const profile: Record<string, number> = {};
  for (const v of vocab) profile[v.jlpt] = (profile[v.jlpt] ?? 0) + 1;
  return profile;
}

/**
 * A jsonb array field that may come back as a JSON *string* (e.g. a model that
 * returned a stringified array, which then got double-encoded into jsonb). Parse
 * it back so the client always receives a real array and never `.map`-crashes.
 */
export function toJsonArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v) as unknown;
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Same, for a jsonb object field that may arrive as a JSON string. */
export function toJsonObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v) as unknown;
      return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function rowToItem(row: Record<string, unknown>): Item {
  return {
    id: String(row.id),
    source: String(row.source),
    url: String(row.url),
    category: row.category as Item["category"],
    title_jp: String(row.title_jp),
    script_jp: String(row.script_jp),
    furigana: toJsonArray(row.furigana) as Item["furigana"],
    gist_zh: String(row.gist_zh ?? ""),
    vocab: toJsonArray(row.vocab) as Item["vocab"],
    grammar_tags: toJsonArray(row.grammar_tags) as string[],
    level: Number(row.level ?? 1),
    jlpt_profile: toJsonObject(row.jlpt_profile) as Record<string, number>,
    explain_back_prompt: String(row.explain_back_prompt ?? ""),
    probes: toJsonArray(row.probes) as string[],
    audio_r2_key: row.audio_r2_key ? String(row.audio_r2_key) : null,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}
