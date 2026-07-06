import type { SourceCategory } from "@kikimimi/shared";

/**
 * News sources for the daily pipeline (spec §3). Nikkei is deliberately
 * excluded (hard paywall / ToS). NHK News Easy is the graded primary until
 * the learner passes level 3; the rest are real Japanese.
 */
export interface SourceDef {
  name: string;
  url: string;
  category: SourceCategory;
  graded: boolean; // true = NHK Easy-style graded Japanese
}

export const SOURCES: SourceDef[] = [
  {
    name: "NHK News Easy",
    url: "https://www3.nhk.or.jp/news/easy/news-list.json",
    category: "society",
    graded: true,
  },
  {
    name: "NHK 主要ニュース",
    url: "https://www3.nhk.or.jp/rss/news/cat0.xml",
    category: "society",
    graded: false,
  },
  {
    name: "NHK 経済",
    url: "https://www3.nhk.or.jp/rss/news/cat5.xml",
    category: "economics",
    graded: false,
  },
  {
    name: "NHK 政治",
    url: "https://www3.nhk.or.jp/rss/news/cat4.xml",
    category: "politics",
    graded: false,
  },
  {
    name: "東洋経済オンライン",
    url: "https://toyokeizai.net/list/feed/rss",
    category: "economics",
    graded: false,
  },
  {
    name: "Yahoo!ニュース 文化",
    url: "https://news.yahoo.co.jp/rss/categories/culture.xml",
    category: "culture",
    graded: false,
  },
];

export interface Candidate {
  source: string;
  category: SourceCategory;
  graded: boolean;
  title: string;
  url: string;
  summary: string;
}

/** Extract text between the first <tag>…</tag>, stripping CDATA and entities. */
function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1]!
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Parse a standard RSS/Atom feed into candidates. Regex-based (no DOM in Workers). */
export function parseRss(xml: string, source: SourceDef, limit = 8): Candidate[] {
  const items = [...xml.matchAll(/<(item|entry)[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  const out: Candidate[] = [];
  for (const block of items.slice(0, limit)) {
    const title = pick(block, "title");
    if (!title) continue;
    let url = pick(block, "link");
    if (!url) {
      const href = block.match(/<link[^>]*href="([^"]+)"/i);
      if (href) url = href[1]!;
    }
    out.push({
      source: source.name,
      category: source.category,
      graded: source.graded,
      title,
      url,
      summary: pick(block, "description") || pick(block, "summary"),
    });
  }
  return out;
}

interface NhkEasyEntry {
  news_id: string;
  title: string;
  title_with_ruby?: string;
}

/** NHK News Easy publishes a JSON list, not RSS. */
export function parseNhkEasy(json: string, limit = 8): Candidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  // Shape: [ { "YYYY-MM-DD": [ {news_id,title,...}, ... ] } ]
  const days = Array.isArray(parsed) ? parsed : [];
  const entries: NhkEasyEntry[] = [];
  for (const day of days) {
    if (day && typeof day === "object") {
      for (const list of Object.values(day as Record<string, unknown>)) {
        if (Array.isArray(list)) entries.push(...(list as NhkEasyEntry[]));
      }
    }
  }
  return entries.slice(0, limit).map((e) => ({
    source: "NHK News Easy",
    category: "society" as SourceCategory,
    graded: true,
    title: e.title,
    url: `https://www3.nhk.or.jp/news/easy/${e.news_id}/${e.news_id}.html`,
    summary: e.title,
  }));
}

/** Fetch and parse one source. Network/parse failures yield an empty list. */
export async function fetchSource(source: SourceDef): Promise<Candidate[]> {
  try {
    const res = await fetch(source.url, {
      headers: { "user-agent": "KikimimiBot/0.1 (personal language-learning app)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (source.url.endsWith(".json")) return parseNhkEasy(text);
    return parseRss(text, source);
  } catch {
    return [];
  }
}
