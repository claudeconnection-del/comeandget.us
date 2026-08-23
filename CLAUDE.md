# comeandget.us — notes for Claude

A static cryptographic ARG / honeypot landing page (see `README.md` for the lore and the
"answers never ship" rules; zero runtime deps on the static side). The **presence ("vigil")**
feature adds Cloudflare Pages Functions + a `VIGIL` **D1** database (`comeandget-us-vigil`),
which also holds the aggregate progress funnel.

**Storage is D1, not KV, and that is load-bearing.** The free KV plan allows only 1,000 *list
requests* per day, and the old design did one `KV.list` per heartbeat — which capped the whole
site at roughly twelve open-tab-hours a day. Never reintroduce a per-request `list`/scan in a
hot path. Everything stays on the **free** plan deliberately: free fails closed (over-quota
returns errors, nothing is billed), while Workers Paid fails open and Cloudflare offers no hard
spend cap. Before changing `functions/api/vigil/*`, read the cost notes at the top of
`_store.js` — the abuse guarantees there are enforced by the SQL, and by tests.

Deploy: GitHub Actions runs `wrangler pages deploy` (argument-free — `wrangler.toml` is the
single source of truth) to **Cloudflare Pages**, gated on green CI + push to `main`. Use the
GitHub-Actions / Direct-Upload path, **not** the Cloudflare dashboard "Connect to Git" flow.
