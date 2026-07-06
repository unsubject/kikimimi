/**
 * FSRS (Free Spaced Repetition Scheduler) — the SRS engine for the Review
 * surface (spec §5). This is the long-term (day-granular) FSRS-5 model, which
 * fits a once-per-day review deck with a daily cap. It is pure and unit-tested
 * (test/srs.test.ts); the DB layer in routes/review.ts persists `FsrsState`.
 *
 * Why FSRS over SM-2 (spec §5): better retention modelling, and lateness is
 * handled natively by retrievability decay — which is exactly why it fits a
 * streak-free system where a missed week costs only the week.
 */

/** 1 = Again, 2 = Hard, 3 = Good, 4 = Easy. */
export type Rating = 1 | 2 | 3 | 4;

export interface FsrsState {
  stability: number; // memory stability, in days
  difficulty: number; // 1..10
  reps: number;
  lapses: number;
}

export interface ScheduleResult {
  state: FsrsState;
  intervalDays: number; // whole days until next review
  retrievability: number; // R at review time (0..1); 1 for brand-new cards
}

// FSRS-5 default weights (19). Indices 17–18 model same-day (short-term)
// memory, which the day-granular scheduler here does not use.
const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const;

const DECAY = -0.5;
// FACTOR makes R(t=S) = 0.9 exactly. 0.9^(1/DECAY) - 1 = 19/81.
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

const MIN_STABILITY = 0.1;
const MAX_INTERVAL = 36500; // 100 years

/** Desired retention at review time. 0.9 is the FSRS default. */
export const DEFAULT_REQUEST_RETENTION = 0.9;

const clampDifficulty = (d: number): number => Math.min(Math.max(d, 1), 10);

/** Retrievability after `elapsedDays` given memory stability `S`. */
export function retrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

/** Interval (days, unrounded) that lands on `requestRetention` for stability `S`. */
function intervalFor(stability: number, requestRetention: number): number {
  return (stability / FACTOR) * (Math.pow(requestRetention, 1 / DECAY) - 1);
}

function initDifficulty(rating: Rating): number {
  return W[4]! - Math.exp(W[5]! * (rating - 1)) + 1;
}

function initStability(rating: Rating): number {
  return Math.max(W[rating - 1]!, MIN_STABILITY);
}

/** FSRS-5 difficulty update: linear damping + mean-reversion toward D₀(Easy). */
function nextDifficulty(difficulty: number, rating: Rating): number {
  const deltaD = -W[6]! * (rating - 3);
  const damped = difficulty + (deltaD * (10 - difficulty)) / 9;
  const reverted = W[7]! * initDifficulty(4) + (1 - W[7]!) * damped;
  return clampDifficulty(reverted);
}

function nextRecallStability(
  difficulty: number,
  stability: number,
  r: number,
  rating: Rating,
): number {
  const hardPenalty = rating === 2 ? W[15]! : 1;
  const easyBonus = rating === 4 ? W[16]! : 1;
  return (
    stability *
    (1 +
      Math.exp(W[8]!) *
        (11 - difficulty) *
        Math.pow(stability, -W[9]!) *
        (Math.exp(W[10]! * (1 - r)) - 1) *
        hardPenalty *
        easyBonus)
  );
}

function nextForgetStability(difficulty: number, stability: number, r: number): number {
  return (
    W[11]! *
    Math.pow(difficulty, -W[12]!) *
    (Math.pow(stability + 1, W[13]!) - 1) *
    Math.exp(W[14]! * (1 - r))
  );
}

/** Schedule a brand-new card from its first rating. */
export function scheduleNew(
  rating: Rating,
  requestRetention = DEFAULT_REQUEST_RETENTION,
): ScheduleResult {
  const stability = initStability(rating);
  const difficulty = clampDifficulty(initDifficulty(rating));
  const state: FsrsState = {
    stability,
    difficulty,
    reps: 1,
    lapses: rating === 1 ? 1 : 0,
  };
  return {
    state,
    intervalDays: roundInterval(intervalFor(stability, requestRetention)),
    retrievability: 1,
  };
}

/** Schedule an existing card given elapsed days since it was last due. */
export function scheduleReview(
  prev: FsrsState,
  rating: Rating,
  elapsedDays: number,
  requestRetention = DEFAULT_REQUEST_RETENTION,
): ScheduleResult {
  const r = retrievability(Math.max(0, elapsedDays), prev.stability);
  const difficulty = nextDifficulty(prev.difficulty, rating);

  let stability: number;
  let lapses = prev.lapses;
  if (rating === 1) {
    // Post-lapse stability never exceeds the prior stability.
    stability = Math.min(nextForgetStability(prev.difficulty, prev.stability, r), prev.stability);
    lapses += 1;
  } else {
    stability = nextRecallStability(prev.difficulty, prev.stability, r, rating);
  }
  stability = Math.min(Math.max(stability, MIN_STABILITY), MAX_INTERVAL);

  const state: FsrsState = { stability, difficulty, reps: prev.reps + 1, lapses };
  return {
    state,
    intervalDays: roundInterval(intervalFor(stability, requestRetention)),
    retrievability: r,
  };
}

function roundInterval(days: number): number {
  return Math.min(Math.max(Math.round(days), 1), MAX_INTERVAL);
}
