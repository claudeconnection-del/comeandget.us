# Byte Café — design (2026-06-28)

The **warm twin** of the comeandget.us honeypot: a friendly, inviting, macOS-style
pseudo-terminal hosting a self-contained, in-browser CTF. Where `/root` looms (dread,
PowerShell `PS C:\>`, taunts, a watching vigil), **`/cafe` smiles** — calm, clean,
encouraging, dark-first but bright and bubbly.

Lives at **`comeandget.us/cafe/`** as a static subtree of the existing site, so it rides the
current Cloudflare Pages pipeline (push to `main` → live). No backend, no KV, no Functions,
no presence/heartbeat. Pure static HTML/CSS/ES-modules.

## Goals & non-goals

- **Purpose:** a *craft/showcase* piece — delight, polish, cleverness over scoring/teaching.
- **CTF shape:** an **open playground** — a board of self-contained challenges, any order,
  collect badges. Lighter narrative, warm "system voice" (no mascot).
- **Difficulty:** genuinely tier-2/3 IT (not kid-gloves), but framed bubbly + encouraging.
- **Responsive:** flawless mobile → ultrawide → multi-monitor (fluid, capped, never stretched).
- **Non-goals:** no leaderboard, no anti-cheat, no accounts, no server. No arcade games in v1
  (easy easter-egg later).

## Aesthetic

- **macOS terminal chrome:** rounded window, three traffic-light dots, a `you@playground ~ %`
  zsh-style prompt. A calm flat backdrop (theme bg + subtle vignette), terminal card floating
  with a soft shadow.
- **Theme:** **Rosé Pine** dark (default ☾) + **periwinkle** light (☀ toggle). One-tap toggle
  in the titlebar; choice persisted in `localStorage` (`cafe.theme`); defaults dark, but honors
  `prefers-color-scheme: light` on a first visit. Colors via CSS custom properties on
  `[data-theme]`.
- **Real-terminal flow** (reused from the honeypot polish): output flows top-down, the prompt
  rides under the last line until the scrollback fills, then pins to the bottom and scrolls.

## Architecture (files under `site/cafe/`)

| File | Role |
|---|---|
| `index.html` | macOS window markup: titlebar (dots + title + ☾/☀), scrolling `.console`, input row. External JS only (CSP `script-src 'self'`). |
| `cafe.css` | Theme variables (dark/periwinkle), macOS chrome, responsive layout, real-terminal flow. |
| `js/app.js` | Module entry: boots shell, wires input/history, theme. |
| `js/shell.js` | Command dispatcher + `println`/print helpers + the warm voice. |
| `js/ctf.js` | Challenge **manifest** + solve/badge/progress engine (SHA-256 via Web Crypto, `localStorage`). |
| `js/tools.js` | The “real” tool commands that fetch artifacts: `cat dig grep strings file curl -I decode base64`. |
| `js/theme.js` | Theme toggle + persistence + default. |
| `artifacts/*` | Challenge data (see below). |

`site/_headers` gets one added rule so the **headers challenge is real** (a custom response
header on a `/cafe/artifacts/…` file, honored by `wrangler pages dev` + Pages).

## Command set

- **Meta:** `help · ls`/`challenges · open <id> · submit <id> <flag> · hint <id> · badges ·
  progress · theme [dark|light] · clear · about`
- **Tools (used to solve):** `cat <file> · curl -I <file> · dig [TYPE] <name> · grep <pat> <file>
  · strings <file> · file <file> · decode <b64|jwt> · base64 -d <s>` (+ `rot13`, `hex` for fun).
- Tool commands fetch from `artifacts/` same-origin. `ls` renders the board: id · family icon ·
  difficulty (★) · solved ✓.

## Flag & progress model

- Flag format: **`cafe{lower_snake_words}`**.
- **Never ship plaintext flags.** The manifest stores only `sha256(flag)` (hex). In artifacts the
  flag appears **encoded** (base64 / hex / inside a JWT claim / buried in noise), so a naive
  `grep cafe{` finds nothing and the *decode itself is the puzzle*.
- `submit` → trim → `SHA-256` → compare to manifest hash → on match mark solved
  (`cafe.solved` array in `localStorage`), award the badge, celebrate (warm message + a little
  ✦ flourish). Idempotent; re-submitting a solved one just re-congratulates.
- Build-time: a **gitignored** `tools/make-flags.mjs` computes hashes + encodings from the chosen
  flags and emits the manifest hashes + the encoded artifact payloads. Plaintext flags live only
  in a gitignored scratch file — consistent with the repo's "answers never ship" rule.

## Challenges (v1 — 7, all four families)

1. **`welcome-mat`** · Encoding · ★ — a base64 blob in the prompt; `decode` it → flag. (warmup)
2. **`receipt-roll`** · Web/HTTP · ★★ — inspect response headers of `artifacts/receipt.txt`
   (`curl -I` or DevTools Network); a custom header (set via `_headers`) carries the encoded flag.
3. **`back-of-house`** · Web/HTTP recon · ★★ — `artifacts/robots.txt` disallows a hidden page;
   open it, read the HTML comment (encoded flag). Teaches robots + view-source.
4. **`daily-grind`** · DNS · ★★★ — `dig` a fake zone (`artifacts/zone.json`): a `CNAME` → `TXT`
   trail ends in the encoded flag. Teaches record types + following a trail.
5. **`loyalty-card`** · Encoding/JWT · ★★★ — a JWT (alg:none); `decode` it, read the payload
   claim for the flag. Teaches JWT structure + the alg:none lesson.
6. **`spilled-grounds`** · Text/regex · ★★★ — `grep` an order log for the one line matching the
   promo pattern; that line holds the encoded flag. Teaches regex/log analysis.
7. **`hidden-roast`** · Forensics · ★★★ — `strings`/`file` a PNG with a flag string embedded in
   a text chunk among noise. Teaches strings/file inspection/metadata.

Badges: one per challenge (emoji + cute name), shown in `badges` as earned/locked, with a
`★ X / 7 solved` progress line echoed on the board and after each solve.

## Responsive strategy

- Terminal card: `width: min(960px, 92vw)`, `height: min(82vh, 720px)`, centered; fluid font via
  `clamp()`. Mobile → near-full-width, comfortable padding, big tap targets. Ultrawide/multi-mon →
  capped + centered with generous calm margins (never stretches). The board is terminal-native text
  so it reflows for free. Verified with screenshots at ~390 / 768 / 1440 / 2560px, dark + light.

## CI / integration

- `npm run validate` (html-validate, recommended) must pass on `site/cafe/**/*.html`.
- The Playwright smoke suite only drives `/` and `/root/` — `/cafe` is independent, so it can't
  break existing tests. (Optional later: add cafe smoke tests.)
- The tracked-file **leak guard** (honeypot answers) must stay green — run locally before pushing
  via the existing `secret/answer.txt`; cafe content uses its own café/tech vocabulary.
- CSP (`script-src 'self'`) → external ES modules only, no inline `<script>`/handlers.

## Out of scope / future

Arcade easter-eggs; more challenge families; a tiny optional mascot; a share-your-progress card;
its own domain. None block v1.
