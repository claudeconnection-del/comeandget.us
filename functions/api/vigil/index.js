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

// Read the live real presences out of KV (prefix "p:"). List is eventually
// consistent — a just-joined real may lag a few seconds. Acceptable for genre.
export async function readReals(env, now = Date.now()) {
  const reals = [];
  const KV = env && env.PRESENCE;
  if (!KV) return reals;
  let cursor;
  do {
    const res = await KV.list({ prefix: "p:", cursor });
    for (const key of res.keys) {
      const id = key.name.slice(2);
      // the id itself must still decode to a living payload; skip anything that
      // somehow doesn't (defends the oracle invariant on read, too)
      const payload = decodeRealPayload(id);
      if (!payload) continue;
      let rec = null;
      try {
        rec = await KV.get(key.name, "json");
      } catch {
        rec = null;
      }
      if (!rec) continue;
      const b = typeof rec.b === "number" ? rec.b : payload.b;
      reals.push({
        id,
        handle: handleFor(payload.n != null ? payload.n : id, rec.t || 0),
        tier: rec.t || 0,
        name: typeof rec.name === "string" ? rec.name : undefined,
        ageSec: Math.max(0, Math.floor(now / 1000) - b),
        _ghost: false,
      });
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
