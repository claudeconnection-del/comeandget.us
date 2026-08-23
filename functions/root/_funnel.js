// Funnel telemetry for the /root gauntlet. Import-only (leading underscore keeps
// Pages from routing it). Two jobs:
//   * mint/verify a first-party HMAC'd solver id cookie (`rg`, Path=/root) so we
//     can attribute gate fetches to one solver without storing any PII — the sid
//     is random, never derived from IP or fingerprint;
//   * record per-solver gate progress into one KV key (`fs:<sid>`), deduped so a
//     solver is counted once per gate and time-to-solve falls out of the stamps.
// Fail-soft throughout: telemetry must never break the response it rides on.

const enc = new TextEncoder();

async function hmac(signKey, msg) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(String(signKey || "")),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(msg)));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function eq(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function randSid() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  let bin = "";
  for (const b of a) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const MAX_AGE = 7776000; // 90 days

export async function mintSid(signKey) {
  const sid = randSid();
  const value = sid + "." + (await hmac(signKey, sid));
  const cookie = `rg=${value}; Secure; HttpOnly; SameSite=Lax; Path=/root; Max-Age=${MAX_AGE}`;
  return { sid, value, cookie };
}

export async function verifySid(signKey, value) {
  if (typeof value !== "string") return null;
  const i = value.lastIndexOf(".");
  if (i < 0) return null;
  const sid = value.slice(0, i);
  const sig = value.slice(i + 1);
  return eq(sig, await hmac(signKey, sid)) ? sid : null;
}

function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const m = raw.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

export async function getOrMintSid(request, signKey) {
  const existing = await verifySid(signKey, readCookie(request, "rg"));
  if (existing) return { sid: existing, setCookie: null };
  const { sid, cookie } = await mintSid(signKey);
  return { sid, setCookie: cookie };
}

export function uaClass(request) {
  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  if (!ua) return "other";
  // curl/dig/scripting first — a tier-3 operator legitimately probes this way
  if (ua.includes("curl") || ua.includes("wget") || ua.includes("python") || ua.includes("dig") || ua.includes("httpie")) return "curl";
  if (/(bot|crawler|spider|headless|gptbot|claudebot|perplexity)/.test(ua)) return "bot";
  if (ua.includes("mozilla")) return "browser";
  return "other";
}

// g0 is the door: the /root document itself. It sorts first so a solver who has
// only arrived reports gmax "g0", which lets the board count the large, cheap
// arrival population from the key listing alone — no value read required.
const GATE_ORDER = ["g0", "g1", "g2", "g3", "g4seal", "g4open"];

export const ARRIVAL = "g0";

export async function recordGate(env, sid, gate, request) {
  const KV = env && env.PRESENCE;
  if (!KV || !sid) return;
  const key = `fs:${sid}`;
  const nowSec = Math.floor(Date.now() / 1000);

  let rec = null;
  try { rec = await KV.get(key, "json"); } catch { rec = null; }
  if (!rec || typeof rec !== "object") rec = { first: nowSec, g: {} };
  if (!rec.g || typeof rec.g !== "object") rec.g = {};
  if (rec.g[gate]) return; // dedup: this solver already cleared this gate

  rec.g[gate] = nowSec;
  rec.ua = uaClass(request);
  const gmax = GATE_ORDER.filter((g) => rec.g[g]).pop() || gate;

  try {
    await KV.put(key, JSON.stringify(rec), {
      expirationTtl: MAX_AGE,
      metadata: { first: rec.first, tier: rec.tier || 0, ua: rec.ua, gmax },
    });
  } catch { /* transient KV error must not 500 the fetch */ }
}
