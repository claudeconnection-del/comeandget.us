import { test } from "node:test";
import assert from "node:assert/strict";
import { readReals, buildRoster } from "../../functions/api/vigil/index.js";

// A real id is base64url(JSON {v:1,b,n,t}); the KV key is "p:" + id.
const b64url = (s) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const realId = (n, b) => b64url(JSON.stringify({ v: 1, b, n, t: 0 }));

// In-memory KV double that counts the operations the roster spends, since the
// whole point of the snapshot is the op budget, not the shape of the output.
function fakeKV() {
  const store = new Map();
  const ops = { list: 0, get: 0, put: 0 };
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
    async list({ prefix }) {
      ops.list++;
      const keys = [...store.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([name, v]) => ({ name, metadata: v.metadata }));
      return { keys, list_complete: true };
    },
  };
}

function seedPresence(KV, n, b) {
  const id = realId(n, b);
  KV.store.set("p:" + id, {
    value: JSON.stringify({ b, t: 0, last: b }),
    metadata: { w: b, t: 0, name: "", b, e: 0, ht: 0 },
  });
  return id;
}

const T0 = 1_700_000_000_000; // ms

test("two roster reads inside the snapshot window spend one KV.list", async () => {
  const KV = fakeKV();
  const env = { PRESENCE: KV };
  seedPresence(KV, "a", T0 / 1000 - 30);
  const first = await readReals(env, T0);
  const second = await readReals(env, T0 + 10_000);
  assert.equal(first.length, 1);
  assert.deepEqual(second.map((p) => p.id), first.map((p) => p.id));
  assert.equal(KV.ops.list, 1, "the second read must be served from the snapshot, not a new list");
});

test("a read after the window re-lists and picks up newcomers", async () => {
  const KV = fakeKV();
  const env = { PRESENCE: KV };
  seedPresence(KV, "a", T0 / 1000 - 30);
  await readReals(env, T0);
  seedPresence(KV, "b", T0 / 1000 + 5);
  const later = await readReals(env, T0 + 10 * 60 * 1000);
  assert.equal(later.length, 2, "the newcomer is visible once the window has passed");
  assert.equal(KV.ops.list, 2);
});

test("ageSec is measured at read time, not at snapshot time", async () => {
  const KV = fakeKV();
  const env = { PRESENCE: KV };
  const b = T0 / 1000 - 30;
  seedPresence(KV, "a", b);
  const first = await readReals(env, T0);
  const second = await readReals(env, T0 + 60_000);
  assert.equal(first[0].ageSec, 30);
  assert.equal(second[0].ageSec, 90, "a cached row must still age in real time");
});

test("when the list fails, the stale snapshot is served and no write is spent", async () => {
  const KV = fakeKV();
  const env = { PRESENCE: KV };
  seedPresence(KV, "a", T0 / 1000 - 30);
  await readReals(env, T0); // builds the snapshot
  const putsAfterSnapshot = KV.ops.put;
  KV.list = async () => { throw new Error("list budget exhausted"); };
  const stale = await readReals(env, T0 + 60 * 60 * 1000); // long after the window
  assert.equal(stale.length, 1, "a stale roster beats an empty one");
  assert.equal(KV.ops.put, putsAfterSnapshot, "a failed list must never spend a write");
});

test("a snapshot write failure still serves the freshly listed reals", async () => {
  const KV = fakeKV();
  const env = { PRESENCE: KV };
  seedPresence(KV, "a", T0 / 1000 - 30);
  KV.put = async () => { throw new Error("write budget exhausted"); };
  const reals = await readReals(env, T0);
  assert.equal(reals.length, 1);
});

test("buildRoster still layers ghosts over the cached reals", async () => {
  const KV = fakeKV();
  const env = { PRESENCE: KV };
  seedPresence(KV, "a", T0 / 1000 - 30);
  await readReals(env, T0);
  const roster = await buildRoster(env, T0 + 5_000);
  assert.ok(roster.some((p) => p._ghost), "ghosts ride on top");
  assert.ok(roster.some((p) => p._ghost === false), "the real presence is in the roster");
});
