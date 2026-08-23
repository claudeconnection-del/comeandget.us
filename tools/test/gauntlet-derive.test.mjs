import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256hex, deriveKeyHex, pathHash, hex, unhex } from "../gauntlet-derive.mjs";

test("pathHash is 16 lowercase hex chars, stable", async () => {
  const p = await pathHash("kestrel");
  assert.match(p, /^[0-9a-f]{16}$/);
  assert.equal(p, await pathHash("kestrel"));
});

test("pathHash differs for different inputs", async () => {
  assert.notEqual(await pathHash("a"), await pathHash("b"));
});

test("deriveKeyHex concatenates in order with sep then sha256", async () => {
  const frags = { FR1: "a", FR2: "b", FR3: "c", FR4: "d" };
  const expect = await sha256hex("a:b:c:d");
  assert.equal(await deriveKeyHex(frags, ["FR1", "FR2", "FR3", "FR4"], ":"), expect);
});

test("deriveKeyHex is order-sensitive (wrong order = wrong key)", async () => {
  const frags = { FR1: "a", FR2: "b", FR3: "c", FR4: "d" };
  const right = await deriveKeyHex(frags, ["FR1", "FR2", "FR3", "FR4"], ":");
  const wrong = await deriveKeyHex(frags, ["FR2", "FR1", "FR3", "FR4"], ":");
  assert.notEqual(right, wrong);
});

test("deriveKeyHex yields a 256-bit key (64 hex chars)", async () => {
  const frags = { FR1: "a", FR2: "b", FR3: "c", FR4: "d" };
  assert.match(await deriveKeyHex(frags, ["FR1", "FR2", "FR3", "FR4"], ":"), /^[0-9a-f]{64}$/);
});

test("hex/unhex round-trip", () => {
  assert.equal(unhex(hex("GET ./check-in.json")), "GET ./check-in.json");
});
