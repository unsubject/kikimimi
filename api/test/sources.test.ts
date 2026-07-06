import { describe, it, expect } from "vitest";
import { parseRss, parseNhkEasy, SOURCES } from "../src/content/sources.js";

describe("feed parsing (spec §3.1)", () => {
  it("parses a standard RSS feed with CDATA titles", () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title><![CDATA[日銀が金利を据え置き]]></title>
        <link>https://example.com/a</link>
        <description>金融政策決定会合の結果</description></item>
      <item><title>円安が進む</title>
        <link>https://example.com/b</link>
        <description><![CDATA[<p>市場の動き</p>]]></description></item>
    </channel></rss>`;
    const src = SOURCES.find((s) => s.name === "東洋経済オンライン")!;
    const items = parseRss(xml, src);
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toBe("日銀が金利を据え置き");
    expect(items[0]!.url).toBe("https://example.com/a");
    expect(items[1]!.summary).toBe("市場の動き"); // tags stripped
    expect(items[0]!.category).toBe("economics");
  });

  it("parses an Atom feed with href links", () => {
    const xml = `<feed><entry><title>文化の記事</title>
      <link href="https://example.com/c"/>
      <summary>展示会の紹介</summary></entry></feed>`;
    const src = SOURCES.find((s) => s.name === "Yahoo!ニュース 文化")!;
    const items = parseRss(xml, src);
    expect(items[0]!.title).toBe("文化の記事");
    expect(items[0]!.url).toBe("https://example.com/c");
  });

  it("parses the NHK News Easy JSON list shape", () => {
    const json = JSON.stringify([
      {
        "2026-07-06": [
          { news_id: "k10012345", title: "やさしいニュース" },
          { news_id: "k10012346", title: "もう一つ" },
        ],
      },
    ]);
    const items = parseNhkEasy(json);
    expect(items).toHaveLength(2);
    expect(items[0]!.graded).toBe(true);
    expect(items[0]!.url).toContain("k10012345");
  });

  it("returns empty on malformed input rather than throwing", () => {
    expect(parseNhkEasy("not json")).toEqual([]);
    const src = SOURCES[0]!;
    expect(parseRss("<garbage>", src)).toEqual([]);
  });
});
