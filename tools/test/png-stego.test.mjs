import { test } from "node:test";
import assert from "node:assert/strict";
import { makeStegoPng, readTextChunk, readDecoyLsb } from "../png-stego.mjs";

test("emits a valid PNG signature, IHDR and IEND", () => {
  const buf = makeStegoPng({ width: 32, height: 32, text: "real", decoy: "ashfall" });
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(buf.includes(Buffer.from("IHDR")));
  assert.ok(buf.subarray(-12).includes(Buffer.from("IEND")));
});

test("tEXt chunk carries the real payload under the Comment keyword", () => {
  const buf = makeStegoPng({ width: 16, height: 16, text: "hello-real", decoy: "decoy" });
  const t = readTextChunk(buf);
  assert.equal(t.keyword, "Comment");
  assert.equal(t.text, "hello-real");
});

test("the decoy LSB payload is recoverable and distinct from the real one", () => {
  const buf = makeStegoPng({ width: 64, height: 32, text: "the-real-fragment", decoy: "ashfall" });
  assert.equal(readDecoyLsb(buf), "ashfall");
  assert.notEqual(readDecoyLsb(buf), readTextChunk(buf).text);
});

test("output is deterministic for identical input", () => {
  const a = makeStegoPng({ width: 24, height: 24, text: "x", decoy: "y" });
  const b = makeStegoPng({ width: 24, height: 24, text: "x", decoy: "y" });
  assert.ok(a.equals(b));
});

test("a long real payload survives the round-trip", () => {
  const long = "shard-3:obsidian · sealed instruction at /root/a/0123456789abcdef.txt · key = sha256 of four shards";
  assert.equal(readTextChunk(makeStegoPng({ width: 96, height: 64, text: long, decoy: "ashfall" })).text, long);
});
