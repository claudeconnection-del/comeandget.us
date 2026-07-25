import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { deriveKeyHex, pathHash } from "../gauntlet-derive.mjs";
import { open } from "../gauntlet-crypto.mjs";
import { readTextChunk, readDecoyLsb } from "../png-stego.mjs";

const FR = JSON.parse(readFileSync("secret/gauntlet.json", "utf8"));
const siteFile = (p) => readFileSync("site" + p.replace(/^\/root/, "/root"), "utf8");

before(() => {
  execFileSync(process.execPath, ["tools/seed-gauntlet.mjs"]);
});

test("writes a committed gate manifest with all five gate paths + header hex", () => {
  const gates = readFileSync("functions/root/_gates.js", "utf8");
  assert.match(gates, /GATE_PATHS/);
  assert.match(gates, /HEADER_HEX/);
  for (const g of ["g1", "g2", "g3", "g4seal", "g4open"]) assert.ok(gates.includes(`"${g}"`), `missing ${g}`);
});

test("check-in.json ships an alg:none JWT and never names _rabbit or the answer", () => {
  const raw = readFileSync("site/root/check-in.json", "utf8");
  assert.ok(!raw.includes("_rabbit"), "check-in.json must not name the DNS terminal");
  const jwt = JSON.parse(raw)._token;
  const header = JSON.parse(Buffer.from(jwt.split(".")[0], "base64url").toString());
  assert.equal(header.alg, "none");
});

test("G2: sha256('introspect:'+kid) resolves to the served introspection artifact", async () => {
  const jwt = JSON.parse(readFileSync("site/root/check-in.json", "utf8"))._token;
  const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
  const kid = payload.cnf.kid;
  const h2 = await pathHash("introspect:" + kid);
  const introspect = JSON.parse(readFileSync(`site/root/.well-known/${h2}.json`, "utf8"));
  assert.match(JSON.stringify(introspect), /\.png/);
});

test("G3: the PNG carries the real fragment in tEXt and a distinct decoy in LSB", async () => {
  const h3 = await pathHash("png:" + FR.FR2 + FR.FR3);
  const png = readFileSync(`site/root/a/${h3}.png`);
  const real = readTextChunk(png).text;
  assert.ok(real.includes(FR.FR3), "tEXt must reveal shard-3");
  assert.equal(readDecoyLsb(png), "ashfall");
  assert.notEqual(readDecoyLsb(png), real);
});

test("G4: the sealed blob decrypts (with the assembled key) to the final path", async () => {
  const key = await deriveKeyHex(FR, FR.order, FR.sep);
  const h4 = await pathHash("seal:" + key);
  const blob = readFileSync(`site/root/a/${h4}.txt`, "utf8").trim();
  const finalPath = await open(key, blob);
  assert.match(finalPath, /^\/root\/a\/[0-9a-f]{16}\.txt$/);
});

test("G5 (fixed): the final file is the untouched _rabbit instruction", async () => {
  const key = await deriveKeyHex(FR, FR.order, FR.sep);
  const h4 = await pathHash("seal:" + key);
  const finalPath = await open(key, readFileSync(`site/root/a/${h4}.txt`, "utf8").trim());
  const instruction = readFileSync("site/root" + finalPath.replace(/^\/root/, ""), "utf8");
  assert.match(instruction, /_rabbit\.comeandget\.us/);
  assert.match(instruction, /please@comeandget\.us/);
});

test("the header hex decodes to a check-in pointer carrying shard-1", () => {
  const m = readFileSync("functions/root/_gates.js", "utf8").match(/HEADER_HEX\s*=\s*"([0-9a-f]+)"/);
  const decoded = Buffer.from(m[1], "hex").toString("utf8");
  assert.match(decoded, /check-in\.json/);
  assert.ok(decoded.includes(FR.FR1), "header must reveal shard-1");
});
