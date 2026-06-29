# Byte Café v2 — a fuller pseudo-terminal (RESUMABLE SPEC)

> **Status: SHIPPED (2026-06-28).** Built, verified (html-validate + 32/32 Playwright smoke +
> leak guard, all green), and deployed via the Pages pipeline. One owner-approved scope change
> during the build: **"4K" is now a single global upgrade shared by ALL four games** (not just
> Tetris) — easy to unlock (finish any game once, or land a Tetris) and freely toggleable
> (`4k on|off`, plus per-launch `tetris 4k` / `snake plain`). The rest matches this spec.
>
> _Original handoff note (kept for history):_ APPROVED, NOT YET BUILT. Handoff spec — a teammate
> can resume cold from this file. All design decisions below are the owner's, confirmed.

## 0. Context you need first

Byte Café is the warm twin of the comeandget.us honeypot, **already shipped (v1)** and live at
**comeandget.us/cafe/**. It is a static `<canvas>`/ES-module pseudo-terminal CTF playground.
Read these before touching anything:

- `docs/superpowers/specs/2026-06-28-byte-cafe-design.md` — the v1 design.
- Memory: `byte-cafe.md`, `comeandget-no-secrets-in-tracked.md`, `domain-work-repos.md`.

**v1 file map** (`site/cafe/`):
- `index.html` — macOS window: `.titlebar` (`.lights` → three `.lt.r/.y/.g` spans, `.title`,
  `#themebtn`), `.console` (scroll container) → `.term` (`#term` pre) + `.cmdline` (`#cmdline`
  form, `#cmd` input). External JS only (CSP).
- `cafe.css` — `[data-theme="dark"]` Rosé Pine / `[data-theme="light"]` periwinkle via CSS vars
  (`--bg/--surface/--overlay/--text/--muted/--subtle/--line/--accent/--ok/--warn/--rose/--love/
  --pine/--kbd-bg/--shadow`). `.window` = `min(960px,92vw) × min(82svh,720px)`, centered.
- `js/app.js` — entry: `initTheme()`, `createTerminal()`, registers meta cmds
  (`help/about/clear/theme/exit`) + `cafeCommands()` + `toolCommands()` + aliases.
- `js/shell.js` — `createTerminal()` → `{ api, register, alias, names, run }`. `api` = `{ print
  (...parts), blank, sp(text,cls), kbd(text), scroll, clearScreen, focus }`. Handles history,
  Ctrl+C, click-to-focus. Commands are `async ({argv, rest, raw, api}) => …`.
- `js/theme.js` — `initTheme()`, `set(t)`, `current()`. Key `cafe.theme`.
- `js/ctf.js` — `CHALLENGES` manifest + `cafeCommands()` (`ls/open/submit/hint/badges/progress`).
  SHA-256 via `crypto.subtle`. Keys `cafe.solved`, `cafe.hints`.
- `js/tools.js` — `toolCommands()`: `cat/curl/dig/grep/strings/file/decode/base64/rot13`. `res()`
  strips `.html` before fetch + 6s abort (Pages clean-URL gotcha, see §7).
- `artifacts/*`, `favicon.svg`.

**Honeypot files this round also touches:**
- `site/index.html` — the veil/front door. `<a class="rabbit" id="rabbit" href="root/">` already
  present; `<body class="dormant">`.
- `site/js/wake.js` — the "feign": waits 60s (or `?wake=<ms>`, `?wake=0` to skip) then calls
  `stage.wake()`.
- `site/js/stage.js` — `stage.wake()` removes `body.dormant` + sets `awake` + runs `onWake` cbs;
  `stage.onWake(fn)` runs fn on/after wake. The rabbit is revealed by CSS keyed off
  `body:not(.dormant)` (confirm in `veil.css`).
- `site/root/index.html` + `site/root/js/shell.js` — the honeypot terminal. Commands live in a
  `CMD` object (e.g. `CMD.help`, `CMD.theme`); add `CMD.cafe`. Terminal is now FIXED-size
  (32rem) — that's why the `cafe` mode-switch is viable.
- `site/_headers` — global CSP `script-src 'self'` (external modules only, NO inline scripts);
  has the cafe `receipt.txt` custom-header rule.
- `tests/smoke.spec.js` — Playwright smoke. **Only drives `/` and `/root/`.** Must stay green.
- `.github/workflows/deploy.yml` — `npm run ci` (html-validate + smoke) then `wrangler pages
  deploy` on push to `main`. (Pre-existing Node-20 deprecation warning; not blocking.)

## 1. Confirmed decisions (owner)

- **Games (all `<canvas>`, theme-aware):** Tetris (+ unlockable **4K**), Snake, Breakout, Pong.
- **"4K" Tetris = "glow skin" + "bigger & crisper" combined:** a larger high-DPI board with neon
  glow, particle bursts on line clears, gentle screen-shake, buttery drops, richer/fancier blocks.
  **Unlock trigger:** 10 cumulative lines cleared OR one Tetris (4-line clear), persisted.
- **Transition (/root → /cafe, echoed on the home reveal): "Sunrise / lights up"** — the dread
  warms into the café; embers soften, dark lifts to dawn, a periwinkle/Rosé glow rises.
- **Voice: "subtle winks"** — warm, cozy tone with occasional sly nods to the seven ARG beings
  (uncanny-but-inviting). They usually watch/menace on the ARG side; here they just want you
  caffeinated and comfy. Pull the seven beings' names from the front-door data
  (`site/js/whispers/*` / `site/index.html`) — keep references light, never spoil the ARG.

## 2. Features to build

### 2A. Live macOS window buttons (`site/cafe/`)
Turn the three `.lt` dots into real, accessible controls (make them `<button>`s with `aria-label`,
keyboard-focusable; keep the traffic-light look). New `js/window.js`, wired in `app.js`.
- **🔴 close → "clear":** `api.clearScreen()` — clears the scrollback only. **Must NOT** reset
  `localStorage` (progress/badges/unlocks persist). Print a tiny "wiped the counter ☕" line.
- **🟡 minimize → ambient mode:** hide/shrink the console and reveal a gently animated, on-theme
  ambient backdrop (drifting motes + soft rising "steam", theme-colored; canvas or pure CSS;
  respect `prefers-reduced-motion`). Click the dot again (or anywhere) to restore. Cozy, calm.
- **🟢 zoom → bigger (not OS fullscreen):** grow `.window` to a larger size *within the browser*
  (e.g. `min(1400px,96vw) × 94svh`) with a smooth CSS transition; click again to restore. This
  also gives the 4K Tetris room to breathe (the game may auto-zoom on launch).

### 2B. Canvas game framework + 4 games (`site/cafe/js/games/`)
A small host that: suspends terminal input, mounts a `<canvas>` sized to the console (scale by
`devicePixelRatio` for crispness), runs a rAF loop, routes keys (arrows/WASD/space, `q`/Esc to
quit), and on quit tears down + restores the terminal + focus. **Theme-aware:** read palette from
`getComputedStyle(document.documentElement)` (`--accent/--ok/--warn/--love/--pine/--text/--bg`),
and re-read on theme change so games match dark/periwinkle. Basic touch where reasonable
(swipe/tap), but desktop keyboard is the priority.
- Commands: `games` (lists the four + unlock status), and `tetris` / `snake` / `breakout` / `pong`
  to play. `tetris 4k` plays the unlocked skin (gated until unlocked, with a friendly "not yet —
  clear 10 lines or land a Tetris" message).
- Persistence: `cafe.hs.<game>` high scores; `cafe.lines` cumulative Tetris lines; `cafe.tetris4k`
  unlock bool. On unlock, a celebratory message + maybe a `spark`.
- The four games are canvas re-imaginings (NOT the honeypot's ASCII versions). Keep them tasteful
  and on-brand: rounded cells, soft glow, theme colors, gentle juice. Reference the honeypot's
  game *logic* in `site/root/js/{tetris,serpent,breakout,pong}.js` for mechanics, but render fresh
  on canvas.
- **4K Tetris** (the unlockable): same Tetris rules, but a larger high-DPI board, neon glow on
  pieces, particle bursts + gentle screen-shake on line clears, smooth (lerped) drop animation,
  fancier block faces. Optionally auto-trigger the 🟢 zoom for room. Make it feel like a reward.

### 2C. `cafe` command in `/root` + the sunrise transition
- Add `CMD.cafe` to `site/root/js/shell.js`: prints a warm one-liner, plays the **sunrise**
  transition, then `window.location = "/cafe/?from=root"`. Add `cafe` to the `help` listing.
- **Transition (cross-document):** on `/root`, overlay a warm radial glow that grows + brightens
  (embers → dawn) over ~0.8–1.2s, then navigate. On `/cafe`, if arriving with `?from=root` (or a
  `sessionStorage` flag), play the *arrival* half — fade up from a warm wash into the café. Respect
  `prefers-reduced-motion` (skip to a quick fade). Pure CSS/JS, no inline scripts (CSP). View
  Transitions API is a nice-to-have enhancement where supported, but the overlay approach must work
  everywhere.
- Keep it CSP-clean and don't break root smoke tests (no test invokes `cafe`; just don't alter
  existing command outputs the tests assert on).

### 2D. Home-page reveal (`site/index.html` + `veil.css`)
- Add a second portal beside `#rabbit`: `<a id="cafe-door" href="cafe/">` with a distinct **coffee
  icon** (reuse the café favicon motif as inline SVG), `aria-label` like "a warm light, off to the
  side". Style it to fit the veil.
- **Reveal ~15s after the page wakes** (NOT during the dormant feign). Cleanest CSP-safe approach:
  pure CSS — `body:not(.dormant) #cafe-door { animation: cafe-rise 1.2s ease 15s both; }` (hidden
  until 15s after `.dormant` is removed). Or hook `stage.onWake(() => setTimeout(reveal, 15000))`.
- **Must not break smoke tests:** they assert `#rabbit` (href `root/`, visible at `?wake=0`),
  `#sigil`, `#door`, and "feign stays inert". The cafe-door is hidden for the first 15s so it never
  interferes; ensure it adds zero console errors (the "door loads without errors" test asserts an
  empty error list).

### 2E. Voice pass (subtle cryptid-warm)
Rework café microcopy (seed in `index.html`, `app.js` help/about, `ctf.js` prompts/celebrations) to
the "subtle winks" voice: warm and cozy, with light, sly nods to the seven beings (e.g. "the night
shift insists you try the cold brew", "something with too many eyes wiped the counter for you").
Never heavy-handed, never spoil the ARG. Keep it inviting first, uncanny second.

## 3. Suggested build order
1. Window buttons (2A) — small, self-contained, immediate payoff.
2. Canvas game framework + Snake (simplest) to prove the host (2B).
3. Tetris + Breakout + Pong, then the 4K Tetris unlock.
4. `cafe` command + sunrise transition (2C).
5. Home-page reveal (2D).
6. Voice pass (2E) across everything.

## 4. Constraints (do not break)
- **CSP:** `site/_headers` is `script-src 'self'` — external ES modules only, NO inline `<script>`
  or inline event handlers anywhere (cafe AND honeypot pages).
- **html-validate** lints `site/**/*.html` (recommended ruleset). Keep new HTML valid.
- **Smoke suite** (`tests/smoke.spec.js`) only drives `/` and `/root/` — keep those green; consider
  ADDING `/cafe` smoke tests (optional but nice).
- **Leak guard** scans ALL tracked files for the honeypot answer needles — café uses its own
  café/cryptid vocabulary; run the pre-check before pushing (see §6).
- **Secrets/flags:** never ship plaintext CTF flags; generator stays in gitignored
  `secret/cafe-flags.mjs`. No ARG answers/codes anywhere tracked.

## 5. Gotchas (learned the hard way)
- **Cloudflare Pages clean-URLs:** `*.html` is served at its extensionless path and fetching the
  `.html` URL **hangs**. `tools.js` already strips `.html`; any new fetch of an `.html` artifact
  must do the same (+ an abort timeout).
- **Preview module cache:** `wrangler pages dev` + the preview browser cache ES modules; after
  editing JS, **restart the preview server** (stop+start) to load fresh modules — a reload/`?v=`
  is not enough.
- **Verify on the production build** (`wrangler pages dev`, the `comeandget-dev` launch config on
  port 8788) — not a plain static server — so `_headers`/clean-URLs/CSP behave like prod.

## 6. Verify + deploy
- `npm run validate` (html-validate) must pass.
- Verify on `wrangler pages dev` (Claude Preview MCP: `comeandget-dev`, :8788) at `/cafe/`:
  each game launches/quits cleanly + is theme-aware; 4K unlock fires at 10 lines / a Tetris; the
  three window buttons behave; `/root` `cafe` command plays the sunrise + lands on `/cafe`; the
  home `#cafe-door` reveals ~15s after wake. Screenshot dark + periwinkle at ~390 / 768 / 1440 /
  2560px.
- Leak-guard pre-check (prints pass/fail only, no needles):
  ```
  node -e 'const fs=require("fs"),{execSync}=require("child_process");let raw="";try{raw=fs.readFileSync("secret/answer.txt","utf8")}catch{}const N=new Set();for(const s of raw.split(/[\n,]/)){const p=s.trim().toLowerCase();if(p){N.add(p);N.add(p.split(/\s+/)[0])}}let bad=0,n=0;for(const f of execSync("git ls-files -o -c --exclude-standard site docs",{encoding:"utf8"}).split("\n").filter(Boolean)){let t;try{t=fs.readFileSync(f,"utf8").toLowerCase()}catch{continue}n++;for(const x of N)if(x&&t.includes(x)){console.log("LEAK",f);bad++;break}}console.log("scanned",n,"leaks",bad)'
  ```
- Deploy: commit + push to `main` → GitHub Actions runs CI then `wrangler pages deploy`. Confirm
  live: `curl -s -o /dev/null -w "%{http_code}" https://comeandget.us/cafe/` → 200.

## 7. Polish round (shipped after v2 — 2026-06-29)
A follow-up motion/feel + content pass, all live:
- **Idle clicker — "Brew Tycoon"** (`games/idle.js`): 5th arcade game. Tap/space to brew, six
  auto-brewers (1–6 to buy), persistent (`cafe.idle`) with an 8h "while you were away" catch-up.
  Full 4K support (glow mug, bean bursts, auto-zoom). Registered in `games/index.js`; aliases
  `brew`/`clicker`.
- **Dark theme is now dark periwinkle** (was Rosé Pine) so it reads as the cozy twin of the light
  periwinkle — `html[data-theme="dark"]` in `cafe.css`, plus `theme.js` + `index.html` theme-color.
- **Games restore the pre-launch window size** — `host.js` only auto-zooms a 4K game if you weren't
  already maximized, and only un-zooms on quit if it was the one that zoomed (`wasZoomed`/`autoZoomed`).
- **Easy/chill tuning** — Tetris: reset `dropAcc` on spawn so every piece starts at the same top row
  (fixed "fell from different heights"), slower gravity (`max(200, 950-(lvl-1)*50)`), ramp every 12
  lines. Snake/Breakout/Pong: slower speeds, bigger paddle, lazier AI.
- **Ambience mode polish** — minimalist defaults (`cafe.amb` = gentle particles, low glow); a corner
  **adjustments panel** (particles/glow/drift, persisted, live); the candlelight is now soft drifting
  **lava-lamp blobs** (heavy blur → no banding); minimize **fades in smoothly** (ambient opacity +
  motes ease in, scene settles darker).
- **Smoother transitions** — the `/root→/cafe` view-transition image-pair now shares the group's
  duration/easing (no pop); the dawn glow waits for `pagereveal`'s transition to finish.
- **Perf** — ambient animations `animation-play-state: paused` unless minimized (the blurred blobs
  are costly); Snake grid-dots and Tetris grid-lines batched into one path/draw call.

## 8. Out of scope / future
Sound/music for games; a shareable progress card; more challenges; a real fullscreen mode; mobile
game controls polish; idle prestige/ascension. None block.
