import { describe, it, expect } from "vitest";
import { isDropDue, hourInZone } from "../src/time.js";

// A fixed instant: 2026-07-06T12:00:00Z = 08:00 America/New_York (EDT).
const NOON_UTC = new Date("2026-07-06T12:00:00Z");

describe("isDropDue", () => {
  it("is true once local time is at/after the drop hour", () => {
    // 08:00 ET ≥ 07:00 drop → due.
    expect(isDropDue(NOON_UTC, "America/New_York", "07:00")).toBe(true);
  });

  it("is false before the drop hour", () => {
    // 08:00 ET < 09:00 drop → not yet.
    expect(isDropDue(NOON_UTC, "America/New_York", "09:00")).toBe(false);
  });

  it("honours a non-07:00 drop time (the old fixed cron couldn't)", () => {
    // 08:00 ET ≥ 08:00 drop → due exactly at the configured hour.
    expect(isDropDue(NOON_UTC, "America/New_York", "08:00")).toBe(true);
  });

  it("reads the zone-local hour correctly", () => {
    expect(hourInZone(NOON_UTC, "America/New_York")).toBe(8);
    expect(hourInZone(NOON_UTC, "UTC")).toBe(12);
  });
});
