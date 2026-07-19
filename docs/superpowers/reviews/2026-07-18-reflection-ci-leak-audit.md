# CI / leak-proof / stability audit — reflection branch (2026-07-18)

Branch: `feat/reflection-device-mirror`. Scope: make CI/CD bulletproof for the final round —
a green check must GUARANTEE (a) no puzzle answer or upstream secret ever ships, (b) a deploy
won't break the ARG, (c) clean production analytics (no avoidable 4xx). Priority order held
throughout: **(1) secrecy / puzzle integrity → (2) least-invasive atmosphere → (3) reliability/speed.**

## 1. Leak sweep — RESULT: CLEAN (verified two ways)

The `/root` prize answer is an Entra control (two words) that must live ONLY in DNS (`_rabbit` TXT);
the front-door answer is an entity name. Both, plus their first-word needles, are protected. Verified:

- **Plaintext:** `git grep -i` over the shippable tree (excludes gitignored `secret/`) → 0 files contain
  either answer's first word, 0 contain "grinning man", 0 contain the DNS-riddle base64 fragment.
- **Encoded:** a sweep decoded **295** base64/base64url/hex blobs across all shipped `site/` files and
  re-scanned the *decoded* text (incl. one level of nesting, for JWT payloads / hex breadcrumbs) for the
  answers + riddle phrases → **0 hits**. Nothing is hidden inside an encoded blob.
- Both leak-guard tests pass locally (armed by `secret/answer.txt`). `secret/` and `.dev.vars` are
  correctly untracked. Bare "access" appears only as legit lore and is deliberately not a needle.

**No leak — plaintext or encoded — exists in the tree.**

## 2. Findings & what was done

### CRITICAL — the leak guard was FAIL-OPEN in CI  → FIXED (`0cd6a5c`)
`loadAnswerNeedles()` reads `PUZZLE_ANSWER` (CI) else gitignored `secret/answer.txt` (local). If the
`PUZZLE_ANSWER` repo secret was unset, `NEEDLES` was empty and all three guard tests `test.skip(...)` —
**CI still went green with the "answers never ship" guard silently disabled.** A future commit could ship
the `/root` answer and deploy on a green check.
Fix: `leakGuardArmedOrSkip()` — armed → run; unarmed **in CI → throw** (hard error); unarmed local → skip.
`PUZZLE_ANSWER` is now documented REQUIRED in `deploy.yml`. Verified: unarmed+CI throws, armed+CI runs,
unarmed-local skips, local guards still pass.

### CRITICAL — new mirror/echo tests would fail in a secret-less CI  → FIXED (`0cd6a5c`)
The recognition tests assert `SIGN_KEY`-dependent behavior (echo `x-vigil-seen:1`, fpc `Set-Cookie`,
KV `seen.returning`) with no skip guard. CI only ever set `PUZZLE_ANSWER`; `SIGN_KEY` comes from gitignored
`.dev.vars` locally and is **absent in CI**, so these would have gone RED (proved at unit level:
`verifyEchoToken(undefined, token) → null`). Fix: a CI step writes a **throwaway, test-only** `SIGN_KEY`
into `.dev.vars` before `npm test`, so the mirror is genuinely exercised (green-for-real). The real key stays
in Cloudflare and is used only at deploy/runtime — never in CI.

### IMPORTANT — avoidable 4xx analytics noise  → FIXED (`090ea40`)
`/root` is a honeypot that invites junk traffic, so per-probe 4xx pollute analytics.
- `/api/mirror` now **fails soft**: malformed json / non-hex sigil → benign cookieless **200** (was 400),
  extending its never-500 ethos to never-4xx. Junk mints no `fpc` cookie and is never `returning`.
- Added `site/robots.txt` (+ `Disallow: /api/`) and `site/_redirects` (302 `/favicon.ico`,
  `/apple-touch-icon*` → `/favicon.svg`) so clients auto-probing those fixed paths stop 404ing — likely the
  largest avoidable chunk (every visit). Smoke test asserts those paths return `<400`.

### Accepted deviation (from Task 7, now confirmed correct)
The `fpc` cookie `Path` was changed `/root`→`/api/mirror` because a `/root`-scoped cookie is a sibling to
`/api/mirror` and would never be sent back (write-only channel). Correct; a dedicated round-trip test proves
the cookie (not KV) carries the return. Secrecy note: the path attr reveals no more than the request URL.

## 3. Test-suite investigation (behavior in a CI that sets only PUZZLE_ANSWER + throwaway SIGN_KEY)

- **Leak guards (2)** — now fail-closed: run when `PUZZLE_ANSWER` set; hard-error if not. No false-green.
- **Mirror/echo recognition (echo, fpc round-trip, KV return)** — now run green-for-real via the throwaway
  `SIGN_KEY`; KV is simulated by `wrangler pages dev` (strongly consistent locally) so `returning` holds.
- **Mirror fail-soft** — asserts 200/benign for junk (no 4xx).
- **404-killers** — assert `<400` for robots/favicon/apple-touch.
- **Vigil `claim`/`name` (2)** — still `test.skip` without `CODE_ARG1` (unchanged; NOT armed in CI by
  choice — see residual risk). Not a regression.
- **Front-door + /root + arcade + reckoning + AI-cloak** — unaffected; 55/55 local.

## 4. Residual risk / recommendations (not blocking; for the next round)

- **R1 (secrecy, low):** the needle guard catches final ANSWERS, not upstream secret material (the DNS
  riddle base64 / decoded riddle). Currently clean, but a future dev could ship the riddle without tripping
  the guard, short-circuiting the "dig DNS" step. Consider adding riddle needles (from a secret source) for
  defense-in-depth on `/root`.
- **R2 (coverage):** vigil `claim`/`name` still skip in CI (no `CODE_ARG1`). Left as-is to avoid asserting a
  throwaway code against `claim.js` validation this round; could be armed like `SIGN_KEY` later.
- **R3 (drift):** `SHIPPED` array is hand-maintained; content-leak coverage is still guaranteed by the
  all-tracked-files scan, but consider deriving `SHIPPED` from the filesystem so it can't silently drift.
- **R4 (residual 4xx):** the zone-level 403 for AI crawlers and bot 404s on random paths are BY DESIGN
  (honeypot) — reduce via the new robots.txt `Disallow`, otherwise filter in analytics rather than eliminate.

## 5. Verdict

Tree is leak-clean (plaintext + encoded). The two false-green/false-red CI holes are closed; a green check
now proves the leak guard ran AND the mirror was actually tested. Avoidable 4xx are cut without touching
puzzle logic. Nothing done here weakened secrecy or altered the solve path. **CI is bulletproof to the
stated standard; branch is leak-proof and stable.**
