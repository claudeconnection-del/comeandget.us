import { test } from "node:test";
import assert from "node:assert/strict";
import { mintSid, verifySid, uaClass, recordGate } from "../../functions/root/_funnel.js";

const reqWith = (headers) => ({ headers: { get: (k) => headers[k.toLowerCase()] ?? null } });

test("sid cookie round-trips under the same key and is scoped to /root", async () => {
  const { sid, value, cookie } = await mintSid("KEY");
  assert.equal(await verifySid("KEY", value), sid);
  assert.match(cookie, /Path=\/root/);
  assert.match(cookie, /HttpOnly/);
});

test("a tampered or foreign-key sid is rejected", async () => {
  const { value } = await mintSid("KEY");
  assert.equal(await verifySid("KEY", value.slice(0, -2) + "xx"), null);
  assert.equal(await verifySid("OTHER", value), null);
});

test("uaClass buckets user agents", () => {
  assert.equal(uaClass(reqWith({ "user-agent": "curl/8.1" })), "curl");
  assert.equal(uaClass(reqWith({ "user-agent": "Mozilla/5.0 (Windows NT 10.0)" })), "browser");
  assert.equal(uaClass(reqWith({ "user-agent": "GPTBot/1.0 (+https://openai.com/gptbot)" })), "bot");
  assert.equal(uaClass(reqWith({})), "other");
});

// A tiny in-memory KV double with the getWithMetadata surface recordGate uses.
function fakeKV() {
  const store = new Map();
  return {
    store,
    async get(k, type) { const v = store.get(k); return v ? (type === "json" ? JSON.parse(v.value) : v.value) : null; },
    async put(k, value, opts) { store.set(k, { value, metadata: opts && opts.metadata }); },
  };
}

test("recordGate writes a per-solver progress record and dedups repeats", async () => {
  const KV = fakeKV();
  const env = { PRESENCE: KV };
  const req = reqWith({ "user-agent": "curl/8.1" });
  await recordGate(env, "sid1", "g1", req);
  await recordGate(env, "sid1", "g1", req); // duplicate — must not overwrite the timestamp
  await recordGate(env, "sid1", "g2", req);
  const rec = JSON.parse(KV.store.get("fs:sid1").value);
  assert.ok(rec.g.g1 != null && rec.g.g2 != null);
  assert.equal(rec.ua, "curl");
  assert.equal(KV.store.get("fs:sid1").metadata.gmax, "g2");
});

test("recordGate is a no-op without KV (fail-soft)", async () => {
  await recordGate({}, "sid1", "g1", reqWith({}));
  await recordGate({ PRESENCE: null }, "sid1", "g1", reqWith({}));
  // no throw = pass
});
