import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { pathHash, deriveKeyHex } from "../gauntlet-derive.mjs";
import { open } from "../gauntlet-crypto.mjs";
import { readTextChunk, readDecoyLsb } from "../png-stego.mjs";
import { GATE_PATHS, HEADER_HEX } from "../../functions/root/_gates.js";

// This suite validates the COMMITTED gauntlet artifacts — it does not run the
// generator (that's a dev step: `npm run seed:gauntlet`). Structural checks run
// everywhere. The decryption checks need the four fragments, which live in
// secret/gauntlet.json locally or GAUNTLET_FRAGMENTS in CI; absent, they skip —
// the same "arm it or it politely skips" contract as the leak-guard's answer.
function loadFragments() {
  if (existsSync("secret/gauntlet.json")) return JSON.parse(readFileSync("secret/gauntlet.json", "utf8"));
  if (process.env.GAUNTLET_FRAGMENTS) { try { return JSON.parse(process.env.GAUNTLET_FRAGMENTS); } catch { /* fall through */ } }
  return null;
}
const FR = loadFragments();
const noFR = FR ? false : "fragments unavailable (arm secret/gauntlet.json or GAUNTLET_FRAGMENTS)";

const pathFor = (gate) => Object.keys(GATE_PATHS).find((p) => GATE_PATHS[p] === gate);
const site = (p) => readFileSync("site" + p, "utf8");
const siteBin = (p) => readFileSync("site" + p);

// ---- structural: no secret required ---------------------------------------

test("the manifest lists all five gates + the header hex", () => {
  for (const g of ["g1", "g2", "g3", "g4seal", "g4open"]) {
    assert.ok(pathFor(g), `missing gate ${g}`);
  }
  assert.match(HEADER_HEX, /^[0-9a-f]+$/);
});

test("the header hex decodes to a check-in pointer", () => {
  assert.match(Buffer.from(HEADER_HEX, "hex").toString("utf8"), /check-in\.json/);
});

test("check-in.json ships an alg:none JWT that never names the DNS terminal", () => {
  const raw = site("/root/check-in.json");
  assert.ok(!raw.includes("_rabbit"), "check-in.json must not name _rabbit");
  const jwt = JSON.parse(raw)._token;
  assert.equal(JSON.parse(Buffer.from(jwt.split(".")[0], "base64url").toString()).alg, "none");
});

test("G2: the JWT's kid derives exactly the served introspection path", async () => {
  const jwt = JSON.parse(site("/root/check-in.json"))._token;
  const kid = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).cnf.kid;
  assert.equal(`/root/.well-known/${await pathHash("introspect:" + kid)}.json`, pathFor("g2"));
});

test("G2 artifact points at the G3 png", () => {
  assert.ok(site(pathFor("g2")).includes(pathFor("g3")), "introspection must name the png");
});

test("G3 png carries a Comment tEXt chunk and a distinct decoy LSB", () => {
  const png = siteBin(pathFor("g3"));
  const real = readTextChunk(png);
  assert.equal(real.keyword, "Comment");
  assert.equal(readDecoyLsb(png), "ashfall");
  assert.notEqual(readDecoyLsb(png), real.text);
});

test("G3 tEXt names the sealed artifact path", () => {
  assert.ok(readTextChunk(siteBin(pathFor("g3"))).text.includes(pathFor("g4seal")));
});

// ---- decryption: needs the fragments --------------------------------------

test("G4: the sealed blob decrypts (assembled key) to the G4-open path", { skip: noFR }, async () => {
  const key = await deriveKeyHex(FR, FR.order, FR.sep);
  const finalPath = await open(key, site(pathFor("g4seal")).trim());
  assert.equal(finalPath, pathFor("g4open"));
});

test("G5 (fixed): the final file is the untouched _rabbit instruction", { skip: noFR }, async () => {
  const instruction = site(pathFor("g4open"));
  assert.match(instruction, /_rabbit\.comeandget\.us/);
  assert.match(instruction, /please@comeandget\.us/);
});

test("the header + png reveal shards 1 and 3", { skip: noFR }, () => {
  assert.ok(Buffer.from(HEADER_HEX, "hex").toString("utf8").includes(FR.FR1), "header hides shard-1");
  assert.ok(readTextChunk(siteBin(pathFor("g3"))).text.includes(FR.FR3), "png hides shard-3");
});
