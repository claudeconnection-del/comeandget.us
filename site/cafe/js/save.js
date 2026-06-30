// save.js — cartridge-era save codes. Your browser clears storage on exit, so the
// durable save lives with YOU: a short, typeable code (Crockford base32 + a typo
// checksum, like an old NES password) that reconstructs your badge progress — plus
// a bookmarkable link that auto-restores on open. No server, no KV; localStorage is
// only the in-session working store (and it's fine for it to be wiped on exit).
import { CHALLENGES } from "./ctf.js";
import { is4kUnlocked, unlock4k } from "./games/store.js";

const SKEY = "cafe.solved";
const IDS = CHALLENGES.map((c) => c.id); // stable bit order = manifest order
const VER = 1;
const ALPH = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32 (no I L O U)

function readSolved() { try { return new Set(JSON.parse(localStorage.getItem(SKEY) || "[]")); } catch { return new Set(); } }
function writeSolved(set) { try { localStorage.setItem(SKEY, JSON.stringify([...set])); } catch {} }

function b32encode(bytes) {
  let bits = 0, val = 0, out = "";
  for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += ALPH[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += ALPH[(val << (5 - bits)) & 31];
  return out;
}
function b32decode(str) {
  let bits = 0, val = 0; const out = [];
  for (const ch of str) { const i = ALPH.indexOf(ch); if (i < 0) return null; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; } }
  return Uint8Array.from(out);
}
// tiny rotate-xor checksum — catches transcription typos, not forgery
function checksum(b) { let c = 0xa5; for (const x of b) { c ^= x; c = ((c << 1) | (c >>> 7)) & 0xff; } return c; }

function encodeState() {
  const solved = readSolved();
  const n = IDS.length;
  const mask = new Uint8Array(Math.ceil((n + 1) / 8)); // n badge bits + 1 for 4K
  for (let i = 0; i < n; i++) if (solved.has(IDS[i])) mask[i >> 3] |= 1 << (i & 7);
  if (is4kUnlocked()) mask[n >> 3] |= 1 << (n & 7);
  const body = Uint8Array.from([VER, ...mask]);
  const full = Uint8Array.from([...body, checksum(body)]);
  return b32encode(full);
}

// returns { count, total, fourk } on success, or null if the code doesn't scan.
// Loading MERGES (it never removes badges), so an older code can't lose progress.
function applyCode(input) {
  let raw = (input || "").trim();
  const url = /[?#&]s=([^&\s]+)/i.exec(raw); // accept a pasted save link too
  if (url) raw = decodeURIComponent(url[1]);
  let s = raw.toUpperCase().replace(/[\s-]/g, "");
  if (s.startsWith("CAFE")) s = s.slice(4);
  s = s.replace(/[ILO]/g, (m) => (m === "O" ? "0" : "1")); // Crockford leniency
  const bytes = b32decode(s);
  if (!bytes || bytes.length < 3) return null;
  const body = bytes.slice(0, -1);
  if (checksum(body) !== bytes[bytes.length - 1] || body[0] !== VER) return null;
  const mask = body.slice(1), n = IDS.length;
  const cur = readSolved();
  for (let i = 0; i < n; i++) if (mask[i >> 3] & (1 << (i & 7))) cur.add(IDS[i]);
  writeSolved(cur);
  const fourk = !!(mask[n >> 3] & (1 << (n & 7)));
  if (fourk) unlock4k();
  return { count: cur.size, total: n, fourk };
}

function pretty(code) { return "CAFE-" + (code.match(/.{1,4}/g) || [code]).join("-"); }

export function saveCommands() {
  return {
    save: async ({ api }) => {
      const code = pretty(encodeState());
      const link = "https://comeandget.us/cafe/#s=" + code;
      const solved = readSolved().size;
      api.print(api.sp("your save code", "c-accent bold"), api.sp("  ·  " + solved + " / " + IDS.length + " badges" + (is4kUnlocked() ? " · 4K" : ""), "c-muted"));
      api.blank();
      api.print(api.sp("  " + code, "c-warn bold"));
      api.blank();
      api.print(api.sp("write it down, or bookmark this link to carry your progress past a", "c-muted"));
      api.print(api.sp("browser wipe — opening it restores you automatically:", "c-muted"));
      api.print(api.sp("  " + link, "c-pine"));
      api.blank();
      api.print(api.sp("later: ", "c-muted"), api.kbd("load " + code), api.sp("   (or just open the link)", "c-muted"));
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(link); api.print(api.sp("(copied the link to your clipboard.)", "c-subtle")); }
      } catch {}
    },
    load: ({ rest, api }) => {
      const input = (rest || "").trim();
      if (!input) { api.print(api.sp("usage: ", "c-muted"), api.kbd("load CAFE-XXXX-X"), api.sp("   (paste a save code or link)", "c-muted")); return; }
      const r = applyCode(input);
      if (!r) { api.print(api.sp("that code didn't scan", "c-love"), api.sp(" — double-check for typos and try again.", "c-muted")); return; }
      api.print(api.sp("↺ restored ", "c-ok bold"), api.sp(r.count + " / " + r.total + " badges", "c-text"), r.fourk ? api.sp("  ·  4K unlocked", "c-warn") : "", api.sp("  — welcome back.", "c-muted"));
      api.print(api.sp("see the shelf with ", "c-muted"), api.kbd("badges"), api.sp(" or the board with ", "c-muted"), api.kbd("ls"), api.sp(".", "c-muted"));
    },
  };
}

// On load, if the URL carries a save link (#s=…), quietly restore from it.
export function autoloadFromHash(api) {
  try {
    if (!/[#&]s=/.test(location.hash || "")) return;
    const r = applyCode(location.hash);
    if (r && r.count) api.print(api.sp("↺ ", "c-ok"), api.sp("restored " + r.count + " / " + r.total + " badges from your save link.", "c-muted"));
  } catch {}
}
