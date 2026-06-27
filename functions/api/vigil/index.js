// GET /api/vigil — the roster: computed ghosts ∪ real presences from KV.
// No KV writes. Reads are cheap (free tier ~100k/day).

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

// Read the live real presences out of KV (prefix "p:"). List is eventually
// consistent — a just-joined real may lag a few seconds. Acceptable for genre.
export async function readReals(env, now = Date.now()) {
  const reals = [];
  const KV = env && env.PRESENCE;
  if (!KV) return reals;
  const nowSec = Math.floor(now / 1000);
  let cursor;
  outer: do {
    const res = await KV.list({ prefix: "p:", cursor });
    for (const key of res.keys) {
      const id = key.name.slice(2);
      // the id itself must still decode to a living payload; skip anything that
      // somehow doesn't (defends the oracle invariant on read, too)
      const payload = decodeRealPayload(id);
      if (!payload) continue;
      // Prefer the metadata KV.list already returned — it carries the displayable
      // record (t/name/b), so the common path performs NO per-key KV.get (this
      // was an N+1 over every key on every roster read + beat). Fall back to a
      // get only for legacy entries written before the record was mirrored into
      // metadata.
      let rec = key.metadata;
      if (!rec || typeof rec.t === "undefined") {
        try {
          rec = await KV.get(key.name, "json");
        } catch {
          rec = null;
        }
      }
      if (!rec) continue;
      const b = typeof rec.b === "number" ? rec.b : payload.b;
      reals.push({
        id,
        handle: handleFor(payload.n != null ? payload.n : id, rec.t || 0),
        tier: rec.t || 0,
        name: typeof rec.name === "string" && rec.name ? rec.name : undefined,
        ageSec: Math.max(0, nowSec - b),
        _ghost: false,
      });
      if (reals.length >= MAX_REALS) break outer;
    }
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return reals;
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
