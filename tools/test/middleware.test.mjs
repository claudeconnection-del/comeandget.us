import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../../functions/root/_middleware.js";
import { mintSid } from "../../functions/root/_funnel.js";
import { GATE_PATHS } from "../../functions/root/_gates.js";

const KEY = "unit-test-sign-key";
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36";
const G1 = Object.keys(GATE_PATHS).find((p) => GATE_PATHS[p] === "g1");

function fakeKV() {
  const store = new Map();
  const ops = { get: 0, put: 0 };
  return {
    store,
    ops,
    async get(k, type) {
      ops.get++;
      const v = store.get(k);
      if (!v) return null;
      return type === "json" ? JSON.parse(v.value) : v.value;
    },
    async put(k, value, opts) {
      ops.put++;
      store.set(k, { value, metadata: opts && opts.metadata });
    },
  };
}

// A Pages Functions context double: the asset behind next(), the env, and a
// waitUntil that collects the telemetry promises so a test can settle them.
function ctx({ path, ua = BROWSER, cookie = null, type = "text/html", KV = fakeKV() }) {
  const headers = { "user-agent": ua };
  if (cookie) headers.cookie = cookie;
  const pending = [];
  const context = {
    request: new Request("https://comeandget.us" + path, { headers }),
    env: { PRESENCE: KV, SIGN_KEY: KEY },
    next: async () => new Response("<html>the door</html>", { headers: { "content-type": type } }),
    waitUntil: (p) => pending.push(p),
  };
  return { context, KV, pending };
}
const settle = (pending) => Promise.all(pending);
const fsKeys = (KV) => [...KV.store.keys()].filter((k) => k.startsWith("fs:"));
const record = (KV) => JSON.parse(KV.store.get(fsKeys(KV)[0]).value);
const cookieOf = async () => "rg=" + (await mintSid(KEY)).value;

test("a cookieless browser at the door is minted a cookie but nothing is written", async () => {
  const { context, KV, pending } = ctx({ path: "/root/" });
  const res = await onRequest(context);
  await settle(pending);
  assert.match(res.headers.get("set-cookie") || "", /^rg=/);
  assert.equal(fsKeys(KV).length, 0, "minting alone must not spend a KV write");
});

test("a browser that returns with its cookie is counted at the door, once", async () => {
  const cookie = await cookieOf();
  const KV = fakeKV();
  for (let i = 0; i < 2; i++) {
    const { context, pending } = ctx({ path: "/root/", cookie, KV });
    await onRequest(context);
    await settle(pending);
  }
  assert.equal(fsKeys(KV).length, 1);
  assert.ok(record(KV).g.g0 != null, "the arrival is stamped");
  assert.equal(KV.ops.put, 1, "the repeat visit is deduped");
});

test("the entry module requested with the cookie counts the arrival", async () => {
  const cookie = await cookieOf();
  const { context, KV, pending } = ctx({ path: "/root/js/agent.js", cookie, type: "application/javascript" });
  await onRequest(context);
  await settle(pending);
  assert.equal(fsKeys(KV).length, 1, "a browser that ran the page has proven it keeps cookies");
  assert.ok(record(KV).g.g0 != null);
});

test("a gate fetched with the cookie stamps the gate and the arrival in one write", async () => {
  const cookie = await cookieOf();
  const { context, KV, pending } = ctx({ path: G1, cookie, type: "application/json" });
  await onRequest(context);
  await settle(pending);
  const rec = record(KV);
  assert.ok(rec.g.g1 != null, "the gate is stamped");
  assert.ok(rec.g.g0 != null, "so is the door");
  assert.equal(KV.ops.put, 1, "both stamps land in a single write");
  assert.equal(KV.store.get(fsKeys(KV)[0]).metadata.gmax, "g1");
});

test("a gate fetched without a cookie still mints and records the gate, but not the door", async () => {
  const { context, KV, pending } = ctx({ path: G1, ua: "curl/8.1", type: "application/json" });
  const res = await onRequest(context);
  await settle(pending);
  assert.match(res.headers.get("set-cookie") || "", /^rg=/);
  const rec = record(KV);
  assert.ok(rec.g.g1 != null);
  assert.equal(rec.g.g0, undefined, "a first-contact probe is not an arrival");
});

test("a scripted client is not counted at the door even with a cookie", async () => {
  const cookie = await cookieOf();
  const { context, KV, pending } = ctx({ path: "/root/", ua: "curl/8.1", cookie });
  await onRequest(context);
  await settle(pending);
  assert.equal(fsKeys(KV).length, 0);
});

test("a self-declared AI crawler is neither minted nor counted", async () => {
  const { context, KV, pending } = ctx({ path: "/root/", ua: "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)" });
  const res = await onRequest(context);
  await settle(pending);
  assert.equal(res.headers.get("set-cookie"), null);
  assert.equal(fsKeys(KV).length, 0);
});
