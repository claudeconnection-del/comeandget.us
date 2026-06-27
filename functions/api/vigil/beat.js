// POST /api/vigil/beat — upsert my presence (TTL), then return the merged roster
// so one round-trip both refreshes and fetches.
//
// Body: { id, name?, token? }
//  - id must be a well-formed living payload (base64url JSON, v===1, numeric b)
//  - if token verifies, accept its tier and the sanitized name; else tier=0, no name
//  - throttled: only re-put when missing/changed/near expiry (client beats ~45s)

import {
  decodeRealPayload,
  verifyTier,
  sanitizeName,
  publicPresence,
  handleFor,
  json,
} from "./_lib.js";
import { buildRoster } from "./index.js";

// A presence lingers ~10min and we only re-write KV when it's within 2min of
// expiry, so one continuously-open tab writes ~once per ~8min (~180/day) — well
// under the free-tier ~1000 writes/day cap, even with several concurrent viewers.
// (Reads are cheap and the roster is "eventually consistent" anyway.)
const TTL_SECONDS = 600;
const REPUT_WINDOW = 120; // re-put when within this many seconds of expiry

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const id = body && body.id;
  const payload = decodeRealPayload(id);
  if (!payload) return json({ error: "malformed id" }, 400);

  // sanity bounds on the embedded timestamp (seconds, not far future/past)
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.b > nowSec + 60 || payload.b < nowSec - 60 * 60 * 24 * 365) {
    return json({ error: "implausible id" }, 400);
  }

  // verify tier from a signed token (the only way to earn tier 1/2 + a name)
  let tier = 0;
  if (body.token) tier = await verifyTier(env && env.SIGN_KEY, body.token);
  const name = tier > 0 ? sanitizeName(body.name) : null;

  const KV = env && env.PRESENCE;

  if (KV) {
    const key = `p:${id}`;
    let existing = null;
    try {
      existing = await KV.getWithMetadata(key, "json");
    } catch {
      existing = null;
    }
    const prev = existing && existing.value;
    const writtenAt = existing && existing.metadata && existing.metadata.w;
    const record = { b: payload.b, t: tier, name: name || undefined, last: nowSec };

    const changed =
      !prev ||
      prev.t !== record.t ||
      (prev.name || "") !== (record.name || "");
    const nearExpiry =
      !writtenAt || nowSec - writtenAt >= TTL_SECONDS - REPUT_WINDOW;

    if (changed || nearExpiry) {
      await KV.put(key, JSON.stringify(record), {
        expirationTtl: TTL_SECONDS,
        metadata: { w: nowSec },
      });
    }
  }

  // Build "you" authoritatively from what we just validated/wrote — KV list+get
  // is eventually consistent, so we cannot rely on reading our own record back in
  // the same request. Overlay it onto the roster so the response is correct now.
  const you = {
    id,
    handle: handleFor(payload.n != null ? payload.n : id, tier),
    tier,
    name: name || undefined,
    ageSec: Math.max(0, nowSec - payload.b),
  };

  const now = Date.now();
  const merged = await buildRoster(env, now);
  let roster = merged.map(publicPresence);
  // overlay my own presence: replace a stale read-back if present, else add it
  roster = roster.filter((p) => p.id !== id);
  roster.unshift(publicPresence(you));

  return json({ roster, you });
}
