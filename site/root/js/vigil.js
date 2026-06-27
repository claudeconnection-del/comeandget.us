// The vigil — presence for /root/. Others are in here too. Most aren't real.
//
// Owns: this browser's identity, the heartbeat loop, the ghosted corner display,
// and the callbacks the terminal commands call (present/claim/name/roster). The
// terminal talks to it only through the passed-in interface, the same way it
// already receives decode/flare/audio. Created in agent.js and passed into
// initTerminal({ ..., vigil }).
//
// A real id IS its proof of life: base64url(JSON.stringify({v:1,b,n,t,name?})).
// Type `decode <id>` on a real presence and you get readable JSON. Ghosts decode
// to a short plaintext hiss and never parse into a {v:1} object. That guaranteed
// living/dead split — not "looks random" — is the whole tell.

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

export function createVigil({ flare, audio, mount, present } = {}) {
  const HEARTBEAT_MS = 45000;

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
    // keep the original join time + nonce if possible
    let b = Math.floor(Date.now() / 1000);
    let nonce;
    try {
      let t = id.replace(/-/g, "+").replace(/_/g, "/");
      while (t.length % 4) t += "=";
      const obj = JSON.parse(decodeURIComponent(
        atob(t).split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
      ));
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

  function renderCorner() {
    if (!mount) return;
    const n = lastCount;
    // most-recent handle = first in the (already shuffled) roster, if any
    const recent = lastRoster.length ? lastRoster[0].handle : "";
    const label = n
      ? `▓ ${n} present${recent ? " · " + recent : ""}`
      : "▓ quiet";
    mount.textContent = label; // textContent only — never innerHTML
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
      if (data && Array.isArray(data.roster)) {
        lastRoster = data.roster;
        lastCount = data.roster.length;
        renderCorner();
      }
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
        lastRoster = data.roster;
        lastCount = data.roster.length;
        renderCorner();
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

  // corner display: tap/click runs the `present` command so a keyboard-less
  // mobile visitor can still open the full list.
  if (mount && typeof present === "function") {
    mount.addEventListener("click", () => present());
  }

  function start() {
    renderCorner();
    beat(); // immediate beat on load
    if (timer) clearInterval(timer);
    timer = setInterval(beat, HEARTBEAT_MS);
    // beat again the moment the tab regains focus
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) beat();
    });
  }

  start();

  return { roster, claim, setName, me, present: roster };
}
