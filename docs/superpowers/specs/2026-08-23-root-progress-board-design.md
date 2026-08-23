# The /root progress board — an anonymous, exact gauntlet ladder (2026-08-23)

## Problem

The `/root` gauntlet already records exact per-solver progress (`fs:<sid>` records in
`PRESENCE`, shipped 2026-07-24/25), and nothing surfaces it. The tracker reads only the
`p:` presence prefix; the site shows nothing at all. The project's centre of gravity has
moved from *presence* ("who is here right now") to *progress* ("how far has anyone got"),
and the surface hasn't followed.

Build a public, anonymous progress board at **`/root/progress`**: how many stood at the
door, how far they climbed, and — deliberately unnumbered — whether anyone finished.

Two audiences, one page:

- **Candidates** walking the chain. The board is pressure and invitation: others are ahead
  of you, and the last rung is a question mark.
- **The site owner's employer**, who uses the ARG as a talent filter and wants a standing
  read on volume, depth, and pace — including the "did someone get close?" signal.

## The governing rule

**Every number on the board is derived from ground truth, or it is not shown.**

No estimates. No extrapolation. No sampling. No modelled or inferred figures. No
placeholder values. Where something cannot be known exactly, the board says so in words
rather than approximating it. This rule outranks completeness, visual balance, and the
desire for a satisfying number in every slot.

Its sharpest consequence is in error handling: **a failure must never render as zero.**
A broken KV read produces an honest "the ledger is unreachable" state, never a board of
zeroes that reads as "nobody has tried."

## Scope

**In:** the `/root` gauntlet only.

**Out:** the cryptid veil at `/` (personal, friends-and-family; it just happens to make a
good front door), `/cafe`, the vigil presence roster, DNS analytics, and the
comeandget-tracker dashboard.

## Fixed constraints (never touched by this work)

- The `_rabbit.comeandget.us` TXT record, its riddle, the answer, and the external sieve.
- No puzzle answer, gate path, or header hex ever ships to the board. The CI leak-guard
  stays green, and the board gets a leak test of its own.
- CSP unchanged. `default-src 'self'` already covers everything here.
- No new KV namespace, no new binding, no new env var, no new client beacon.
- The real solve path is never blocked, delayed, or gated by the board or its telemetry.

## What can be measured exactly — and what cannot

| Rung | Signal | Exactness |
|---|---|---|
| arrived | **new:** `g0` recorded on the `/root` document | exact, cookie-capable browsers only |
| the wire | fetch of `/root/check-in.json` → `g1` | exact |
| the token | fetch of the derived `.well-known` JSON → `g2` | exact |
| the shape | fetch of the PNG → `g3` | exact |
| the seal | fetch of the sealed artifact → `g4seal` | exact |
| the opening | fetch of the final derived path → `g4open` | exact |
| the reply | an email to `please@comeandget.us` | **unknowable to the site — permanently `?`** |

### Three things deliberately excluded

**G5 / DNS.** `dig TXT _rabbit` produces no HTTP fetch. Resolver caching means query volume
is not a count of people, and the site has no credential to read DNS analytics anyway.
Excluded entirely. The board states that the last *measured* rung is the opening.

**The reply count.** It exists only in the owner's inbox. Publishing a hand-maintained
number would mean publishing a figure the system cannot verify — exactly what the governing
rule forbids. It is rendered as a permanent `?`: mentioned, never numbered. This is a
feature. It is the board's most inviting statistic, and it is also the only honest one.

**Anything per-person.** No names, no handles, no locations, no timestamps of individual
events, no session detail. The board is aggregate-only by construction.

### What a "solver" actually is

A **browser holding a signed `rg` cookie** — not a person. Clearing cookies, switching
browsers, or using a second device creates a second solver. Scripted clients that keep no
cookies create a new solver per run.

This is disclosed on the page in plain words. It is a real limit on precision, and hiding
it would be its own kind of dishonesty.

## Architecture

Six code changes plus one durable KV key, each with one job — in the order the sections
below treat them:

1. `functions/root/_funnel.js` — gains an arrival rung.
2. `functions/root/_middleware.js` — records arrivals.
3. `f:rollup` — an un-expiring KV key that survives the 90-day TTL.
4. `functions/root/progress/data.js` — the data endpoint (KV + rollup + the pure module).
5. `functions/root/_progress.js` — pure aggregation. No I/O.
6. `site/root/progress/` — the page. Static, themed, zero dependencies.
7. `site/root/js/shell.js` — a `progress` command.

### 1. Arrivals — `_funnel.js`

```js
const GATE_ORDER = ["g0", "g1", "g2", "g3", "g4seal", "g4open"];
export const ARRIVAL = "g0";
```

`recordGate` is otherwise unchanged: it already dedups per (solver, gate), already stores
the timestamp, already fails soft, and already recomputes `gmax` from `GATE_ORDER`.

### 2. Recording arrivals — `_middleware.js`

On the `/root` document only (the existing `isDoc` branch):

```js
// signature changes: onRequest({ request, env, next }) → onRequest(context)
export async function onRequest(context) {
  const { request, env } = context;
  // …
  if (isDoc && env?.SIGN_KEY && countsAsArrival(request)) {
    const { sid, setCookie: sc } = await getOrMintSid(request, env.SIGN_KEY);
    if (sc) headers.append("Set-Cookie", sc);
    context.waitUntil(recordGate(env, sid, ARRIVAL, request));
  }
```

**Call it as `context.waitUntil(...)`, never destructured.** Destructuring `waitUntil` off
the context loses its `this` binding and throws `Illegal invocation` at runtime — a
documented Workers pitfall. `request`, `env`, and `next` are plain values and destructure
safely, so only the signature's shape changes.

**`countsAsArrival(request)`** — a stated rule, not a heuristic dressed as a fact:

```js
const countsAsArrival = (req) =>
  uaClass(req) === "browser" && !AI_UA.test(req.headers.get("user-agent") || "");
```

Both filters are required. `uaClass`'s bot regex misses several self-declared AI agents
(`chatgpt-user`, `anthropic-ai`, `google-extended`, `meta-externalfetcher`, `novaact`,
`cohere-ai`), and the middleware's `AI_UA` list catches them.

Restricting arrivals to **cookie-capable browsers** is deliberate. A tier-3 operator
probing with `curl -I` keeps no cookies, so counting scripted requests would turn one
operator's thirty probes into thirty people standing at the door — less accurate, not more.
Scripted clients are simply not counted *at the door*; they are counted from the wire
onward like anyone else. A consequence: **the wire count can exceed the arrival count**,
because they are different populations. The methodology note says so explicitly.

Two deliberate asymmetries, both to be documented in the code:

- Arrival recording rides `waitUntil` so it never adds latency to the `/root` document.
  Gate recording stays `await`ed — the walk-gauntlet verifier and the Playwright specs rely
  on the write having landed before the response returns.
- Arrivals mint the `rg` cookie on the document. Previously the cookie was minted only on a
  gate artifact. This is what makes "arrived → the wire" a real, attributable drop-off.

**Cost.** One KV read per `/root` document load; one KV write per *new* non-crawler browser.
Cloudflare's free KV tier allows 1,000 writes and 100,000 reads per day. At vetting volume
this is not close. If a cookie-less scraper ever threatens the write cap, the mitigation is
a Cloudflare Rate Limiting rule on `/root/*` — the same posture the middleware's existing
abuse note takes, and no code change.

### 3. Beating the 90-day TTL — the `f:rollup` key

`fs:` records carry a 90-day TTL, so any "all-time" figure would silently decay — precisely
the failure the governing rule exists to prevent.

- **Key:** `f:rollup`, written with **no** `expirationTtl`. (Note: always list with prefix
  `fs:`, never `f:` — the latter would sweep the rollup key into the record listing.)
- **Value:** `{ v: 1, counts: { g0, g1, g2, g3, g4seal, g4open }, since, updated }`
- **Update rule:** on each render, compute live counts from the `fs:` listing, then store
  `max(stored, live)` per rung. Write only when something increased.

Counts only ever grow, so `max()` is monotonic and idempotent. Concurrent writers converge
on the same value; a lost write is repaired by the next render. No read-modify-write race,
and — importantly — **no writes on the solve path at all**.

`since` is the minimum `first` timestamp ever observed, so the board can honestly say
"since 24 July 2026" rather than implying it has always existed.

The gauntlet shipped roughly a month ago against a 90-day TTL, so **nothing has expired
yet**: the rollup captures the chain from its true beginning.

**Known failure mode, accepted and documented:** if nobody loads the board for 90 days
*and* records expire in that window, those solvers are lost to the rollup. Mitigations: the
board is linked from the shell and reachable by anyone, and the tracker can poll the JSON
endpoint on its existing digest schedule. Not worth a Durable Object.

### 4. The data endpoint — `functions/root/progress/data.js` → `/root/progress/data`

**Why it lives under `/root/` and not `/api/`:** the `rg` cookie is `Path=/root`. An
endpoint under `/api/` would never receive it, and the viewer's own position on the ladder
would be impossible.

**Why a directory rather than `progress.json.js`:** a dotted filename would need Pages to
map `progress.json.js` → `/root/progress.json`, which is not something to bet the routing on
unverified. A plain directory is unambiguous under Pages' file-based routing. It does not
collide with the static page: Functions serve `/root/progress/data`, the static asset serves
`/root/progress`. Clients must request the **absolute** path `/root/progress/data` — a
relative `./data` resolves differently depending on whether the page URL carried a trailing
slash.

Algorithm:

1. `KV.list({ prefix: "fs:", limit: 1000 })`, paginating to a hard cap of `MAX_KEYS = 10000`.
   If the cap is reached, set `truncated: true` in the response and have the page say so.
   **Never truncate silently** — a capped count presented as a total is an estimate.
2. For every key whose `metadata.gmax !== "g0"`, `KV.get(key, "json")` in bounded-concurrency
   batches (16 at a time) to get exact per-gate flags. Records whose furthest rung is `g0`
   need no value read, so the large, cheap population costs one listing and nothing more.
   Records written before this change have no `g0` and a `gmax` of `g1` or later, so they
   are read and handled correctly.
3. Hand the assembled records to `summarize()` (below). No aggregation logic lives here.
4. Reconcile with `f:rollup` via `max()`; write back only if changed.
5. Resolve `you` from the `rg` cookie: verify the HMAC, look up that one record, report the
   viewer's furthest rung. Never returns anything about any other solver.
6. Respond.

**Caching.** The response varies by cookie, so it must not be shared:
`Cache-Control: private, max-age=30` plus `Vary: Cookie`. No edge caching. At this volume
one listing plus a handful of value reads per view is cheap; correctness beats the cache.

**Failure.** Any KV error returns HTTP 200 with `{ ok: false, reason: "unavailable" }` and
**no counts object at all** — the shape makes it impossible for the page to accidentally
render zeroes. A genuinely empty ledger returns `ok: true` with real zeroes and
`empty: true`. These two states must never be confusable, in the payload or on the page.

**Response shape:**

```jsonc
{
  "ok": true,
  "since": 1753315200,          // unix seconds; first activity ever observed
  "asOf": 1755993600,           // when this response was computed
  "arrived": 412,               // browsers that loaded /root (see methodology)
  "rungs": [                    // ordered; labels ship with the data (see below)
    { "key": "g1",     "label": "the wire",    "count": 23 },
    { "key": "g2",     "label": "the token",   "count": 9 },
    { "key": "g3",     "label": "the shape",   "count": 4 },
    { "key": "g4seal", "label": "the seal",    "count": 2 },
    { "key": "g4open", "label": "the opening", "count": 1 }
  ],
  "terminal": { "label": "the reply", "count": null },  // always null. by design.
  "climbing": 8,                // see definition below
  "pace": { "median": 15120, "fastest": 9240, "n": 3 }, // seconds, or null — see below
  "you": { "rung": "g2", "label": "the token" },        // or null
  "truncated": false,
  "empty": false
}
```

**The labels ship with the data.** The page and the shell command both render whatever the
endpoint sends, so there is exactly one definition of the ladder. (A shared constants module
is not an option: `functions/` is bundled server-side and `site/root/js/` is served to the
browser; duplicating the rung list across both is how they drift.)

### 5. Pure aggregation — `functions/root/_progress.js`

Export `summarize(records, { now })` — a pure function over `[{ sid, rec, meta }]` returning
the response shape above. No KV, no `fetch`, no clock of its own. Unit-tested with
`node --test` under `tools/test/`, exactly like `_funnel.js` is today.

Definitions, all exact and all stated on the page:

- **arrived** — records with `g0` stamped. Computed as (keys whose `gmax === "g0"`) plus
  (climber records whose value carries `g0`). Not "total keys": a curl-only operator has an
  `fs:` record but never triggered an arrival, and counting them at the door would
  contradict the arrival rule.
- **rung count** — records with that gate stamped, counted per gate independently rather
  than derived from `gmax`. Gates *should* only clear in order, but a leaked path could
  produce an out-of-order record, and counting by `gmax >= k` would over-report the gates
  underneath it. Independent counts are exact under every input.
- **climbing** — records with `g1` stamped, without `g4open`, whose most recent stamp falls
  within **14 days** of `now`. A stated window, not a guess.
- **pace** — elapsed `g1 → g4open` per finisher; the median and the minimum. **Emitted only
  when n ≥ 3**; below that it is `null` and the page prints "not enough finishers to say."
  Suppression, never estimation. (This also keeps a single finisher's time from being
  presented as a population statistic.)

### 6. The page — `site/root/progress/`

Three files, matching the repo's existing split:

- `site/root/progress/index.html` — static, so `npm run validate` covers it.
- `site/root/progress/progress.css` — layout and the board's own type scale.
- `site/root/js/progress.js` — an ES module; fetches `/root/progress/data` (absolute,
  same-origin, so the `rg` cookie rides along) and renders.

It links `../ember.css` first for the palette (`--bg #060402`, `--ember #ff7a18`,
`--ember-dim #7a3a0c`, `--ash #c9a98a`, `--spark #ffd27a`, `--term-fg #f4ecdd`, `--mono`),
then `progress.css` to override ember.css's console geometry — `html, body { overflow: hidden }`
and `main { height: 32rem }` are right for a terminal and wrong for a document. It reuses
`<canvas id="rain">` with `createRain` from `../js/rain.js`, so the board sits in the same
fire as the shell rather than looking like a page from a different site.
`<meta name="robots" content="noindex">`, consistent with the rest of `/root`.

#### Visual intent

The brief is "visually stunning and simple, given its job." The job is: make six numbers
land, and be believed. Direction, to be executed with the frontend-design skill at
implementation time:

- **One column**, `min(760px, 92vw)` — the same measure as the `/root` console.
- **Monospace throughout.** This is a terminal artifact, not a BI dashboard. No cards, no
  chrome, no icons.
- **The ladder is the hero and the only chart.** Rung label, bar, count. Bar widths are
  `count / arrived`, drawn in CSS — no chart library (the site is zero-dependency by
  constitution). The descending bars *are* the drop-off; no axis, no gridlines, no legend,
  no percentages competing with the counts.
- **The reply rung is rendered as the horizon, not as missing data.** A hairline rule above
  it, the count as `?` in `--spark`, and one line of copy. It should read as the point where
  the instrumentation stops and the person begins.
- **Colour carries meaning, once.** Counts in `--spark`; labels in `--ash`; bars a gradient
  from `--ember-dim` to `--ember`. Nothing else is coloured.
- **"you are here"** — a marker on the viewer's own rung, from `you`. Present but quiet.
- **Motion** — counts tick up once on load; bars grow from zero. Everything behind
  `prefers-reduced-motion: reduce`.
- **The methodology note is designed, not buried.** It is the reason an employer can trust
  the board, so it gets real typography at the foot of the page: what a solver is, what
  arrivals exclude and why, why the wire can exceed the door, why the reply has no number,
  and the `asOf` time. Roughly 120 words, in the site's voice.

#### States, all first-class

| State | Rendering |
|---|---|
| normal | the board |
| `ok: false` | "the ledger is unreachable." No numbers, no zeroes, no bars. |
| `empty: true` | "no one has come this way yet." Real zeroes, said plainly. |
| `truncated` | a line stating the listing cap was reached and counts are floors |
| `pace: null` | "not enough finishers to say" |
| `you: null` | the marker is simply absent |

### 7. The shell command — `site/root/js/shell.js`

`CMD.progress` follows the established async idiom (`CMD.unseal`): return a line
immediately, `println` the result when the fetch lands.

```
> progress
reading the ledger…

  412 have stood at the door.
  ─────────────────────────────────
  the wire      ████████████████  23
  the token     ███████████        9
  the shape     █████              4
  the seal      ██                 2   ← you are here
  the opening   █                  1
  ─────────────────────────────────
  the reply                        ?

  the full ledger: /root/progress
```

Rendered from the same JSON, using the labels it ships. Added to the `help` listing and
given a `MANPAGES` entry:

```
progress: "PROGRESS(1) — the ledger. how many came, how far they got. the last number is
not ours to give."
```

Discoverable through `help` and `man`, linked from nowhere else — known, but not obnoxious.

## Tests

Everything below must pass under `npm run ci` (`validate` + `test:tools` + `test`).

**`tools/test/progress.test.mjs`** — `node --test`, pure, no KV:

- rungs count independently; an out-of-order record does not inflate the gates beneath it
- arrivals count `g0` records only; a curl-shaped record (gates but no `g0`) is excluded
- dedup: one solver clearing a gate twice counts once
- `climbing` respects the 14-day window at both boundaries
- `pace` is `null` at n = 2 and populated at n = 3; median and minimum are correct
- empty input → real zeroes with `empty: true` — *never* the failure shape
- malformed records (null, missing `g`, string timestamps) are skipped without throwing

**`tools/test/funnel.test.mjs`** (extend):

- `g0` is recorded on arrival and deduped
- `GATE_ORDER` places `g0` first, so `gmax` stays correct
- a self-declared crawler UA records nothing and mints no cookie
- a `curl` UA records no arrival but still records gates

**`tests/progress.spec.js`** — Playwright:

- the page renders a ladder whose counts are monotonically non-increasing
- the reply row shows `?` and **never a number**
- with the endpoint stubbed to `ok: false`, the page shows the unreachable state and renders
  **no zeroes and no bars** (the single most important regression test here)
- with the endpoint stubbed empty, the page shows real zeroes and the empty copy
- `noindex` is present
- **leak guard:** neither the page's HTML/JS nor the JSON response contains any value from
  `GATE_PATHS`, the `HEADER_HEX` string, `_rabbit`, `_shard`, or `please@`
- the `progress` shell command prints the ladder and the page link

## Ops

Nothing outside the repo. `PRESENCE` is already bound in `wrangler.toml`; `SIGN_KEY` is
already set. No DNS change, no new token, no dashboard configuration.

Optional and only if needed later: a Cloudflare Rate Limiting rule on `/root/*` if arrival
writes approach the KV daily cap.

## Rollout

1. This spec, committed.
2. TDD each piece in order: `_progress.js` (pure, fully tested) → `_funnel.js`/middleware →
   the endpoint → the page → the shell command.
3. Deploy to a Pages preview branch (`wrangler pages deploy --branch feat/progress-board`)
   and walk the whole chain against it, confirming each rung increments exactly once.
4. Merge to `main` after sign-off on the preview.

## Invariants

- Every displayed number is derived from ground truth or is not displayed.
- A failure never renders as zero; the failure payload carries no counts to render.
- The reply rung is never a number.
- No gate path, header hex, DNS name, or answer ever reaches the board or its JSON.
- The board and its telemetry never block, delay, or gate the real solve path; every KV
  operation fails soft.
- No per-person information is exposed. `you` describes only the requesting cookie.
- CSP unchanged; no new dependency, binding, namespace, or env var.
- `npm run ci` stays green.

## Out of scope (and possible follow-ons)

- **comeandget-tracker integration.** The dashboard's `/root` view currently builds its
  funnel from sampled `httpRequestsAdaptiveGroups` path hits. Once `/root/progress/data`
  exists, it should consume that instead — exact numbers replacing sampled ones, and the
  tracker gets the private extras the public board omits (UA-class split, reckoning-tier
  distribution, per-gate dwell). A separate spec.
- **DNS analytics for G5**, if the tracker's token ever gains DNS-read scope. Private
  dashboard only; it does not belong on a board that promises exactness.
- Anything per-person, ever.
