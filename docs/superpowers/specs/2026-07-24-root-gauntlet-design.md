# The /root gauntlet — a harder five-gate chain (2026-07-24)

## Problem

`/root`'s real solve trail is only ~3 hops deep (HTML-comment breadcrumb → `check-in.json`
→ `alg:none` JWT → `dig TXT _rabbit.comeandget.us`), and most of it is spoon-fed in plain
text that pastes straight into an LLM. We want the **pieces in between** to be genuinely
harder — a 5-gate chain that filters for a strong engineer in a focused session — while the
**prize and everything that delivers it stay byte-for-byte fixed**: the `_rabbit` DNS record,
its riddle, the final subject answer, and the external sieve auto-reply are untouched.

Calibration (approved):
- **Audience:** vetting specific candidates (a pre-interview filter). A strong operator
  should finish in one focused sitting; casual visitors and paste-into-an-LLM shortcuts
  should hard-stop.
- **Depth:** 5–6 gates between landing on `/root` and the fixed DNS terminal.
- **Difficulty texture:** deeper crypto/stego + OSINT/lateral + a multi-gate chain +
  adversarial (anti-AI) properties, combined.
- **Telemetry:** hybrid — exact per-gate **KV counters** (unique solvers) + Cloudflare
  **DNS analytics** for the lookup stage. No new client beacons, no CSP change.

## Fixed constraints (never touched by this work)

- The `_rabbit.comeandget.us` TXT record, the riddle it carries, and the riddle's answer.
- The final action: email `please@comeandget.us` with the answer in the subject line.
- The external sieve that auto-replies. No email-side change of any kind.
- The CI leak-guard stays green: no puzzle answer ever ships (the answer lives only in DNS
  / env, never in the repo).

## Core design rule — instrument-by-design

**Each gate advances only by fetching an artifact whose path is derived (by hash) from
solving the previous gate.** Consequences:

- Paths cannot be enumerated ahead of a solve, so scanners/bots cannot skip gates.
- A fetch of a gate-N artifact is *proof the solver cleared gate N-1* — so the funnel is a
  natural byproduct of the mechanics, not bolted-on surveillance.
- The telemetry (Layer 6) simply counts these fetches, deduped per solver.

## The chain

Narrative frame: you have walked into a compromised M365 / Intune tenant and must
reconstruct the attacker's exfiltration channel, one real technique at a time.

### G1 — the wire (network forensics; anti-AI)

The honest first breadcrumb moves **out of the HTML comment** — the comment stays as pure
AI/scanner bait and continues to be rewritten to `smokesign` for self-declared AI crawlers.
The real breadcrumb ships as a **custom response header** on the `/root/` document:

```
X-Intune-Checkin: <hex>
```

`<hex>` decodes to an instruction to fetch `check-in.json` and "mind the alg." Visible only
in DevTools → Network, `curl -I`, or a proxy — invisible to anyone pasting rendered HTML or
view-source into a model.

- **Artifact / signal:** fetch of `/root/check-in.json` → funnel counter `g1`.
- **Alternative considered:** `Server-Timing` header. Rejected — a bespoke `X-Intune-*`
  header reads as authentic tenant telemetry and matches the `/cafe` `X-Cafe-Receipt` idiom.

### G2 — the unsigned token (auth/JWT knowledge)

Keep the `alg:none` JWT in `check-in.json`, but it no longer names the DNS record in plain
text. A claim in the decoded payload yields a **derived introspection path** the solver must
compute and fetch:

```
/root/.well-known/<sha256(claim-value)[:16]>.json
```

Fetching that path returns the G3 pointer. Only someone who actually decoded the token and
computed the hash can reach it.

- **Artifact / signal:** fetch of the introspection JSON → funnel counter `g2`.

### G3 — the shape in the noise (binary / steganography)

The introspection artifact points to an **unreferenced binary asset** — a "device
compliance screenshot" PNG under `/root/`. The real payload is hidden in a PNG `tEXt`/`zTXt`
chunk; a **decoy LSB payload** is also present and, if grabbed and submitted, brands the
solver via the existing reckoning (a lazy tell). Solving needs real tooling (`binwalk`,
`exiftool`, `strings`, `zsteg`, or a few lines of script).

The extracted chunk yields **one key fragment** (for G4) plus the pointer to the sealed
instruction artifact.

- **Artifact / signal:** fetch of the PNG → funnel counter `g3`.
- **Alternative considered:** appended-ZIP polyglot. Kept as a fallback; `tEXt`/`zTXt` is
  cleaner to author deterministically and to test.

### G4 — assembling the key (crypto + patience)

A **sealed instruction artifact**: AES-GCM ciphertext (base64) served from `/root/`. The key
is **assembled from four scattered fragments**, concatenated in a specified order, then
SHA-256'd into the 256-bit key:

1. a claim value from the G2 JWT,
2. the `tEXt` chunk fragment from the G3 PNG,
3. a token embedded in the G1 response header,
4. **a fragment published in DNS** — `dig TXT _shard.comeandget.us` (new record; see
   Ops below). This forces off-box OSINT and keeps part of the solution off-repo.

Decryption is available offline (`openssl`/script) or via a new shell verb (`unseal`). The
plaintext is the **final derived path** (proof-of-decrypt) which the solver fetches.

- **Cipher choice:** AES-256-GCM via WebCrypto (already used by the mirror; CSP-clean).
  Chosen over the site's lighter Vigenère because a vetting filter wants a real primitive
  that can't be partially/casually cracked and that fails closed on a wrong key.
- **Artifact / signal:** fetch of the final derived path → funnel counter `g4`.

### G5 — the exfil channel (OSINT / DNS) — FIXED

The decrypted plaintext is the **original, untouched instruction**: `dig TXT
_rabbit.comeandget.us` → decode the record → answer the riddle in the subject line to
`please@comeandget.us`. This is the fixed terminal; nothing here changes.

- **Signal:** Cloudflare **DNS analytics** — TXT query volume for `_rabbit` (and `_shard`).
  This stage has no HTTP fetch, so it is measured at the DNS layer, not via KV.

### Prize — FIXED

Email `please@comeandget.us` with the riddle answer in the subject → the external sieve
auto-replies. No change.

## Counter-intel layer — kept and extended

Everything already built stays: the `emberline` / `ashfall` / `cinderkey` / `smokesign`
counter-signs, the `cg.haunt` reckoning and its tiers, the AI-crawler cloaking middleware,
and the reflection/mirror dossier. Extensions:

- G1's header move makes the HTML "operator note" comment a **pure honeypot** (the lie no
  longer competes with the real path — it *is* the AI trap).
- G3 ships a **decoy LSB payload** so naive stego-scanners self-brand.
- The reckoning **tier is surfaced to the tracker** (Layer 6) so the AI-shortcut rate is
  *measured*, not only theatrically punished. It rides the existing self-branding channel
  (the beat's `e` mark), extended to carry the tier — same trust model (an id may only mark
  its own record).

## Layer 6 — telemetry (hybrid KV + DNS)

A **funnel middleware** (extending `functions/root/_middleware.js`, or a sibling scoped
middleware) recognizes the derived gate-artifact paths. On a matching fetch it:

1. attributes the hit to a solver via the existing **`fpc` cookie / mirror sigil**;
2. bumps a per-gate KV counter **once per unique solver** — keys `f:g1`…`f:g4` in the
   existing `PRESENCE` namespace, storing `{count, firstSeen, lastSeen}`, plus a
   per-(gate,solver) marker with TTL so a solver is counted once per gate;
3. records the timestamp so **time-to-solve** (median gap between gates) is derivable.

Budget: ~1 tiny KV write per solver per gate — negligible at vetting volume, well under the
free-tier write cap. No PII is stored (only a salted one-way sigil-derived key). No CSP
change; no new client beacon.

G5 is read from **`dnsAnalyticsAdaptiveGroups`** (TXT queries for `_rabbit`/`_shard`).

## comeandget-tracker enhancements

Extend the local dashboard (`server.mjs` + `public/index.html`) with a **/root gauntlet
view**:

- **Per-gate funnel & drop-off** — unique solvers G1→G5 with drop-off %, from the new `f:*`
  KV keys (the tracker already reads `PRESENCE` KV).
- **AI-shortcut / cheat rate** — canary-tier distribution, from the reckoning tier now
  written to KV.
- **Time-to-solve / velocity** — median gap between gates per solver.
- **Operator-method fingerprint** — curl/dig/devtools vs GUI-only, from the mirror's
  edge/UA/JA3 data.
- New GraphQL query: `dnsAnalyticsAdaptiveGroups` for `_rabbit`/`_shard`.
  - **Scope note:** the tracker's Cloudflare token must have **DNS-analytics read**; today
    it may be analytics-only. Flag/verify before wiring this panel; degrade gracefully if
    absent (the KV funnel stands alone).

## Ops (outside the repo — user actions)

- Add DNS TXT record `_shard.comeandget.us` carrying key fragment #4. (`_rabbit` unchanged.)
  Managed via the Cloudflare dashboard/API — not committed to the repo.
- If the DNS-analytics panel is wanted, ensure the tracker token has the DNS-analytics read
  scope.

## Invariants

- The `_rabbit` record, its riddle, the final subject answer, and the sieve are untouched.
- No puzzle answer ships; the CI leak-guard stays green.
- The real solve path is never blocked, delayed, or gated by the telemetry or the mirror.
- Screen-reader users never encounter a decoy (`display:none` decoys stay out of the AX tree;
  the new binary/stego/header gates are invisible to assistive tech by nature).
- Every probe / edge field / KV op degrades to omission — nothing 500s on thin `cf`, absent
  Bot Management, cleared storage, or local `wrangler dev`.
- CSP unchanged (`connect-src 'self'` already covers every same-origin fetch).
- KV write budget stays safe (dedup-per-solver counters).

## Build & rollout

1. This spec → committed.
2. **Confluence** project-hub page (CGU space) + **CGU Jira** issues: an epic plus one issue
   per gate (G1–G4), the telemetry middleware, the tracker enhancements, and preview/QA.
3. TDD each gate against `tests/` (the existing smoke/mirror suites are the pattern).
4. Deploy the feature branch to a **Cloudflare Pages preview URL**
   (`wrangler pages deploy --branch <feat>`); walk the whole chain end-to-end there.
5. Only after sign-off on the preview → merge to `main`.

## Tests (tests/*.spec.js)

- G1: `/root/` response carries `X-Intune-Checkin`; the header decodes to the check-in
  pointer; the HTML comment is still cloaked to `smokesign` for AI UAs.
- G2: decoding the shipped `alg:none` JWT + hashing the claim yields the introspection path;
  that path serves the G3 pointer; a wrong claim 404s / benign-200s.
- G3: the PNG carries the real `tEXt` chunk fragment; the decoy LSB payload is present and
  distinct; extracting the real fragment yields the sealed-artifact pointer.
- G4: concatenating the four fragments in order → SHA-256 → AES-GCM decrypt succeeds and
  yields the final derived path; a wrong/partial key fails closed (no plaintext).
- G5: the decrypted plaintext equals the fixed instruction string
  (`dig TXT _rabbit.comeandget.us` … `please@comeandget.us`) — asserted without shipping any
  answer.
- Telemetry: fetching each gate artifact bumps its `f:*` KV counter once per solver;
  repeated fetches by the same solver do not double-count; malformed input never 500s.
- Reckoning tier reaches KV via the extended `e` channel; any other shape is dropped.
- Existing leak-guard, AI-cloak, mirror, and reckoning tests remain green.

## Out of scope (forever)

Front door (`site/`) and `/cafe` are untouched. The `_rabbit` terminal, the riddle, and the
sieve are untouched. No new KV namespace, no new client-side beacon, no CSP change, no WebRTC
or Battery probes.
