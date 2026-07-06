/**
 * Shared types for 聞き耳 Kikimimi — mirror of the data schema in
 * docs/kikimimi-app-spec-v1.2.md §8–9.
 */

export type Skill = "listening" | "reading" | "speaking" | "vocab" | "grammar";

/** Scaffold stages (spec §1.2): S1 = audio+text+furigana+ZH tap-reveal, S2 = audio+text, S3 = audio only. */
export type ScaffoldStage = 1 | 2 | 3;

export type SourceCategory = "economics" | "society" | "culture" | "politics";

export interface InterestWeights {
  economics: number;
  society: number;
  culture: number;
  politics: number;
}

/** One furigana segment of the item body. Kanji runs carry a `ruby` reading; kana/punctuation runs do not. */
export interface FuriganaSegment {
  text: string;
  ruby?: string;
}

export interface VocabEntry {
  word: string;
  reading: string;
  /** Chinese gloss — hidden behind tap-to-reveal in the UI (anti-bypass). */
  meaning_zh: string;
  jlpt: "N5" | "N4" | "N3" | "N2" | "N1";
}

export interface Item {
  id: string;
  source: string;
  url: string;
  category: SourceCategory;
  title_jp: string;
  script_jp: string;
  furigana: FuriganaSegment[];
  gist_zh: string;
  vocab: VocabEntry[];
  grammar_tags: string[];
  level: number;
  jlpt_profile: Record<string, number>;
  explain_back_prompt: string;
  probes: string[];
  audio_r2_key: string | null;
  created_at: string;
}

export interface LearnerStateRow {
  skill: Skill;
  level: number;
  scaffold_stage: ScaffoldStage;
  trailing_scores: number[];
  stage_entered_at: string;
  updated_at: string;
}

export interface UserSettings {
  tz: string;
  drop_time: string; // "07:00"
  interest_weights: InterestWeights;
  srs_daily_cap: number;
  tts_voice: TtsVoice;
  monthly_reset_ack: string | null; // ISO month "2026-07" when breaker acknowledged
}

/** Candidate TTS voices for the Sprint-1 pick (spec §13 open item). */
export type TtsVoice = "nova" | "shimmer" | "coral";
export const TTS_VOICES: TtsVoice[] = ["nova", "shimmer", "coral"];

export type ResponseMode = "explain_back_text" | "explain_back_voice";

export interface CostSummary {
  today_usd: number;
  month_usd: number;
  soft_warn: boolean; // >= $1.50 today
  degraded: boolean; // >= $2.00 today — no-LLM mode until midnight
  monthly_breaker: boolean; // >= $45 this month, awaiting /reset ack
}

/** Payload for GET /api/today */
export interface TodayResponse {
  item: Item | null;
  stage: ScaffoldStage;
  delivered_at: string | null;
  cost: CostSummary;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// Cost governor constants (spec §10 — CONFIRMED)
export const COST_SOFT_WARN_USD = 1.5;
export const COST_HARD_CEILING_USD = 2.0;
export const COST_MONTHLY_BREAKER_USD = 45.0;

export const DEFAULT_INTEREST_WEIGHTS: InterestWeights = {
  economics: 0.35,
  society: 0.25,
  culture: 0.25,
  politics: 0.15,
};
