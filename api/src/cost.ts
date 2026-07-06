import {
  COST_HARD_CEILING_USD,
  COST_MONTHLY_BREAKER_USD,
  COST_SOFT_WARN_USD,
  type CostSummary,
} from "@kikimimi/shared";
import type { Sql } from "./db.js";
import { dayInZone, monthInZone } from "./time.js";

/** Anthropic per-MTok pricing used to convert usage into USD. */
const LLM_PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function llmCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = LLM_PRICES[model] ?? { input: 3, output: 15 };
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/** OpenAI tts-1: $15 per 1M characters. */
export function ttsCostUsd(chars: number): number {
  return (chars * 15) / 1_000_000;
}

export class GovernorError extends Error {
  constructor(
    message: string,
    public readonly kind: "daily_ceiling" | "monthly_breaker",
  ) {
    super(message);
  }
}

export interface SpendState {
  todayUsd: number;
  monthUsd: number;
  monthlyAcked: boolean;
}

/**
 * Pure governor decision (unit-tested): given current spend, may a new
 * paid (LLM/TTS) action start? Spec §10: finish the current exchange
 * gracefully, never cut mid-conversation — so this is checked *before*
 * starting an action, never in the middle of one.
 */
export function checkGovernor(state: SpendState): void {
  if (state.monthUsd >= COST_MONTHLY_BREAKER_USD && !state.monthlyAcked) {
    throw new GovernorError(
      `Monthly spend $${state.monthUsd.toFixed(2)} hit the $${COST_MONTHLY_BREAKER_USD} breaker — acknowledge via /api/reset`,
      "monthly_breaker",
    );
  }
  if (state.todayUsd >= COST_HARD_CEILING_USD) {
    throw new GovernorError(
      `Daily spend $${state.todayUsd.toFixed(2)} hit the $${COST_HARD_CEILING_USD} ceiling — degraded (no-LLM) mode until midnight`,
      "daily_ceiling",
    );
  }
}

export function summarize(state: SpendState): CostSummary {
  return {
    today_usd: Number(state.todayUsd.toFixed(4)),
    month_usd: Number(state.monthUsd.toFixed(4)),
    soft_warn: state.todayUsd >= COST_SOFT_WARN_USD,
    degraded: state.todayUsd >= COST_HARD_CEILING_USD,
    monthly_breaker: state.monthUsd >= COST_MONTHLY_BREAKER_USD && !state.monthlyAcked,
  };
}

export async function readSpend(sql: Sql, tz: string, now = new Date()): Promise<SpendState> {
  const day = dayInZone(now, tz);
  const month = monthInZone(now, tz);
  const [row] = await sql`
    select
      coalesce(sum(usd) filter (where day = ${day}), 0) as today,
      coalesce(sum(usd) filter (where to_char(day, 'YYYY-MM') = ${month}), 0) as month
    from cost_log`;
  const [settings] = await sql`select monthly_reset_ack from user_settings where id = 1`;
  return {
    todayUsd: Number(row?.today ?? 0),
    monthUsd: Number(row?.month ?? 0),
    monthlyAcked: settings?.monthly_reset_ack === month,
  };
}

export async function logCost(
  sql: Sql,
  tz: string,
  category: string,
  usd: number,
  now = new Date(),
): Promise<void> {
  if (usd <= 0) return;
  await sql`insert into cost_log (day, category, usd) values (${dayInZone(now, tz)}, ${category}, ${usd})`;
}
