import { describe, it, expect } from "vitest";
import {
  checkGovernor,
  summarize,
  llmCostUsd,
  ttsCostUsd,
  GovernorError,
} from "../src/cost.js";

describe("cost governor (spec §10)", () => {
  it("allows a normal micro-dose day", () => {
    expect(() => checkGovernor({ todayUsd: 0.15, monthUsd: 6, monthlyAcked: false })).not.toThrow();
    const s = summarize({ todayUsd: 0.15, monthUsd: 6, monthlyAcked: false });
    expect(s.soft_warn).toBe(false);
    expect(s.degraded).toBe(false);
  });

  it("soft-warns at $1.50/day but does not block", () => {
    expect(() => checkGovernor({ todayUsd: 1.6, monthUsd: 20, monthlyAcked: false })).not.toThrow();
    expect(summarize({ todayUsd: 1.6, monthUsd: 20, monthlyAcked: false }).soft_warn).toBe(true);
  });

  it("hard-stops at the $2.00/day ceiling", () => {
    expect(() => checkGovernor({ todayUsd: 2.0, monthUsd: 20, monthlyAcked: false })).toThrow(
      GovernorError,
    );
    try {
      checkGovernor({ todayUsd: 2.1, monthUsd: 20, monthlyAcked: false });
    } catch (e) {
      expect((e as GovernorError).kind).toBe("daily_ceiling");
    }
  });

  it("trips the $45 monthly breaker until acknowledged", () => {
    expect(() => checkGovernor({ todayUsd: 0.1, monthUsd: 45, monthlyAcked: false })).toThrow(
      GovernorError,
    );
    // Acknowledged → passes (daily still fine).
    expect(() => checkGovernor({ todayUsd: 0.1, monthUsd: 46, monthlyAcked: true })).not.toThrow();
  });

  it("prices match the spec cost table order of magnitude", () => {
    // ~$0.035 script gen: Sonnet at say 8k in / 1k out.
    expect(llmCostUsd("claude-sonnet-4-6", 8000, 1000)).toBeCloseTo(0.039, 2);
    // ~400 char TTS ≈ $0.006.
    expect(ttsCostUsd(400)).toBeCloseTo(0.006, 3);
  });
});
