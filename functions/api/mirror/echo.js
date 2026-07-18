// GET /api/mirror/echo — the cookieless recognition leg. We stamp a
// self-authenticating ETag; the browser (Cache-Control: no-cache) revalidates on
// return and hands it back via If-None-Match. A valid HMAC = "we issued this
// browser a token before" = returning. No cookie, no JS storage, no KV write.

import { echoToken, verifyEchoToken } from "./_lib.js";

export async function onRequestGet({ request, env }) {
  const signKey = env && env.SIGN_KEY;
  const inm = request.headers.get("If-None-Match");
  const seenAt = inm ? await verifyEchoToken(signKey, inm) : null;

  if (seenAt) {
    return new Response(null, {
      status: 304,
      headers: {
        "ETag": inm,
        "Cache-Control": "no-cache",
        "X-Vigil-Seen": "1",
        "X-Vigil-First": String(seenAt),
      },
    });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const token = signKey ? await echoToken(signKey, nowSec) : String(nowSec);
  return new Response(".", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "ETag": `"${token}"`,
      "Cache-Control": "no-cache",
      "X-Vigil-Seen": "0",
    },
  });
}
