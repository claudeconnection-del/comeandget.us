// POST /api/vigil/beat — refresh my presence, then return the merged roster so
// one round-trip both registers and fetches.
//
// Body: { id, name?, token?, e? }
//  - id must be a well-formed living payload (base64url JSON, v===1, numeric b)
//  - if token verifies, accept its tier and the sanitized name; else tier 0, no name
//
// COST, which is the whole reason this file was rewritten:
//   The old version did a KV.list on every beat to rebuild the roster. Free KV
//   allows 1,000 list requests a day, so a 45s heartbeat exhausted the site's
//   entire daily allowance in about twelve tab-hours. Now a beat costs:
//     - zero storage ops when this isolate saw the same slot inside REFRESH_AFTER
//     - one guarded upsert otherwise, which itself writes zero rows unless
//       something actually changed or the row went stale
//     - zero reads when the roster is still cached
//   A caller hammering this endpoint from one address therefore consumes no
//   quota at all after their first beat. See _store.js for why that holds.

import { decodeRealPayload, verifyTier, sanitizeName, publicPresence, handleFor, json } from "./_lib.js";
import { buildRoster } from "./index.js";
import { touchPresence, countMilestone, allow } from "./_store.js";

export async function onRequestPost({ request, env, waitUntil }) {
  const ctx = { waitUntil };

  // A generous ceiling — well above any honest heartbeat, low enough to blunt a
  // single-host flood before it reaches storage. Storage-less and per-isolate;
  // the real boundary is the WAF rule documented in README.md.
  if (!allow(request, "beat", 120, 60_000)) {
    return new Response(JSON.stringify({ error: "too many" }), {
      status: 429,
      headers: { "content-type": "application/json; charset=utf-8", "retry-after": "60" },
    });
  }

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
  const name = tier > 0 ? await sanitizeName(body.name) : null;

  // The echo brand (self-applied by the reckoning, client-side). Strictly a
  // boolean shape — any other value is dropped. It can only ever mark the
  // caller's OWN row, because the row is addressed by a server-derived slot.
  const echo = body.e === 1 || body.e === true;

  const wrote = await touchPresence(
    env,
    request,
    ctx,
    { id, tier, name, echo, born: payload.b },
    Date.now()
  );

  // Build "you" from what we just validated rather than reading it back: the
  // roster is served from a cache and D1 reads are not guaranteed to reflect a
  // write from the same request, so the response has to be authoritative here.
  const you = {
    id,
    handle: handleFor(payload.n != null ? payload.n : id, tier),
    tier,
    name: name || undefined,
    e: echo ? 1 : undefined,
    ageSec: Math.max(0, nowSec - payload.b),
  };

  const now = Date.now();
  const merged = await buildRoster(env, request, ctx, now);
  let roster = merged.map(publicPresence);
  // Overlay my own presence: drop a cached copy of me, then put me first.
  roster = roster.filter((p) => p.id !== id);
  roster.unshift(publicPresence(you));

  // Funnel signal — but only on a beat that actually wrote. A heartbeat that the
  // guard declined is a no-op, and it should stay a no-op: piggybacking the
  // milestone probes on every beat would reintroduce per-request storage chatter
  // through the back door. countMilestone dedupes again on top of this.
  if (wrote && ctx.waitUntil) {
    const marks = ["root.entered"];
    if (tier === 1) marks.push("root.claimed.cryptid");
    if (tier === 2) marks.push("root.claimed.tech");
    if (name) marks.push("root.named");
    if (echo) marks.push("root.haunted");
    ctx.waitUntil(
      (async () => {
        for (const m of marks) await countMilestone(env, request, ctx, m, now);
      })()
    );
  }

  return json({ roster, you });
}
