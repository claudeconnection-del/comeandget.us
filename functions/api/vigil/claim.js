// POST /api/vigil/claim — constant-time compare a code against the per-ARG env
// secrets. On match, return the tier (1=cryptid/ARG1, 2=tech/ARG2) and a signed
// HMAC grant the client includes on every beat. No KV write.
//
// Body: { code }  ->  { ok:true, tier, token }  |  { ok:false }
//
// The codes are NOT the puzzle answers and live only in env (CODE_ARG1 /
// CODE_ARG2). SIGN_KEY also lives only in env. None of them ship in source.
//
// This endpoint does NO KV write, so brute-force friction belongs at the edge:
// add a Cloudflare **Rate Limiting** rule on `/api/vigil/*` (per-IP) rather than
// a KV-counter (which would introduce writes where there are none). The compare
// hashes both sides before a constant-time check, so neither a match nor the
// code's LENGTH can be timed out of it.

import { signTier, json } from "./_lib.js";
import { secretEquals } from "../../_shared.js";

export async function onRequestPost({ request, env }) {
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

  // both compared, always, over fixed-length digests — no early exit, no length tell
  const [m1, m2] = await Promise.all([secretEquals(code, c1), secretEquals(code, c2)]);

  let tier = 0;
  if (m1) tier = 1;
  else if (m2) tier = 2;

  if (!tier || !signKey) return json({ ok: false });

  const token = await signTier(signKey, tier);
  return json({ ok: true, tier, token });
}
