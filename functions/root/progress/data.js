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

import { summarize, reconcile, fromRollup, ARRIVAL_KEY, RUNGS } from "../_progress.js";
import { verifySid } from "../_funnel.js";

const PREFIX = "fs:";        // never "f:" — that would sweep the rollup key in
const ROLLUP_KEY = "f:rollup";
const PAGE = 1000;           // KV list page size
const MAX_KEYS = 10000;      // hard cap; if we hit it we say so rather than lie
const BATCH = 16;            // concurrent value reads
const REFRESH_SECONDS = 600; // how often a real listing is spent (~144/day worst case)

// Tests and local dev set this to 0 so a walk is reflected immediately; production
// leaves it unset and gets the interval above.
const refreshAfter = (env) => {
  const n = Number(env && env.PROGRESS_REFRESH_SECONDS);
  return Number.isFinite(n) && n >= 0 ? n : REFRESH_SECONDS;
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // the payload carries the viewer's own position, so it is never shared
  "cache-control": "private, max-age=30",
  vary: "Cookie",
};

const reply = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: JSON_HEADERS });

// Two different unreachable states, kept apart on purpose. "not-configured" is a
// deployment problem that will never fix itself; "read-failed" is transient and
// worth retrying. Both render as "unreachable" on the page — neither ever carries
// a counts object, so no client can paint an outage as zeroes — but an operator
// reading the JSON can tell which one they have without production log access.
const unavailable = (reason, err) =>
  reply({
    ok: false,
    reason,
    ...(err ? { detail: `${err.name || "Error"}: ${String(err.message || err).slice(0, 160)}` } : {}),
  });

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
  if (!KV) return unavailable("not-configured");

  const now = Math.floor(Date.now() / 1000);

  // The rollup first, because it is a get and gets are effectively free. A full
  // listing is NOT: KV allows a fixed number of list() operations per day and the
  // roster already spends most of them. Listing once per page view would put the
  // board in competition with the site's own presence feature for a shared budget
  // — so the board reconciles on an interval and serves the durable counts between
  // times. They are real counts either way; only their freshness differs.
  const stored = await KV.get(ROLLUP_KEY, "json").catch(() => null);
  const staleFor = now - (Number(stored && stored.updated) || 0);
  const wantsRefresh = !stored || staleFor >= refreshAfter(env);

  const you = await viewerPosition(KV, request, env.SIGN_KEY);

  if (wantsRefresh) {
    try {
      const { keys, truncated } = await listAll(KV);
      const records = await loadRecords(KV, keys);
      const { summary, rollup, changed } = reconcile(summarize(records, { now }), stored);

      // High-water only. max() is monotonic, so concurrent writers converge and a
      // dropped write is repaired by the next refresh. Always restamp `updated`,
      // even when nothing moved, or an idle board would re-list on every view.
      context.waitUntil(
        KV.put(ROLLUP_KEY, JSON.stringify({ ...rollup, updated: now })).catch(() => {})
      );
      void changed;

      return reply({ ok: true, asOf: now, stale: false, truncated, you, ...summary });
    } catch (err) {
      // The listing failed — usually the daily list budget. Fall back to the last
      // durable counts rather than showing nothing: they are true, just older.
      const fallback = fromRollup(stored);
      if (!fallback) return unavailable("read-failed", err);
      return reply({
        ok: true,
        asOf: Number(stored.updated) || null,
        stale: true,
        truncated: false,
        you,
        ...fallback,
      });
    }
  }

  const summary = fromRollup(stored);
  if (!summary) return unavailable("read-failed", new Error("rollup unreadable"));
  return reply({
    ok: true,
    asOf: Number(stored.updated) || null,
    stale: true,
    truncated: false,
    you,
    ...summary,
  });
}
