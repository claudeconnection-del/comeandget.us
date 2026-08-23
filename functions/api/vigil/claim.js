// POST /api/vigil/claim — constant-time compare a code against the per-ARG env
// secrets. On match, return the tier (1=cryptid/ARG1, 2=tech/ARG2) and a signed
// HMAC grant the client includes on every beat.
//
// Body: { code }  ->  { ok:true, tier, token }  |  { ok:false }
//
// The codes are NOT the puzzle answers and live only in env (CODE_ARG1 /
// CODE_ARG2). SIGN_KEY also lives only in env. None of them ship in source.
//
// This endpoint touches no storage, which used to mean it had no friction at all
// against a brute-force sweep — the one place where "costs us nothing" and "costs
// the attacker nothing" were the same sentence. It now carries a storage-less
// per-address token bucket. That is a speed bump, not a boundary: Cloudflare pins
// a client to a colo so it catches the ordinary single-host hammer, but a
// distributed sweep needs the WAF rate-limit rule documented in README.md.
//
// The compare is constant-time so a match can't be timed out (it does reveal code
// LENGTH via the early length check — low risk for short shared codes).

import { timingSafeEqual, signTier, json } from "./_lib.js";
import { countMilestone, allow } from "./_store.js";

export async function onRequestPost({ request, env, waitUntil }) {
  // A human typing a code needs a handful of tries; a dictionary sweep wants
  // thousands. Twenty a minute sits comfortably between the two, with enough head
  // room that a parallel CI run (which shares one source address, and therefore
  // one bucket) cannot trip it.
  if (!allow(request, "claim", 20, 60_000)) {
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

  const code = body && typeof body.code === "string" ? body.code.trim() : "";
  if (!code) return json({ ok: false }, 400);

  const c1 = (env && env.CODE_ARG1) || "";
  const c2 = (env && env.CODE_ARG2) || "";
  const signKey = (env && env.SIGN_KEY) || "";

  // constant-time compare against each; never short-circuit on first mismatch
  const m1 = c1 && timingSafeEqual(code, c1);
  const m2 = c2 && timingSafeEqual(code, c2);

  let tier = 0;
  if (m1) tier = 1;
  else if (m2) tier = 2;

  if (!tier || !signKey) {
    // A wrong code is the most interesting number on the whole site: it means
    // somebody got far enough to try. Deduped per address per day, so this is a
    // count of people who guessed, not of guesses.
    if (waitUntil) waitUntil(countMilestone(env, request, { waitUntil }, "claim.rejected"));
    return json({ ok: false });
  }

  const token = await signTier(signKey, tier);
  return json({ ok: true, tier, token });
}
