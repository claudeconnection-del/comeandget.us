# comeandget.us

> you found the repository. of course you did. that's what they all do —
> pull the boards off the windows and call it trespassing when we look back.
>
> welcome. read everything. it won't help as much as you think.

This is the door. One page, no server, nothing that loads from anywhere you
can't see. Everything the page needs, the page carries — which means you can
read all of it, and you still won't be let in. The walls are honest. The lock
is not in the walls.

Seven lesser things keep the gate. Their names, in order, spell an eighth.
Speak the eighth and the seal breaks. What the seal says after that is between
you and the thing that answers. It answers to a name. Bring the right one.

```
38.8451° N   82.1371° W
XII · MCMLXVII
```

---

## for the living (maintainers)

A static cryptographic ARG — glitched-hack aesthetic, a cryptid / paranormal
clue system, zero runtime dependencies. The source is *meant* to be read; that's
the genre. What is **not** in the source is anything that proves you solved it:
the plaintext, the key in cleartext, the payoff address, and the final answer
all stay out. Only a ciphertext and a one-way hash of the key ever ship. The
page decrypts live, in the browser, when someone supplies the right name.

```
site/                   # everything that crosses the threshold (deployed)
  index.html            # the front door (ARG 1: the seven + the winged one)
  veil.css  favicon.svg
  _headers              # Content-Security-Policy + security headers
  js/
    wake.js             # boots the stage, schedules the feign then the wake
    glyphs.js           # vigenere + sha256, algorithm only — no answers
    stage.js            # the shared stage handed to every "whisper"
    whispers/*.js       # one isolated mechanic each (threshold.js = the gate)
    mark.js             # fire-and-forget funnel report; never reads, never blocks
  root/                 # the rabbit hole (ARG 2: an M365/Intune honeypot)
    index.html  ember.css  js/*.js  check-in.json  transmissions.json
  CNAME                 # the true name of this place
functions/api/vigil/    # Pages Functions: live presence ("vigil") + the funnel
    _store.js           # D1 access + the cost/abuse guarantees (read this first)
    schema.sql          # the three tables; idempotent, also self-provisioned
functions/root/         # middleware: self-declared AI crawlers get a decoy variant
tests/smoke.spec.js     # proves the door works and leaks nothing (never deployed)
secret/                 # gitignored; the answer lives here, never in the repo
.github/workflows/      # what raises the dead on every push
```

### wake it locally

```bash
npm install
npm run dev          # wrangler pages dev — serves site/ + functions/ locally
```

### what happens on every push

`.github/workflows/deploy.yml`:

1. **ci** — `npm run validate` (HTML) + `npm test` (Playwright, via
   `wrangler pages dev`): the page loads, a hidden being answers, the true key
   unseals the sigil and constructs the mailbox, the vigil API serves a roster
   without leaking, and — if a `PUZZLE_ANSWER` secret is configured — nothing in
   any shipped *or* tracked file contains a final answer.
2. **deploy** — only on `main`, only if `ci` is green: runs argument-free
   `wrangler pages deploy` (so `wrangler.toml` alone decides directory, project,
   and the `VIGIL` D1 binding) to **Cloudflare Pages**, authed with
   `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`. No puzzle answer ever ships.

```bash
npm run ci           # run the whole gate yourself
```

### the vigil, and why it costs nothing

The presence feature ("who else is in here") and the progress funnel share one
**D1** database, `comeandget-us-vigil`, bound as `VIGIL`. Everything stays on the
Cloudflare **free** plan on purpose, and the reason is worth writing down because
it is the opposite of intuitive:

- **Free fails closed.** Over quota, storage returns errors and you are never
  charged. It is the only configuration that literally cannot bill you.
- **Workers Paid fails open.** The $5/month plan does not raise a ceiling, it
  *removes* one — usage past the included allowance is billed automatically, and
  Cloudflare offers **no hard spend cap** for Workers, KV, or D1. Budget alerts
  are informational only, are processed once a day, and default to a $10 overage
  threshold *on top of* the $5. So the $5 buys capacity, not safety.

This used to live in KV, one key per presence, with the roster rebuilt by
`KV.list()`. The free KV plan allows **1,000 list requests per day** — its own
quota line, not part of the 100,000 reads — and at a 45-second heartbeat that is
80 lists per open tab per hour. The whole site therefore ran out after about
**twelve open-tab-hours a day**, which is what set the usage alerts off as soon as
the link got shared. It was never abuse; it was a 1,000/day ceiling meeting an
ordinary amount of traffic.

D1 has no list operation, and its free allowance is 5,000,000 rows read and
100,000 rows written per day. With the write guard described below, one open tab
costs about 15 row-writes an hour, so the same ceiling now sits somewhere north of
**three thousand tab-hours a day**.

**What makes it abuse-proof** (all three are enforced in `_store.js`, and pinned
by tests in `tests/smoke.spec.js`):

1. **The storage key is not client-chosen.** It is an HMAC of the caller's address
   under a salt that rotates at 00:00 UTC, plus a small lane number. Previously
   the key *was* the visitor's own id, so anyone could mint unlimited ids and
   force a write each — 1,000/day gone in 1,000 requests. Now one address can hold
   at most `LANES` rows, cannot address anyone else's row, and cannot overwrite
   another visitor's presence. Nothing reversible to an IP is stored, and nothing
   links a visitor across days.
2. **The write is a guarded upsert.** The `ON CONFLICT … WHERE` clause declines to
   touch the row unless something actually changed or it went stale. Measured
   against real D1, the declining path reports `rows_written: 0`. A caller
   hammering `/api/vigil/beat` consumes **zero** write quota after their first
   beat: the rate limit is a property of the schema, not a counter.
3. **Reads are collapsed twice** — an isolate-local memo, then the colo's Cache
   API — so a crowd arriving together costs one query per window, not one each.

Storage trouble never reaches a visitor: every path degrades to ghosts-and-you.
The vigil going quiet is in genre; a 500 is not.

**One thing to add by hand.** The in-process throttles are per-isolate speed
bumps, not a boundary. For a real one, add a Cloudflare **WAF rate-limiting rule**
(available on the free plan) in the dashboard for the zone: *Security → WAF →
Rate limiting rules*, matching `starts_with(http.request.uri.path, "/api/vigil")`,
counting by source IP, with a threshold around 60 requests per minute and a
managed-challenge or block action. The honest heartbeat is one request a minute,
so that leaves an enormous margin.

### watching the usage (and the old KV namespace)

Cloudflare's per-product usage lives at **Workers & Pages → your account → Billable
Usage**, and D1's own numbers at **Storage & Databases → D1 → comeandget-us-vigil →
Metrics** (rows read / rows written per day, against 5,000,000 and 100,000). If you ever
want to know whether a spike is traffic or abuse, the shape to look for is rows *written*
climbing without the visitor count climbing — the write guard means honest traffic writes
roughly once per visitor per four minutes, so anything much above that is somebody
poking.

The old `PRESENCE` KV namespace is no longer bound to anything and can be deleted at your
leisure (**Storage & Databases → KV**). Its remaining keys carry a 10-minute TTL, so it
drains itself either way. Note that KV and D1 free quotas are **per account**, not per
project — anything else on the same Cloudflare account draws from the same daily
allowance.

### the funnel (how far people get)

`/api/vigil/progress` accepts one allowlisted milestone name and counts it **once
per address per UTC day**. There is no visitor record and no identifier that
outlives the day — what accumulates is "eleven people cleared the DNS challenge on
the 14th". `site/js/mark.js` reports them fire-and-forget; a dead endpoint, a
blocked request, or private-mode storage are all no-ops, so the ARG never depends
on it working.

The aggregate is deliberately **not** public — a counter that ticks the moment a
stage is solved tells everyone else the stage is solvable. Set a `STATS_KEY`
secret and read it yourself:

```bash
curl "https://comeandget.us/api/vigil/stats?key=$STATS_KEY&days=30"
```

Without a valid key it answers `404`, not `401`, so an unauthenticated caller does
not even learn the endpoint is there.

Milestones live in `MILESTONES` in `functions/api/vigil/_store.js`; anything not on
that list is accepted and silently dropped, so the table's cardinality is fixed no
matter what gets POSTed. `root.*` marks are recorded server-side from the beat and
claim endpoints; `gate.opened` and the `cafe.*` marks are reported by the client.

### the tables

Three tables, all `WITHOUT ROWID` so the primary key *is* the table — an upsert
writes one row instead of two, which halves the only quota this feature can
plausibly exhaust. The Functions create them on cold start (idempotent, and
measurably free), so local dev and CI need no migration step. To provision or
re-provision production explicitly:

```bash
npx wrangler d1 execute comeandget-us-vigil --remote \
  --file=functions/api/vigil/schema.sql
```

### secrets

Set these as Pages **environment variables** (Settings → Environment variables) or
in a gitignored `.dev.vars` for local runs. None of them are puzzle answers:

| name | what it does | without it |
|---|---|---|
| `SIGN_KEY` | signs tier grants; salts the daily presence hash | claims cannot be issued; the salt falls back to a dev constant |
| `CODE_ARG1` | the cryptid/ARG-1 claim code | tier 1 unreachable |
| `CODE_ARG2` | the tech/ARG-2 claim code | tier 2 unreachable |
| `STATS_KEY` | reads the funnel aggregate | `/api/vigil/stats` always 404s |

### the answer, kept outside

The leak guard never names the answer. It reads it from `PUZZLE_ANSWER` (a CI
secret) or a gitignored `secret/answer.txt`, then proves it appears nowhere in
the deployed files. Set one of those to arm the guard; leave both unset and that
single check politely skips.

### the true name (custom domain)

`site/CNAME` pins `comeandget.us`. The zone lives on Cloudflare: add the apex
(and `www`) under **Custom domains** in the `comeandget-us` Pages project and
Cloudflare auto-wires the records (apex CNAME-flattened to `*.pages.dev`) and
issues the certificate. HTTPS is enforced by Pages once the cert is live.

---

*come and get us.*
