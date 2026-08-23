// GET /api/vigil — the roster: computed ghosts ∪ real presences.
//
// No writes. The one SELECT behind this is collapsed through an isolate memo and
// the colo cache (see _store.js), so a crowd arriving together costs one query
// per window rather than one per visitor. Storage trouble degrades to
// ghosts-only — this endpoint must never hand a visitor an error, because the
// vigil going quiet is in genre and a 500 is not.

import {
  computeGhosts,
  publicPresence,
  handleFor,
  shuffleDeterministic,
  decodeRealPayload,
  json,
} from "./_lib.js";
import { readReals, MAX_REALS } from "./_store.js";

// Shape a stored row into a roster entry. The id must STILL decode to a living
// payload — the oracle invariant is re-checked on read as well as on write, so a
// row can never present as real unless its id genuinely is.
function asPresence(row, nowSec) {
  const payload = decodeRealPayload(row && row.id);
  if (!payload) return null;
  const born = typeof row.born === "number" ? row.born : payload.b;
  return {
    id: row.id,
    handle: handleFor(payload.n != null ? payload.n : row.id, row.tier || 0),
    tier: row.tier || 0,
    name: typeof row.name === "string" && row.name ? row.name : undefined,
    e: row.echo ? 1 : undefined,
    ageSec: Math.max(0, nowSec - born),
    _ghost: false,
  };
}

export async function buildRoster(env, request, ctx, now = Date.now()) {
  const nowSec = Math.floor(now / 1000);
  const rows = await readReals(env, request, ctx, now);

  // Dedupe by id. Two rows can legitimately carry the same id (the same browser
  // seen from two addresses), and a griefer could copy someone else's id into
  // their own row; either way the roster shows one chip per identity.
  const seen = new Set();
  const reals = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    const p = asPresence(row, nowSec);
    if (!p) continue;
    seen.add(row.id);
    reals.push(p);
    if (reals.length >= MAX_REALS) break;
  }

  const ghosts = computeGhosts(now);
  const merged = [...ghosts, ...reals];
  // Deterministic interleave keyed to a coarse time bucket: stable for a while,
  // never frozen, and ghosts are never trivially clustered.
  const seed = Math.floor(now / (1000 * 60)) ^ merged.length;
  return shuffleDeterministic(merged, seed);
}

export async function onRequestGet({ env, request, waitUntil }) {
  const now = Date.now();
  const ctx = { waitUntil };
  const merged = await buildRoster(env, request, ctx, now);
  const roster = merged.map(publicPresence);
  return json({ roster, n: roster.length });
}
