import { describe, it, expect } from "vitest";
import { selectItem } from "../src/content/select.js";
import type { Candidate } from "../src/content/sources.js";
import { DEFAULT_INTEREST_WEIGHTS } from "@kikimimi/shared";

const mk = (over: Partial<Candidate>): Candidate => ({
  source: "test",
  category: "society",
  graded: false,
  title: "タイトル",
  url: "https://example.com",
  summary: "",
  ...over,
});

describe("content selection (spec §3.2)", () => {
  it("prefers the highest interest-weighted category", () => {
    const chosen = selectItem(
      [
        mk({ category: "politics", title: "政治のニュース" }),
        mk({ category: "economics", title: "経済のニュース" }),
      ],
      DEFAULT_INTEREST_WEIGHTS,
      [],
      3,
    );
    expect(chosen?.category).toBe("economics"); // 0.35 > 0.15
  });

  it("penalises topics overlapping the last 7 days", () => {
    const recent = ["日本銀行の金融政策について"];
    const chosen = selectItem(
      [
        mk({ category: "economics", title: "日本銀行の金融政策の続報" }),
        mk({ category: "culture", title: "京都の伝統工芸の展示" }),
      ],
      DEFAULT_INTEREST_WEIGHTS,
      recent,
      3,
    );
    // Despite economics outweighing culture, the heavy overlap should demote it.
    expect(chosen?.category).toBe("culture");
  });

  it("boosts graded sources below level 3", () => {
    const chosen = selectItem(
      [
        mk({ category: "politics", graded: true, title: "やさしいニュース" }),
        mk({ category: "economics", graded: false, title: "難しい経済" }),
      ],
      DEFAULT_INTEREST_WEIGHTS,
      [],
      1,
    );
    expect(chosen?.graded).toBe(true);
  });

  it("returns null with no candidates", () => {
    expect(selectItem([], DEFAULT_INTEREST_WEIGHTS, [], 1)).toBeNull();
  });
});
