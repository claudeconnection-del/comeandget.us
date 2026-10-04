// Import-only helpers shared by every Pages Function (the leading underscore
// keeps Pages from routing this file, same convention as the per-API _lib.js).
// One copy of each primitive, so a fix lands everywhere at once: base64url,
// HMAC, the constant-time compares, the cookie parser, and the response headers.

// ---- base64url (Workers runtime: atob/btoa + TextEncoder/Decoder) ---------

export function b64urlEncode(str) {
  // UTF-8 safe: encode to bytes, then map to a binary string, then btoa.
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

// ---- HMAC-SHA256 → base64url -------------------------------------------------

export async function hmacB64url(signKey, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(signKey || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(msg)));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(str)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- compares ----------------------------------------------------------------

// Constant-time over equal-length strings. Unequal lengths return early — fine
// for signatures (fixed length), wrong for secrets: use secretEquals for those.
export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// A submitted code against an env secret. Both sides are hashed first, so the
// compare is always over two 64-char digests: a wrong-length guess costs exactly
// what a right-length one does, and the secret's length never shows in the timing.
export async function secretEquals(given, secret) {
  if (typeof given !== "string" || typeof secret !== "string" || !given || !secret) return false;
  const [g, s] = await Promise.all([sha256hex(given), sha256hex(secret)]);
  return timingSafeEqual(g, s);
}

// ---- cookies -----------------------------------------------------------------

export function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const m = raw.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

// ---- response headers --------------------------------------------------------
//
// Pages applies site/_headers to static assets only — a Function's response gets
// nothing unless the Function sets it. So every response built here carries the
// same posture the static routes get from _headers, adapted for API payloads:
// nothing may load from them, nothing may frame them, and nothing is cached
// unless the route says otherwise.

export const SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000",
  "cache-control": "no-store",
});

// The security set plus a route's own headers. Names are lower-cased so a route's
// "Cache-Control" overrides the default instead of being appended beside it.
export function withSecurityHeaders(extra = {}) {
  const out = { ...SECURITY_HEADERS };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) out[k.toLowerCase()] = v;
  return out;
}

export function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: withSecurityHeaders({ "content-type": "application/json; charset=utf-8", ...extraHeaders }),
  });
}
