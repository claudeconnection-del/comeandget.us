-- The vigil's storage. D1 (SQLite), not KV — see the note in _store.js for why.
--
-- Every table is WITHOUT ROWID with the primary key doing the work. That is not
-- a micro-optimisation: D1 bills "rows written", and an ordinary rowid table
-- with a TEXT PRIMARY KEY writes TWO rows per upsert (one to the table, one to
-- the implicit PK index). WITHOUT ROWID makes the key the table, so an upsert
-- writes exactly one row. It halves the only quota this feature can realistically
-- exhaust.
--
-- Apply it with:
--   npx wrangler d1 execute comeandget-us-vigil --remote --file=functions/api/vigil/schema.sql
-- It is idempotent (every statement is IF NOT EXISTS), so re-running is safe.
-- The Functions also self-provision these tables on cold start, so `wrangler
-- pages dev` and CI need no migration step.

-- ---------------------------------------------------------------- presence --
-- One row per live presence. `slot` is derived server-side from the caller's IP
-- (HMAC'd, salted per UTC day) and is NEVER client-chosen — that single property
-- is what makes row-flooding structurally impossible rather than merely
-- rate-limited. `id` is the visitor's own decodable proof-of-life payload: it
-- rides along as display data, but it is not the key, so nobody can claim or
-- overwrite anybody else's record by guessing an id.
CREATE TABLE IF NOT EXISTS presence (
  slot TEXT PRIMARY KEY,           -- hmac(day, ip) + ":" + lane   (server-derived)
  id   TEXT NOT NULL,              -- the living payload the roster displays
  tier INTEGER NOT NULL DEFAULT 0, -- 0 unclaimed, 1 cryptid/ARG1, 2 tech/ARG2
  name TEXT,                       -- sanitized, solvers only
  echo INTEGER NOT NULL DEFAULT 0, -- the reckoning's brand
  born INTEGER NOT NULL,           -- epoch seconds, from the id payload
  seen INTEGER NOT NULL            -- epoch seconds, last refresh
) WITHOUT ROWID;

-- ---------------------------------------------------------------- progress --
-- Aggregate funnel counters — how far visitors get, never who they are. One row
-- per (UTC day, milestone), so cardinality is bounded by the milestone allowlist
-- in _store.js no matter how much traffic arrives.
CREATE TABLE IF NOT EXISTS progress (
  day       TEXT NOT NULL,           -- "YYYY-MM-DD" (UTC)
  milestone TEXT NOT NULL,           -- from the server-side allowlist only
  n         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, milestone)
) WITHOUT ROWID;

-- Dedupe ledger: a milestone counts once per slot per day. The repeat path is an
-- INSERT OR IGNORE that writes ZERO rows, which is what makes the counters
-- non-inflatable (you cannot pump a number by replaying the request) and what
-- bounds the write cost to "distinct visitors x milestones reached", not
-- "requests received".
CREATE TABLE IF NOT EXISTS progress_seen (
  slot      TEXT NOT NULL,
  day       TEXT NOT NULL,
  milestone TEXT NOT NULL,
  PRIMARY KEY (slot, day, milestone)
) WITHOUT ROWID;
