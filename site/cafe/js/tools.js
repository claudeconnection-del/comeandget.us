// tools.js — the "real" tools players use to solve challenges. Everything reads
// same-origin static artifacts under cafe/artifacts/. No backend.
const ART = "artifacts/";
const strip = (n) => (n || "").replace(/^(\.?\/)?(cafe\/)?artifacts\//, "");

// Cloudflare Pages serves *.html at its extensionless clean URL — and requesting
// the .html path can hang/redirect under fetch — so always fetch the clean name.
// An abort timeout guarantees a tool can never wedge on a stalled request.
async function tryFetch(p) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 6000);
  try { const r = await fetch(ART + p, { cache: "no-store", signal: c.signal }); return r.ok ? r : null; }
  catch { return null; }
  finally { clearTimeout(t); }
}
async function res(name) {
  name = strip(name);
  if (name.endsWith(".html")) name = name.slice(0, -5);
  return tryFetch(name);
}
async function getText(name) { const r = await res(name); if (!r) throw new Error(strip(name) + ": no such file"); return r.text(); }
async function getBytes(name) { const r = await res(name); if (!r) throw new Error(strip(name) + ": no such file"); return new Uint8Array(await r.arrayBuffer()); }

// ── encoders / decoders ──────────────────────────────────────
function b64ToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
const toUtf8 = (u) => new TextDecoder().decode(u);
const b64ToUtf8 = (s) => toUtf8(b64ToBytes(s));
function hexToUtf8(s) { const u = new Uint8Array(s.length / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(s.substr(i * 2, 2), 16); return toUtf8(u); }
const looksJwt = (s) => { const p = s.split("."); return (p.length === 2 || p.length === 3) && /^[A-Za-z0-9_-]+$/.test(p[0]) && /^[A-Za-z0-9_-]+$/.test(p[1]); };
const isHex = (s) => /^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0 && s.length >= 8;

function printJwt(s, api) {
  const parts = s.split(".");
  const pretty = (seg) => { try { return JSON.stringify(JSON.parse(b64ToUtf8(seg)), null, 2); } catch { return "(unreadable)"; } };
  api.print(api.sp("header:", "c-muted"));
  for (const l of pretty(parts[0]).split("\n")) api.print(api.sp(l, "c-pine"));
  api.print(api.sp("payload:", "c-muted"));
  for (const l of pretty(parts[1]).split("\n")) api.print(api.sp(l, "c-warn"));
  api.print(api.sp("signature: ", "c-muted"), api.sp(parts[2] ? "present (" + parts[2].length + " chars)" : "(none — alg:none, so nobody verified this card)", "c-love"));
}

// printable-run extraction, like unix `strings`
function strings(u, min = 4) {
  const out = []; let cur = "";
  for (const b of u) {
    if (b >= 32 && b < 127) cur += String.fromCharCode(b);
    else { if (cur.length >= min) out.push(cur); cur = ""; }
  }
  if (cur.length >= min) out.push(cur);
  return out;
}
function sniff(u) {
  const h = [...u.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (h.startsWith("89504e470d0a1a0a")) return "PNG image data";
  if (h.startsWith("ffd8ff")) return "JPEG image data";
  if (h.startsWith("25504446")) return "PDF document";
  if (h.startsWith("474946383")) return "GIF image data";
  return "data";
}

let ZONE = null;
async function zone() { if (!ZONE) ZONE = JSON.parse(await getText("zone.json")); return ZONE; }

export function toolCommands() {
  return {
    cat: async ({ argv, api }) => {
      const name = strip(argv[0] || "");
      if (!name) { api.print(api.sp("usage: ", "c-muted"), api.kbd("cat <file>")); return; }
      if (/\.png$/i.test(name)) { api.print(api.sp(name + ": binary file — try ", "c-muted"), api.kbd("strings " + name), api.sp(" or ", "c-muted"), api.kbd("file " + name)); return; }
      const text = await getText(name);
      for (const line of text.replace(/\n$/, "").split("\n")) api.print(line);
    },

    curl: async ({ argv, api }) => {
      const headOnly = argv.includes("-I") || argv.includes("--head");
      const name = strip(argv.find((a) => a && !a.startsWith("-")) || "");
      if (!name) { api.print(api.sp("usage: ", "c-muted"), api.kbd("curl -I <file>")); return; }
      const r = await res(name);
      if (!r) { api.print(api.sp("curl: couldn't reach " + name, "c-love")); return; }
      api.print(api.sp("HTTP/1.1 " + r.status + " " + (r.statusText || ""), "c-pine"));
      r.headers.forEach((v, k) => api.print(api.sp(k + ": ", "c-muted"), api.sp(v, /x-cafe/i.test(k) ? "c-warn" : "c-text")));
      if (!headOnly && r.ok) { api.blank(); const t = await r.text(); for (const line of t.replace(/\n$/, "").split("\n")) api.print(line); }
    },

    dig: async ({ argv, api }) => {
      const a = argv.filter(Boolean);
      let type = null, name;
      if (a.length >= 2) { type = a[0].toUpperCase(); name = a[1].toLowerCase(); } else { name = (a[0] || "").toLowerCase(); }
      if (!name) { api.print(api.sp("usage: ", "c-muted"), api.kbd("dig [TYPE] <name>"), api.sp("   e.g. ", "c-muted"), api.kbd("dig specials.cafe")); return; }
      const z = await zone();
      api.print(api.sp("; <<>> cafe-dig <<>> " + (type ? type + " " : "") + name, "c-muted"));
      const recs = z[name];
      if (!recs || !recs.length) { api.print(api.sp(";; status: NXDOMAIN — nothing answers for " + name, "c-love")); return; }
      const show = type ? recs.filter((r) => r.type === type) : recs;
      if (!show.length) { api.print(api.sp(";; no " + type + " record — " + name + " has: " + recs.map((r) => r.type).join(", "), "c-warn")); return; }
      api.print(api.sp(";; ANSWER", "c-muted"));
      for (const r of show) api.print(api.sp(name.padEnd(18), "c-text"), api.sp("IN  " + r.type.padEnd(6), "c-pine"), api.sp(r.value, "c-warn"));
    },

    grep: async ({ argv, api }) => {
      const pattern = argv[0], file = argv[1];
      if (!pattern || !file) { api.print(api.sp("usage: ", "c-muted"), api.kbd("grep <pattern> <file>")); return; }
      let re; try { re = new RegExp(pattern); } catch { api.print(api.sp("bad regex: " + pattern, "c-love")); return; }
      const text = await getText(file);
      const hits = text.split(/\r?\n/).filter((l) => re.test(l));
      if (!hits.length) { api.print(api.sp("no matches.", "c-muted")); return; }
      for (const l of hits) api.print(l);
    },

    strings: async ({ argv, api }) => {
      const name = strip(argv[0] || "");
      if (!name) { api.print(api.sp("usage: ", "c-muted"), api.kbd("strings <file>")); return; }
      const runs = strings(await getBytes(name));
      if (!runs.length) { api.print(api.sp("(no printable strings found)", "c-muted")); return; }
      for (const r of runs) api.print(r);
    },

    file: async ({ argv, api }) => {
      const name = strip(argv[0] || "");
      if (!name) { api.print(api.sp("usage: ", "c-muted"), api.kbd("file <file>")); return; }
      const u = await getBytes(name);
      api.print(api.sp(name + ": ", "c-text"), api.sp(sniff(u) + ", " + u.length + " bytes", "c-pine"));
    },

    decode: ({ rest, api }) => {
      const s = (rest || "").trim();
      if (!s) { api.print(api.sp("usage: ", "c-muted"), api.kbd("decode <base64 | hex | jwt>")); return; }
      if (looksJwt(s)) { printJwt(s, api); return; }
      try {
        if (isHex(s)) { api.print(api.sp("(hex) ", "c-muted"), hexToUtf8(s)); return; }
        api.print(api.sp("(base64) ", "c-muted"), b64ToUtf8(s));
      } catch { api.print(api.sp("couldn't decode that as base64, hex, or a JWT.", "c-love")); }
    },

    base64: ({ argv, rest, api }) => {
      if (argv[0] === "-d" || argv[0] === "--decode") {
        try { api.print(b64ToUtf8(argv.slice(1).join(" "))); } catch { api.print(api.sp("not valid base64.", "c-love")); }
      } else { try { api.print(btoa(rest)); } catch { api.print(api.sp("can only encode plain text.", "c-love")); } }
    },

    rot13: ({ rest, api }) => api.print((rest || "").replace(/[a-z]/gi, (c) => { const b = c <= "Z" ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b); })),
  };
}
