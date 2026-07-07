import { describe, it, expect } from "vitest";
import { rowToItem, toJsonArray, toJsonObject } from "../src/content/pipeline.js";

describe("jsonb coercion (toJsonArray / toJsonObject)", () => {
  it("passes real arrays/objects through", () => {
    expect(toJsonArray([1, 2])).toEqual([1, 2]);
    expect(toJsonObject({ a: 1 })).toEqual({ a: 1 });
  });

  it("parses a JSON *string* back to an array/object", () => {
    // The production bug: a model returned a stringified array, which got
    // double-encoded into jsonb and read back as this string.
    expect(toJsonArray('[{"word":"猫"}]')).toEqual([{ word: "猫" }]);
    expect(toJsonObject('{"N5":3}')).toEqual({ N5: 3 });
  });

  it("falls back to empty for junk / wrong-typed values", () => {
    expect(toJsonArray("not json")).toEqual([]);
    expect(toJsonArray('"a string"')).toEqual([]); // valid JSON, but not an array
    expect(toJsonArray(null)).toEqual([]);
    expect(toJsonArray(42)).toEqual([]);
    expect(toJsonObject("[1,2]")).toEqual({}); // array is not an object here
    expect(toJsonObject(null)).toEqual({});
  });
});

describe("rowToItem never yields a non-array field (client .map safety)", () => {
  it("recovers a double-encoded vocab string instead of crashing", () => {
    const item = rowToItem({
      id: "id",
      source: "src",
      url: "https://x",
      category: "economics",
      title_jp: "t",
      script_jp: "s",
      furigana: [{ text: "s" }],
      gist_zh: "g",
      vocab: '[{"word":"猫","reading":"ねこ","meaning_zh":"猫","jlpt":"N5"}]', // <- string, not array
      grammar_tags: '["は (N5)"]',
      level: 1,
      jlpt_profile: '{"N5":1}',
      explain_back_prompt: "p",
      probes: "not-an-array",
      audio_r2_key: null,
      created_at: "2026-07-07T00:00:00.000Z",
    });
    expect(Array.isArray(item.vocab)).toBe(true);
    expect(item.vocab[0]?.word).toBe("猫");
    expect(Array.isArray(item.grammar_tags)).toBe(true);
    expect(Array.isArray(item.probes)).toBe(true); // junk string -> []
    expect(item.probes).toEqual([]);
    expect(item.jlpt_profile).toEqual({ N5: 1 });
  });
});
