import { test } from "node:test";
import assert from "node:assert/strict";
import { seal, open } from "../gauntlet-crypto.mjs";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

test("round-trips with the right key", async () => {
  const blob = await seal(KEY_A, "/root/a/0123456789abcdef.txt");
  assert.equal(await open(KEY_A, blob), "/root/a/0123456789abcdef.txt");
});

test("fails closed on a wrong key — no plaintext leaks", async () => {
  const blob = await seal(KEY_A, "secret");
  await assert.rejects(() => open(KEY_B, blob));
});

test("fails closed on a truncated blob (tamper-evident via the GCM tag)", async () => {
  const blob = await seal(KEY_A, "secret");
  await assert.rejects(() => open(KEY_A, blob.slice(0, blob.length - 4)));
});

test("output is base64 and deterministic for the same key+plaintext", async () => {
  const a = await seal(KEY_A, "x");
  const b = await seal(KEY_A, "x");
  assert.equal(a, b);
  assert.match(a, /^[A-Za-z0-9+/]+=*$/);
});

test("carries the 12-byte iv ahead of the ciphertext", async () => {
  const blob = await seal(KEY_A, "hello");
  assert.ok(Buffer.from(blob, "base64").length > 12 + 16); // iv + tag at minimum
});
