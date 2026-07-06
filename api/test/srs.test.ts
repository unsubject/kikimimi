import { describe, it, expect } from "vitest";
import {
  scheduleNew,
  scheduleReview,
  retrievability,
  DEFAULT_REQUEST_RETENTION,
  type FsrsState,
  type Rating,
} from "../src/srs.js";

describe("FSRS engine (spec §5)", () => {
  it("retrievability is 0.9 at exactly one stability-length elapsed", () => {
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 4);
    expect(retrievability(0, 10)).toBe(1);
  });

  it("retrievability decays as elapsed time grows", () => {
    const s = 10;
    expect(retrievability(5, s)).toBeGreaterThan(retrievability(20, s));
  });

  it("new-card initial stability matches the first-rating weight ordering", () => {
    const again = scheduleNew(1);
    const hard = scheduleNew(2);
    const good = scheduleNew(3);
    const easy = scheduleNew(4);
    // Higher rating → higher initial stability → longer first interval.
    expect(again.state.stability).toBeLessThan(hard.state.stability);
    expect(hard.state.stability).toBeLessThan(good.state.stability);
    expect(good.state.stability).toBeLessThan(easy.state.stability);
    expect(again.intervalDays).toBeLessThanOrEqual(good.intervalDays);
    expect(good.intervalDays).toBeLessThanOrEqual(easy.intervalDays);
  });

  it("new Again card counts a lapse; Good does not", () => {
    expect(scheduleNew(1).state.lapses).toBe(1);
    expect(scheduleNew(3).state.lapses).toBe(0);
  });

  it("a successful review grows stability and interval", () => {
    const prev: FsrsState = scheduleNew(3).state;
    const next = scheduleReview(prev, 3, prev.stability); // review when due
    expect(next.state.stability).toBeGreaterThan(prev.stability);
    expect(next.intervalDays).toBeGreaterThanOrEqual(scheduleNew(3).intervalDays);
    expect(next.state.reps).toBe(2);
  });

  it("Again on a mature card shrinks stability and records a lapse", () => {
    const mature: FsrsState = { stability: 40, difficulty: 5, reps: 5, lapses: 0 };
    const lapsed = scheduleReview(mature, 1, 40);
    expect(lapsed.state.stability).toBeLessThan(mature.stability);
    expect(lapsed.state.lapses).toBe(1);
  });

  it("difficulty rises on Again and falls on Easy", () => {
    const prev: FsrsState = { stability: 20, difficulty: 5, reps: 3, lapses: 0 };
    expect(scheduleReview(prev, 1, 20).state.difficulty).toBeGreaterThan(prev.difficulty);
    expect(scheduleReview(prev, 4, 20).state.difficulty).toBeLessThan(prev.difficulty);
  });

  it("Easy yields a longer interval than Good than Hard", () => {
    const prev: FsrsState = { stability: 20, difficulty: 5, reps: 3, lapses: 0 };
    const hard = scheduleReview(prev, 2, 20).intervalDays;
    const good = scheduleReview(prev, 3, 20).intervalDays;
    const easy = scheduleReview(prev, 4, 20).intervalDays;
    expect(hard).toBeLessThanOrEqual(good);
    expect(good).toBeLessThanOrEqual(easy);
  });

  it("difficulty and stability stay within valid bounds under abuse", () => {
    let state: FsrsState = scheduleNew(1).state;
    const ratings: Rating[] = [1, 1, 4, 1, 3, 2, 1, 4, 3, 1];
    for (const r of ratings) {
      const res = scheduleReview(state, r, 1);
      state = res.state;
      expect(state.difficulty).toBeGreaterThanOrEqual(1);
      expect(state.difficulty).toBeLessThanOrEqual(10);
      expect(state.stability).toBeGreaterThanOrEqual(0.1);
      expect(res.intervalDays).toBeGreaterThanOrEqual(1);
    }
  });

  it("interval at default retention approximates stability in days", () => {
    // By construction, interval ≈ S when requestRetention == 0.9.
    const prev: FsrsState = { stability: 30, difficulty: 5, reps: 3, lapses: 0 };
    const res = scheduleReview(prev, 3, 30, DEFAULT_REQUEST_RETENTION);
    expect(res.intervalDays).toBeGreaterThan(20); // grew from 30, stays in the right ballpark
  });
});
