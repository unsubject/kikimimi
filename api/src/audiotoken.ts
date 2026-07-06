/**
 * Short-lived signed capability tokens for the /audio proxy. Audio <audio>/Audio
 * elements can't send Authorization headers, so access is granted via a `?t=`
 * query param. Putting the long-lived master APP_TOKEN there leaks it into CDN
 * access logs, browser history, and Cache Storage — so instead the client mints
 * a time-boxed HMAC token (this module) that grants audio access only, and the
 * master token never appears in a URL.
 *
 * Token format: `a1.<expUnixSeconds>.<hmacHex>` where hmac = HMAC-SHA256(exp).
 */

const PREFIX = "a1.";
const enc = new TextEncoder();

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string compare (avoids leaking match progress via timing). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function mintAudioToken(
  secret: string,
  ttlSec: number,
): Promise<{ token: string; exp: number }> {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = await hmacHex(secret, String(exp));
  return { token: `${PREFIX}${exp}.${sig}`, exp };
}

/** True if `token` is a valid, unexpired audio token signed with `secret`. */
export async function verifyAudioToken(secret: string, token: string): Promise<boolean> {
  if (!token.startsWith(PREFIX)) return false;
  const rest = token.slice(PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot < 0) return false;
  const expStr = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  return timingSafeEqual(sig, await hmacHex(secret, expStr));
}

/** Does this look like a signed audio token (vs a raw bearer token)? */
export const isAudioToken = (t: string): boolean => t.startsWith(PREFIX);
