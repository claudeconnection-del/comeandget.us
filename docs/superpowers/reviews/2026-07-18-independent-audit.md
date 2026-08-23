# Independent audit — CI/leak-proof/stability hardening (2026-07-18)

Branch: `feat/reflection-device-mirror`, HEAD `1256808` (3 commits ahead of
`origin/feat/reflection-device-mirror`, working tree clean at audit time).
Scope: independently re-verify the hardening diff (`3ada721..1256808`) and
fact-check `docs/superpowers/reviews/2026-07-18-reflection-ci-leak-audit.md`.
Nothing was edited or committed during this audit. Priorities held: (1)
secrecy/puzzle integrity, (2) least-invasive atmosphere, (3) reliability/speed.

## 1. Leak-clean re-verification — PASS

Re-ran all three reusable sweep scripts from scratch, independently of the prior
agent's run, plus the guard tests themselves:

- `leaksweep2.mjs` (precise needles: exact answer phrases/first-words from
  `secret/answer.txt`, the exact `msg=` base64 payload and its decoded text from
  `secret/arg2-tech.md`, and specific riddle phrases) over all `git ls-files` →
  **0 hits** on any ANSWER or riddle-phrase/base64 needle. The only 3 hits were
  on two unrelated "flavor" sanity-check strings (public Mothman/Point-Pleasant
  trivia used as atmosphere in `README.md`/`site/index.html`/`shell.js`), not the
  protected riddle material.
- `leaksweep3.mjs` (decodes every base64/base64url/hex blob actually present in
  shipped `site/` files, incl. one level of nesting, and re-scans the decoded
  text) → 297 blobs decoded, **0 hits**.
- `leaksweep.mjs` (broad heuristic: treats any 12+ char run in `arg2-tech.md` and
  any 6+ char quoted string in `cafe-flags.mjs` as a needle) reported 69 "hits" —
  verified these are false positives from overly generic needles, e.g. needle
  values turned out to be `localstorage`, `noncompliant`, `prefers-reduced-motion`,
  `welcome-mat`, `).tostring(` — common code/CSS tokens, not secret material. Zero
  of its hits were in the `ANSWER` category (0 answer-needle hits, consistent with
  `leaksweep2`).
- Directly ran the guard tests themselves (armed locally via `secret/answer.txt`):
  `tests/smoke.spec.js -g "no puzzle answer"` → **2/2 passed** (DOM/shipped-file
  scan and full tracked-file scan, the latter covering `docs/` too — including the
  new audit doc, which itself contains no answer, only abstract descriptions).

**Conclusion: tree is leak-clean, plaintext and encoded, confirmed independently.**

## 2. Fail-closed leak guard — PASS

`tests/smoke.spec.js:42-50` (`leakGuardArmedOrSkip`) and its three call sites
(lines 185, 205, 595 — DOM/shipped-file guard, tracked-file guard, name-sanitization
guard) all route through the same function. Built an isolated replica of the exact
logic and exercised all four branches without touching any repo file:

| case | result |
|---|---|
| armed + CI | returns `false` (runs, never skips) |
| armed + local | returns `false` (runs, never skips) |
| **unarmed + CI** | **throws** `"LEAK GUARD UNARMED IN CI…"` |
| unarmed + local | returns `true` (dev-convenience skip) |

Because the throw happens inside the test body (as the argument to `test.skip`,
evaluated eagerly before the skip decision), an unarmed-in-CI run fails that test
rather than silently skipping it — so CI goes red, not green, and the `deploy` job
(`needs: ci`) never runs. This closes the exact false-green hole the audit doc
describes.

`.github/workflows/deploy.yml:42-43` writes a throwaway `.dev.vars` with a
timestamped `SIGN_KEY` before `npm test` (line 44), and lines 47-50 document
`PUZZLE_ANSWER` as REQUIRED. Confirmed via `gh secret list` that `PUZZLE_ANSWER`
is **already configured** as a repo secret (set 2026-06-27), so the next CI run
will actually exercise the guard rather than immediately going red on a missing
secret — the hardening doesn't introduce an operational surprise.

## 3. Fail-soft `/api/mirror` — PASS

`functions/api/mirror/index.js:100-104`: bad JSON and non-hex sigil both return
`benign()` → `json({...}, 200)` with no extra headers (confirmed against the
shared `json()` helper in `_lib.js:55-58`, which defaults to status 200 and only
sets `content-type` unless extra headers are passed — so no `Set-Cookie` is ever
minted for junk). The success path (valid sigil) is unchanged in substance; the
only structural change is hoisting `const nowSec` to the top of the function
(previously computed after the JSON parse) — functionally equivalent.

Ran `tests/mirror.spec.js` in full: **16/16 passed**, including the new
"malformed input SOFT" test (200/no-cookie for both bad JSON and bad sigil) and
the "fpc cookie round-trips" test (proves the `Path=/api/mirror` cookie, not KV,
carries the return across a different sigil).

## 4. 404-killers — PASS

`site/_redirects` matches only three literal, fixed paths (`/favicon.ico`,
`/apple-touch-icon.png`, `/apple-touch-icon-precomposed.png`) with no wildcards —
cannot shadow `/api/*`, `/root/*`, or any puzzle asset. Confirmed the redirect
target `site/favicon.svg` exists.

`site/robots.txt` (`Disallow: /api/`) is advisory-only for compliant crawlers; it
has no effect on the site's own JS calling those endpoints via `fetch`, and no
effect on `/root/` (not disallowed) or on the existing zone-level AI-crawler
block/smokesign cloaking, which is a separate mechanism.

Ran the full suite: the new smoke test "common auto-requested paths never return
a client error" **passed** — Playwright's request API follows the 302s to a final
200 on `/favicon.ico` and `/apple-touch-icon.png`. Minor gap: the smoke test does
not separately assert `/apple-touch-icon-precomposed.png` (only 2 of the 3
redirected paths are covered) — a test-coverage nit, not a functional issue.

## 5. No ARG/secrecy regression — PASS

The diff touches only: `functions/api/mirror/index.js` (analytics/UX fail-soft
behavior on a passive posture-mirror endpoint, not part of the solve path), CI
workflow, test files, two new static files (`robots.txt`, `_redirects`), and the
audit doc. Nothing in the solve path (front-door key check, ritual, DNS-riddle
hand-off, terminal commands, vigil claim logic) was touched. The audit doc was
independently confirmed answer-clean by the tracked-file guard test.

## 6. Test suite — PASS (verified directly, not just claimed)

Ran the full suite locally (armed by `.dev.vars` with `SIGN_KEY`/`CODE_ARG1`/
`CODE_ARG2` and `secret/answer.txt`):

```
Running 55 tests using 16 workers
...
55 passed (12.3s)
```

Matches the audit's claimed 55/55, including the one CI-skipped test
("name sanitization rejects needles and markup (server-side)") passing here
because `CODE_ARG1` is present locally.

## Residual gaps (independently assessed)

- **Important — R2 confirmed real and worth prioritizing:** the *only* test that
  exercises server-side dropping of a needle/markup from the user-supplied
  `name` field (the vector by which a visitor could otherwise plant the real
  answer into the public `/root` roster for other players to see) requires
  `CODE_ARG1`, which is never provisioned in CI. It therefore always skips in CI
  — a regression to that specific sanitization path would not be caught by a
  green check. This is honestly disclosed in the audit doc's own R2, and given
  priority (1) is secrecy, it's the one gap worth closing next (arm `CODE_ARG1`
  in CI the same throwaway way `SIGN_KEY` now is).
- Low/informational, as the audit doc already states: R1 (needle guard doesn't
  cover upstream DNS-riddle material — currently clean, defense-in-depth item
  for later), R3 (hand-maintained `SHIPPED` array — content-leak coverage still
  guaranteed by the all-tracked-files scan), and the untested third redirect
  path noted above.

## Bottom-line verdict

The hardening diff achieves its stated goal. Independently re-verified: the tree
is leak-clean (plaintext and encoded, via three separate sweep methodologies),
the leak guard is genuinely fail-closed in CI (empirically proved all four
arm/environment branches, and confirmed the `PUZZLE_ANSWER` secret is already
configured so this won't surprise-break the next CI run), `/api/mirror` is
fail-soft without weakening the success path, the two 404-killers cannot shadow
any puzzle or API route, and the full 55-test suite passes locally exactly as
claimed. Nothing in the diff weakens secrecy, alters the solve path, or
reproduces an answer. **CI is bulletproof to the stated standard; the branch is
leak-proof and stable.**

**Gaps: 0 Critical, 1 Important** (CODE_ARG1 not armed in CI → server-side
name-sanitization test unexercised in CI; pre-existing, honestly disclosed,
not a regression introduced by this diff).
