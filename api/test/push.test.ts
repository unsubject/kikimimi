import { describe, it, expect } from "vitest";
import { webcrypto as crypto } from "node:crypto";
import { encryptPayload } from "../src/push.js";
import type { PushSubscriptionJSON } from "@kikimimi/shared";

// The Worker uses the global `crypto`; provide it under Node's test runner.
// @ts-expect-error - assign node webcrypto to global for the module under test
if (!globalThis.crypto) globalThis.crypto = crypto;

const b64url = (b: ArrayBuffer | Uint8Array) =>
  Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8),
  );
}

const utf8 = (s: string) => new TextEncoder().encode(s);
function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * Independent RFC 8291 / RFC 8188 decryptor. If encryptPayload and this
 * decryptor agree on the plaintext, the Worker push crypto is correct.
 */
async function decrypt(
  body: Uint8Array,
  uaPrivate: CryptoKey,
  uaPublicRaw: Uint8Array,
  authSecret: Uint8Array,
): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const asPublicRaw = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);

  const asPublicKey = await crypto.subtle.importKey(
    "raw",
    asPublicRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: asPublicKey }, uaPrivate, 256),
  );
  const keyInfo = concat(utf8("WebPush: info\0"), uaPublicRaw, asPublicRaw);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, ciphertext),
  );
  // Strip the RFC 8188 padding delimiter (0x02 for the last record).
  const end = plain[plain.length - 1] === 0x02 ? plain.length - 1 : plain.length;
  return new TextDecoder().decode(plain.slice(0, end));
}

describe("web push encryption (RFC 8291 aes128gcm)", () => {
  it("round-trips a JSON payload through encrypt → decrypt", async () => {
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair;
    const uaPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
    const authSecret = crypto.getRandomValues(new Uint8Array(16));

    const subscription: PushSubscriptionJSON = {
      endpoint: "https://push.example.com/xyz",
      keys: { p256dh: b64url(uaPublicRaw), auth: b64url(authSecret) },
    };

    const message = { title: "聞き耳", body: "今日の一本が届きました", url: "/" };
    const encrypted = await encryptPayload(utf8(JSON.stringify(message)), subscription);

    const decrypted = await decrypt(encrypted, ua.privateKey, uaPublicRaw, authSecret);
    expect(JSON.parse(decrypted)).toEqual(message);
  });

  it("produces a valid aes128gcm header (salt + rs=4096 + keyid)", async () => {
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair;
    const uaPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const sub: PushSubscriptionJSON = {
      endpoint: "https://push.example.com/xyz",
      keys: { p256dh: b64url(uaPublicRaw), auth: b64url(authSecret) },
    };
    const out = await encryptPayload(utf8("hi"), sub);
    const rs = new DataView(out.buffer, out.byteOffset + 16, 4).getUint32(0, false);
    expect(rs).toBe(4096);
    expect(out[20]).toBe(65); // key id length = uncompressed P-256 point
  });
});
