// POST /api/vigil/progress — record that somebody reached a milestone.
//
// Body: { m: "<milestone>" }  ->  { ok: true }
//
// This is the aggregate funnel: how FAR visitors get, never who they are. The
// only thing stored is a per-day counter per milestone, plus a dedupe ledger
// keyed on the same one-way daily HMAC of the address that presence uses. There
// is no visitor row, no identifier that outlives the UTC day, and nothing that
// can be joined back to a person.
//
// Three properties keep it honest and cheap:
//   - the milestone must be in the server-side allowlist (MILESTONES in
//     _store.js), so the table's cardinality is fixed no matter what is POSTed;
//   - a milestone counts once per address per day, enforced by an INSERT OR
//     IGNORE that writes zero rows on a replay, so nobody can pump a number;
//   - the reply is the same {ok:true} either way, so this endpoint is not an
//     oracle for "has this milestone been reached before" — which would leak
//     progress information into the ARG.
//
// Cost: an already-counted report costs nothing (an isolate-local set catches
// it); a fresh one costs two row-writes. Bounded by distinct visitors times
// milestones reached, not by traffic.

import { json } from "./_lib.js";
import { countMilestone, allow, MILESTONES } from "./_store.js";

export async function onRequestPost({ request, env, waitUntil }) {
  // A visitor can only reach so many milestones; a burst above this is noise.
  if (!allow(request, "progress", 40, 60_000)) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 429,
      headers: { "content-type": "application/json; charset=utf-8", "retry-after": "60" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false }, 400);
  }

  const m = body && typeof body.m === "string" ? body.m.trim() : "";
  // Deliberately uniform: an unknown milestone is accepted and dropped rather
  // than rejected, so probing this endpoint reveals nothing about the allowlist.
  if (m && MILESTONES.has(m)) {
    const job = countMilestone(env, request, { waitUntil }, m);
    if (waitUntil) waitUntil(job);
    else await job;
  }

  return json({ ok: true });
}
