// Walk the whole /root gauntlet against a running deployment and prove it
// resolves to the fixed _rabbit terminal. Usage:
//   node tools/walk-gauntlet.mjs [--base https://feat-root-gauntlet.comeandget-us.pages.dev]
// Defaults to http://localhost:8788 (wrangler pages dev). The final decrypt leg
// needs the four fragments (secret/gauntlet.json or GAUNTLET_FRAGMENTS); without
// them the walk still checks G1–G3 structurally, then stops with a note.

import { readFileSync, existsSync } from "node:fs";
import { pathHash, deriveKeyHex, unhex } from "./gauntlet-derive.mjs";
import { open } from "./gauntlet-crypto.mjs";
import { readTextChunk } from "./png-stego.mjs";

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const BASE = arg("--base", "http://localhost:8788").replace(/\/$/, "");
const FR = existsSync("secret/gauntlet.json")
  ? JSON.parse(readFileSync("secret/gauntlet.json", "utf8"))
  : (process.env.GAUNTLET_FRAGMENTS ? JSON.parse(process.env.GAUNTLET_FRAGMENTS) : null);

const get = async (path) => {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res;
};
const ok = (m) => console.log("  ✓ " + m);
const fail = (m) => { console.error("  ✗ " + m); process.exitCode = 1; };

console.log(`walking the gauntlet at ${BASE}\n`);
try {
  // G1 — the wire
  const doc = await get("/root/");
  const hex = doc.headers.get("x-intune-checkin");
  if (!hex) throw new Error("no X-Intune-Checkin header on /root/");
  ok(`G1 header → ${unhex(hex)}`);

  // G2 — the unsigned token → derived introspection path
  const jwt = JSON.parse(await (await get("/root/check-in.json")).text())._token;
  if (JSON.parse(Buffer.from(jwt.split(".")[0], "base64url").toString()).alg !== "none")
    throw new Error("JWT alg is not none");
  const kid = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).cnf.kid;
  const introPath = `/root/.well-known/${await pathHash("introspect:" + kid)}.json`;
  const intro = await (await get(introPath)).text();
  ok(`G2 kid=${kid} → ${introPath}`);

  // G3 — the shape in the noise
  const pngPath = intro.match(/\/root\/\S+\.png/)[0];
  const png = Buffer.from(await (await get(pngPath)).arrayBuffer());
  const tEXt = readTextChunk(png).text;
  const sealPath = tEXt.match(/\/root\/\S+\.txt/)[0];
  ok(`G3 png tEXt → seal at ${sealPath}`);

  if (!FR) {
    console.log("\n  (no fragments — stopping before G4. Arm secret/gauntlet.json or GAUNTLET_FRAGMENTS to decrypt.)");
    process.exit(process.exitCode || 0);
  }

  // G4 — assemble the key, decrypt the seal
  const key = await deriveKeyHex(FR, FR.order, FR.sep);
  const finalPath = await open(key, (await (await get(sealPath)).text()).trim());
  ok(`G4 assembled key → decrypts to ${finalPath}`);

  // G5 — the fixed terminal
  const instruction = (await (await get(finalPath)).text()).trim();
  if (instruction.includes("_rabbit.comeandget.us") && instruction.includes("please@comeandget.us"))
    ok(`G5 fixed terminal → ${instruction}`);
  else fail(`G5 unexpected: ${instruction}`);

  console.log(process.exitCode ? "\n✗ gauntlet walk FAILED" : "\n✓ gauntlet resolves end-to-end to the fixed terminal");
} catch (e) {
  fail(e.message);
  console.error("\n✗ gauntlet walk FAILED");
}
