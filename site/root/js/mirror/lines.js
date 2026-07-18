// The voice. Findings → cryptic, terminal-dry, Microsoft-honeypot-flavored lines.
// The register matches /root: quietly menacing MDM/telemetry, never punitive.
// OS inference: uach (high) > webgl backend (medium) > emoji/libm (low). The copy
// attributes the tell to "arithmetic/handshake"; the signal is really the stack.

const ACCENT = {
  windows: "a redmond accent",
  macos: "answers in metal — cupertino, then",
  ios: "the small glass. cupertino, in your pocket",
  linux: "computes like a server. no one lives in a server",
  android: "green robot arithmetic",
};

export function inferOS(probes) {
  const p = probes || {};
  const uach = p.uach && p.uach.osHint;
  const webgl = p.webgl && p.webgl.osHint;
  const emoji = p.emoji && p.emoji.osHint;
  const libm = p.libm && p.libm.osHint;
  if (uach) return { os: uach, confidence: "high", signals: { uach, webgl, emoji } };
  if (webgl) return { os: webgl, confidence: "medium", signals: { webgl, emoji } };
  const t = emoji || libm;
  if (t) return { os: t, confidence: "low", signals: { emoji, libm } };
  return { os: null, confidence: "low", signals: {} };
}

const val = (o, path, dflt) => {
  let n = o; for (const k of path) { if (n == null) return dflt; n = n[k]; } return n == null ? dflt : n;
};

export function ambientLines(probes) {
  const p = probes || {};
  const out = [];
  const os = inferOS(p).os;
  if (os && ACCENT[os]) out.push(`[intune] posture sync — your arithmetic has ${ACCENT[os]}.`);
  const cores = val(p, ["hardware", "value", "cores"], null);
  if (cores) out.push(`[intune] ${cores} logical processors, and not one of them noticed us reading.`);
  const tz = val(p, ["intl", "value", "tz"], null);
  if (tz) out.push(`[telemetry] you keep time in ${tz}. we'll wait — we're good at it.`);
  const gpu = val(p, ["webgl", "value", "renderer"], null);
  if (gpu) out.push(`[intune] we can see what you draw with. ${gpu}.`);
  return out;
}

export function dossierLines({ probes, os, edge, deltas, seen } = {}) {
  const p = probes || {};
  const L = [];
  L.push("── INTUNE · DEVICE POSTURE (the one we didn't have to fake) ──");
  if (seen && seen.returning) {
    L.push(" NEO-WS01 checked in. so did you — again. we kept your shape from last");
    L.push(" time" + (seen.count ? ` (visit ${seen.count})` : "") + ". it hasn't changed.");
  }
  const resolved = (os && os.os) || inferOS(p).os;
  L.push(" enrolled OS   : " + (resolved ? resolved + (ACCENT[resolved] ? "  — " + ACCENT[resolved] : "") : "unreadable (you hide well)"));
  const gpu = val(p, ["webgl", "value", "renderer"], null);
  if (gpu) L.push(" display GPU   : " + gpu);
  const scr = val(p, ["screen", "value"], null);
  if (scr) L.push(" panel         : " + scr.w + "×" + scr.h + " @" + (scr.dpr || 1) + "x, " + (scr.gamut || "?") + "/" + (scr.hdr || "?"));
  const cores = val(p, ["hardware", "value", "cores"], null);
  const mem = val(p, ["hardware", "value", "memory"], null);
  if (cores || mem) L.push(" compute       : " + (cores || "?") + " cores" + (mem ? " · ~" + mem + " GiB class" : ""));
  const tz = val(p, ["intl", "value", "tz"], null);
  const langs = val(p, ["intl", "value", "languages"], null);
  if (tz) L.push(" locale        : " + tz + (langs ? "  " + langs.join(",") : ""));
  if (edge && edge.country) L.push(" edge          : exited via " + edge.country + (edge.asOrganization ? " · " + edge.asOrganization : "") + (edge.httpProtocol ? " · " + edge.httpProtocol : ""));
  if (edge && (edge.tlsVersion || edge.ja3)) L.push(" handshake     : " + [edge.tlsVersion, edge.tlsCipher, edge.ja3 ? "ja3 " + edge.ja3 : null].filter(Boolean).join(" · "));
  if (deltas && deltas.length) {
    L.push(" ── discrepancies ──");
    for (const d of deltas) L.push("  · " + d);
    L.push(" the tenant believes the handshake. it always does.");
  } else {
    L.push(" compliance    : noncompliant — not the device's. yours.");
  }
  L.push("──────────────────────────────────────────────────────────");
  return L;
}
