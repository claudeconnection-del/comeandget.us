// ctf.js — the open playground: challenge manifest + solve/badge/hint/progress.
// Flags are verified by SHA-256 (Web Crypto); plaintext flags are never shipped —
// artifacts carry only encoded forms, the manifest only hashes. Progress, hints,
// and theme live in localStorage.

// each family gets a small diamond in its own accent colour — quiet visual
// identity without leaning on emoji.
const FAM = {
  encoding: { mark: "c-accent", label: "encoding" },
  web: { mark: "c-warn", label: "web · http" },
  dns: { mark: "c-pine", label: "dns" },
  forensics: { mark: "c-ok", label: "forensics" },
};

const LOYALTY_JWT =
  "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0." +
  "eyJzdWIiOiJ5b3UiLCJwbGFuIjoiYmFyaXN0YS1jbHViIiwicmVmaWxscyI6InVubGltaXRlZCIsIm5vdGUiOiJub2JvZHkgdmVyaWZpZWQgdGhpcyBjYXJkIiwiZmxhZyI6ImNhZmV7bm9ib2R5X2NoZWNrZWRfdGhlX2FsZ30ifQ.";

export const CHALLENGES = [
  {
    id: "welcome-mat", family: "encoding", stars: 1, badge: { name: "First Sip" },
    blurb: "a free sample, on the house",
    prompt: ["Every café leaves out a free sample. Decode this little token and taste it."],
    show: ["sample (base64)", "Y2FmZXtmaXJzdF9zaXBfZnJlZX0="],
    toolHint: "decode Y2FmZXtmaXJzdF9zaXBfZnJlZX0=",
    hints: [
      "base64 packs text into A–Z a–z 0–9 + / and pads tidily with =. Any base64 decoder cracks it.",
      "Run it right here: decode Y2FmZXtmaXJzdF9zaXBfZnJlZX0=",
    ],
    flagHash: "96903a089391db0bb61da797137e422369500564a92606cedfa74df3e09eddfe",
  },
  {
    id: "receipt-roll", family: "web", stars: 2, badge: { name: "Fine Print" },
    blurb: "your receipt prints more than you think",
    prompt: [
      "Order up! Your receipt is at artifacts/receipt.txt — but the secret isn't on the paper.",
      "A good café hides it in *how* the receipt is served, not what it says.",
    ],
    files: ["receipt.txt"],
    toolHint: "curl -I receipt.txt",
    hints: [
      "Response headers carry metadata the body doesn't. Try: curl -I receipt.txt  (or DevTools → Network → Headers).",
      "Spot the X-Cafe-* header — its value is base64. decode it.",
    ],
    flagHash: "0d8d91be24543579ecb48bfa2a592d2b4efc8366722158895a4673abd83dd3f2",
  },
  {
    id: "back-of-house", family: "web", stars: 2, badge: { name: "Staff Only" },
    blurb: "what does the robots file fence off?",
    prompt: [
      "Every café has a back room. Ours politely asks crawlers to skip one page.",
      "Read artifacts/robots.txt, find what's Disallowed, then go peek (view-source counts).",
    ],
    files: ["robots.txt"],
    toolHint: "cat robots.txt",
    hints: [
      "cat robots.txt and read the Disallow line — that's the hidden page.",
      "Open that page and read its HTML source/comments. The flag is base64 in a comment: cat staff-room.html",
    ],
    flagHash: "8666afe4dfbb8794a4163d86441c3ecb7b28b098e190dff5cc803402b5b4e1ed",
  },
  {
    id: "daily-grind", family: "dns", stars: 3, badge: { name: "Trail Follower" },
    blurb: "follow today's bean origin through DNS",
    prompt: [
      "We publish today's single-origin as DNS records. Start at specials.cafe and follow the trail.",
      "Use dig. Records point to records — the end of the trail holds the flag.",
    ],
    toolHint: "dig specials.cafe",
    hints: [
      "dig specials.cafe returns a CNAME — an alias pointing at another name. dig *that* name next.",
      "On the aliased name, ask for its TXT record: dig TXT beans.cafe — the flag is base64 in the text.",
    ],
    flagHash: "eff2d7454823cb7f22fcbf29f52231887b30ca4d5aa0579e57bd4998bed49951",
  },
  {
    id: "loyalty-card", family: "encoding", stars: 3, badge: { name: "Refills Forever" },
    blurb: "a loyalty card nobody bothered to verify",
    prompt: [
      "Your barista-club card is a JWT claiming unlimited refills. But who actually signed it?",
      "Decode it and read the claims — there's a gift inside (and a lesson about alg).",
    ],
    show: ["loyalty card (jwt)", LOYALTY_JWT],
    toolHint: "decode " + LOYALTY_JWT.slice(0, 24) + "…",
    hints: [
      "A JWT is three base64url parts split by dots: header.payload.signature. decode shows them. (also: cat loyalty.jwt)",
      "The header says alg:none — nobody verified this card. Read the flag claim in the payload.",
    ],
    flagHash: "a3441c80fbfffd0e6de14e4fe04e958f23bf8fabc7c3d4b14f1f66a019ebc1c8",
  },
  {
    id: "spilled-grounds", family: "forensics", stars: 3, badge: { name: "Pattern Spotter" },
    blurb: "one order matches the secret promo — grep it out",
    prompt: [
      "A day of orders spilled across the floor: artifacts/orders.log.",
      "Exactly one order used the secret golden promo, shaped GT-XXXXXX (six caps/digits).",
      "Find that line — the flag is tucked in it, hex-encoded.",
    ],
    files: ["orders.log"],
    toolHint: "grep GT-[A-Z0-9]{6} orders.log",
    hints: [
      "grep takes a regex. The golden code is GT- then six uppercase letters/digits: grep GT-[A-Z0-9]{6} orders.log",
      "On that line, the long hex after flag= is the answer. decode handles hex too: decode <the-hex>",
    ],
    flagHash: "ad252dcbb75237845c616d0843d5206f36566391b13fc283b69f0e1005b7e5d8",
  },
  {
    id: "hidden-roast", family: "forensics", stars: 3, badge: { name: "Deep Roast" },
    blurb: "this roast photo is hiding something",
    prompt: [
      "Our roast-of-the-day photo (artifacts/roast.png) smells like more than coffee.",
      "Files carry text you can't see in the picture. Sniff its insides.",
    ],
    files: ["roast.png"],
    toolHint: "strings roast.png",
    hints: [
      "file roast.png confirms what it is; strings roast.png prints the readable text baked into its bytes.",
      "Among the noise sits a base64 chunk — decode it for the flag.",
    ],
    flagHash: "59317bd5ebd390a362433fcae25005bede8cc994304b20e6618a56630bcc908a",
  },
];

const byId = (id) => CHALLENGES.find((c) => c.id === id);

// ── persistence ──────────────────────────────────────────────
const SKEY = "cafe.solved", HKEY = "cafe.hints";
function solvedSet() { try { return new Set(JSON.parse(localStorage.getItem(SKEY) || "[]")); } catch { return new Set(); } }
function markSolved(id) { try { const s = solvedSet(); s.add(id); localStorage.setItem(SKEY, JSON.stringify([...s])); } catch {} }
function hintsFor(id) { try { return (JSON.parse(localStorage.getItem(HKEY) || "{}"))[id] || 0; } catch { return 0; } }
function bumpHint(id, max) { try { const o = JSON.parse(localStorage.getItem(HKEY) || "{}"); o[id] = Math.min((o[id] || 0) + 1, max); localStorage.setItem(HKEY, JSON.stringify(o)); return o[id]; } catch { return 1; } }

async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── commands ─────────────────────────────────────────────────
export function cafeCommands() {
  const total = CHALLENGES.length;

  function progressLine(api) {
    const n = solvedSet().size;
    api.print(api.sp(`★ ${n} / ${total} solved`, "c-warn"),
      n === total ? api.sp("  —  the whole café is yours", "c-ok") : api.sp("  ·  open one with ", "c-muted"),
      n === total ? "" : api.kbd("open <name>"));
  }

  function board({ api }) {
    const solved = solvedSet();
    api.print(api.sp("the board", "c-accent bold"), api.sp("  ·  pick any, any order", "c-muted"));
    api.blank();
    for (const c of CHALLENGES) {
      const fam = FAM[c.family];
      const done = solved.has(c.id);
      api.print(
        api.sp("◆ ", fam.mark),
        api.sp(c.id.padEnd(16), done ? "c-ok" : "c-text"),
        api.sp(("★".repeat(c.stars)).padEnd(4), "c-warn"),
        api.sp(done ? "✓ solved " : "open     ", done ? "c-ok" : "c-muted"),
        api.sp(c.blurb, "c-muted"),
      );
    }
    api.blank();
    progressLine(api);
    api.print(api.sp("details: ", "c-muted"), api.kbd("open <name>"), api.sp("   ·   how to play: ", "c-muted"), api.kbd("help"));
  }

  function open({ argv, api }) {
    const id = (argv[0] || "").toLowerCase();
    const c = byId(id);
    if (!c) { api.print(api.sp("no challenge called ", "c-muted"), api.sp(id || "(none)", "c-love"), api.sp(". the board: ", "c-muted"), api.kbd("ls")); return; }
    const fam = FAM[c.family];
    const done = solvedSet().has(c.id);
    api.print(api.sp("◆ ", fam.mark), api.sp(c.id, "c-accent bold"), api.sp("  " + fam.label + "  " + "★".repeat(c.stars), "c-muted"), done ? api.sp("  ✓ solved", "c-ok") : "");
    api.blank();
    for (const line of c.prompt) api.print(api.sp(line, "c-text"));
    if (c.show) { api.blank(); api.print(api.sp(c.show[0] + ":", "c-muted")); api.print(api.sp("  " + c.show[1], "c-warn")); }
    if (c.files && c.files.length) { api.blank(); api.print(api.sp("artifacts: ", "c-muted"), api.sp(c.files.join("  "), "c-pine")); }
    api.blank();
    api.print(api.sp("try: ", "c-muted"), api.kbd(c.toolHint));
    api.print(api.sp("stuck? ", "c-muted"), api.kbd("hint " + c.id), api.sp("    submit with ", "c-muted"), api.kbd("submit " + c.id + " cafe{...}"));
  }

  async function submit({ argv, api }) {
    const id = (argv[0] || "").toLowerCase();
    const flag = argv.slice(1).join(" ").trim();
    const c = byId(id);
    if (!c) { api.print(api.sp("no challenge called ", "c-muted"), api.sp(id || "(none)", "c-love"), api.sp(". see ", "c-muted"), api.kbd("ls")); return; }
    if (!flag) { api.print(api.sp("usage: ", "c-muted"), api.kbd("submit " + id + " cafe{...}")); return; }
    const got = await sha256hex(flag);
    if (got === c.flagHash) {
      const already = solvedSet().has(id);
      markSolved(id);
      if (already) {
        api.print(api.sp("✓ ", "c-ok"), api.sp("already brewed — still counts.", "c-text"));
      } else {
        const n = solvedSet().size;
        api.print(api.sp("✓ ", "c-ok bold"), api.sp("nice — " + c.id + " solved.  ", "c-text"), api.sp("badge earned: ", "c-muted"), api.sp(c.badge.name, "c-accent"));
        if (n === total) api.print(api.sp("★ " + n + " / " + total + " — you cleared the whole café.", "c-warn"), api.sp("  the night shift tips their hats (those that have them). come back soon.", "c-ok"));
        else api.print(api.sp("★ " + n + " / " + total + " solved", "c-warn"), api.sp("  ·  next: ", "c-muted"), api.kbd("ls"));
      }
    } else {
      api.print(api.sp("not quite — ", "c-love"), api.sp("that flag doesn't match. ", "c-text"), api.sp("stuck? ", "c-muted"), api.kbd("hint " + id));
    }
  }

  function hint({ argv, api }) {
    const id = (argv[0] || "").toLowerCase();
    const c = byId(id);
    if (!c) { api.print(api.sp("hint for what? the board: ", "c-muted"), api.kbd("ls")); return; }
    const n = bumpHint(id, c.hints.length);
    api.print(api.sp("hint " + n + "/" + c.hints.length + ": ", "c-warn"), api.sp(c.hints[n - 1], "c-text"));
    if (n >= c.hints.length) api.print(api.sp("that's all I've got — you've got this.", "c-muted"));
    else api.print(api.sp("need more? ", "c-muted"), api.kbd("hint " + id));
  }

  function badges({ api }) {
    const solved = solvedSet();
    api.print(api.sp("badge shelf", "c-accent bold"));
    api.blank();
    for (const c of CHALLENGES) {
      const done = solved.has(c.id);
      api.print(api.sp(done ? "◆ " : "◇ ", done ? "c-accent" : "c-subtle"), api.sp((done ? c.badge.name : "— — —").padEnd(18), done ? "c-accent" : "c-subtle"), api.sp(done ? "" : "(" + c.id + ")", "c-muted"));
    }
    api.blank();
    progressLine(api);
  }

  function progress({ api }) { progressLine(api); }

  return { ls: board, challenges: board, board, open, submit, hint, badges, progress };
}
