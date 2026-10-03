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
// previous gate knows them — a blind flood can't hit them. The door is different:
// anyone can request /root/, so the door never spends a KV write on first contact.
// A browser is handed a cookie for free and is counted only when that cookie comes
// back — on a later document load, on the page's entry module, or on a gate. A
// cookieless flood therefore costs CPU and nothing else. Write-rate friction beyond
// that belongs at the edge (a Cloudflare Rate Limiting rule on /root/*), same
// posture as /api/vigil.

import { GATE_PATHS, HEADER_HEX } from "./_gates.js";
import { mintSid, verifySid, readCookie, recordGate, uaClass, ARRIVAL } from "./_funnel.js";

const AI_UA =
  /\b(gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|claude-user|anthropic-ai|perplexitybot|perplexity-user|bytespider|ccbot|cohere-ai|google-extended|applebot-extended|meta-externalagent|meta-externalfetcher|amazonbot|novaact|youbot|diffbot|ai2bot|duckassistbot|timpibot|omgilibot|petalbot|mistralai-user)\b/i;

// The page's module entry. A browser that requests it with the cookie it was just
// handed has proven two things at once: it runs the page, and it keeps cookies.
const ENTRY_MODULE = "/root/js/agent.js";

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
  let setCookie = null;

  // (2) G1: the header breadcrumb on the /root document
  const isDoc = (path === "/root/" || path === "/root") && type.includes("text/html");
  if (isDoc) headers.set("X-Intune-Checkin", HEADER_HEX);

  // (2b, 3) the door and the gates. Only cookie-capable browsers count at the
  // door — a scripted probe keeps no cookie, so counting one operator's thirty
  // curl runs as thirty people would be less accurate, not more. Scripted clients
  // are still counted from g1 onward, which is why the wire count can legitimately
  // exceed the door count.
  const gate = GATE_PATHS[path];
  if (env && env.SIGN_KEY && (isDoc || gate || path === ENTRY_MODULE)) {
    try {
      const countable = uaClass(request) === "browser" && !AI_UA.test(ua);
      const known = await verifySid(env.SIGN_KEY, readCookie(request, "rg"));
      // the door is stamped only for a browser whose cookie came back
      const arrival = countable && known ? ARRIVAL : null;

      if (gate) {
        // a gate artifact mints for any client (scripted solvers included) and
        // records synchronously; the arrival rides the same write when it applies
        let sid = known;
        if (!sid) {
          const minted = await mintSid(env.SIGN_KEY);
          sid = minted.sid;
          setCookie = minted.cookie;
        }
        await recordGate(env, sid, [arrival, gate], request);
      } else {
        // first contact at the door: a browser gets its cookie, and nothing is written
        if (isDoc && countable && !known) setCookie = (await mintSid(env.SIGN_KEY)).cookie;
        // Rides waitUntil so the document never waits on telemetry.
        if (arrival) context.waitUntil(recordGate(env, known, arrival, request));
      }
    } catch {
      /* the door must open, and the artifact must serve, whether or not we counted */
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
