// Pure derivation shared by the seed generator and the tests. No secrets here —
// only the arithmetic that turns fragments into a key and strings into the
// unguessable artifact paths the gauntlet serves.

import { createHash } from "node:crypto";

export async function sha256hex(str) {
  return createHash("sha256").update(String(str), "utf8").digest("hex");
}

// The G4 key: fragments concatenated in a declared order, joined by a separator,
// then hashed to 256 bits. Order-sensitive on purpose — a solver who finds all
// four shards but assembles them wrong still gets nothing.
export async function deriveKeyHex(fragments, order, sep) {
  const joined = order.map((k) => fragments[k]).join(sep);
  return sha256hex(joined);
}

// Artifact paths are the first 16 hex of a sha256, so they cannot be enumerated
// ahead of the solve that reveals their input.
export async function pathHash(str) {
  return (await sha256hex(str)).slice(0, 16);
}

export function hex(str) {
  return Buffer.from(String(str), "utf8").toString("hex");
}

export function unhex(h) {
  return Buffer.from(String(h), "hex").toString("utf8");
}
