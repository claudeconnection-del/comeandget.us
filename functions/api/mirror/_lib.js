// Shared helpers for the mirror API (leading underscore = import-only, never
// routed). Self-authenticating tokens over SIGN_KEY: no storage needed to prove
// "we issued this before". No puzzle answer, no key material, is ever hardcoded.

import { b64urlEncode as b64url, b64urlDecode, hmacB64url, timingSafeEqual } from "../../_shared.js";

export async function echoToken(signKey, firstSeenSec) {
  const body = b64url(String(firstSeenSec));
  return body + "." + (await hmacB64url(signKey, body));
}

export async function verifyEchoToken(signKey, token) {
  if (!signKey || typeof token !== "string") return null;
  const raw = token.replace(/^W\//, "").replace(/^"|"$/g, ""); // tolerate weak (W/) then quoted ETag
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!timingSafeEqual(sig, await hmacB64url(signKey, body))) return null;
  const n = Number(b64urlDecode(body));
  return Number.isFinite(n) ? n : null;
}

// Every response carries the shared security header set (functions/_shared.js).
export { json } from "../../_shared.js";
