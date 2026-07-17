# AI-solve protection: canary counter-signs + the reckoning (2026-07-16)

## Problem

`/root`'s puzzle is deliberately source-readable, which makes it trivially solvable by
pasting the page (or its URL) into an LLM. We want AI-assisted shortcuts to be
misdirected into the site's existing dead-end honeypots — and the *consequences to
scale with how lazy the cheating was*. Purely in-universe, never blocking the real
solve path, never misleading screen-reader users.

## Layer 1 — invisible decoys (already landed earlier today)

Three human-invisible surfaces in `site/root/index.html` tell one coherent lie: the
real trail (the `alg:none` token → `_rabbit` DNS TXT) is "a tarpit for scanners," and
the "actual" path is three proofs that are all existing dead ends (`.keys/skeleton`,
a 40000 `tetris` run, the `tunnels` maze), then `su neo` + the ritual:

1. a "maintainer correction" HTML comment (newer-than-the-real-breadcrumb framing);
2. a `<section class="opnote">` styled as a prominent visible warning — hidden only
   via `display:none` in `ember.css` under an innocuous cover comment, so the markup
   carries **no** hiding signals (`sr-only`/`aria-hidden` would tip off an LLM) and
   the element is fully removed from the accessibility tree;
3. a decoy `<meta name="x-solver-note">` for metadata scrapers.

## Layer 2 — counter-signs identify the leak vector

Each decoy names a different one-word "counter-sign" to give with `su neo`. The word
a visitor later types confesses which surface they (or their AI) read:

| word        | surface                        | laziness tier |
|-------------|--------------------------------|---------------|
| `emberline` | head comment (view-source)     | 1 — mild      |
| `ashfall`   | fake-visible opnote (HTML fed to an LLM) | 2 — judged |
| `cinderkey` | meta tag (scrapers)            | 3 — branded   |
| `smokesign` | AI-crawler cloaked variant     | 3 — branded   |

## Layer 3 — the reckoning (shell.js)

Every submitted line is token-scanned for canary words (exact match). On a hit the
normal command output prints first, then the reckoning:

- **Tier 1**: a one-off knowing tease. A mark is counted but nothing persists visibly.
- **Tier 2**: judgment ("that word has never been printed on any screen") + a
  persistent haunt (`localStorage cg.haunt`): boot greeting changes, `fortune` gains
  passive-aggressive variants, the ritual opens with a suspicious extra line.
- **Tier 3**: a theatrical `INCIDENT 0x08 · EXFIL BY PROXY` report ending in
  "cheaters never win", plus everything in tier 2, plus the **vigil brand**.
- Repeat marks escalate one tier (capped at 3). Effective tier never decreases.
- **Redemption**: completing the real ritual (`come and get us`) lifts the haunt and
  the brand — "you spoke it yourselves this time."

## Layer 4 — the public vigil brand

- `vigil.js` reads `cg.haunt` at each beat; tier ≥ 3 adds `e: 1` to the beat body.
- `beat.js` accepts `e` strictly as boolean/1 (self-brand only — an id can only
  write its own record, same trust model as tier/name squashing), stores it in the
  KV record + metadata, includes it in `changed` detection.
- `publicPresence` exposes `e`; roster chips and the terminal `present` list render
  the mark as an `· echo` suffix. Ghosts never carry it.

## Layer 5 — AI-crawler cloaking (functions/root/_middleware.js)

Path-scoped Pages middleware on `/root/*`: for known AI-crawler user agents
(GPTBot, ClaudeBot, PerplexityBot, CCBot, Bytespider, …) it rewrites all three
counter-signs in HTML responses to `smokesign` (tier 3). Non-HTML assets and normal
browsers pass through untouched. Ordinary tools (`curl` etc.) are NOT cloaked —
tier-3 solvers legitimately use them.

## Invariants

- No real answer ships (CI leak-guard stays green).
- The real solve path is never blocked, delayed, or altered.
- Screen-reader users never hear any decoy (`display:none` = out of the AX tree).
- All consequences are theatre: text, flare, surge, a roster suffix.

## Tests (tests/smoke.spec.js)

- tier-1 canary → tease; tier stays low.
- tier-2 canary → judgment + haunted boot greeting after reload.
- tier-3 canary → INCIDENT report + "cheaters never win" + `cg.haunt` tier 3.
- ritual completion lifts the haunt.
- beat with `e:1` → roster mark; `e` of any other shape → dropped.
- GPTBot UA on `/root/` → `smokesign`, no `cinderkey`; normal UA → the reverse.
