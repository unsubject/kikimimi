import { describe, it, expect } from "vitest";
import { webcrypto as crypto } from "node:crypto";
import { sha256hex, TTS_MAX_CHARS } from "../src/ttscache.js";

// @ts-expect-error - provide node webcrypto as the global the module uses
if (!globalThis.crypto) globalThis.crypto = crypto;

describe("TTS content-address key (Sprint 4 refactor)", () => {
  it("is a stable 64-char lowercase hex digest", async () => {
    const h = await sha256hex("nova:こんにちは");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    // Deterministic — same input → same key, so the R2 cache hits on repeats.
    expect(await sha256hex("nova:こんにちは")).toBe(h);
  });

  it("separates by voice and by text (no cross-voice cache collision)", async () => {
    const a = await sha256hex("nova:同じ文");
    const b = await sha256hex("shimmer:同じ文");
    const c = await sha256hex("nova:違う文");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("matches a known SHA-256 vector", async () => {
    // echo -n "abc" | sha256sum
    expect(await sha256hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("exposes a sane TTS length cap", () => {
    expect(TTS_MAX_CHARS).toBeGreaterThanOrEqual(200);
  });
});
