// GET /api/vigil — the roster: computed ghosts ∪ real presences from KV.
// The only write on this path is the shared roster snapshot (see readReals).

import {
  computeGhosts,
  publicPresence,
  handleFor,
  shuffleDeterministic,
  decodeRealPayload,
  json,
} from "./_lib.js";

// Cap on real presences folded into the roster. Bounds both the response size
// and the per-request work regardless of how many keys live in KV, so a flood of
// seeded ids can't turn a cheap roster read into an unbounded sweep. Ghosts ride
// on top of this.
const MAX_REALS = 50;

// One listing is shared by everyone for this long. KV.list is the scarce op —
// the free plan allows 1,000 per day, and the roster used to spend one on every
// GET and every beat, so a single tab beating every 45s burned the whole day's
// budget by itself (and took the progress board's recount down with it). Now a
// listing is taken at most once per window and kept in one KV value that every
// other request reads instead (reads are 100k/day). Freshness: a newcomer shows
// up for others within the window; the beating client sees itself immediately,
// because beat.js overlays its own presence onto whatever roster it gets.
const SNAPSHOT_KEY = "roster:snap";
const SNAPSHOT_TTL_SECONDS = 180;
// How long KV keeps a snapshot at all. Longer than the window on purpose: when
// the list budget is gone, a stale roster is still truer than an empty one.
const SNAPSHOT_KEEP_SECONDS = 60 * 60;

// Sweep KV for the live real presences (prefix "p:"). Returns the rows without a
// clock (ageSec is applied at read time, so a cached row still ages) and whether
// the sweep completed — a failed list must never be mistaken for an empty roster.
async function listReals(KV) {
  const rows = [];
  let cursor;
  try {
    outer: do {
      const res = await KV.list({ prefix: "p:", cursor });
      for (const key of res.keys) {
        const id = key.name.slice(2);
        // the id itself must still decode to a living payload; skip anything that
        // somehow doesn't (defends the oracle invariant on read, too)
        const payload = decodeRealPayload(id);
        if (!payload) continue;
        // Prefer the metadata KV.list already returned — it carries the displayable
        // record (t/name/b), so the common path performs NO per-key KV.get. Fall
        // back to a get only for legacy entries written before the record was
        // mirrored into metadata.
        let rec = key.metadata;
        if (!rec || typeof rec.t === "undefined") {
          try {
            rec = await KV.get(key.name, "json");
          } catch {
            rec = null;
          }
        }
        if (!rec) continue;
        rows.push({
          id,
          handle: handleFor(payload.n != null ? payload.n : id, rec.t || 0),
          tier: rec.t || 0,
          name: typeof rec.name === "string" && rec.name ? rec.name : undefined,
          e: rec.e ? 1 : undefined,
          b: typeof rec.b === "number" ? rec.b : payload.b,
        });
        if (rows.length >= MAX_REALS) break outer;
      }
      cursor = res.list_complete ? undefined : res.cursor;
    } while (cursor);
  } catch {
    // KV.list can fail for reasons that are nothing to do with this request —
    // most often the namespace's daily list budget. The roster is decorative:
    // report the failure and let the caller fall back rather than 500.
    return { rows, ok: false };
  }
  return { rows, ok: true };
}

// Put the clock on a set of rows: age is measured now, whatever the rows' vintage.
const present = (rows, nowSec) =>
  rows.map((r) => ({
    ...r,
    ageSec: Math.max(0, nowSec - (typeof r.b === "number" ? r.b : nowSec)),
    _ghost: false,
  }));

// Read the live real presences: from the shared snapshot while it is fresh, else
// from one new listing that is then snapshotted for everyone else. List is
// eventually consistent — a just-joined real may lag a little. Acceptable for genre.
export async function readReals(env, now = Date.now()) {
  const KV = env && env.PRESENCE;
  if (!KV) return [];
  const nowSec = Math.floor(now / 1000);

  let snap = null;
  try {
    snap = await KV.get(SNAPSHOT_KEY, "json");
  } catch {
    snap = null;
  }
  const kept = snap && typeof snap.at === "number" && Array.isArray(snap.rows) ? snap : null;
  if (kept && nowSec - kept.at < SNAPSHOT_TTL_SECONDS) return present(kept.rows, nowSec);

  const listed = await listReals(KV);
  if (!listed.ok) {
    // The list failed. A stale snapshot is still the truest roster we have, and a
    // failure must never spend a write recording itself.
    return present(kept ? kept.rows : listed.rows, nowSec);
  }
  try {
    await KV.put(SNAPSHOT_KEY, JSON.stringify({ at: nowSec, rows: listed.rows }), {
      expirationTtl: SNAPSHOT_KEEP_SECONDS,
    });
  } catch {
    // a snapshot we could not keep is still a roster we can serve
  }
  return present(listed.rows, nowSec);
}

export function buildRoster(env, now = Date.now()) {
  return Promise.resolve(readReals(env, now)).then((reals) => {
    const ghosts = computeGhosts(now);
    const merged = [...ghosts, ...reals];
    // deterministic interleave keyed to a coarse time bucket so it's stable for
    // a while but not frozen, and ghosts aren't clustered.
    const seed = Math.floor(now / (1000 * 60)) ^ merged.length;
    const shuffled = shuffleDeterministic(merged, seed);
    return shuffled;
  });
}

export async function onRequestGet({ env }) {
  const now = Date.now();
  const merged = await buildRoster(env, now);
  const roster = merged.map(publicPresence);
  return json({ roster, n: roster.length });
}
