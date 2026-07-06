import { describe, it, expect } from "vitest";
import {
  mintAudioToken,
  verifyAudioToken,
  isAudioToken,
  timingSafeEqual,
} from "../src/audiotoken.js";

const SECRET = "test-master-token-abc123";

describe("audio token", () => {
  it("mints a token that verifies against the same secret", async () => {
    const { token } = await mintAudioToken(SECRET, 3600);
    expect(isAudioToken(token)).toBe(true);
    expect(await verifyAudioToken(SECRET, token)).toBe(true);
  });

  it("rejects a token signed with a different secret", async () => {
    const { token } = await mintAudioToken(SECRET, 3600);
    expect(await verifyAudioToken("other-secret", token)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const { token } = await mintAudioToken(SECRET, 3600);
    const bad = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
    expect(await verifyAudioToken(SECRET, bad)).toBe(false);
  });

  it("rejects an already-expired token", async () => {
    const { token } = await mintAudioToken(SECRET, -10); // expired 10s ago
    expect(await verifyAudioToken(SECRET, token)).toBe(false);
  });

  it("rejects a raw (non-prefixed) token", async () => {
    expect(isAudioToken(SECRET)).toBe(false);
    expect(await verifyAudioToken(SECRET, SECRET)).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("is true only for identical strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
