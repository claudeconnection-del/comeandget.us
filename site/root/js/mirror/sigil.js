// The derived sigil: identity by RECOMPUTATION, not storage. We hash only the
// STABLE dimensions of the fingerprint, so clearing every store on the machine
// changes nothing — the arithmetic still has the same accent, the GPU still
// names itself, and the sigil re-derives. This is the whole of the "we still
// knew you" resilience: recognition, not an evercookie fighting the delete key.

const pick = (o, path, dflt) => {
  let n = o;
  for (const k of path) { if (n == null) return dflt; n = n[k]; }
  return n == null ? dflt : n;
};

export function stableMaterial(probes) {
  const p = probes || {};
  const parts = [
    "libm=" + pick(p, ["libm", "value"], "-"),
    "webgl=" + pick(p, ["webgl", "value", "renderer"], "-"),
    "canvas=" + pick(p, ["canvas", "value"], "-"),
    "tz=" + pick(p, ["intl", "value", "tz"], "-"),
    "cores=" + pick(p, ["hardware", "value", "cores"], "-"),
    "gamut=" + pick(p, ["screen", "value", "gamut"], "-"),
    "emoji=" + pick(p, ["emoji", "value", "w"], "-"),
  ];
  return parts.join("|");
}

export async function deriveSigil(probes) {
  const material = stableMaterial(probes);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
