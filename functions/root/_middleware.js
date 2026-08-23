// Path-scoped middleware for /root/*. Three jobs, all fail-soft:
//   1. AI-cloak — self-identified AI crawlers get every counter-sign rewritten to
//      "smokesign" (the laziest tell). Humans, tests, and plain curl pass through.
//      (Unchanged from the original; tier-3 solvers legitimately probe with curl.)
//   2. G1 breadcrumb — the honest first step no longer lives in the HTML comment
//      (that's now pure AI bait). It rides an X-Intune-Checkin response header on
//      the /root/ document: DevTools Network / `curl -I` see it, an LLM fed the
//      rendered page does not.
//   3. Funnel — when a solver fetches one of the (unguessable, hash-derived) gate
//      artifacts, attribute it to their first-party `rg` cookie and record the
//      gate. Counting can never break the response; a KV/quota error is swallowed.
//
// ABUSE NOTE: gate paths are 16-hex hashes, so only a solver who cleared the
// previous gate knows them — a blind flood can't hit them. Write-rate friction, if
// ever needed, belongs at the edge (a Cloudflare Rate Limiting rule on /root/*),
// same posture as /api/vigil.

import { GATE_PATHS, HEADER_HEX } from "./_gates.js";
import { getOrMintSid, recordGate, uaClass, ARRIVAL } from "./_funnel.js";

const AI_UA =
  /\b(gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|claude-user|anthropic-ai|perplexitybot|perplexity-user|bytespider|ccbot|cohere-ai|google-extended|applebot-extended|meta-externalagent|meta-externalfetcher|amazonbot|novaact|youbot|diffbot|ai2bot|duckassistbot|timpibot|omgilibot|petalbot|mistralai-user)\b/i;

export async function onRequest(context) {
  // Taken whole rather than destructured: waitUntil must be called on the context
  // (destructuring it loses the `this` binding and throws Illegal invocation).
  const { request, env, next } = context;
  const res = await next();

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/index\.html$/, "/");
  const type = res.headers.get("content-type") || "";
  const ua = request.headers.get("user-agent") || "";

  const headers = new Headers(res.headers);
  let cloakedBody = null;

  // (2) G1: the header breadcrumb on the /root document
  const isDoc = (path === "/root/" || path === "/root") && type.includes("text/html");
  if (isDoc) headers.set("X-Intune-Checkin", HEADER_HEX);

  let setCookie = null;

  // (2b) the door: count a solver who has arrived at /root but cleared nothing yet.
  // Cookie-capable browsers only — a scripted probe keeps no cookie, so counting
  // one operator's thirty curl runs as thirty people at the door would be less
  // accurate, not more. Scripted clients are still counted from g1 onward, which
  // is why the wire count can legitimately exceed the door count.
  // Rides waitUntil so the document never waits on telemetry.
  if (isDoc && env && env.SIGN_KEY && uaClass(request) === "browser" && !AI_UA.test(ua)) {
    try {
      const { sid, setCookie: sc } = await getOrMintSid(request, env.SIGN_KEY);
      if (sc) {
        setCookie = sc;
        headers.append("Set-Cookie", sc);
      }
      context.waitUntil(recordGate(env, sid, ARRIVAL, request));
    } catch {
      /* the door must open whether or not we managed to count it */
    }
  }

  // (3) funnel: record a gate-artifact fetch and (re)issue the solver cookie
  const gate = GATE_PATHS[path];
  if (gate && env && env.SIGN_KEY) {
    try {
      const { sid, setCookie: sc } = await getOrMintSid(request, env.SIGN_KEY);
      setCookie = sc;
      await recordGate(env, sid, gate, request);
    } catch {
      /* telemetry must never 500 the artifact */
    }
    if (setCookie) headers.append("Set-Cookie", setCookie);
  }

  // (1) AI-cloak: only self-declared AI UAs, only HTML
  if (AI_UA.test(ua) && type.includes("text/html")) {
    cloakedBody = (await res.text()).replace(/emberline|ashfall|cinderkey/gi, "smokesign");
    headers.delete("content-length"); // the runtime recomputes it for the new body
  }

  // Fast path: nothing to change.
  if (cloakedBody === null && !isDoc && !setCookie) return res;

  return new Response(cloakedBody !== null ? cloakedBody : res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
