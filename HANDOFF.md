# HANDOFF — Cloudflare migration for the presence ("vigil") feature

> Working doc for resuming this task in another Claude Code session / team seat.
> **Delete this file before merging to `main`.**

- **Repo:** `claudeconnection-del/comeandget.us`
- **Branch:** `claude/cloudflare-presence-setup-h90fws` (do all work here; never push elsewhere)
- **Goal:** Migrate `comeandget.us` from **GitHub Pages** to **Cloudflare Pages** so the
  presence/"vigil" feature can run: static `site/` + Pages **Functions** (`functions/` at repo
  root) + a **KV** namespace `PRESENCE` for live presence state. Deploy is **GitHub-Actions-gated
  `wrangler pages deploy`** (Direct Upload), NOT the Cloudflare dashboard "Connect to Git" flow.

## Decisions already made (don't relitigate)

- **Deploy path:** CI holds a scoped Cloudflare API token and runs `wrangler pages deploy`. The
  first run **auto-creates** the `comeandget-us` Pages project. The token is **never** pasted
  into chat.
- **Token scopes** (scoped Account API token, not the Global API Key): `Cloudflare Pages: Edit`
  + `Workers KV Storage: Edit`, restricted to the one account.
- **Why not the dashboard Git build:** that path produced the error *"There was a problem parsing
  the Wrangler configuration file. Please report this issue on GitHub."* This repo deploys via
  Direct Upload from Actions instead. Other triggers of that same error: an ancient wrangler that
  predates `pages_build_output_dir`, or passing a positional directory to `pages deploy` (forbidden
  here — `pages_build_output_dir` is set).

## Done in this branch (committed)

- `wrangler.toml` (repo root) — project `comeandget-us`, assets from `site/`, **real KV id baked
  in**: `PRESENCE` → `1cd08bd52a3049a5ba07372a5466b01d`. Designed for **argument-free** invocation.
- `.gitignore` — added `.dev.vars` and `.wrangler/`.
- `.github/workflows/deploy.yml` — `deploy` job swapped from GitHub Pages (`actions/deploy-pages`)
  to `cloudflare/wrangler-action@v3` running `command: pages deploy`, reading repo secrets
  `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`. Still gated on `needs: ci` + push to `main`.
  The `ci` job (HTML validate + Playwright smoke) is unchanged.

## Done by the user (cloud-side)

- ✅ GitHub repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` created.
- ✅ KV namespace `PRESENCE` created (id above).

## ⛔ Outstanding blocker — code not yet in the repo

The **Functions code (`functions/`) and the vigil client JS are NOT in this checkout** (they were
never committed and weren't uploaded). Until they land here, a deploy will publish the static
`site/` to Cloudflare but the presence endpoints (`present` / `claim` / `name`, the ghosted corner
display, the proof-of-life decode mechanic) **won't exist**. **First action for the next session:**
get those files from the user (or the branch/commit where they live) and commit them — `functions/`
at repo root, next to `wrangler.toml`.

## Remaining steps (in order)

1. **Land the code:** commit `functions/` (+ any vigil client JS under `site/js/`). Confirm the
   Playwright smoke test still passes; extend it to exercise the Functions via `wrangler pages dev`
   if needed.
2. **Cloudflare project env secrets:** after the first deploy creates `comeandget-us`, set
   `CODE_ARG1` and `CODE_ARG2` on the Pages project (the two access codes — must NOT be the puzzle
   answers). Mirror locally in `.dev.vars` for `wrangler pages dev`. (These can also be set with
   `wrangler pages secret put` against the project.)
3. **Proton sieve:** append the matching code to each of the two "solved" auto-replies.
4. **DNS cutover (LAST):** only after the `*.pages.dev` deploy is verified, point `comeandget.us`
   at Cloudflare Pages. The live domain keeps serving the last GitHub Pages build until this flip,
   so there is no outage window.
5. Delete this `HANDOFF.md` and merge to `main`.

## Verify

- **Local:** `npx wrangler pages dev` (argument-free; needs `.dev.vars` with `CODE_ARG1`/`CODE_ARG2`)
  → serves `site/` + `functions/` with a simulated `PRESENCE` KV. Exercise the vigil endpoints; confirm
  KV reads/writes persist.
- **CI:** push branch → `ci` green; on `main`, `deploy` runs `wrangler pages deploy`, auto-creates the
  project, prints the `*.pages.dev` URL.
- Open the `*.pages.dev` URL: static site loads and (once `functions/` lands) presence endpoints respond.
- Then DNS cutover; confirm `comeandget.us` serves from Cloudflare with HTTPS.
