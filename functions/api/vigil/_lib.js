// Shared helpers for the vigil API. The leading underscore keeps Pages from
// routing this file as an endpoint — it is import-only.
//
// Theme: the walls are honest, but not everything inside them is alive. Real
// presences carry a decodable proof-of-life payload; ghosts carry noise. This
// module owns the discriminator, the ghost generator, the HMAC token, and the
// name sanitizer. No puzzle answer, no code, and no sign key is ever hardcoded
// here.

// ---- base64url (Workers runtime: atob/btoa + TextEncoder/Decoder) ---------

export function b64urlEncode(str) {
  // UTF-8 safe: percent-encode then map to bytes, then btoa.
  const bytes = new TextEncoder().encode(str);
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

// ---- the living/dead discriminator (the load-bearing oracle) --------------
// A real id is base64url(JSON.stringify({v:1, b:<epochSeconds>, n, t, name?})).
// "Decodes to a clean payload" = JSON.parse(b64urlDecode(id)) is an object with
// v===1 and a numeric b. Ghost ids encode plaintext, so they can never satisfy
// this. Returns the parsed payload on success, or null.
export function decodeRealPayload(id) {
  // cap < 512 so the KV key "p:" + id stays within Cloudflare KV's 512-byte key
  // limit (a longer id would make KV.put throw). Real ids are ~80-150 chars.
  if (typeof id !== "string" || !id || id.length > 500) return null;
  let txt;
  try {
    txt = b64urlDecode(id);
  } catch {
    return null;
  }
  let obj;
  try {
    obj = JSON.parse(txt);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  if (obj.v !== 1) return null;
  if (typeof obj.b !== "number" || !isFinite(obj.b)) return null;
  return obj;
}

export const isLivingId = (id) => decodeRealPayload(id) !== null;

// ---- HMAC tier token -------------------------------------------------------
// token = base64url(tier "." exp) "." base64url(rawHmac)
// Signed server-side with SIGN_KEY; verified on every beat so the roster (and
// the proof-of-life payload the server echoes) can't be forged by a client.

async function hmacRaw(signKey, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days; re-claim if storage clears

export async function signTier(signKey, tier) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const body = b64urlEncode(`${tier}.${exp}`);
  const sig = await hmacRaw(signKey, body);
  return `${body}.${sig}`;
}

// Constant-time string compare (both args already strings).
export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Returns the verified tier (1 or 2) or 0 if the token is missing/invalid/expired.
export async function verifyTier(signKey, token) {
  if (!signKey || typeof token !== "string" || !token) return 0;
  const parts = token.split(".");
  if (parts.length !== 2) return 0;
  const [body, sig] = parts;
  const expect = await hmacRaw(signKey, body);
  if (!timingSafeEqual(sig, expect)) return 0;
  let decoded;
  try {
    decoded = b64urlDecode(body);
  } catch {
    return 0;
  }
  const [tierStr, expStr] = decoded.split(".");
  const tier = Number(tierStr);
  const exp = Number(expStr);
  if (!(tier === 1 || tier === 2)) return 0;
  if (!isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return 0;
  return tier;
}

// ---- name sanitization -----------------------------------------------------
// Restrained allowlist (letters/digits/-._ + spaces), trimmed, capped, HTML
// stripped by construction. The two forbidden answer-words are matched WITHOUT
// ever shipping them — not even as char codes, which were trivially decodable
// from this (public) source and silently bypassed the string-only leak guard.
// Instead we ship only the SHA-256 of each word (the same one-way pattern the
// gate key uses in site/js/whispers/threshold.js) plus its length, and reject a
// name if any same-length substring hashes to a forbidden digest. The plaintext
// answer-word now appears nowhere in the repo.
const FORBIDDEN_HASHES = [
  { len: 6, hash: "58a012dcab81199ece3f16ca6f74738ae9d41af92ba44a25797c7f08acb5e376" },
  { len: 11, hash: "6929adae851d8522fccccc1cd3059119748cc66eeb8168ce7e5e7c79b98d7d63" },
];

async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// True if `low` (already lowercased) contains a forbidden word as a substring.
// Only same-length windows are hashed, so the work is bounded (name ≤ 24 chars).
async function containsForbidden(low) {
  for (const { len, hash } of FORBIDDEN_HASHES) {
    for (let i = 0; i + len <= low.length; i++) {
      if ((await sha256hex(low.slice(i, i + len))) === hash) return true;
    }
  }
  return false;
}

export async function sanitizeName(raw) {
  if (typeof raw !== "string") return null;
  let s = raw.trim().slice(0, 24);
  if (!s) return null;
  // strict allowlist — markup characters (< > & " ' / etc.) are simply not allowed
  if (!/^[A-Za-z0-9 ._-]+$/.test(s)) return null;
  // collapse runs of whitespace
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (await containsForbidden(s.toLowerCase())) return null;
  return s;
}

// ---- cryptid handle pool (display label) ----------------------------------
// Stable per-browser for reals (derived from the nonce). Deliberately excludes
// the forbidden answer needles and the ARG key cryptids themselves.
export const CRYPTID_POOL = [
  "flatwoods", "snallygaster", "ahool", "jersey", "wendigo", "chupacabra",
  "yowie", "bunyip", "kelpie", "grootslang", "thunderbird", "lurker",
  "nightcrawler", "skinwalker", "hodag", "squonk", "wampus", "dover",
  "bigfoot", "yeti", "kraken", "selkie", "banshee", "wraith",
];

export function handleFor(nonce, tier) {
  // deterministic, stable per nonce
  let h = 2166136261 >>> 0;
  const str = String(nonce);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const word = CRYPTID_POOL[h % CRYPTID_POOL.length];
  const num = (h % 9) + 1;
  return `${word}-${num}`;
}

// ---- ghosts: computed, never stored ---------------------------------------
// IDs are base64url(<plaintext atmospheric noise>) — never JSON, so they can
// never satisfy the living oracle. Clocks loop or freeze. Count breathes 2-5.
const NOISE_POOL = [
  "static.", "..hum..", "~~~", "::carrier::", "dropout", "..signal..",
  "...", "white-noise", "[lost]", "::hiss::", "feedback", "..echo..",
  "ghost-line", "dead-air", "..drift..", "<<null>>",
];

// A ghost's marker is private and server-side only; it is stripped before the
// roster is serialized so the API can assert ghosts never carry a decodable
// shape, while the client only sees what a real presence shows.
export function computeGhosts(now = Date.now()) {
  const sec = Math.floor(now / 1000);
  // count breathes by time-of-day: 2..5
  const hourPhase = Math.floor(now / (1000 * 60 * 60)) % 24;
  const count = 2 + (Math.abs(Math.sin(hourPhase / 3.8) * 4) | 0); // 2..5
  const out = [];
  for (let i = 0; i < count; i++) {
    // deterministic per slot per ~10-min window so the set is stable-ish but breathes
    const slot = Math.floor(now / (1000 * 60 * 10)) + i * 7919;
    const noise = NOISE_POOL[(slot + i) % NOISE_POOL.length];
    // unique-but-still-plaintext: a short noise glyph + slot tag. Encodes plain
    // text, so it can never JSON.parse into a {v:1} payload — the dead tell holds.
    const id = b64urlEncode(`${noise}~${(Math.abs(slot) % 9000).toString(36)}`);
    const handleSeed = `g${slot}`;
    const handle = handleFor(handleSeed, 0);
    // clock: half loop, half freeze
    let ageSec;
    if (i % 2 === 0) {
      // loops on a cycle (resets every ~17 min)
      const cycle = 17 * 60;
      ageSec = (sec % cycle);
    } else {
      // frozen — pinned to a constant derived from the slot
      ageSec = (Math.abs(slot) % (40 * 60)) + 60;
    }
    out.push({
      id,
      handle,
      tier: 0,
      ageSec,
      _ghost: true, // private marker, stripped before serialization
    });
  }
  return out;
}

// Strip private markers and present a uniform shape to the client. Ghosts and
// reals look identical by label — you must `decode` the id to tell them apart.
// A verified name (solvers only) rides along; ghosts never carry one.
export function publicPresence(p) {
  const out = { id: p.id, handle: p.handle, tier: p.tier, ageSec: p.ageSec };
  if (p.name) out.name = p.name;
  return out;
}

// Deterministic interleave so ghosts aren't trivially clustered.
export function shuffleDeterministic(arr, seed) {
  const a = arr.slice();
  let s = (seed >>> 0) || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = s % (i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

export const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}
