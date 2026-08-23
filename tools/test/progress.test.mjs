import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, reconcile, fromRollup, RUNGS, ARRIVAL_KEY } from "../../functions/root/_progress.js";

const NOW = 1_756_000_000;
const DAY = 86_400;
const rec = (g) => ({ g });
const countOf = (s, key) => s.rungs.find((r) => r.key === key).count;

test("counts each rung independently and never invents a terminal number", () => {
  const s = summarize([
    rec({ g0: NOW - DAY, g1: NOW - DAY }),
    rec({ g0: NOW - DAY, g1: NOW - DAY, g2: NOW }),
  ], { now: NOW });

  assert.equal(s.arrived, 2);
  assert.equal(countOf(s, "g1"), 2);
  assert.equal(countOf(s, "g2"), 1);
  assert.equal(countOf(s, "g4open"), 0);
  assert.equal(s.terminal.count, null);
  assert.equal(s.terminal.label, "the reply");
  assert.equal(s.empty, false);
});

test("an out-of-order record does not inflate the rungs beneath it", () => {
  // a leaked path could stamp g3 without g1/g2 ever being cleared
  const s = summarize([rec({ g0: NOW, g3: NOW })], { now: NOW });
  assert.equal(countOf(s, "g1"), 0);
  assert.equal(countOf(s, "g2"), 0);
  assert.equal(countOf(s, "g3"), 1);
});

test("arrivals count g0 only — a scripted solver with gates but no g0 is not at the door", () => {
  const s = summarize([rec({ g1: NOW, g2: NOW })], { now: NOW });
  assert.equal(s.arrived, 0);
  assert.equal(countOf(s, "g1"), 1);
});

test("climbing counts unfinished solvers active inside the 14-day window", () => {
  const s = summarize([
    rec({ g1: NOW - 13 * DAY }),                  // inside the window
    rec({ g1: NOW - 15 * DAY }),                  // stale
    rec({ g1: NOW - DAY, g4open: NOW }),          // finished, not climbing
  ], { now: NOW });
  assert.equal(s.climbing, 1);
});

test("pace is suppressed below three finishers and exact at three", () => {
  const two = summarize([
    rec({ g1: 0, g4open: 100 }),
    rec({ g1: 0, g4open: 300 }),
  ], { now: NOW });
  assert.equal(two.pace, null);

  const three = summarize([
    rec({ g1: 0, g4open: 300 }),
    rec({ g1: 0, g4open: 100 }),
    rec({ g1: 0, g4open: 200 }),
  ], { now: NOW });
  assert.deepEqual(three.pace, { median: 200, fastest: 100, n: 3 });
});

test("an empty ledger is real zeroes flagged empty — never the failure shape", () => {
  const s = summarize([], { now: NOW });
  assert.equal(s.empty, true);
  assert.equal(s.arrived, 0);
  assert.equal(s.rungs.length, RUNGS.length);
  assert.ok(!("ok" in s));
});

test("malformed records are skipped without throwing", () => {
  const s = summarize(
    [null, undefined, 42, {}, { g: null }, { g: { g1: "soon" } }, rec({ g0: NOW, g1: NOW })],
    { now: NOW }
  );
  assert.equal(s.arrived, 1);
  assert.equal(countOf(s, "g1"), 1);
});

test("reconcile keeps the high-water mark when live records have expired", () => {
  const live = summarize([rec({ g0: NOW, g1: NOW })], { now: NOW });
  const stored = { v: 1, counts: { g0: 400, g1: 23, g2: 9, g3: 4, g4seal: 2, g4open: 1 }, since: 100 };
  const { summary, rollup, changed } = reconcile(live, stored);

  assert.equal(summary.arrived, 400);
  assert.equal(countOf(summary, "g4open"), 1);
  assert.equal(summary.empty, false);
  assert.equal(rollup.since, 100);
  assert.equal(changed, false);
});

test("reconcile raises the stored mark and reports the change", () => {
  const live = summarize([rec({ g0: NOW, g1: NOW }), rec({ g0: NOW })], { now: NOW });
  const { rollup, changed } = reconcile(live, { v: 1, counts: { g0: 1 }, since: NOW });
  assert.equal(rollup.counts[ARRIVAL_KEY], 2);
  assert.equal(changed, true);
});

test("reconcile against no stored rollup adopts the live counts", () => {
  const live = summarize([rec({ g0: NOW, g1: NOW })], { now: NOW });
  const { summary, rollup, changed } = reconcile(live, null);
  assert.equal(summary.arrived, 1);
  assert.equal(rollup.counts.g1, 1);
  assert.equal(changed, true);
});

test("fromRollup serves durable counts when a live listing is impossible", () => {
  const s = fromRollup({ v: 1, counts: { g0: 412, g1: 23, g2: 9, g3: 4, g4seal: 2, g4open: 1 }, since: 100 });
  assert.equal(s.arrived, 412);
  assert.equal(countOf(s, "g1"), 23);
  assert.equal(s.since, 100);
  assert.equal(s.empty, false);
  // live-only measures must be null, never 0 — a zero here would be a lie
  assert.equal(s.climbing, null);
  assert.equal(s.pace, null);
  assert.equal(s.terminal.count, null);
});

test("fromRollup on an absent rollup yields nothing to serve", () => {
  assert.equal(fromRollup(null), null);
  assert.equal(fromRollup({ counts: {} }), null);
});

test("readReals fails soft when KV.list throws (quota, transient) instead of 500ing", async () => {
  const { readReals } = await import("../../functions/api/vigil/index.js");
  const env = {
    PRESENCE: {
      async list() { throw new Error("KV list() limit exceeded for the day."); },
      async get() { return null; },
    },
  };
  const reals = await readReals(env);
  assert.deepEqual(reals, [], "a list failure must degrade to an empty roster, not throw");
});
