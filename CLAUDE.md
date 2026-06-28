# comeandget.us — notes for Claude

A static cryptographic ARG / honeypot landing page (see `README.md` for the lore and the
"answers never ship" rules; zero runtime deps on the static side). The **presence ("vigil")**
feature adds Cloudflare Pages Functions + a `PRESENCE` KV namespace.

Deploy: GitHub Actions runs `wrangler pages deploy` (argument-free — `wrangler.toml` is the
single source of truth) to **Cloudflare Pages**, gated on green CI + push to `main`. Use the
GitHub-Actions / Direct-Upload path, **not** the Cloudflare dashboard "Connect to Git" flow.
