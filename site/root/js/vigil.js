// The vigil — presence for /root/. Others are in here too. Most aren't real.
//
// Owns: this browser's identity, the heartbeat loop, the right-edge presence
// stack (one chip per presence), the occasional ghost that drifts across the
// screen, and the callbacks the terminal commands call (present/claim/name).
// Created in agent.js and passed into initTerminal({ ..., vigil }).
//
// A real id IS its proof of life: base64url(JSON.stringify({v:1,b,n,t,name?})).
// Click a chip (or type `decode <id>`) and a real presence yields readable JSON;
// a ghost yields a short plaintext hiss and never parses into a {v:1} object.
// That guaranteed living/dead split — not "looks random" — is the whole tell.

const LS = {
  id: "cg.vigil.id",
  name: "cg.vigil.name",
  tier: "cg.vigil.tier",
  token: "cg.vigil.token",
};

function lsGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s) {
  let t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return decodeURIComponent(
    atob(t).split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
  );
}

// The living/dead tell, client-side (mirror of the server oracle): a real id
// decodes to a {v:1, b:<number>} object; a ghost id is plaintext noise and won't.
function isRealId(id) {
  try {
    const obj = JSON.parse(b64urlDecode(id));
    return !!obj && typeof obj === "object" && obj.v === 1 && typeof obj.b === "number";
  } catch {
    return false;
  }
}

// Mirror of the server's restrained sanitizer (defence in depth; the server is
// authoritative). Allowlist only — markup characters can never pass.
function sanitizeNameLocal(raw) {
  if (typeof raw !== "string") return null;
  let s = raw.trim().slice(0, 24);
  if (!s) return null;
  if (!/^[A-Za-z0-9 ._-]+$/.test(s)) return null;
  s = s.replace(/\s+/g, " ").trim();
  return s || null;
}

const tierGlyph = (t) => (t === 1 ? "✦" : t === 2 ? "✧" : "·");

export function createVigil({ flare, audio, mount, decodeId } = {}) {
  const HEARTBEAT_MS = 45000;
  const MAX_CHIPS = 8; // cap the stack so it never buries the screen / input

  let token = lsGet(LS.token) || "";
  let tier = Number(lsGet(LS.tier) || 0) || 0;
  let name = lsGet(LS.name) || "";

  // mint (or restore) this browser's living id
  function mintId() {
    const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const payload = { v: 1, b: Math.floor(Date.now() / 1000), n: nonce, t: tier };
    if (tier > 0 && name) payload.name = name;
    return b64urlEncode(JSON.stringify(payload));
  }

  let id = lsGet(LS.id);
  if (!id) {
    id = mintId();
    lsSet(LS.id, id);
  }

  // when tier/name change we re-fold them into the id payload (the name rides the
  // roster and decodes in the solver's payload, tier-tagged).
  function refoldId() {
    let b = Math.floor(Date.now() / 1000);
    let nonce;
    try {
      const obj = JSON.parse(b64urlDecode(id));
      if (typeof obj.b === "number") b = obj.b;
      if (obj.n) nonce = obj.n;
    } catch {}
    if (!nonce) nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const payload = { v: 1, b, n: nonce, t: tier };
    if (tier > 0 && name) payload.name = name;
    id = b64urlEncode(JSON.stringify(payload));
    lsSet(LS.id, id);
  }

  let lastRoster = [];
  let lastCount = 0;
  let timer = null;

  // ── the right-edge presence stack: one chip per presence ──────────────────
  function renderStack() {
    if (!mount) return;
    mount.textContent = ""; // clear; we rebuild from the roster each beat
    if (!lastCount) {
      const q = document.createElement("div");
      q.className = "vigil-chip vigil-quiet";
      q.textContent = "▓ quiet";
      mount.appendChild(q);
      return;
    }
    for (const p of lastRoster.slice(0, MAX_CHIPS)) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "vigil-chip";
      const label = p.name ? `${p.handle} · ${p.name}` : p.handle;
      chip.textContent = `${tierGlyph(p.tier)} ${label}`; // textContent only — never innerHTML
      chip.title = "decode — living or dead?";
      if (p.id) {
        chip.dataset.id = p.id;
        chip.addEventListener("click", () => {
          if (decodeId) decodeId(p.id);
        });
      }
      mount.appendChild(chip);
    }
    if (lastCount > MAX_CHIPS) {
      const more = document.createElement("div");
      more.className = "vigil-chip vigil-more";
      more.textContent = `+${lastCount - MAX_CHIPS} more in the dark`;
      mount.appendChild(more);
    }
  }

  // ── occasional drift: a ghost surfaces at a random, off-grid spot ──────────
  // Ghosts only (the dead wander; the living dock in the stack). Atmospheric and
  // non-interactive; suppressed entirely under prefers-reduced-motion.
  let driftLayer = null;
  let driftTimer = null;
  function ensureDriftLayer() {
    if (driftLayer) return driftLayer;
    driftLayer = document.getElementById("vigil-drift");
    if (!driftLayer) {
      driftLayer = document.createElement("div");
      driftLayer.id = "vigil-drift";
      driftLayer.setAttribute("aria-hidden", "true");
      document.body.appendChild(driftLayer);
    }
    return driftLayer;
  }
  function driftOnce() {
    if (document.hidden) return;
    const ghosts = lastRoster.filter((p) => p.id && !isRealId(p.id));
    if (!ghosts.length) return;
    const p = ghosts[Math.floor(Math.random() * ghosts.length)];
    const layer = ensureDriftLayer();
    const chip = document.createElement("div");
    chip.className = "vigil-drift-chip";
    chip.textContent = `${tierGlyph(p.tier)} ${p.handle}`;
    // random, not grid-aligned; keep clear of the very bottom (the input row)
    chip.style.top = (10 + Math.random() * 66).toFixed(2) + "%";
    chip.style.left = (6 + Math.random() * 72).toFixed(2) + "%";
    chip.style.transform = `rotate(${(Math.random() * 6 - 3).toFixed(2)}deg)`;
    layer.appendChild(chip);
    setTimeout(() => chip.remove(), 7200); // outlives the CSS fade, then GC
  }
  function startDrift() {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    if (driftTimer) clearInterval(driftTimer);
    driftTimer = setInterval(() => {
      if (Math.random() < 0.75) driftOnce();
    }, 22000 + Math.floor(Math.random() * 16000)); // ~22–38s cadence
  }

  function applyRoster(list) {
    lastRoster = Array.isArray(list) ? list : [];
    lastCount = lastRoster.length;
    renderStack();
  }

  async function beat() {
    if (document.hidden) return null;
    try {
      const res = await fetch("/api/vigil/beat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name: name || undefined, token: token || undefined }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && Array.isArray(data.roster)) applyRoster(data.roster);
      return data;
    } catch {
      return null;
    }
  }

  async function roster() {
    try {
      const res = await fetch("/api/vigil");
      if (!res.ok) return lastRoster;
      const data = await res.json();
      if (data && Array.isArray(data.roster)) {
        applyRoster(data.roster);
        return data.roster;
      }
    } catch {}
    return lastRoster;
  }

  async function claim(code) {
    const c = (code || "").trim();
    if (!c) return { ok: false, reason: "the gate wants a code." };
    try {
      const res = await fetch("/api/vigil/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const data = await res.json();
      if (data && data.ok && data.token) {
        token = data.token;
        tier = Number(data.tier) || 0;
        lsSet(LS.token, token);
        lsSet(LS.tier, String(tier));
        refoldId();
        beat();
        if (flare) flare(900);
        return { ok: true, tier };
      }
      return { ok: false };
    } catch {
      return { ok: false, reason: "the gate did not answer." };
    }
  }

  function setName(newName) {
    if (!(tier > 0)) {
      return { ok: false, reason: "no name without a claim. the gate has to remember you first." };
    }
    const clean = sanitizeNameLocal(newName);
    if (!clean) {
      return { ok: false, reason: "that name won't take. (letters, digits, spaces, . _ - — up to 24.)" };
    }
    name = clean;
    lsSet(LS.name, name);
    refoldId();
    beat();
    return { ok: true, name };
  }

  function me() {
    return { id, tier, name: name || undefined };
  }

  function start() {
    renderStack();
    beat(); // immediate beat on load
    if (timer) clearInterval(timer);
    timer = setInterval(beat, HEARTBEAT_MS);
    startDrift();
    // beat again the moment the tab regains focus
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) beat();
    });
  }

  start();

  return { roster, claim, setName, me, present: roster };
}
