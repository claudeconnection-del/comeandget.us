// The vigil's storage layer. Import-only (leading underscore keeps Pages from
// routing it).
//
// ---------------------------------------------------------------------------
// WHY THIS MOVED OFF KV
// ---------------------------------------------------------------------------
// The vigil used to keep one KV key per presence and rebuild the roster with
// KV.list(). That is the one shape Workers KV cannot afford on the free plan:
//
//   free KV: 100,000 reads/day BUT only 1,000 *list requests*/day, and only
//            1,000 writes/day. List is its own quota line, not a read.
//
// Every roster read AND every heartbeat did one list. At a 45s heartbeat that is
// 80 lists per open tab per hour, so the entire site ran out of list quota after
// about twelve tab-hours — before lunch, once the link got shared. The alerts
// were not abuse; they were the design meeting a 1,000/day ceiling.
//
// D1 has no "list" concept and its free allowance is a different order of
// magnitude: 5,000,000 rows read/day and 100,000 rows written/day. Both plans
// fail CLOSED on the free tier — over-quota returns errors, never a charge — so
// staying here is what keeps this project structurally unbillable.
//
// ---------------------------------------------------------------------------
// THE THREE PROPERTIES THAT MAKE IT ABUSE-PROOF
// ---------------------------------------------------------------------------
// 1. The row key is NOT client-chosen. It is an HMAC of the caller's IP under a
//    per-UTC-day salt. The old design keyed on the client's own id, so anyone
//    could mint unlimited ids and force a write each — 1,000/day gone in 1,000
//    requests. Now a caller cannot address a row that isn't theirs, cannot
//    overwrite anyone else's, and cannot create more than LANES of them.
// 2. The write is a guarded UPSERT. The ON CONFLICT ... WHERE clause refuses to
//    touch the row unless something actually changed or it is genuinely stale.
//    Measured against real D1: the declining path reports rows_written: 0 and
//    changed_db: false. So a caller hammering this endpoint from one address
//    consumes ZERO write quota after their first beat. The rate limit is a
//    property of the schema, not a counter someone has to maintain.
// 3. Reads are collapsed twice over — an isolate-local memo, then the colo's
//    Cache API — so a crowd arriving at once costs one SELECT per window, not
//    one per visitor.
//
// Nothing here stores an IP, a user agent, or anything that outlives the day:
// the slot is a one-way HMAC under a salt that rotates at 00:00 UTC.

import { hmacRaw } from "./_lib.js";

// ---- tunables ---------------------------------------------------------------

// A presence is "live" for this long after its last refresh.
export const TTL_SECONDS = 600;
// Only rewrite a row once it is this stale. The gap between this and TTL is the
// slack that keeps a continuously-open tab from writing on every beat: one write
// per REFRESH_AFTER, not one per heartbeat.
export const REFRESH_AFTER = 240;
// Distinct rows one IP may hold. >1 so an office behind one NAT doesn't collapse
// into a single chip; small enough that the per-IP write ceiling stays trivial.
export const LANES = 6;
// Hard ceiling on live rows. Bounds the roster scan (and therefore rows-read)
// no matter how distributed an attempt to grow the table gets.
export const MAX_LIVE = 240;
// Cap on reals folded into a roster response.
export const MAX_REALS = 50;
// How long a built roster may be reused. Cheap staleness; the vigil is
// atmospheric, not a trading floor.
const MEMO_MS = 8000;
const CACHE_TTL = 20;

// ---- schema (self-provisioning) --------------------------------------------
// Idempotent and, measured against real D1, free: CREATE TABLE IF NOT EXISTS on
// an existing table reports rows_read 0 / rows_written 0. Doing it once per
// isolate means `wrangler pages dev` and CI need no migration step, while
// production is still provisioned explicitly from schema.sql.

const DDL = [
  `CREATE TABLE IF NOT EXISTS presence (
     slot TEXT PRIMARY KEY, id TEXT NOT NULL, tier INTEGER NOT NULL DEFAULT 0,
     name TEXT, echo INTEGER NOT NULL DEFAULT 0, born INTEGER NOT NULL,
     seen INTEGER NOT NULL
   ) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS progress (
     day TEXT NOT NULL, milestone TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (day, milestone)
   ) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS progress_seen (
     slot TEXT NOT NULL, day TEXT NOT NULL, milestone TEXT NOT NULL,
     PRIMARY KEY (slot, day, milestone)
   ) WITHOUT ROWID`,
];

let schemaReady = false;
// If the DDL itself fails — which in practice means D1 is unhappy or the daily
// quota is spent — don't retry it on every single request for the rest of the
// isolate's life. Back off for a bit instead: callers already degrade to
// ghosts-and-you, so the only thing a retry storm would add is noise.
let schemaFailedAt = 0;
const SCHEMA_RETRY_MS = 60000;

export async function ensureSchema(db) {
  if (schemaReady || !db) return;
  if (schemaFailedAt && Date.now() - schemaFailedAt < SCHEMA_RETRY_MS) {
    throw new Error("schema unavailable");
  }
  try {
    await db.batch(DDL.map((sql) => db.prepare(sql)));
  } catch (err) {
    schemaFailedAt = Date.now();
    throw err;
  }
  schemaReady = true;
  schemaFailedAt = 0;
}

// The D1 binding, or null when it isn't bound (local dev without config, or a
// preview). Every caller degrades instead of throwing.
export const dbOf = (env) => (env && env.VIGIL) || null;

// ---- identity: the slot ----------------------------------------------------

export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

// Which of an address's LANES this browser occupies. Derived from the client id
// so one browser keeps one lane, and two people behind the same NAT usually land
// on different ones. FNV-1a — the same cheap hash handleFor uses.
function laneFor(id) {
  let h = 2166136261 >>> 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % LANES;
}

// slot = base64url(HMAC(SIGN_KEY, "slot:<utc-day>:<ip>"))[0..21] + ":" + lane
//
// One-way and salted per day, so the stored key is not reversible to an address
// and does not link a visitor across days. Falls back to a fixed dev salt when
// SIGN_KEY is unset (local dev / CI) — that only weakens unlinkability locally,
// never the write guard, which does not depend on the salt being secret.
export async function slotFor(env, request, id, now = Date.now()) {
  // ONLY cf-connecting-ip. Cloudflare sets it on every request that reaches a
  // Function and a client cannot forge it. X-Forwarded-For deliberately is NOT
  // consulted as a fallback: it is attacker-controlled, and trusting it would
  // hand any caller an unlimited supply of distinct slots — which is precisely
  // the unbounded-row-minting hole this whole scheme exists to close. When the
  // header is absent we are not behind Cloudflare (local dev, `pages dev`), so
  // everyone collapses into one bucket. That is over-strict rather than unsafe.
  const ip = (request && request.headers.get("cf-connecting-ip")) || "local";
  const salt = (env && env.SIGN_KEY) || "vigil-dev-salt";
  const mac = await hmacRaw(salt, `slot:${utcDay(now)}:${ip}`);
  return `${mac.slice(0, 22)}:${laneFor(id)}`;
}

// ---- reading the roster ----------------------------------------------------

// Layer 1: isolate-local. Free, works everywhere including *.pages.dev and
// `wrangler pages dev`, where the Cache API is a no-op.
let memo = { at: 0, reals: null };

// Layer 2: the colo's cache, shared across isolates. Keyed on the *request's own*
// origin so the URL is always same-zone (the Cache API refuses foreign hosts, and
// no-ops on pages.dev — hence layer 1 carrying the floor).
async function cacheKeyFor(request) {
  return new Request(new URL("/__vigil/roster", request.url).toString(), { method: "GET" });
}

async function readRealsUncached(db, now) {
  const cutoff = Math.floor(now / 1000) - TTL_SECONDS;
  const { results } = await db
    .prepare(
      `SELECT id, tier, name, echo, born FROM presence
        WHERE seen > ?1 ORDER BY seen DESC LIMIT ?2`
    )
    .bind(cutoff, MAX_REALS)
    .all();
  return results || [];
}

// The roster's real presences, collapsed through both cache layers. Returns []
// on any storage trouble — the vigil then shows ghosts and you, never an error.
export async function readReals(env, request, ctx, now = Date.now()) {
  const db = dbOf(env);
  if (!db) return [];

  if (memo.reals && now - memo.at < MEMO_MS) return memo.reals;

  let key = null;
  try {
    key = await cacheKeyFor(request);
    const hit = await caches.default.match(key);
    if (hit) {
      const reals = await hit.json();
      memo = { at: now, reals };
      return reals;
    }
  } catch {
    // Cache API unavailable (pages.dev, local dev) — fall through to D1.
  }

  let reals = [];
  try {
    await ensureSchema(db);
    reals = await readRealsUncached(db, now);
  } catch {
    return memo.reals || [];
  }

  memo = { at: now, reals };
  const pruning = maybePrune(db, ctx, now);
  if (ctx && ctx.waitUntil) ctx.waitUntil(pruning);
  else await pruning;
  if (key) {
    const store = caches.default
      .put(
        key,
        new Response(JSON.stringify(reals), {
          headers: {
            "content-type": "application/json",
            "cache-control": `max-age=${CACHE_TTL}`,
          },
        })
      )
      .catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(store);
    else await store;
  }
  return reals;
}

// ---- writing a presence ----------------------------------------------------

// Skip D1 entirely when this isolate already refreshed this slot recently. Free,
// storage-less, and it absorbs the common case of a client beating faster than
// REFRESH_AFTER. Bounded so a spray of slots can't grow it without limit.
const recent = new Map();
const RECENT_MAX = 2000;

function beatenRecently(slot, nowSec) {
  const at = recent.get(slot);
  if (at != null && nowSec - at < REFRESH_AFTER) return true;
  if (recent.size >= RECENT_MAX) recent.clear();
  recent.set(slot, nowSec);
  return false;
}

// Upsert a presence. Returns true if a row was actually written.
//
// The guard is the whole point. A new slot inserts only while the live-row count
// is under MAX_LIVE (an existing slot always refreshes, so the cap can never
// lock out someone already here). An existing slot rewrites only when something
// changed or it is REFRESH_AFTER stale. Both declining paths write zero rows.
export async function touchPresence(env, request, ctx, rec, now = Date.now()) {
  const db = dbOf(env);
  if (!db) return false;
  const nowSec = Math.floor(now / 1000);
  const slot = await slotFor(env, request, rec.id, now);

  if (beatenRecently(slot, nowSec) && !rec.force) return false;

  const cutoff = nowSec - TTL_SECONDS;
  try {
    await ensureSchema(db);
    const res = await db
      .prepare(
        `INSERT INTO presence (slot, id, tier, name, echo, born, seen)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
          WHERE (SELECT COUNT(*) FROM presence WHERE seen > ?8) < ?9
             OR EXISTS (SELECT 1 FROM presence WHERE slot = ?1)
         ON CONFLICT(slot) DO UPDATE SET
              id = excluded.id, tier = excluded.tier, name = excluded.name,
              echo = excluded.echo, born = excluded.born, seen = excluded.seen
          WHERE excluded.seen - presence.seen >= ?10
             OR presence.tier <> excluded.tier
             OR presence.echo <> excluded.echo
             OR presence.id <> excluded.id
             OR ifnull(presence.name, '') <> ifnull(excluded.name, '')`
      )
      .bind(
        slot,
        rec.id,
        rec.tier | 0,
        rec.name || null,
        rec.echo ? 1 : 0,
        rec.born | 0,
        nowSec,
        cutoff,
        MAX_LIVE,
        REFRESH_AFTER
      )
      .run();
    const wrote = !!(res && res.meta && res.meta.changes);
    // A write invalidates both cache layers, so a newcomer shows up to everyone
    // on the next build instead of waiting out the window. Only an actual write
    // pays for this, which is rare by construction — the guard above declines
    // most beats — so it costs nothing in the steady state.
    if (wrote) {
      memo = { at: 0, reals: null };
      const purge = (async () => {
        try {
          await caches.default.delete(await cacheKeyFor(request));
        } catch {}
      })();
      if (ctx && ctx.waitUntil) ctx.waitUntil(purge);
      else await purge;
    }
    return wrote;
  } catch {
    return false;
  }
}

// Drop expired rows. Deletes bill as rows written, so this never runs per-request:
// it is driven off the roster cache-miss path (see readReals) and rationed to one
// in every PRUNE_EVERY misses. Bounded by LIMIT so a huge backlog can't produce
// one enormous write.
const PRUNE_EVERY = 4;
let missCount = 0;

async function maybePrune(db, ctx, now) {
  if (missCount++ % PRUNE_EVERY !== 0) return;
  const nowSec = Math.floor(now / 1000);
  const job = (async () => {
    try {
      await db.batch([
        db
          .prepare(
            `DELETE FROM presence WHERE slot IN
               (SELECT slot FROM presence WHERE seen <= ?1 LIMIT 100)`
          )
          .bind(nowSec - TTL_SECONDS),
        // The dedupe ledger only needs today and yesterday.
        db
          .prepare(`DELETE FROM progress_seen WHERE day < ?1`)
          .bind(utcDay(now - 36 * 60 * 60 * 1000)),
      ]);
    } catch {
      // never surface storage trouble to a visitor
    }
  })();
  // Without waitUntil, await it rather than dropping it: skipping the prune
  // entirely would let expired rows accumulate against MAX_LIVE until dead
  // presences crowd out live ones. It is rationed to one in PRUNE_EVERY cache
  // misses, so paying for it inline costs a few milliseconds now and then.
  if (ctx && ctx.waitUntil) ctx.waitUntil(job);
  else await job;
}

// ---- progress: aggregate funnel counters -----------------------------------

// Server-side allowlist. A caller can only ever nudge one of these, so the
// progress table's cardinality is bounded by this list no matter what arrives.
export const MILESTONES = new Set([
  // the front door (ARG 1)
  "gate.opened",
  // /root/ (ARG 2)
  "root.entered",
  "root.claimed.cryptid",
  "root.claimed.tech",
  "root.named",
  "root.decoded",
  // the reckoning — an AI did the reading. Kept because it is a signal, not noise.
  "root.haunted",
  // Byte Cafe challenges
  "cafe.entered",
  "cafe.welcome-mat",
  "cafe.receipt-roll",
  "cafe.back-of-house",
  "cafe.daily-grind",
  "cafe.loyalty-card",
  "cafe.spilled-grounds",
  "cafe.hidden-roast",
  "cafe.cleared",
  // the gate, from the other side
  "claim.rejected",
]);

// Isolate-local record of milestones already settled, so a repeat report costs
// nothing at all — not even the ledger probe. Without this, a visitor beating
// every minute would send an INSERT OR IGNORE per milestone per beat: zero rows
// written, but a D1 round trip all the same, which is the exact per-request
// chatter this rewrite exists to remove.
const counted = new Set();
const COUNTED_MAX = 20000;

// Count a milestone once per slot per UTC day.
//
// Two dedupe layers. The isolate set above catches the common replay for free.
// Behind it, the INSERT OR IGNORE into the ledger is authoritative across
// isolates and colos: on a replay it writes zero rows and reports changes: 0, so
// the counter increment never runs. That is what makes these numbers
// non-inflatable — you cannot pump one by resending the request — and what bounds
// the write cost to "distinct visitors x milestones reached" rather than
// "requests received".
export async function countMilestone(env, request, ctx, milestone, now = Date.now()) {
  const db = dbOf(env);
  if (!db || !MILESTONES.has(milestone)) return false;
  const day = utcDay(now);
  try {
    await ensureSchema(db);
    const slot = await slotFor(env, request, milestone, now);
    const memoKey = `${day}:${milestone}:${slot}`;
    if (counted.has(memoKey)) return false;
    if (counted.size >= COUNTED_MAX) counted.clear();
    counted.add(memoKey);
    const claim = await db
      .prepare(`INSERT OR IGNORE INTO progress_seen (slot, day, milestone) VALUES (?1, ?2, ?3)`)
      .bind(slot, day, milestone)
      .run();
    if (!(claim && claim.meta && claim.meta.changes)) return false;
    await db
      .prepare(
        `INSERT INTO progress (day, milestone, n) VALUES (?1, ?2, 1)
         ON CONFLICT(day, milestone) DO UPDATE SET n = n + 1`
      )
      .bind(day, milestone)
      .run();
    return true;
  } catch {
    return false;
  }
}

// Aggregate counts for the last `days` UTC days. Operator-facing.
export async function readProgress(env, days = 14, now = Date.now()) {
  const db = dbOf(env);
  if (!db) return [];
  const from = utcDay(now - (days - 1) * 24 * 60 * 60 * 1000);
  try {
    await ensureSchema(db);
    const { results } = await db
      .prepare(
        `SELECT day, milestone, n FROM progress
          WHERE day >= ?1 ORDER BY day DESC, milestone ASC LIMIT 1000`
      )
      .bind(from)
      .all();
    return results || [];
  } catch {
    return [];
  }
}

// ---- a storage-free throttle for the endpoints that do no writes -----------
// /api/vigil/claim touches nothing, so it has no natural friction against a
// brute-force sweep. An isolate-local token bucket gives it some: Cloudflare
// pins a client to a colo, so in practice this catches the single-host hammer.
// It is deliberately NOT a security boundary — the real one is the WAF rate-limit
// rule documented in README.md. It costs no storage and cannot itself be abused.

const buckets = new Map();
const BUCKET_MAX = 5000;

export function allow(request, bucket, limit, windowMs, now = Date.now()) {
  const ip = (request && request.headers.get("cf-connecting-ip")) || "local";
  const key = `${bucket}:${ip}`;
  if (buckets.size >= BUCKET_MAX) buckets.clear();
  const b = buckets.get(key);
  if (!b || now - b.at >= windowMs) {
    buckets.set(key, { at: now, n: 1 });
    return true;
  }
  b.n += 1;
  return b.n <= limit;
}
