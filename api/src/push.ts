import type { Env } from "./env.js";
import type { PushSubscriptionJSON } from "@kikimimi/shared";

/**
 * Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) implemented on WebCrypto so
 * it runs in a Cloudflare Worker with no Node dependencies. This is the sole
 * notification channel (spec §2, §12).
 *
 * The math here is fiddly; it is covered end-to-end by test/push.test.ts,
 * which decrypts a generated payload back to plaintext with a throwaway
 * subscription keypair.
 */

const b64urlToBytes = (s: string): Uint8Array => {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToB64url = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const utf8 = (s: string) => new TextEncoder().encode(s);

/**
 * WebCrypto interop shims. `@cloudflare/workers-types` names the ECDH derive
 * field `$public` and types `exportKey` as `ArrayBuffer | JsonWebKey`; the
 * Workers runtime — like every browser — uses the standard `public` property
 * and returns an `ArrayBuffer` for the "raw" format. These wrappers keep the
 * runtime standard-compliant while satisfying the compiler. Verified end-to-end
 * by test/push.test.ts.
 */
async function exportRaw(key: CryptoKey): Promise<ArrayBuffer> {
  return (await crypto.subtle.exportKey("raw", key)) as ArrayBuffer;
}
async function ecdhDeriveBits(
  publicKey: CryptoKey,
  privateKey: CryptoKey,
  bits: number,
): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
    privateKey,
    bits,
  );
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** DER-encoded ECDSA signature → raw 64-byte r||s that JWT/JWS expects. */
function derToJose(der: Uint8Array): Uint8Array {
  // der: 0x30 len 0x02 rlen R 0x02 slen S
  let offset = 3;
  const rLen = der[offset]!;
  offset += 1;
  let r = der.slice(offset, offset + rLen);
  offset += rLen + 1;
  const sLen = der[offset]!;
  offset += 1;
  let s = der.slice(offset, offset + sLen);
  const trim = (b: Uint8Array) => (b.length > 32 ? b.slice(b.length - 32) : b);
  const pad = (b: Uint8Array) => {
    b = trim(b);
    if (b.length === 32) return b;
    const out = new Uint8Array(32);
    out.set(b, 32 - b.length);
    return out;
  };
  return concat(pad(r), pad(s));
}

/** Build the P-256 private CryptoKey for signing from the VAPID scalar `d`. */
async function importVapidSigningKey(env: Env): Promise<CryptoKey> {
  const d = env.VAPID_PRIVATE_KEY;
  const pub = b64urlToBytes(env.VAPID_PUBLIC_KEY); // 65-byte uncompressed 0x04 X Y
  const x = bytesToB64url(pub.slice(1, 33));
  const y = bytesToB64url(pub.slice(33, 65));
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d,
    x,
    y,
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
}

/** RFC 8292 VAPID `Authorization: vapid t=<jwt>, k=<pubkey>` header. */
async function vapidAuthHeader(env: Env, audience: string): Promise<string> {
  const header = bytesToB64url(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const claims = bytesToB64url(
    utf8(JSON.stringify({ aud: audience, exp, sub: env.VAPID_SUBJECT })),
  );
  const signingInput = `${header}.${claims}`;
  const key = await importVapidSigningKey(env);
  const der = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(signingInput)),
  );
  const jwt = `${signingInput}.${bytesToB64url(derToJose(der))}`;
  return `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`;
}

/**
 * Encrypt `plaintext` for one subscription using the aes128gcm content
 * encoding (RFC 8188 §2 body + RFC 8291 key derivation). Exported for tests.
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  subscription: PushSubscriptionJSON,
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(subscription.keys.p256dh); // 65 bytes
  const authSecret = b64urlToBytes(subscription.keys.auth); // 16 bytes

  // Ephemeral server (application server) ECDH keypair.
  const asKeyPair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const asPublicRaw = new Uint8Array(await exportRaw(asKeyPair.publicKey));

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhBits = new Uint8Array(await ecdhDeriveBits(uaPublicKey, asKeyPair.privateKey, 256));

  // RFC 8291: PRK_key = HKDF(auth_secret, ecdh, "WebPush: info\0" || ua_public || as_public, 32)
  const keyInfo = concat(
    utf8("WebPush: info\0"),
    uaPublic,
    asPublicRaw,
  );
  const ikm = await hkdf(authSecret, ecdhBits, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  // Single record: plaintext || 0x02 padding delimiter (RFC 8188).
  const padded = concat(plaintext, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, padded),
  );

  // aes128gcm header: salt(16) || rs(4, big-endian) || idlen(1) || keyid(as_public)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const header = concat(salt, rs, new Uint8Array([asPublicRaw.length]), asPublicRaw);
  return concat(header, ciphertext);
}

export interface PushResult {
  endpoint: string;
  status: number;
  gone: boolean; // 404/410 → drop the subscription
}

export async function sendPush(
  env: Env,
  subscription: PushSubscriptionJSON,
  payload: unknown,
): Promise<PushResult> {
  const body = await encryptPayload(utf8(JSON.stringify(payload)), subscription);
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const auth = await vapidAuthHeader(env, audience);

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      authorization: auth,
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "86400",
      urgency: "normal",
    },
    body,
  });
  return {
    endpoint: subscription.endpoint,
    status: res.status,
    gone: res.status === 404 || res.status === 410,
  };
}
