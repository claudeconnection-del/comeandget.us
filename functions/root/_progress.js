// Pure aggregation for the /root progress board. No KV, no fetch, no clock of its
// own — everything arrives as an argument, so the whole of the board's arithmetic
// is unit-testable without a runtime. Import-only (the leading underscore keeps
// Pages from routing it).
//
// The governing rule of this file: a number is derived from ground truth or it is
// not produced. Where a figure cannot be known (the terminal) it is null forever;
// where a sample is too small to summarise (pace) it is suppressed, never guessed.

export const ARRIVAL_KEY = "g0";

// The measured chain, in order. Labels ship to the client with the data so the
// page and the shell render one definition instead of two that can drift.
export const RUNGS = [
  { key: "g1", label: "the wire" },
  { key: "g2", label: "the token" },
  { key: "g3", label: "the shape" },
  { key: "g4seal", label: "the seal" },
  { key: "g4open", label: "the opening" },
];

export const TERMINAL_LABEL = "the reply";
export const COUNT_KEYS = [ARRIVAL_KEY, ...RUNGS.map((r) => r.key)];

const CLIMBING_WINDOW = 14 * 24 * 60 * 60; // seconds
const PACE_MIN_N = 3;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Pull only the well-formed stamps out of a record. Anything else — a null
// record, a missing map, a string timestamp — contributes nothing rather than
// throwing: one corrupt entry must not take the board down.
function stamps(record) {
  if (!record || typeof record !== "object") return null;
  const g = record.g;
  if (!g || typeof g !== "object") return null;
  const out = {};
  for (const k of COUNT_KEYS) {
    const v = num(g[k]);
    if (v !== null) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

function median(sorted) {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function build(counts, { climbing, pace, since }) {
  const rungs = RUNGS.map((r) => ({ key: r.key, label: r.label, count: counts[r.key] || 0 }));
  const arrived = counts[ARRIVAL_KEY] || 0;
  return {
    arrived,
    rungs,
    terminal: { label: TERMINAL_LABEL, count: null }, // never a number. by design.
    climbing,
    pace,
    since,
    empty: arrived === 0 && rungs.every((r) => r.count === 0),
  };
}

export function summarize(records, { now }) {
  const rows = [];
  for (const r of Array.isArray(records) ? records : []) {
    const s = stamps(r);
    if (s) rows.push(s);
  }

  // Counted per gate independently, not from the furthest rung: gates should only
  // clear in order, but a leaked path could stamp g3 without g2, and counting by
  // "furthest >= k" would over-report every rung underneath it.
  const counts = {};
  for (const k of COUNT_KEYS) counts[k] = rows.filter((s) => s[k] != null).length;

  let climbing = 0;
  let since = null;
  const elapsed = [];

  for (const s of rows) {
    const times = Object.values(s);
    const first = Math.min(...times);
    since = since === null ? first : Math.min(since, first);

    if (s.g1 != null && s.g4open == null && Math.max(...times) >= now - CLIMBING_WINDOW) climbing++;
    if (s.g1 != null && s.g4open != null && s.g4open >= s.g1) elapsed.push(s.g4open - s.g1);
  }

  elapsed.sort((a, b) => a - b);
  const pace =
    elapsed.length >= PACE_MIN_N
      ? { median: median(elapsed), fastest: elapsed[0], n: elapsed.length }
      : null;

  return build(counts, { climbing, pace, since });
}

// Build a summary from the durable rollup alone, for when a live listing is not
// possible (KV's daily list budget is finite, and the roster spends most of it).
// The counts are real — a monotonic high-water mark of things that actually
// happened — but climbing and pace are live-only measures, so they come back null
// rather than 0. A zero there would claim "nobody is climbing", which we do not know.
export function fromRollup(stored) {
  const counts = stored && stored.counts;
  if (!counts || !COUNT_KEYS.some((k) => num(counts[k]))) return null;
  return build(counts, { climbing: null, pace: null, since: num(stored.since) });
}

// Merge the live counts with the durable high-water mark. Counts only ever grow,
// so max() is monotonic and idempotent: concurrent writers converge, and a lost
// write is repaired by the next render. climbing and pace are deliberately NOT
// rolled up — both are live measures by definition, and a median cannot be merged
// monotonically without lying about it.
export function reconcile(summary, stored) {
  const live = { [ARRIVAL_KEY]: summary.arrived };
  for (const r of summary.rungs) live[r.key] = r.count;

  const counts = {};
  let changed = false;
  for (const k of COUNT_KEYS) {
    const prev = num(stored && stored.counts && stored.counts[k]) ?? 0;
    counts[k] = Math.max(prev, live[k] || 0);
    if (counts[k] !== prev) changed = true;
  }

  const prevSince = num(stored && stored.since);
  const since =
    prevSince === null
      ? summary.since
      : summary.since === null
        ? prevSince
        : Math.min(prevSince, summary.since);
  if (since !== prevSince) changed = true;

  return {
    summary: build(counts, { climbing: summary.climbing, pace: summary.pace, since }),
    rollup: { v: 1, counts, since },
    changed,
  };
}
