import type { InterestWeights } from "@kikimimi/shared";
import type { Candidate } from "./sources.js";

/**
 * Rank candidates by interest profile + novelty (spec §3.2): score by the
 * category weight, skip anything whose topic overlaps the last 7 days, and
 * prefer graded sources while the learner is below level 3.
 */
export function selectItem(
  candidates: Candidate[],
  weights: InterestWeights,
  recentTitles: string[],
  level: number,
): Candidate | null {
  const recentTokens = new Set(
    recentTitles.flatMap((t) => tokenize(t)),
  );

  const scored = candidates
    .map((c) => {
      const base = weights[c.category] ?? 0.1;
      const overlap = tokenize(c.title).filter((tok) => recentTokens.has(tok)).length;
      const novelty = overlap === 0 ? 1 : Math.max(0, 1 - overlap * 0.34);
      const gradedBonus = level < 3 && c.graded ? 0.25 : 0;
      // Deterministic tie-break jitter from the title so runs are reproducible.
      const jitter = (hash(c.title) % 100) / 10000;
      return { c, score: base * novelty + gradedBonus + jitter };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.c ?? null;
}

function tokenize(s: string): string[] {
  // Split on non-CJK/word boundaries; keep 2-gram CJK slices for overlap.
  const clean = s.replace(/[「」『』（）()【】、。・,.:;!?！？\s]+/g, "");
  const tokens: string[] = [];
  for (let i = 0; i < clean.length - 1; i++) tokens.push(clean.slice(i, i + 2));
  return tokens;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
