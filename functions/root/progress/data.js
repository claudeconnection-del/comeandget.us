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
