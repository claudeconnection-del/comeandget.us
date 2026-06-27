# CHECKPOINT — comeandget.us

Single source of truth for where work stands; any seat/session resumes from here.
How this file works and when to update it: `docs/checkpoint-system.md` (TL;DR: update on demand,
at every feature-implementation change, at every spec update, and before pushing).
**Never** put secret values here — names / set-status only.

## Checkpoint log (newest first)

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

## ⛔ Outstanding blocker
`functions/` (Pages Functions) and the vigil client JS are **not in the repo**. Until they land,
a deploy publishes the static site only — the presence endpoints won't exist. **Get these from the
user and commit `functions/` at repo root, next to `wrangler.toml`.**

## Next steps (ordered)
1. Land `functions/` (+ vigil client under `site/js/`); extend the Playwright smoke to exercise
   Functions via `wrangler pages dev` if needed.
2. After the first deploy creates `comeandget-us`, set Pages project env secrets `CODE_ARG1` /
   `CODE_ARG2` (the two access codes — NOT the puzzle answers). Mirror in local `.dev.vars`.
3. Proton sieve — append the matching code to each of the two "solved" auto-replies.
4. **DNS cutover (last):** point `comeandget.us` at Cloudflare Pages once `*.pages.dev` is verified.
   No outage before this — GitHub Pages keeps serving until the flip.

## Verify
- Local: `npx wrangler pages dev` (needs `.dev.vars`) → serves `site/` + `functions/` with a
  simulated `PRESENCE` KV.
- CI: push branch → `ci` green; on `main`, `deploy` runs `wrangler pages deploy`, auto-creates the
  project, prints the `*.pages.dev` URL.
- DNS cutover, then confirm `comeandget.us` serves from Cloudflare over HTTPS.

## Key IDs / secrets status (names only — never values)
- KV `PRESENCE` id `1cd08bd52a3049a5ba07372a5466b01d` (committed in `wrangler.toml`; not secret).
- GitHub repo secrets: `CLOUDFLARE_API_TOKEN` ✅, `CLOUDFLARE_ACCOUNT_ID` ✅, `PUZZLE_ANSWER` (optional CI leak guard).
- Cloudflare Pages project secrets: `CODE_ARG1` ⬜, `CODE_ARG2` ⬜ (set after first deploy).
