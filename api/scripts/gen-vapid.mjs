#!/usr/bin/env node
// Generate a VAPID P-256 keypair for Web Push.
// Prints base64url values for `wrangler secret put VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY`.
import { webcrypto as crypto } from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const pub = await crypto.subtle.exportKey("raw", pair.publicKey); // 65-byte uncompressed point
const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

console.log("VAPID_PUBLIC_KEY =", b64url(pub));
console.log("VAPID_PRIVATE_KEY =", jwk.d);
console.log("\nSet them with:");
console.log("  npx wrangler secret put VAPID_PUBLIC_KEY");
console.log("  npx wrangler secret put VAPID_PRIVATE_KEY");
console.log("  npx wrangler secret put VAPID_SUBJECT   # e.g. mailto:you@example.com");
