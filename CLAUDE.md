# comeandget.us — notes for Claude

A static cryptographic ARG / honeypot landing page (see `README.md` for the lore and the
"answers never ship" rules; zero runtime deps on the static side). The **presence ("vigil")**
feature adds Cloudflare Pages Functions + a `PRESENCE` KV namespace.

Deploy: GitHub Actions runs `wrangler pages deploy` (argument-free — `wrangler.toml` is the
single source of truth) to **Cloudflare Pages**, gated on green CI + push to `main`. Use the
GitHub-Actions / Direct-Upload path, **not** the Cloudflare dashboard "Connect to Git" flow.

## Checkpoint protocol — READ AND MAINTAIN

`CHECKPOINT.md` (repo root) is the **single source of truth for where work stands**, so any
teammate in any seat (web, desktop, CI) can resume cold. Sessions run in ephemeral containers
across team seats — uncommitted context is lost.

- **At session start:** read `CHECKPOINT.md` before acting. (A `SessionStart` hook also surfaces it.)
- **Update it and commit whenever:**
  1. **on demand** — the user asks, or you run `/checkpoint`;
  2. **a feature implementation changes** — code altering a feature's behavior/structure lands;
  3. **a spec / requirements / scope decision changes**;
  4. **backstop** — before any `git push`, and before ending a session.
- Keep entries **dated and terminal**: what's done (with commit refs), what's blocked, what's next.
- **Never** write secret *values* (API tokens, access codes) into the checkpoint — names and
  set/unset status only.

Full design + how to extend: `docs/checkpoint-system.md`. On-demand command: `/checkpoint`
(`.claude/commands/checkpoint.md`).
