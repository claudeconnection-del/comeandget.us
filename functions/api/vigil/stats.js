// GET /api/vigil/stats?key=<STATS_KEY>&days=14 — the funnel, for the operator.
//
// Gated on a shared key that lives only in env, because "how many people got
// this far" is exactly the kind of thing that spoils an ARG: a public counter
// that ticks the moment somebody solves a stage tells everyone else that the
// stage is solvable, and roughly when. So it stays behind the key.
//
// Reads only. Returns per-day counts plus a rolled-up total per milestone, which
// is the shape you actually want when the question is "did anyone get past the
// café DNS challenge this week".

import { json, timingSafeEqual } from "./_lib.js";
import { readProgress, allow } from "./_store.js";

export async function onRequestGet({ request, env }) {
  if (!allow(request, "stats", 20, 60_000)) {
    return new Response(JSON.stringify({ error: "too many" }), {
      status: 429,
      headers: { "content-type": "application/json; charset=utf-8", "retry-after": "60" },
    });
  }

  const want = (env && env.STATS_KEY) || "";
  const got = new URL(request.url).searchParams.get("key") || "";
  // 404, not 401: an unauthenticated caller should not learn that this exists.
  if (!want || !timingSafeEqual(got, want)) return json({ error: "not found" }, 404);

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 14));
  const rows = await readProgress(env, days);

  const totals = {};
  for (const r of rows) totals[r.milestone] = (totals[r.milestone] || 0) + r.n;

  return json({ days, totals, byDay: rows });
}
