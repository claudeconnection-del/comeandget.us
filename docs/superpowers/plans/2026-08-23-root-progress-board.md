# /root Progress Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, anonymous progress board at `/root/progress` that reports exactly how far solvers have got in the `/root` gauntlet, and never reports anything it cannot derive from ground truth.

**Architecture:** The gauntlet already writes exact per-solver records to `PRESENCE` KV as `fs:<sid>`. This adds an arrival rung (`g0`) on the `/root` document, a pure aggregation module, a data endpoint under `/root/` (so the `Path=/root` solver cookie reaches it), an un-expiring `f:rollup` high-water key that survives the records' 90-day TTL, a static themed page, and a `progress` shell command. Every piece is additive: no existing gate, artifact, header, or answer changes.

**Tech Stack:** Cloudflare Pages Functions (ES modules, Workers runtime), Workers KV, vanilla ES-module frontend, `node --test` for pure logic, Playwright against `wrangler pages dev` for integration.

**Spec:** `docs/superpowers/specs/2026-08-23-root-progress-board-design.md`

## Global Constraints

- **Zero runtime dependencies.** No npm packages. Node built-ins and Workers APIs only; charts are hand-rolled CSS.
- **Exactness rule:** every displayed number is derived from ground truth or is not displayed. No estimates, extrapolation, sampling, or placeholder values.
- **A failure must never render as zero.** The failure payload carries no counts object at all, so the page structurally cannot paint zeroes.
- **The terminal rung is never a number.** `terminal.count` is always `null`; the page renders `?`.
- **Silently additive.** No change to any existing gate path, artifact byte, response body, puzzle answer, or counter-sign. Existing behaviour may gain headers/cookies; it may not lose or alter any.
- **Leak guard:** no `GATE_PATHS` value, no `HEADER_HEX`, no `_rabbit`, no `_shard`, no `please@` may appear in the board's HTML, CSS, JS, or JSON.
- **Fail-soft:** every KV operation is wrapped; telemetry never 500s a response and never delays the solve path.
- **CSP unchanged.** `default-src 'self'` must keep covering everything (no inline `<script>`, no external assets).
- **`context.waitUntil(...)`, never destructured** — destructuring loses the `this` binding and throws `Illegal invocation`.
- **`npm run ci` must be green** (`validate` + `test:tools` + `test`) before any push.
- Rung labels, verbatim: `g1` = "the wire", `g2` = "the token", `g3` = "the shape", `g4seal` = "the seal", `g4open` = "the opening", terminal = "the reply".
- Climbing window: **14 days**. Pace minimum sample: **n ≥ 3**. Listing cap: **MAX_KEYS = 10000**, page size 1000, value-read batch 16.

## File Structure

| File | Responsibility |
|---|---|
| `functions/root/_progress.js` | **Create.** Pure aggregation: `RUNGS`, `summarize()`, `reconcile()`. No I/O. |
| `functions/root/_funnel.js` | **Modify.** Add `g0` to `GATE_ORDER`; export `ARRIVAL`. |
| `functions/root/_middleware.js` | **Modify.** Record arrivals on the `/root` document. |
| `functions/root/progress/data.js` | **Create.** The endpoint: KV listing, batched reads, rollup, `you`. |
| `site/root/progress/index.html` | **Create.** The page shell. Static, html-validate covered. |
| `site/root/progress/progress.css` | **Create.** Undoes the terminal's scroll lock; the ladder's type and bars. |
| `site/root/js/progress.js` | **Create.** Fetches the endpoint and renders every state. |
| `site/root/js/shell.js` | **Modify.** `CMD.progress`, the `help` line, the `man` entry. |
| `tools/test/progress.test.mjs` | **Create.** Unit tests for the pure module. |
| `tools/test/funnel.test.mjs` | **Modify.** Arrival-rung tests. |
| `tests/progress.spec.js` | **Create.** Playwright: states, leak guard, integration, shell command. |

---

### Task 1: The pure aggregation module

The whole board's correctness lives here, and none of it needs KV. Build it first and test it hard.

**Files:**
- Create: `functions/root/_progress.js`
- Test: `tools/test/progress.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ARRIVAL_KEY: "g0"`
  - `RUNGS: Array<{key: string, label: string}>` — the five measured rungs in order
  - `TERMINAL_LABEL: "the reply"`
  - `COUNT_KEYS: string[]` — `["g0","g1","g2","g3","g4seal","g4open"]`
  - `summarize(records: Array<{g: Record<string, number>}>, opts: {now: number}) -> Summary`
  - `reconcile(summary: Summary, stored: Rollup|null) -> {summary: Summary, rollup: Rollup, changed: boolean}`
  - `Summary = {arrived, rungs: [{key,label,count}], terminal: {label, count: null}, climbing, pace, since, empty}`
  - `Rollup = {v: 1, counts: Record<string, number>, since: number|null}`

- [ ] **Step 1: Write the failing test**

Create `tools/test/progress.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, reconcile, RUNGS, ARRIVAL_KEY } from "../../functions/root/_progress.js";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:tools`
Expected: FAIL — `Cannot find module ... functions/root/_progress.js`

- [ ] **Step 3: Write the implementation**

Create `functions/root/_progress.js`:

```js
// Pure aggregation for the /root progress board. No KV, no fetch, no clock of its
// own — everything arrives as an argument, so the whole of the board's arithmetic
// is unit-testable without a runtime. Import-only (the leading underscore keeps
// Pages from routing it).
//
// The governing rule of this file: a number is derived from ground truth or it is
// not produced. Where a figure cannot be known (the terminal) it is null forever;
// where a sample is too small to summarise (pace) it is suppressed, never guessed.

export const ARRIVAL_KEY = "g0";

// The measured chain, in order. Labels ship to the client with the data so the
// page and the shell render one definition instead of two that can drift.
export const RUNGS = [
  { key: "g1", label: "the wire" },
  { key: "g2", label: "the token" },
  { key: "g3", label: "the shape" },
  { key: "g4seal", label: "the seal" },
  { key: "g4open", label: "the opening" },
];

export const TERMINAL_LABEL = "the reply";
export const COUNT_KEYS = [ARRIVAL_KEY, ...RUNGS.map((r) => r.key)];

const CLIMBING_WINDOW = 14 * 24 * 60 * 60; // seconds
const PACE_MIN_N = 3;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Pull only the well-formed stamps out of a record. Anything else — a null
// record, a missing map, a string timestamp — contributes nothing rather than
// throwing: one corrupt entry must not take the board down.
function stamps(record) {
  if (!record || typeof record !== "object") return null;
  const g = record.g;
  if (!g || typeof g !== "object") return null;
  const out = {};
  for (const k of COUNT_KEYS) {
    const v = num(g[k]);
    if (v !== null) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

function median(sorted) {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function build(counts, { climbing, pace, since }) {
  const rungs = RUNGS.map((r) => ({ key: r.key, label: r.label, count: counts[r.key] || 0 }));
  const arrived = counts[ARRIVAL_KEY] || 0;
  return {
    arrived,
    rungs,
    terminal: { label: TERMINAL_LABEL, count: null }, // never a number. by design.
    climbing,
    pace,
    since,
    empty: arrived === 0 && rungs.every((r) => r.count === 0),
  };
}

export function summarize(records, { now }) {
  const rows = [];
  for (const r of Array.isArray(records) ? records : []) {
    const s = stamps(r);
    if (s) rows.push(s);
  }

  // Counted per gate independently, not from the furthest rung: gates should only
  // clear in order, but a leaked path could stamp g3 without g2, and counting by
  // "furthest >= k" would over-report every rung underneath it.
  const counts = {};
  for (const k of COUNT_KEYS) counts[k] = rows.filter((s) => s[k] != null).length;

  let climbing = 0;
  let since = null;
  const elapsed = [];

  for (const s of rows) {
    const times = Object.values(s);
    const first = Math.min(...times);
    since = since === null ? first : Math.min(since, first);

    if (s.g1 != null && s.g4open == null && Math.max(...times) >= now - CLIMBING_WINDOW) climbing++;
    if (s.g1 != null && s.g4open != null && s.g4open >= s.g1) elapsed.push(s.g4open - s.g1);
  }

  elapsed.sort((a, b) => a - b);
  const pace =
    elapsed.length >= PACE_MIN_N
      ? { median: median(elapsed), fastest: elapsed[0], n: elapsed.length }
      : null;

  return build(counts, { climbing, pace, since });
}

// Merge the live counts with the durable high-water mark. Counts only ever grow,
// so max() is monotonic and idempotent: concurrent writers converge, and a lost
// write is repaired by the next render. climbing and pace are deliberately NOT
// rolled up — both are live measures by definition, and a median cannot be merged
// monotonically without lying about it.
export function reconcile(summary, stored) {
  const live = { [ARRIVAL_KEY]: summary.arrived };
  for (const r of summary.rungs) live[r.key] = r.count;

  const counts = {};
  let changed = false;
  for (const k of COUNT_KEYS) {
    const prev = num(stored && stored.counts && stored.counts[k]) ?? 0;
    counts[k] = Math.max(prev, live[k] || 0);
    if (counts[k] !== prev) changed = true;
  }

  const prevSince = num(stored && stored.since);
  const since =
    prevSince === null
      ? summary.since
      : summary.since === null
        ? prevSince
        : Math.min(prevSince, summary.since);
  if (since !== prevSince) changed = true;

  return {
    summary: build(counts, { climbing: summary.climbing, pace: summary.pace, since }),
    rollup: { v: 1, counts, since },
    changed,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:tools`
Expected: PASS — all progress tests plus the existing funnel/crypto/stego/seed tests.

- [ ] **Step 5: Commit**

```bash
git add functions/root/_progress.js tools/test/progress.test.mjs
git commit -m "feat(progress): pure aggregation module for the gauntlet ladder"
```

---

### Task 2: The arrival rung in the funnel

**Files:**
- Modify: `functions/root/_funnel.js` (the `GATE_ORDER` constant)
- Test: `tools/test/funnel.test.mjs` (append)

**Interfaces:**
- Consumes: `ARRIVAL_KEY` semantics from Task 1 (the string `"g0"`).
- Produces: `ARRIVAL: "g0"` exported from `_funnel.js`; `recordGate(env, sid, "g0", request)` writes an arrival record whose `metadata.gmax` is `"g0"`.

- [ ] **Step 1: Write the failing test**

Append to `tools/test/funnel.test.mjs`:

```js
import { ARRIVAL } from "../../functions/root/_funnel.js";

test("an arrival records g0 and leaves gmax at the door", async () => {
  const KV = fakeKV();
  const env = { PRESENCE: KV };
  const req = reqWith({ "user-agent": "Mozilla/5.0 (Windows NT 10.0)" });

  assert.equal(ARRIVAL, "g0");
  await recordGate(env, "sid9", ARRIVAL, req);
  await recordGate(env, "sid9", ARRIVAL, req); // dedup: still one arrival

  const entry = KV.store.get("fs:sid9");
  const rec = JSON.parse(entry.value);
  assert.ok(rec.g.g0 != null);
  assert.equal(entry.metadata.gmax, "g0");
  assert.equal(rec.ua, "browser");
});

test("a gate cleared after arrival advances gmax past the door", async () => {
  const KV = fakeKV();
  const env = { PRESENCE: KV };
  const req = reqWith({ "user-agent": "Mozilla/5.0 (Windows NT 10.0)" });

  await recordGate(env, "sid10", ARRIVAL, req);
  await recordGate(env, "sid10", "g1", req);

  const entry = KV.store.get("fs:sid10");
  assert.equal(entry.metadata.gmax, "g1");
  assert.ok(JSON.parse(entry.value).g.g0 != null, "the arrival stamp survives");
});
```

Move the new `import { ARRIVAL }` up beside the existing `_funnel.js` import rather than leaving it mid-file — ES imports hoist, but a reader should not have to know that.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:tools`
Expected: FAIL — `ARRIVAL` is `undefined`, and `gmax` comes back as `"g0"`'s fallback (`gate`) rather than a value from `GATE_ORDER`.

- [ ] **Step 3: Write the implementation**

In `functions/root/_funnel.js`, replace the `GATE_ORDER` line:

```js
// g0 is the door: the /root document itself. It sorts first so a solver who has
// only arrived reports gmax "g0", which lets the board count the large, cheap
// arrival population from the key listing alone — no value read required.
const GATE_ORDER = ["g0", "g1", "g2", "g3", "g4seal", "g4open"];

export const ARRIVAL = "g0";
```

Nothing else in the file changes: `recordGate` already dedups per (solver, gate), already stamps the time, already recomputes `gmax` from `GATE_ORDER`, and already fails soft.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:tools`
Expected: PASS — including the two pre-existing `recordGate` tests, which must still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add functions/root/_funnel.js tools/test/funnel.test.mjs
git commit -m "feat(progress): add the g0 arrival rung to the funnel"
```

---

### Task 3: Record arrivals in the middleware

The one change that touches a live request path. It must add a header and a cookie and nothing else — no body change, no latency, no new failure mode.

**Files:**
- Modify: `functions/root/_middleware.js`
- Test: `tests/progress.spec.js` (create, first two tests)

**Interfaces:**
- Consumes: `ARRIVAL` and `recordGate`, `getOrMintSid`, `uaClass` from `_funnel.js`.
- Produces: a `/root` document response that carries `Set-Cookie: rg=…` for a fresh cookie-capable browser, and an `fs:<sid>` record with `g0` stamped.

- [ ] **Step 1: Write the failing test**

Create `tests/progress.spec.js`:

```js
import { test, expect } from "@playwright/test";

test.describe("the door counts arrivals", () => {
  test("a browser loading /root is minted a solver cookie", async ({ page }) => {
    const res = await page.request.get("/root/", {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    const setCookie = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
    expect(setCookie.length, "the door should mint the rg cookie").toBeGreaterThan(0);
    expect(setCookie[0].value).toMatch(/rg=[^;]+/);
    expect(setCookie[0].value).toContain("Path=/root");

    // a known solver is not re-minted
    const second = await page.request.get("/root/");
    expect(second.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").length).toBe(0);
  });

  test("a self-declared crawler is not counted at the door", async ({ page }) => {
    const res = await page.request.get("/root/", {
      headers: { "user-agent": "GPTBot/1.0 (+https://openai.com/gptbot)" },
    });
    expect(res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").length).toBe(0);
  });

  test("the door still carries the gauntlet's own breadcrumb header", async ({ page }) => {
    // regression: the arrival branch must not disturb G1
    const res = await page.request.get("/root/");
    expect(res.headers()["x-intune-checkin"]).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/progress.spec.js`
Expected: FAIL on the first test — no `Set-Cookie` on the document today (the cookie is minted only on a gate artifact).

- [ ] **Step 3: Write the implementation**

Edit `functions/root/_middleware.js`. Change the import line:

```js
import { getOrMintSid, recordGate, uaClass, ARRIVAL } from "./_funnel.js";
```

Change the signature — `waitUntil` must be called on the context object, never destructured, or the runtime throws `Illegal invocation`:

```js
export async function onRequest(context) {
  const { request, env, next } = context;
  const res = await next();
```

Add the arrival branch immediately after the `isDoc` header line (`if (isDoc) headers.set("X-Intune-Checkin", HEADER_HEX);`):

```js
  // (2b) the door: count a solver who has arrived at /root but cleared nothing yet.
  // Cookie-capable browsers only — a scripted probe keeps no cookie, so counting
  // one operator's thirty curl runs as thirty people at the door would be less
  // accurate, not more. Scripted clients are still counted from g1 onward.
  // Rides waitUntil so the document never waits on telemetry.
  if (isDoc && env && env.SIGN_KEY && uaClass(request) === "browser" && !AI_UA.test(ua)) {
    try {
      const { sid, setCookie: sc } = await getOrMintSid(request, env.SIGN_KEY);
      if (sc) { setCookie = sc; headers.append("Set-Cookie", sc); }
      context.waitUntil(recordGate(env, sid, ARRIVAL, request));
    } catch {
      /* the door must open whether or not we managed to count it */
    }
  }
```

`setCookie` is already declared above the gate branch; assigning it here is what keeps the existing fast-path guard (`if (cloakedBody === null && !isDoc && !setCookie) return res;`) correct. That guard already returns the rebuilt response whenever `isDoc` is true, so the header and cookie both survive.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/progress.spec.js`
Expected: PASS, all three.

Then run the gauntlet suite to prove the change is additive:

Run: `npx playwright test tests/gauntlet.spec.js`
Expected: PASS — in particular "funnel: a gate fetch issues a stable first-party rg cookie", which fetches `/root/check-in.json` without loading the document first and must still see a fresh mint.

- [ ] **Step 5: Commit**

```bash
git add functions/root/_middleware.js tests/progress.spec.js
git commit -m "feat(progress): count arrivals at the /root door"
```

---

### Task 4: The data endpoint

**Files:**
- Create: `functions/root/progress/data.js`
- Test: `tests/progress.spec.js` (append)

**Interfaces:**
- Consumes: `summarize`, `reconcile`, `ARRIVAL_KEY`, `RUNGS` from `../_progress.js`; `verifySid` from `../_funnel.js`.
- Produces: `GET /root/progress/data` returning the JSON contract in the spec — `{ok, since, asOf, arrived, rungs, terminal, climbing, pace, you, truncated, empty}` on success, or `{ok: false, reason}` with **no counts** on failure.

- [ ] **Step 1: Write the failing test**

Append to `tests/progress.spec.js`:

```js
test.describe("the ledger endpoint", () => {
  test("serves an exact, private, cookie-varying summary", async ({ page }) => {
    const res = await page.request.get("/root/progress/data");
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["cache-control"]).toContain("private");
    expect((res.headers()["vary"] || "").toLowerCase()).toContain("cookie");

    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(d.rungs.map((r) => r.key)).toEqual(["g1", "g2", "g3", "g4seal", "g4open"]);
    expect(d.rungs.map((r) => r.label)).toEqual([
      "the wire", "the token", "the shape", "the seal", "the opening",
    ]);
    expect(d.terminal).toEqual({ label: "the reply", count: null });
    expect(typeof d.arrived).toBe("number");
    expect(typeof d.asOf).toBe("number");
  });

  test("a real walk moves the real numbers", async ({ page }) => {
    const before = await (await page.request.get("/root/progress/data")).json();
    await page.request.get("/root/", {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    await page.request.get("/root/check-in.json");
    const after = await (await page.request.get("/root/progress/data")).json();

    expect(after.arrived).toBeGreaterThanOrEqual(before.arrived + 1);
    const wire = (d) => d.rungs.find((r) => r.key === "g1").count;
    expect(wire(after)).toBeGreaterThanOrEqual(wire(before) + 1);
    expect(after.you, "the viewer's own rung comes from their cookie").toBeTruthy();
    expect(after.you.rung).toBe("g1");
  });

  test("counts never go backwards once recorded", async ({ page }) => {
    const a = await (await page.request.get("/root/progress/data")).json();
    const b = await (await page.request.get("/root/progress/data")).json();
    expect(b.arrived).toBeGreaterThanOrEqual(a.arrived);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/progress.spec.js -g "ledger endpoint"`
Expected: FAIL — `/root/progress/data` returns the site's soft-404 HTML, so `res.json()` throws.

- [ ] **Step 3: Write the implementation**

Create `functions/root/progress/data.js`:

```js
// The ledger. Reads the gauntlet's own per-solver records and reports exactly how
// far people have got — nothing modelled, nothing inferred, nothing padded.
//
// It lives under /root/ rather than /api/ for one concrete reason: the solver
// cookie is Path=/root, so only an endpoint under that path can tell a viewer
// where they personally stand. It is a directory rather than a dotted filename
// (progress.json.js) so the Pages route is unambiguous; it does not collide with
// the static page, which serves /root/progress.
//
// Failure is a distinct shape, not a zeroed board: { ok: false } carries no counts
// at all, so a client cannot accidentally render "nobody has tried" out of an
// outage.

import { summarize, reconcile, ARRIVAL_KEY, RUNGS } from "../_progress.js";
import { verifySid } from "../_funnel.js";

const PREFIX = "fs:";        // never "f:" — that would sweep the rollup key in
const ROLLUP_KEY = "f:rollup";
const PAGE = 1000;           // KV list page size
const MAX_KEYS = 10000;      // hard cap; if we hit it we say so rather than lie
const BATCH = 16;            // concurrent value reads

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // the payload carries the viewer's own position, so it is never shared
  "cache-control": "private, max-age=30",
  vary: "Cookie",
};

const reply = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: JSON_HEADERS });
const unavailable = () => reply({ ok: false, reason: "unavailable" });

function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const m = raw.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

async function listAll(KV) {
  const keys = [];
  let cursor;
  for (let page = 0; page * PAGE < MAX_KEYS; page++) {
    const res = await KV.list({ prefix: PREFIX, limit: PAGE, cursor });
    keys.push(...res.keys);
    if (res.list_complete) return { keys, truncated: false };
    cursor = res.cursor;
    if (!cursor) return { keys, truncated: false };
  }
  return { keys, truncated: true };
}

// Arrival-only records are the big, cheap population: their furthest rung is the
// door, so the listing metadata already tells us everything and no value read is
// needed. Everything else — including any record written before g0 existed — gets
// read, so per-gate counts are exact rather than inferred from gmax.
async function loadRecords(KV, keys) {
  const records = [];
  const climbers = [];

  for (const k of keys) {
    if (k.metadata && k.metadata.gmax === ARRIVAL_KEY) {
      const first = k.metadata.first;
      records.push({ g: { [ARRIVAL_KEY]: typeof first === "number" ? first : 0 } });
    } else {
      climbers.push(k);
    }
  }

  for (let i = 0; i < climbers.length; i += BATCH) {
    const slice = climbers.slice(i, i + BATCH);
    const values = await Promise.all(
      slice.map((k) => KV.get(k.name, "json").catch(() => null))
    );
    for (const rec of values) if (rec) records.push(rec);
  }

  return records;
}

async function viewerPosition(KV, request, signKey) {
  if (!signKey) return null;
  const sid = await verifySid(signKey, readCookie(request, "rg"));
  if (!sid) return null;
  const rec = await KV.get(PREFIX + sid, "json").catch(() => null);
  if (!rec || !rec.g) return null;
  let found = null;
  for (const r of RUNGS) if (rec.g[r.key] != null) found = r;
  return found ? { rung: found.key, label: found.label } : null;
}

export async function onRequest(context) {
  const { request, env } = context;
  const KV = env && env.PRESENCE;
  if (!KV) return unavailable();

  try {
    const now = Math.floor(Date.now() / 1000);
    const { keys, truncated } = await listAll(KV);
    const records = await loadRecords(KV, keys);

    const live = summarize(records, { now });
    const stored = await KV.get(ROLLUP_KEY, "json").catch(() => null);
    const { summary, rollup, changed } = reconcile(live, stored);

    // High-water only, and only when it moved. max() is monotonic, so concurrent
    // writers converge and a dropped write is repaired by the next render.
    if (changed) {
      context.waitUntil(
        KV.put(ROLLUP_KEY, JSON.stringify({ ...rollup, updated: now })).catch(() => {})
      );
    }

    const you = await viewerPosition(KV, request, env.SIGN_KEY);

    return reply({ ok: true, asOf: now, truncated, you, ...summary });
  } catch {
    // A KV outage renders as "unreachable", never as a board of zeroes.
    return unavailable();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/progress.spec.js`
Expected: PASS, all six.

- [ ] **Step 5: Commit**

```bash
git add functions/root/progress/data.js tests/progress.spec.js
git commit -m "feat(progress): the ledger endpoint with a durable high-water rollup"
```

---

### Task 5: The page

Invoke the **frontend-design** skill before writing the CSS — the spec's visual intent (one column, monospace, the ladder as the only chart, the terminal rung as a horizon rather than missing data) is the deliverable here, not decoration.

**Files:**
- Create: `site/root/progress/index.html`
- Create: `site/root/progress/progress.css`
- Create: `site/root/js/progress.js`
- Test: `tests/progress.spec.js` (append)

**Interfaces:**
- Consumes: `GET /root/progress/data` (Task 4); `createRain(canvas)` from `site/root/js/rain.js`.
- Produces: a page at `/root/progress` with `#ladder`, `#state`, and `#method` regions; a `data-state` attribute on `<main>` set to one of `ok` / `unreachable` / `empty` for tests to assert against.

- [ ] **Step 1: Write the failing test**

Append to `tests/progress.spec.js`:

```js
test.describe("the board", () => {
  test("renders the ladder, and the reply is never a number", async ({ page }) => {
    await page.goto("/root/progress");
    await expect(page.locator("main")).toHaveAttribute("data-state", /ok|empty/);

    const reply = page.locator('[data-rung="terminal"] .count');
    await expect(reply).toHaveText("?");

    const counts = await page.locator('.rung:not([data-rung="terminal"]) .count').allTextContents();
    const nums = counts.map((t) => Number(t.replace(/\D/g, "")));
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i], "the ladder must never climb").toBeLessThanOrEqual(nums[i - 1]);
    }
  });

  test("an unreachable ledger shows no numbers at all", async ({ page }) => {
    await page.route("**/root/progress/data", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, reason: "unavailable" }) })
    );
    await page.goto("/root/progress");
    await expect(page.locator("main")).toHaveAttribute("data-state", "unreachable");
    await expect(page.locator(".rung")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("0");
  });

  test("an empty ledger shows real zeroes and says so", async ({ page }) => {
    await page.route("**/root/progress/data", (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          ok: true, asOf: 1756000000, since: null, arrived: 0, empty: true, truncated: false,
          climbing: 0, pace: null, you: null,
          rungs: [
            { key: "g1", label: "the wire", count: 0 }, { key: "g2", label: "the token", count: 0 },
            { key: "g3", label: "the shape", count: 0 }, { key: "g4seal", label: "the seal", count: 0 },
            { key: "g4open", label: "the opening", count: 0 },
          ],
          terminal: { label: "the reply", count: null },
        }),
      })
    );
    await page.goto("/root/progress");
    await expect(page.locator("main")).toHaveAttribute("data-state", "empty");
    await expect(page.locator("#state")).toContainText("no one");
  });

  test("the board leaks nothing about the chain", async ({ page }) => {
    const { GATE_PATHS, HEADER_HEX } = await import("../functions/root/_gates.js");
    const sources = await Promise.all(
      ["/root/progress", "/root/progress/progress.css", "/root/js/progress.js", "/root/progress/data"]
        .map(async (p) => (await page.request.get(p)).text())
    );
    const haystack = sources.join("\n").toLowerCase();
    for (const p of Object.keys(GATE_PATHS)) {
      if (p === "/root/check-in.json") continue; // this one is public in the HTML comment already
      expect(haystack, `${p} must not appear on the board`).not.toContain(p.toLowerCase());
    }
    expect(haystack).not.toContain(HEADER_HEX.toLowerCase());
    expect(haystack).not.toContain("_rabbit");
    expect(haystack).not.toContain("_shard");
    expect(haystack).not.toContain("please@");
  });

  test("the page is noindex, like the rest of /root", async ({ page }) => {
    const html = await (await page.request.get("/root/progress")).text();
    expect(html).toContain('name="robots"');
    expect(html).toContain("noindex");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/progress.spec.js -g "the board"`
Expected: FAIL — `/root/progress` serves the soft-404 page; no `main[data-state]` exists.

- [ ] **Step 3: Write the implementation**

Create `site/root/progress/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>the ledger — root@comeandget</title>
  <meta name="description" content="how far anyone has got.">
  <meta name="robots" content="noindex">
  <link rel="icon" href="../../favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="../ember.css">
  <link rel="stylesheet" href="progress.css">
</head>
<body class="board-body">
  <canvas id="rain" aria-hidden="true"></canvas>

  <main class="board" data-state="loading" aria-busy="true">
    <header class="masthead">
      <h1>the root gauntlet</h1>
      <p class="sub" id="since"></p>
    </header>

    <p class="state" id="state">reading the ledger…</p>

    <p class="door" id="door"></p>
    <div class="ladder" id="ladder"></div>
    <dl class="asides" id="asides"></dl>

    <footer class="method" id="method"></footer>
  </main>

  <noscript>
    <p class="noscript">the ledger needs scripts. enable them and come back.</p>
  </noscript>

  <script type="module" src="../js/progress.js"></script>
</body>
</html>
```

Create `site/root/progress/progress.css`:

```css
/* The ledger. ember.css supplies the palette and the rain; everything here either
   undoes the terminal's geometry (a fixed 32rem console with the scroll locked is
   right for a shell and wrong for a document) or belongs to the board alone. */

html, body { overflow: auto; }
body.board-body { display: block; place-items: initial; cursor: default; min-height: 100svh; }

main.board {
  height: auto;
  width: min(760px, 92vw);
  margin: clamp(2rem, 9vh, 7rem) auto;
  padding: clamp(1.4rem, 4vw, 2.6rem);
}

.masthead h1 {
  font-size: clamp(1.05rem, 3.4vw, 1.5rem);
  font-weight: 500;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: var(--term-fg);
}
.masthead .sub { margin-top: 0.5rem; font-size: 0.75rem; letter-spacing: 0.12em; color: var(--ember-dim); }

.state { margin: 1.6rem 0 0; color: var(--ash); font-size: 0.86rem; }
main.board[data-state="ok"] .state { display: none; }

.door {
  margin: 2.2rem 0 0;
  padding-bottom: 1.1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ember) 16%, transparent);
  color: var(--ash);
  font-size: 0.92rem;
}
.door b { color: var(--spark); font-weight: 500; }

.ladder { margin-top: 1.5rem; display: grid; gap: 0.55rem; }

.rung {
  display: grid;
  grid-template-columns: 8.5rem 1fr 3.2rem;
  align-items: center;
  gap: 0.9rem;
  font-size: 0.9rem;
}
.rung .label { color: var(--ash); letter-spacing: 0.04em; }
.rung .track { height: 0.62rem; border-radius: 2px; background: color-mix(in srgb, var(--ember) 7%, transparent); }
.rung .bar {
  display: block; height: 100%; border-radius: 2px; width: var(--w, 0%);
  background: linear-gradient(90deg, var(--ember-dim), var(--ember));
  transition: width 900ms cubic-bezier(.22,.61,.36,1);
}
.rung .count { text-align: right; color: var(--spark); font-variant-numeric: tabular-nums; }

.rung[data-you="1"] .label::after {
  content: " ← you";
  color: var(--ember);
  letter-spacing: 0.02em;
}

.rung[data-rung="terminal"] {
  margin-top: 0.9rem;
  padding-top: 1.1rem;
  border-top: 1px solid color-mix(in srgb, var(--ember) 16%, transparent);
}
.rung[data-rung="terminal"] .track { background: none; }
.rung[data-rung="terminal"] .count { color: var(--spark); font-size: 1.2rem; }

.asides { margin: 2.1rem 0 0; display: flex; flex-wrap: wrap; gap: 1.8rem; }
.asides div { display: grid; gap: 0.25rem; }
.asides dt { font-size: 0.68rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ember-dim); }
.asides dd { margin: 0; color: var(--spark); font-size: 1.05rem; font-variant-numeric: tabular-nums; }

.method {
  margin-top: 2.6rem;
  padding-top: 1.2rem;
  border-top: 1px solid color-mix(in srgb, var(--ember) 12%, transparent);
  color: color-mix(in srgb, var(--ash) 74%, transparent);
  font-size: 0.72rem;
  line-height: 1.75;
}
.method p { margin-bottom: 0.55rem; }

.noscript { color: var(--ash); text-align: center; padding: 2rem; }

@media (prefers-reduced-motion: reduce) {
  .rung .bar { transition: none; }
}
```

Create `site/root/js/progress.js`:

```js
// The ledger's renderer. Every state the endpoint can return has a rendering here,
// and exactly one rule governs all of them: a number appears only when the server
// actually measured it. An unreachable ledger paints no digits at all — a board of
// zeroes would read as "nobody has tried", which is a lie the outage did not earn.

import { createRain } from "../js/rain.js";

createRain(document.getElementById("rain"));

const main = document.querySelector("main.board");
const el = (id) => document.getElementById(id);
const NBSP = " ";

function setState(state, message) {
  main.dataset.state = state;
  main.setAttribute("aria-busy", state === "loading" ? "true" : "false");
  el("state").textContent = message;
}

function duration(seconds) {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

const stamp = (unix) =>
  new Date(unix * 1000).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

function rung({ key, label, count, width, you, terminal }) {
  const row = document.createElement("div");
  row.className = "rung";
  row.dataset.rung = terminal ? "terminal" : key;
  if (you) row.dataset.you = "1";

  const name = document.createElement("span");
  name.className = "label";
  name.textContent = label;

  const track = document.createElement("span");
  track.className = "track";
  if (!terminal) {
    const bar = document.createElement("span");
    bar.className = "bar";
    track.appendChild(bar);
    requestAnimationFrame(() => { bar.style.setProperty("--w", `${width}%`); });
  }

  const n = document.createElement("span");
  n.className = "count";
  n.textContent = terminal ? "?" : String(count);

  row.append(name, track, n);
  return row;
}

function methodology(d) {
  const lines = [
    `A solver is a browser holding a signed cookie — not a person. Clearing cookies, or using a second device, makes a second solver.`,
    `The door counts cookie-capable browsers only; self-identified crawlers are excluded, and scripted clients (curl, scripts) are not counted there — which is why the wire can exceed the door. They are counted from the wire onward.`,
    `The reply has no number because the site cannot see one: it happens in an inbox, not on this server. Rather than publish a figure nothing here can verify, it stays a question mark.`,
    `Every figure above is counted, never estimated. Read at ${new Date(d.asOf * 1000).toLocaleTimeString()}.`,
  ];
  if (d.truncated) lines.unshift(`The record listing hit its cap, so these counts are floors, not totals.`);
  el("method").innerHTML = "";
  for (const text of lines) {
    const p = document.createElement("p");
    p.textContent = text;
    el("method").appendChild(p);
  }
}

function asides(d) {
  const items = [
    ["still climbing", String(d.climbing)],
    ["fastest clear", d.pace ? duration(d.pace.fastest) : "—"],
    ["typical clear", d.pace ? duration(d.pace.median) : "not enough finishers to say"],
  ];
  el("asides").innerHTML = "";
  for (const [term, value] of items) {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    wrap.append(dt, dd);
    el("asides").appendChild(wrap);
  }
}

function render(d) {
  el("since").textContent = d.since ? `since ${stamp(d.since)}` : NBSP;
  el("door").innerHTML = "";
  const door = document.createElement("span");
  door.textContent = `${d.arrived} `;
  const b = document.createElement("b");
  b.textContent = d.arrived === 1 ? "has stood at the door." : "have stood at the door.";
  el("door").append(document.createTextNode(`${d.arrived} `), b);

  const top = Math.max(d.arrived, ...d.rungs.map((r) => r.count), 1);
  el("ladder").innerHTML = "";
  for (const r of d.rungs) {
    el("ladder").appendChild(
      rung({ ...r, width: (r.count / top) * 100, you: d.you && d.you.rung === r.key })
    );
  }
  el("ladder").appendChild(rung({ ...d.terminal, terminal: true }));

  asides(d);
  methodology(d);
  setState(d.empty ? "empty" : "ok", "no one has come this way yet.");
}

(async () => {
  try {
    const res = await fetch("/root/progress/data", { headers: { accept: "application/json" } });
    const d = await res.json();
    if (!d || d.ok !== true) throw new Error("unavailable");
    render(d);
  } catch {
    // No counts to render, and none invented.
    el("ladder").innerHTML = "";
    el("asides").innerHTML = "";
    el("method").innerHTML = "";
    el("since").textContent = NBSP;
    el("door").textContent = "";
    setState("unreachable", "the ledger is unreachable.");
  }
})();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx playwright test tests/progress.spec.js`
Expected: PASS, all eleven.

Run: `npm run validate`
Expected: PASS — html-validate covers the new static page.

- [ ] **Step 5: Commit**

```bash
git add site/root/progress site/root/js/progress.js tests/progress.spec.js
git commit -m "feat(progress): the board — ladder, honest states, methodology"
```

---

### Task 6: The shell command

**Files:**
- Modify: `site/root/js/shell.js` (the `CMD` registry, the `help` listing, the `MANPAGES` map)
- Test: `tests/progress.spec.js` (append)

**Interfaces:**
- Consumes: `GET /root/progress/data`; the module-scoped `println(text)` helper and the `CMD` registry already in `shell.js`.
- Produces: a `progress` command that prints the ladder and the page link.

- [ ] **Step 1: Write the failing test**

Append to `tests/progress.spec.js`:

```js
test.describe("the progress command", () => {
  test("prints the ladder and points at the page", async ({ page }) => {
    await page.goto("/root/");
    const input = page.locator("input, [contenteditable]").first();
    await input.click();
    await page.keyboard.type("progress");
    await page.keyboard.press("Enter");

    const console_ = page.locator(".console");
    await expect(console_).toContainText("the wire", { timeout: 10000 });
    await expect(console_).toContainText("the reply");
    await expect(console_).toContainText("/root/progress");
  });

  test("progress is discoverable from help and man", async ({ page }) => {
    await page.goto("/root/");
    const input = page.locator("input, [contenteditable]").first();
    await input.click();
    await page.keyboard.type("man progress");
    await page.keyboard.press("Enter");
    await expect(page.locator(".console")).toContainText("PROGRESS(1)");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/progress.spec.js -g "progress command"`
Expected: FAIL — `'progress' is not recognized as a command.`

- [ ] **Step 3: Write the implementation**

In `site/root/js/shell.js`, add `progress` to the `help` listing. Change the line reading
`"          klist  token  systeminfo  env  history  uptime  date  fortune  hint",` to:

```js
      "          klist  token  systeminfo  env  history  uptime  date  fortune  hint  progress",
```

Add the command next to `CMD.unseal` (same async idiom — return a line now, print when the fetch lands):

```js
  // progress — the ledger. Aggregate only: how many came, how far they got. The
  // last number is deliberately absent; it lives in an inbox, not on this box.
  CMD.progress = () => {
    (async () => {
      try {
        const d = await (await fetch("/root/progress/data", { headers: { accept: "application/json" } })).json();
        if (!d || d.ok !== true) { println("the ledger is unreachable."); return; }

        const top = Math.max(d.arrived, ...d.rungs.map((r) => r.count), 1);
        const rule = "  " + "-".repeat(37);
        println("");
        println(`  ${d.arrived} have stood at the door.`);
        println(rule);
        for (const r of d.rungs) {
          const bar = "#".repeat(Math.round((r.count / top) * 16));
          const you = d.you && d.you.rung === r.key ? "   <- you are here" : "";
          println(`  ${r.label.padEnd(13)}${bar.padEnd(17)}${String(r.count).padStart(3)}${you}`);
        }
        println(rule);
        println(`  ${d.terminal.label.padEnd(13)}${"".padEnd(17)}${"?".padStart(3)}`);
        println("");
        println("  the full ledger: /root/progress");
      } catch {
        println("the ledger is unreachable.");
      }
    })();
    return "reading the ledger…";
  };
```

Add the manual entry to the `MANPAGES` map, beside `unseal`:

```js
    progress: "PROGRESS(1) — the ledger. how many came, how far they got. the last number is not ours to give. the full board: /root/progress",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx playwright test tests/progress.spec.js`
Expected: PASS, all thirteen.

If the input locator does not match the shell's actual prompt element, read the end of
`site/root/index.html` and `initTerminal` in `shell.js` for the real selector and fix the
test — do not weaken the assertions.

- [ ] **Step 5: Commit**

```bash
git add site/root/js/shell.js tests/progress.spec.js
git commit -m "feat(progress): a progress command in the shell"
```

---

### Task 7: Prove it is silently additive, then land it

The board is worthless if it perturbs the puzzle. This task is the evidence.

**Files:**
- Modify: none (verification only, plus any fix a failure demands)

**Interfaces:**
- Consumes: everything above.
- Produces: a green `npm run ci`, a reviewed diff, and a landing decision.

- [ ] **Step 1: Run the whole suite**

Run: `npm run ci`
Expected: PASS — `validate`, `test:tools`, and every Playwright spec (`smoke`, `mirror`, `gauntlet`, `progress`).

The leak guard needs arming or it errors by design. Locally: ensure `secret/answer.txt`
exists or `PUZZLE_ANSWER` is set, per `tests/smoke.spec.js`.

- [ ] **Step 2: Review the diff for additive-only changes**

Run: `git diff 979b187 --stat` and then read the three modified files' diffs in full:

```bash
git diff 979b187 -- functions/root/_funnel.js functions/root/_middleware.js site/root/js/shell.js
```

Confirm, line by line:
- `_funnel.js`: only `GATE_ORDER` gained `"g0"` and a new `ARRIVAL` export. `recordGate`'s body is untouched.
- `_middleware.js`: the signature changed shape and one branch was added. The AI-cloak block, the `X-Intune-Checkin` line, the gate-recording block, and the fast-path guard are unchanged.
- `shell.js`: one command added, one word added to `help`, one `MANPAGES` entry. No existing command's output changed.
- No file under `site/root/a/`, `site/root/.well-known/`, `site/root/check-in.json`, or `functions/root/_gates.js` appears in the diff at all.

- [ ] **Step 3: Confirm the puzzle's own behaviour is unchanged**

Run: `npx playwright test tests/gauntlet.spec.js tests/smoke.spec.js tests/mirror.spec.js`
Expected: PASS with the same test count as before this work.

Run: `npm run walk:gauntlet -- --base http://localhost:4173` (start `npx wrangler pages dev --port 4173` first)
Expected: the end-to-end chain still resolves, every gate in order.

- [ ] **Step 4: Land it**

**Read this before pushing.** `origin/main` is at `963c6f4` — the pre-gauntlet site — and
that is what auto-deploys to production. `feat/root-gauntlet` has never been pushed. The
board cannot go to `main` alone: it depends on `_funnel.js`, `_gates.js`, and the `fs:`
records, none of which exist there. Merging the branch ships the entire 5-gate gauntlet to
the live puzzle, which is a puzzle change, not a silent addition.

So the safe sequence, which runs full CI without deploying (the workflow deploys only on a
push to `main`; a pull request runs `ci` alone):

```bash
git push -u origin feat/root-gauntlet
gh pr create --base main --title "the /root gauntlet + the progress board" --body "…"
```

Confirm the PR's CI is green, then let the owner choose when to flip the live puzzle.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "test(progress): verification pass"
```

## Self-Review

**Spec coverage.** Governing rule → Tasks 1, 4, 5 (failure shape carries no counts; tested in Task 5). Arrivals + crawler exclusion → Tasks 2, 3. `f:rollup` → Tasks 1 (`reconcile`) and 4. Endpoint contract, caching, `you`, truncation → Task 4. Pure module + all definitions → Task 1. Page, states, methodology, visual intent → Task 5. Shell command + help + man → Task 6. Tests listed in the spec → distributed across Tasks 1–6. Ops (nothing needed) and the invariants → Task 7. Out-of-scope items are correctly absent.

**Placeholder scan.** Every code step carries real code. The one judgement call left to the implementer is the shell input selector in Task 6, which names the fallback (read `initTerminal`) rather than hand-waving.

**Type consistency.** `summarize`/`reconcile` signatures match between Task 1's implementation and Task 4's call site. `ARRIVAL` (`_funnel.js`) and `ARRIVAL_KEY` (`_progress.js`) are deliberately separate exports of the same string, each local to its module's concerns — Task 3 imports `ARRIVAL`, Task 4 imports `ARRIVAL_KEY`. Rung keys and labels are identical in Tasks 1, 4, 5, and 6.
