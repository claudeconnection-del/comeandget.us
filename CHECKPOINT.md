# CHECKPOINT — comeandget.us

Single source of truth for where work stands; any seat/session resumes from here.
How this file works and when to update it: `docs/checkpoint-system.md` (TL;DR: update on demand,
at every feature-implementation change, at every spec update, and before pushing).
**Never** put secret values here — names / set-status only.

## Checkpoint log (newest first)

### 2026-06-27 (SECURITY — secrets were leaked into this tracked file; tip redacted) ⚠️
- A prior seat wrote the two access codes AND both puzzle answers as literal values into this
  git-tracked file (introduced in `eb13ced`, pushed to **PUBLIC** `origin/main`). That broke the
  "names/status only" rule above and the honeypot's "answers never ship". The tip is now redacted to
  names/status only.
- ⛔ The values remain in **public git history** → treat the two access codes AND both puzzle answers
  as **COMPROMISED**. Remediation pending owner decision: (a) **rotate** `CODE_ARG1`/`CODE_ARG2`
  (Pages secrets + Proton replies); (b) the **answers are burned** — change them (re-key the ARG1
  sigil + the ARG2 DNS riddle, update `secret/answer.txt` + the sieve subjects) or accept; (c) **purge
  git history** (`git filter-repo`/BFG + force-push); (d) **extend the leak guard** to scan tracked
  repo files, not just shipped `site/`. Do NOT rely on the gate as secret until rotated.

### 2026-06-27 (vigil overlap fix) — presence can't overlap or hide behind the console
- `main` is a centered panel (z-index 2); reworked the vigil so it can never collide: the chip stack
  docks into the right gutter (left edge pinned just outside main's right edge) at **z-index 30**
  (above the panel — never trapped behind); **drift moved BEHIND** the panel (z-index 1) so ghosts can
  wander past it without ever covering terminal text. Narrow screens (≤1024px, no gutter) fall back to
  a thin **top rail** above the console (`body padding-top` reserves the space) so chips never cover
  the body or the bottom input. CSS-only (`ember.css`). Presence feature now code-complete.

### 2026-06-27 (vigil redesign) — presence display: right-edge stack + click-to-decode + drift
- Replaced the single ghosted corner label with a right-edge vertical **stack of chips** (one per
  presence). **Clicking a chip runs `decode <id>`** in the terminal (real → JSON, ghost → hiss),
  fixing decode discoverability. Occasional **ghost drifts** to a random off-grid spot (reduced-motion
  safe). Opacity raised (~0.35 → ~0.62). `present` output now lists each id so it's decodable from the
  keyboard too.
- Files: `site/root/js/vigil.js` (stack/drift/click), `agent.js` (decodeId wiring), `shell.js`
  (present ids), `ember.css`. Local smoke GREEN (31/31) incl. no-console-errors on /root/ boot + leak guard.

### 2026-06-27 (claim live) — Pages secrets bound; claim verified live ✅
- `CODE_ARG1`, `CODE_ARG2`, `SIGN_KEY` all set on the project (values redacted — they live only in the
  Pages env + `.dev.vars`, gitignored). Pages binds secrets only on a fresh deployment → after a
  redeploy, `POST /api/vigil/claim` with the ARG1 code → `{ok:true, tier:1, token:…}`. Naming is live.
- `PUZZLE_ANSWER` repo secret set → CI leak guard now RUNS and passes (29 passed / 2 skipped).
  ⚠️ the guard derives a needle from only the FIRST word of each comma/newline segment, so a
  single-segment value guards just one needle. Use a comma/newline-separated value (one answer per
  segment) so both answers' first words are guarded. (Answer values live only in `secret/answer.txt`
  + the CI secret — never in this file.)
- DNS zone is on Cloudflare (coby/angelina.ns.cloudflare.com) → cutover = add the custom domain in
  the Pages project (auto-wires records + cert). See Next steps.

### 2026-06-27 (deployed) — LIVE on Cloudflare Pages ✅
- Deploy GREEN (run 28287984572): project `comeandget-us` auto-created by the workflow, 30 files +
  Functions bundle uploaded. Production alias: **https://comeandget-us.pages.dev**.
- Verified live: `/` 200, `/root/` 200, `GET /api/vigil` returns a ghost roster (Functions + KV
  binding live; ghost ids are plaintext noise that fail the `{v:1}` decode oracle — invariant holds),
  `POST /api/vigil/claim` → `{ok:false}` (correct; `CODE_*` / `SIGN_KEY` not set yet).
- DNS still points at GitHub Pages — **comeandget.us is unaffected** until the cutover (step 4).

### 2026-06-27 (deploy iter) — First deploy failed (project not found); workflow now self-creates it
- Merged PR #1 to `main`; CI green (28 passed, 3 skipped — the leak-guard + claim tests skip in CI
  without `PUZZLE_ANSWER`/codes; all ran & passed locally). Deploy job then FAILED:
  `wrangler pages deploy` errored **"Project not found … comeandget-us [code 8000007]"** — it does
  NOT auto-create the project (the earlier assumption was wrong). wrangler.toml parsed fine; token authed.
- Fix: `deploy.yml` now creates the project idempotently before deploy
  (`preCommands: npx wrangler pages project create comeandget-us --production-branch=main || …`),
  pins `wranglerVersion: 3.114.0`, and uses `pages deploy --commit-dirty=true`. Re-deploying.

### 2026-06-27 (later) — Presence Functions + vigil client landed & verified GREEN
- Restored the presence implementation onto this branch (from the earlier seat's WIP):
  `functions/api/vigil/{_lib,index,beat,claim}.js`, `site/root/js/vigil.js`, the corner display +
  terminal wiring (`site/root/{index.html,ember.css,js/agent.js,js/shell.js}`), the extended leak
  guard + presence tests (`tests/smoke.spec.js`), and the local toolchain (`package.json` wrangler
  devDep, `playwright.config.js` → `wrangler pages dev`).
- Kept this branch's canonical deploy wiring untouched (`wrangler.toml` real KV id, `deploy.yml`, `.gitignore`).
- **Local verify GREEN: 31/31 Playwright smoke pass** via `wrangler pages dev` — incl. the leak guard
  (answers never ship; `SHIPPED` now lists `/root/js/vigil.js`), proof-of-life (real id decodes, ghost
  id does not), claim accept/reject, server-side name sanitization. `npm run validate` clean.
- Blocker from the previous entry is **cleared**. Remaining: deploy + Pages secrets + Proton + DNS.

### 2026-06-27 — Cloudflare deploy path wired; Functions still pending
- Wired the GitHub-Pages → Cloudflare-Pages deploy for the presence ("vigil") feature
  (commit `4f4f8f6`): `wrangler.toml`, `deploy.yml` swap, `.gitignore`.
- Stood up the checkpoint system (this file + `CLAUDE.md` + `docs/checkpoint-system.md` +
  `/checkpoint` command + `SessionStart` hook); retired the one-off `HANDOFF.md`.
- Blocker unchanged: `functions/` + vigil client code not yet in the repo.

---

## Task
Migrate `comeandget.us` from GitHub Pages to **Cloudflare Pages** so the presence/"vigil"
feature runs: static `site/` + Pages **Functions** (`functions/` at repo root) + **KV** namespace
`PRESENCE`. Deploy = GitHub-Actions-gated `wrangler pages deploy` (Direct Upload), **not** the
dashboard "Connect to Git" flow.

- **Branch:** `claude/cloudflare-presence-setup-h90fws` (work here only).

## Decisions (don't relitigate)
- CI holds a scoped Cloudflare API token and runs `wrangler pages deploy`; the first run
  auto-creates the `comeandget-us` project. Token is never pasted into chat.
- Token scopes: `Cloudflare Pages: Edit` + `Workers KV Storage: Edit`, account-scoped (custom
  token, not the Global API Key).
- Dashboard "Connect to Git" is the wrong path — it caused *"problem parsing the Wrangler
  configuration file."* Same error also comes from an ancient wrangler or a positional dir arg to
  `pages deploy` (forbidden — `pages_build_output_dir` is set).

## Done (committed)
- `wrangler.toml` — project `comeandget-us`, assets `site/`, `PRESENCE` KV id
  `1cd08bd52a3049a5ba07372a5466b01d`, argument-free invocation.
- `.github/workflows/deploy.yml` — deploy job → `cloudflare/wrangler-action@v3` `pages deploy`,
  gated on `ci` + push to `main`; reads `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`.
- `.gitignore` — `.dev.vars`, `.wrangler/`.
- Checkpoint system: `CLAUDE.md`, this file, `docs/checkpoint-system.md`,
  `.claude/commands/checkpoint.md`, `.claude/settings.json` (SessionStart hook).

## Done by the user (cloud-side)
- ✅ GitHub repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- ✅ KV namespace `PRESENCE` created (id above).

## ✅ Blocker cleared
`functions/` + the vigil client are committed on this branch and verified locally (31/31 smoke via
`wrangler pages dev`). What remains is deploy → Pages secrets → Proton → DNS (Next steps).

## Next steps (ordered)
1. ✅ DONE — code landed + merged + **deployed live** to https://comeandget-us.pages.dev (workflow
   self-creates the project via `wrangler pages project create … || true`, then `pages deploy`).
2. ✅ DONE — Pages secrets set (`CODE_ARG1`, `CODE_ARG2`, `SIGN_KEY` — values redacted) + redeployed;
   `claim` verified live (`{ok:true,tier:1}` with the ARG1 code). `PUZZLE_ANSWER` repo secret set → CI
   leak guard runs.
   - ⚠️ **Fix `PUZZLE_ANSWER` value** → comma/newline-separated (one answer per segment) so both
     answers' first words are guarded (a single-segment value guards only one). ⚠️ See the SECURITY
     entry — these values are compromised and pending rotation.
3. ✅ DONE — Proton sieve has the per-ARG codes (ARG1/cryptid reply → `CODE_ARG1`; ARG2/tech reply → `CODE_ARG2`).
4. ⬅️ **CURRENT — DNS cutover.** Zone is on Cloudflare. In the `comeandget-us` Pages project →
   **Custom domains** → add `comeandget.us` (and `www`); Cloudflare auto-creates the records (apex
   CNAME-flattened → `comeandget-us.pages.dev`) + issues the cert, replacing the GitHub Pages records.
   Proton MX untouched. No outage before the flip.

## Verify
- Local: `npx wrangler pages dev` (needs `.dev.vars`) → serves `site/` + `functions/` with a
  simulated `PRESENCE` KV.
- CI: push branch → `ci` green; on `main`, `deploy` runs `wrangler pages deploy`, auto-creates the
  project, prints the `*.pages.dev` URL.
- DNS cutover, then confirm `comeandget.us` serves from Cloudflare over HTTPS.

## Key IDs / secrets status (names only — never values)
- KV `PRESENCE` id `1cd08bd52a3049a5ba07372a5466b01d` (committed in `wrangler.toml`; not secret).
- GitHub repo secrets: `CLOUDFLARE_API_TOKEN` ✅, `CLOUDFLARE_ACCOUNT_ID` ✅, `PUZZLE_ANSWER` (optional CI leak guard).
- Cloudflare Pages project secrets: `CODE_ARG1` ⬜, `CODE_ARG2` ⬜, `SIGN_KEY` ⬜ (set after first deploy; `SIGN_KEY` is REQUIRED — `claim` returns `ok:false` without it).
