// Import-only helpers shared by every Pages Function (the leading underscore
// keeps Pages from routing this file, same convention as the per-API _lib.js).
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
