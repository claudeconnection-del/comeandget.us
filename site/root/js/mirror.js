// The Reflection — orchestrator. Boots from agent.js. Drips ambient Intune-style
// telemetry, watches a threshold (accreted drips OR a recognized return), and
// surfaces the device-posture dossier once. Reads/writes ONLY cg.mirror.seen.
// Strictly parallel to the puzzle: it never reads or writes gate/ritual/haunt.

import { collectProbes } from "./mirror/probes.js";
import { deriveSigil } from "./mirror/sigil.js";
import { ambientLines, inferOS } from "./mirror/lines.js";
import { printDossier } from "./mirror/dossier.js";

const SEEN_KEY = "cg.mirror.seen";
const AMBIENT_THRESHOLD = 3;      // drips before the dossier accretes
const AMBIENT_INTERVAL_MS = 38000;
const FIRST_DRIP_MS = 12000;

function seenGet() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "null") || { count: 0 }; }
  catch { return { count: 0 }; }
}
function seenBump() {
  const s = seenGet();
  const next = { count: (s.count || 0) + 1, last: Date.now() };
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch {}
  return next;
}

export function createMirror({ println, run, vigil, flare } = {}) {
  const param = new URLSearchParams(location.search).get("mirror");
  const inert = param === "off";
  const say = (s) => { try { println && println(s); } catch {} };

  const prior = seenGet();
  const nowSeen = inert ? prior : seenBump();     // this visit counts (unless inert)
  const returning = (prior.count || 0) >= 1;

  let revealed = false;
  let drips = 0;
  let ambientTimer = null;

  async function reveal(reason) {
    // "inert" (mirror=off) suppresses AUTOMATIC surfacing (ambient drips, the
    // ?mirror=now auto-path — both gated at their own call sites below), but an
    // explicit pull (dsregcmd /status) must still work even while inert; that's
    // the whole point of the on-demand command.
    if (revealed) return;
    revealed = true;
    if (ambientTimer) clearInterval(ambientTimer);
    let probes = {};
    try { probes = await collectProbes(); } catch {}
    try { await deriveSigil(probes); } catch {} // derived, used by Phase 2; harmless now
    const seen = { count: nowSeen.count, returning: returning };
    printDossier(say, { probes, os: inferOS(probes), seen });
    if (flare) try { flare(700); } catch {}
  }

  function startAmbient() {
    if (inert) return;
    let lines = [];
    const dripOne = async () => {
      if (revealed) return;
      if (!lines.length) {
        try { lines = ambientLines(await collectProbes()); } catch { lines = []; }
      }
      const line = lines.shift();
      if (line) { say(line); drips++; }
      if (drips >= AMBIENT_THRESHOLD || returning) reveal("threshold");
    };
    setTimeout(dripOne, FIRST_DRIP_MS);
    ambientTimer = setInterval(dripOne, AMBIENT_INTERVAL_MS);
  }

  if (param === "now") { reveal("param"); }
  else { startAmbient(); }

  return { reveal, primed: !inert };
}
