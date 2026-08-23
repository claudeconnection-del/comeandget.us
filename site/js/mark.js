// mark.js — the one-way funnel report.
//
// Calling mark("cafe.daily-grind") says "somebody got this far" and nothing else.
// No identifier is sent. The server counts it against a one-way daily hash of the
// address (see functions/api/vigil/_store.js) and keeps only a per-day total per
// milestone, so what accumulates is "eleven people cleared the DNS challenge on
// the 14th" — never who, never a trail.
//
// Three deliberate properties:
//   - Fire and forget. Nothing here can fail loudly, block a puzzle, or change
//     what the page does. A dead endpoint, a blocked request, a private-mode
//     localStorage throw: all no-ops. The ARG never depends on this working.
//   - Once per browser per milestone. The localStorage ledger means the daily
//     numbers count NEW arrivals at a stage rather than repeat visits, which is
//     the shape you want from a funnel.
//   - It never reads. There is no endpoint here that tells a visitor how many
//     others solved something, because that would leak progress into the puzzle:
//     a counter that ticks the moment a stage is solved tells everyone else the
//     stage is solvable. The aggregate is operator-only, behind STATS_KEY.

const KEY = "cg.marks";
const MAX = 64;

function seen() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function remember(set) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set].slice(-MAX)));
  } catch {
    // private mode, storage disabled, quota — the report just repeats next time,
    // and the server dedupes it anyway.
  }
}

export function mark(name) {
  if (typeof name !== "string" || !name) return;
  const already = seen();
  if (already.has(name)) return;
  already.add(name);
  remember(already);

  const body = JSON.stringify({ m: name });
  try {
    // sendBeacon survives the navigation that often follows a milestone (solving
    // the gate, crossing to the café), which a plain fetch would not.
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/vigil/progress", blob)) return;
    }
    fetch("/api/vigil/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never let telemetry break a puzzle
  }
}

export default mark;
