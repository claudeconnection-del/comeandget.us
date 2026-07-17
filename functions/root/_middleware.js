// Path-scoped middleware for /root/*: self-identified AI crawlers are served the
// "smokesign" variant — every invisible counter-sign in the HTML is rewritten to
// the one word that only machines are ever given (the reckoning in shell.js
// treats it as the laziest possible tell). Humans, tests, and plain tools like
// curl pass through untouched: tier-3 solvers legitimately probe with curl and
// devtools, so only user agents that *declare themselves* AI are cloaked.
// Non-HTML assets (check-in.json, js/*) always pass through unmodified.

const AI_UA =
  /\b(gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|claude-user|anthropic-ai|perplexitybot|perplexity-user|bytespider|ccbot|cohere-ai|google-extended|applebot-extended|meta-externalagent|meta-externalfetcher|amazonbot|novaact|youbot|diffbot|ai2bot|duckassistbot|timpibot|omgilibot|petalbot|mistralai-user)\b/i;

export async function onRequest({ request, next }) {
  const res = await next();
  const ua = request.headers.get("user-agent") || "";
  if (!AI_UA.test(ua)) return res;
  const type = res.headers.get("content-type") || "";
  if (!type.includes("text/html")) return res;
  const body = await res.text();
  const cloaked = body.replace(/emberline|ashfall|cinderkey/gi, "smokesign");
  const headers = new Headers(res.headers);
  headers.delete("content-length"); // the runtime recomputes it for the new body
  return new Response(cloaked, { status: res.status, statusText: res.statusText, headers });
}
