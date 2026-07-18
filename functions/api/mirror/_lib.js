// Shared helpers for the mirror API (leading underscore = import-only, never
// routed). Self-authenticating tokens over SIGN_KEY: no storage needed to prove
// "we issued this before". No puzzle answer, no key material, is ever hardcoded.

export function b64url(str) {
  const bytes = new TextEncoder().encode(String(str));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s) {
  let t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  const bin = atob(t);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export async function hmacB64url(signKey, msg) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(signKey || "")),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(msg)));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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

export function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}
