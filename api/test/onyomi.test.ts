import { describe, it, expect } from "vitest";
import { ONYOMI_RULES, onyomiCards } from "../src/content/onyomi.js";

describe("Cantonese→on'yomi pack (Sprint 3)", () => {
  it("covers the entering-tone and nasal finals", () => {
    const ids = ONYOMI_RULES.map((r) => r.id);
    for (const f of ["final-k", "final-t", "final-p", "final-m", "final-n", "final-ng"]) {
      expect(ids).toContain(f);
    }
  });

  it("every rule has a pattern, a note, and worked examples", () => {
    for (const rule of ONYOMI_RULES) {
      expect(rule.japanesePattern.length).toBeGreaterThan(0);
      expect(rule.note.length).toBeGreaterThan(0);
      expect(rule.examples.length).toBeGreaterThanOrEqual(3);
      for (const ex of rule.examples) {
        expect(ex.hanzi).toBeTruthy();
        expect(ex.cantonese).toMatch(/[a-z]+[1-6]/); // jyutping + tone
        expect(ex.kana).toBeTruthy();
        expect(ex.romaji).toBeTruthy();
      }
    }
  });

  it("flattens to unique-hanzi cards", () => {
    const cards = onyomiCards();
    expect(cards.length).toBeGreaterThanOrEqual(20);
    const hanzi = cards.map((c) => c.hanzi);
    expect(new Set(hanzi).size).toBe(hanzi.length); // no duplicate characters
    // Each card carries its rule id and pattern for review context.
    for (const c of cards) {
      expect(c.ruleId).toBeTruthy();
      expect(c.pattern).toBeTruthy();
    }
  });

  it("encodes the canonical examples from the learning plan", () => {
    const cards = onyomiCards();
    const roku = cards.find((c) => c.hanzi === "六");
    const san = cards.find((c) => c.hanzi === "三");
    const gaku = cards.find((c) => c.hanzi === "学");
    expect(roku?.kana).toBe("ろく");
    expect(san?.kana).toBe("さん");
    expect(gaku?.kana).toBe("がく");
  });
});
