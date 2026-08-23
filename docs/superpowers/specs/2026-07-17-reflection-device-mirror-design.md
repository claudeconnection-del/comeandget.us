# The Reflection: a device-posture mirror for /root (2026-07-17)

## Problem

`/root` is an M365/Intune honeypot terminal that *fakes* device readouts — `dsregcmd`,
`systeminfo` ("NEO-WS01 — Windows 11 Pro 23H2"), `get-mgdevice` ("Intune managed ·
compliance: noncompliant"). We want to invert that: alongside the honeypot's fake
identity, surface cryptic **real** details about the visitor's own machine, gathered by
alternative (permission-free) fingerprinting. Ambient at first, building to a single
"we see you" dossier framed as an Intune device-compliance report. Purely atmospheric —
it runs *parallel* to the three-proofs solve, never gates or alters it, and reflects the
visitor's own request data back to the visitor on our own origin (no third parties; CSP
`connect-src 'self'` already forbids off-origin exfiltration).

## Principles

- **Reflect-to-self.** Everything shown is the visitor's own machine/request, shown back
  to them. No cross-site tracking, no LAN reach, no data leaves the origin.
- **Derive, don't hoard.** Identity is *recomputed* from a stable fingerprint every visit,
  not stashed in redundant storage vectors. Clearing storage erases nothing — the arithmetic
  still has the same accent — so "you cleared your cookies, we still knew you" is achieved by
  recognition, not by an evercookie fighting the delete button.
- **Cookieless-first.** One disguised cookie exists, wearing a costume; everything else is
  `localStorage` + an HTTP-cache channel + server KV.
- **Orthogonal to the puzzle.** The mirror reads/writes only its own `cg.mirror.*` state;
  it never touches the gate, the ritual, or the reckoning's `cg.haunt`.
- **Degrade silently.** Any probe may throw; any edge field may be absent (bare `pages.dev`,
  local `wrangler dev`, no Bot Management). Nothing 500s; missing signals are simply omitted.

## Layer 1 — the probe roster (client)

Each probe is isolated (`() => {key, value, osHint?}`) and try/caught so one failure never
breaks the shell. Full approved roster, **WebRTC and Battery deliberately excluded** (external
STUN dependency / LAN reach; deprecated-and-gated, respectively):

- **OS / arch accent** — libm/`Math` last-digit quirks (`tan`,`sinh`,`acosh`,`expm1` →
  glibc/musl/Windows/Apple libm); UA-CH high-entropy (`getHighEntropyValues`: platform,
  platformVersion → Win 10 vs 11, architecture, bitness, model); emoji/glyph canvas raster
  (Apple vs Segoe vs Noto → OS).
- **GPU / display** — WebGL `WEBGL_debug_renderer_info` (GPU + ANGLE backend: D3D11⇒Windows,
  Metal⇒mac); canvas-2D text hash; screen dims, DPR, color depth, `color-gamut`, HDR
  `dynamic-range`.
- **Hardware / env** — `hardwareConcurrency`, `deviceMemory`, `maxTouchPoints`, pointer/hover
  media; `storage.estimate()`; `navigator.connection`; `Intl` timezone + calendar + numbering;
  `navigator.languages`; OS theme/a11y (`prefers-color-scheme`, `reduced-motion`, `contrast`,
  `forced-colors`).
- **Engine / behavioral** — error-stack / engine quirks (V8 vs SpiderMonkey vs JSC);
  `OfflineAudioContext` DSP hash (no permission, no output); `performance.now()` resolution.

## Layer 2 — the derived sigil (identity)

`sigil.js` selects only the **stable** subset (libm signature, WebGL renderer, canvas hash,
timezone, core count, gamut), concatenates, and hashes to one SHA-256 sigil via
`crypto.subtle`. Recomputed every visit; **stored nowhere as identity.** This is the whole of
the resilience — recognition by recomputation. Mutable history (visit count, last-seen
fingerprint for the spoof delta) lives in the corroboration channels below.

## Layer 3 — recognition & the disguised cookie

Primary recognition is the derived sigil → server KV. Three **corroboration** channels handle
sigil drift (a browser update nudging one probe) and cross-profile/incognito recognition; any
subset present strengthens "we know you," none is required:

- `localStorage cg.mirror.seen` → `{count, lastDelta}`.
- **`fpc` cookie** — the cheeky costume: `fpc` is *literally* Microsoft's own "fingerprint
  cookie" name, so it reads as a bog-standard M365 auth artifact in DevTools. Value is an HMAC
  blob encoding `sigilHash + firstSeen`. Set server-side: `Secure; HttpOnly; SameSite=Lax;
  Path=/root; Max-Age=7776000` (90 d). HttpOnly because the client derives identity
  independently and never needs to read it — more authentic, server-only.
- **ETag / `If-None-Match` channel** — `GET /api/mirror/echo` returns a tiny cacheable body
  with `ETag: "<opaque token>"` and `Cache-Control: no-cache`; the browser revalidates on
  return, handing the token back at the HTTP layer with no cookie or JS storage involved. The
  sneaky cookieless leg.
- **Server KV** — key `m:` + `base64url(HMAC(SIGN_KEY, sigil)).slice(0,32)` → `{firstSeen,
  count, deltaSummary}`, `expirationTtl` 90 d. Reuses the existing `PRESENCE` binding and
  `SIGN_KEY` secret — no new binding, no new secret, only a salted one-way hash retained.

## Layer 4 — edge cross-check (the honeypot payoff)

`POST /api/mirror` is the brain. Body carries `{sigil, os, tz, langs, …}` (client-derived).
Server reads `request.cf` (country, city, ASN/`asOrganization`, `httpProtocol`, `tlsVersion`,
`tlsCipher`, `clientTcpRtt`), parsed `User-Agent` / `Sec-CH-UA` / `Accept-Language`, and
JA3/JA4 **iff `request.cf.botManagement?.ja3Hash` exists** (feature-detected; falls back to
TLS-version+cipher+protocol as a coarse client-stack signal otherwise). It computes the
**deltas** — the material that makes the dossier land:

- claimed-OS (UA / `Sec-CH-UA-Platform`) vs derived-OS (libm + WebGL backend + emoji raster)
- `Intl` timezone vs edge country/timezone
- `Accept-Language` header vs `navigator.languages`
- "not-a-browser" tell (JA3/`navigator.webdriver`/headless CH) — surfaced *knowingly, not
  punitively*: tier-3 solvers legitimately probe with curl.

Then updates KV, sets the `fpc` cookie + ETag, returns `{edge, deltas, seen}`.

## Layer 5 — experience (ambient → dossier)

`createMirror({ println, run, vigil, flare })` is created in `agent.js` after `initTerminal`
returns `{ println, run }`. It renders **only** through the terminal's `println` (text nodes —
the same XSS-safe path all shell output uses); no new DOM container.

- **Ambient** — occasional MDM/telemetry notices printed into the shell, e.g.
  `[intune] posture sync — your arithmetic has a redmond accent`.
- **Dossier** — an Intune-style device-compliance report. Trips on **whichever comes first**:
  enough accreted notices in a session, *or* a recognized return (KV/cookie/ETag/`cg.mirror`
  says `count > 1`). Also pullable on demand via **`dsregcmd /status`** — the canonical
  Entra/Intune device-registration command an admin actually types; bare `dsregcmd` keeps its
  existing canned honeypot fake, the real `/status` flag pulls the true posture. Parallel to
  the solve; never a gate.
- **Voice** — terminal-dry, Microsoft-honeypot-flavored, quietly menacing:
  - `[intune] enrolled device posture: your handshake says linux. your papers say windows. the tenant believes the handshake.`
  - `compliance: noncompliant — not the device's. yours. we can see the machine you actually came on.`
  - return: `NEO-WS01 checked in. so did you — again. we kept your shape from last time. it hasn't changed.`
  - curl/JA3: `you came by curl. we kept your handshake anyway. it's a nice one.`

`?mirror=now` forces the dossier immediately (tests / debug).

## Module layout

```
site/root/js/mirror/
  probes.js   # the roster; each probe isolated & try/caught
  sigil.js    # stable-subset selection + SHA-256 derived sigil
  lines.js    # findings → cryptic Intune/telemetry-register lines
  dossier.js  # assembles + prints the device-posture report via println
site/root/js/mirror.js         # createMirror({ println, run, vigil, flare }) orchestrator
functions/api/mirror/echo.js   # GET  — cookieless ETag / If-None-Match channel
functions/api/mirror/index.js  # POST — edge cross-check + KV memory + fpc cookie
```
`agent.js` gains the `createMirror(...)` wiring; `shell.js` gains the `dsregcmd /status`
branch. Nothing else in `/root` changes; `/api/mirror/*` sits outside the `/root/*` AI-cloak
middleware, so the two never interact.

## Privacy / safety posture

- Same-origin only; CSP unchanged (`connect-src 'self'` already covers the POST; canvas/WebGL/
  audio/Intl touch no network). No CSP edit needed.
- KV retains only a salted one-way hash + counters, TTL 90 d. The one cookie is first-party,
  HMAC'd, HttpOnly, TTL'd. No third parties, no cross-site anything, no LAN reach, no prompts.
- No puzzle content in the dossier — only the visitor's own machine facts. The CI leak-guard
  stays green (no answer strings introduced).

## Invariants

- The real solve path is never blocked, delayed, or altered; the mirror touches no gate/
  ritual/`cg.haunt` state.
- Every probe and every edge field degrades to omission; `/api/mirror/*` never 500s when
  `cf`/JA3/KV are thin (local dev, bare `pages.dev`).
- Output is text-node only (no innerHTML); typed input can never reach the mirror as markup.
- `curl`/devtools solvers are recognized but never punished — the "not-a-browser" line is
  knowing flavor, not an obstacle.

## Tests (tests/smoke.spec.js)

- `/root` loads, the shell still answers, the mirror never throws into it.
- `?mirror=now` → the device-posture dossier prints in `#term`.
- `dsregcmd /status` → real posture; bare `dsregcmd` → unchanged canned fake.
- `POST /api/mirror` with a thin/absent `cf` (local dev) → clean 200, no 500, deltas omitted
  gracefully; JA3 absent → TLS-fallback path taken.
- Returning visit (seeded `cg.mirror.seen`) → recognition line / dossier trips.
- Existing leak-guard, AI-cloak, and reckoning tests remain green.

## Out of scope (forever)

Front door (`site/`) and `/cafe` are untouched. No WebRTC, no Battery API. No new KV namespace,
no new secret, no CSP change.
