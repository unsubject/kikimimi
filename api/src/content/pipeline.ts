import type { Item, InterestWeights, ScaffoldStage } from "@kikimimi/shared";
import type { Env } from "../env.js";
import type { Sql } from "../db.js";
import { checkGovernor, logCost, readSpend, ttsCostUsd } from "../cost.js";
import { synthesize } from "../tts.js";
import { fetchSource, SOURCES, type Candidate } from "./sources.js";
import { selectItem } from "./select.js";
import { generateItem } from "./generate.js";

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
  const voice = (settings?.tts_voice as Item["source"]) ?? "nova";

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
    const audio = await synthesize(env, gen.item.script_jp, voice as never);
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

  const [row] = await sql`
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

  // Deliver at the learner's current listening scaffold stage.
  const [ls] = await sql`select scaffold_stage from learner_state where skill = 'listening'`;
  const stage = (Number(ls?.scaffold_stage ?? 1) as ScaffoldStage);
  await sql`insert into deliveries (item_id, stage) values (${row!.id}, ${stage})`;

  return { item: rowToItem(row!), reason: undefined, usd: gen.usd + ttsUsd };
}

function jlptProfile(vocab: { jlpt: string }[]): Record<string, number> {
  const profile: Record<string, number> = {};
  for (const v of vocab) profile[v.jlpt] = (profile[v.jlpt] ?? 0) + 1;
  return profile;
}

export function rowToItem(row: Record<string, unknown>): Item {
  return {
    id: String(row.id),
    source: String(row.source),
    url: String(row.url),
    category: row.category as Item["category"],
    title_jp: String(row.title_jp),
    script_jp: String(row.script_jp),
    furigana: (row.furigana as Item["furigana"]) ?? [],
    gist_zh: String(row.gist_zh ?? ""),
    vocab: (row.vocab as Item["vocab"]) ?? [],
    grammar_tags: (row.grammar_tags as string[]) ?? [],
    level: Number(row.level ?? 1),
    jlpt_profile: (row.jlpt_profile as Record<string, number>) ?? {},
    explain_back_prompt: String(row.explain_back_prompt ?? ""),
    probes: (row.probes as string[]) ?? [],
    audio_r2_key: row.audio_r2_key ? String(row.audio_r2_key) : null,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}
