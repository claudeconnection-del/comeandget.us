// POST /api/mirror — the brain. Reflects the edge's view of THIS request back to
// the visitor, cross-checks it against what the client believes about itself, and
// remembers the machine by its derived sigil (salted one-way hash in KV, 90d TTL).
// Reuses PRESENCE + SIGN_KEY; sets one disguised cookie (fpc). Never 500s: every
// edge field and KV op degrades to omission.

import { b64url, b64urlDecode, hmacB64url, timingSafeEqual, json } from "./_lib.js";

const TTL = 7776000; // 90 days
const COOKIE = "fpc"; // Microsoft's own "fingerprint cookie" name — the costume

async function kvKey(signKey, sigil) {
  return "m:" + (await hmacB64url(signKey, sigil)).slice(0, 32);
}

async function fpcValue(signKey, firstSeenSec) {
  const body = b64url(String(firstSeenSec));
  return body + "." + (await hmacB64url(signKey, "fpc." + body));
}
async function fpcFirstSeen(signKey, value) {
  if (typeof value !== "string") return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  if (!timingSafeEqual(parts[1], await hmacB64url(signKey, "fpc." + parts[0]))) return null;
  const n = Number(b64urlDecode(parts[0]));
  return Number.isFinite(n) ? n : null;
}
function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const m = raw.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

function readEdge(cf) {
  if (!cf || typeof cf !== "object") return {};
  const e = {};
  const put = (k, v) => { if (v !== undefined && v !== null && v !== "") e[k] = v; };
  put("country", cf.country);
  put("city", cf.city);
  put("asOrganization", cf.asOrganization);
  put("httpProtocol", cf.httpProtocol);
  put("tlsVersion", cf.tlsVersion);
  put("tlsCipher", cf.tlsCipher);
  put("clientTcpRtt", cf.clientTcpRtt);
  put("ja3", cf.botManagement && cf.botManagement.ja3Hash); // present only with Bot Management
  return e;
}

// timezone → rough continent, to spot tz/country conflicts without a full db
function tzContinent(tz) {
  if (typeof tz !== "string" || !tz.includes("/")) return null;
  return tz.split("/")[0];
}
const COUNTRY_CONTINENT = {
  US: "America", CA: "America", BR: "America", MX: "America",
  GB: "Europe", DE: "Europe", FR: "Europe", NL: "Europe", IE: "Europe",
  JP: "Asia", CN: "Asia", IN: "Asia", SG: "Asia",
  AU: "Australia", NZ: "Pacific", ZA: "Africa",
};

function computeDeltas({ os, tz, langs, edge, request }) {
  const out = [];
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  const chPlat = (request.headers.get("Sec-CH-UA-Platform") || "").replace(/"/g, "").toLowerCase();

  // claimed OS vs the request's own headers
  if (os) {
    const claim = os.toLowerCase();
    const headerSaysWin = ua.includes("windows") || chPlat.includes("windows");
    const headerSaysMac = ua.includes("mac os") || ua.includes("macintosh") || chPlat.includes("macos");
    const headerSaysLinux = (ua.includes("linux") && !ua.includes("android")) || chPlat.includes("linux");
    if (claim === "windows" && (headerSaysMac || headerSaysLinux)) out.push("your papers say windows; your headers say otherwise.");
    if (claim === "macos" && headerSaysWin) out.push("your handshake says mac; your papers say windows. we believe the handshake.");
    if (claim === "linux" && (headerSaysWin || headerSaysMac)) out.push("you compute like a server but dress like a desktop.");
  }
  // tz vs edge country
  const cont = tzContinent(tz);
  const edgeCont = edge.country && COUNTRY_CONTINENT[edge.country];
  if (cont && edgeCont && cont !== edgeCont) out.push("you keep " + cont + " time but you left through " + edge.country + ".");
  // header-locale vs client languages
  const accept = (request.headers.get("Accept-Language") || "").toLowerCase();
  if (Array.isArray(langs) && langs.length && accept) {
    const primary = String(langs[0] || "").toLowerCase().split("-")[0];
    if (primary && !accept.includes(primary)) out.push("you speak " + langs[0] + " to us, and something else to the wire.");
  }
  // not-a-browser
  if (edge.ja3 && (!ua || ua.includes("curl") || ua.includes("python") || ua.includes("wget") || ua.includes("headless"))) {
    out.push("you came without a face. we kept your handshake anyway. it's a nice one.");
  }
  return out;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const sigil = body && typeof body.sigil === "string" ? body.sigil.slice(0, 128) : "";
  if (!/^[0-9a-f]{16,128}$/.test(sigil)) return json({ error: "bad sigil" }, 400);

  const signKey = env && env.SIGN_KEY;
  const edge = readEdge(request.cf);
  const deltas = computeDeltas({ os: body.os, tz: body.tz, langs: body.langs, edge, request });

  // recognition: KV (authoritative) corroborated by the fpc cookie and echoSeen
  const nowSec = Math.floor(Date.now() / 1000);
  let count = 0, firstSeen = nowSec;
  const KV = env && env.PRESENCE;
  if (KV && signKey) {
    const key = await kvKey(signKey, sigil);
    let prev = null;
    try { prev = await KV.get(key, "json"); } catch { prev = null; }
    if (prev && typeof prev === "object") {
      count = Number(prev.c) || 0;
      firstSeen = Number(prev.f) || nowSec;
    }
    count += 1;
    try {
      await KV.put(key, JSON.stringify({ f: firstSeen, c: count, d: deltas.length }), { expirationTtl: TTL });
    } catch { /* transient KV error must not 500 */ }
  }
  // corroborate first-seen from the cookie (handles a cleared KV / sigil drift)
  const cookieFirst = signKey ? await fpcFirstSeen(signKey, readCookie(request, COOKIE)) : null;
  if (cookieFirst && cookieFirst < firstSeen) firstSeen = cookieFirst;
  const returning = count >= 2 || !!cookieFirst || body.echoSeen === true;

  const headers = {};
  if (signKey) {
    const val = await fpcValue(signKey, firstSeen);
    headers["Set-Cookie"] = `${COOKIE}=${val}; Secure; HttpOnly; SameSite=Lax; Path=/root; Max-Age=${TTL}`;
  }
  return json({ edge, deltas, seen: { count: Math.max(count, 1), firstSeen, returning } }, 200, headers);
}
