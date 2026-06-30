# Byte Café — "Classic" theme skins (rainbow-Apple era, + optional green mono)

> **Status: SHIPPED (2026-06-29).** Both skins built + live. Owner chose "implement and iterate,"
> so the recommended defaults were taken: **[DECIDE-1]** skins are extra `data-theme` values and
> the titlebar button cycles dark→light→classic (with `theme <name>` selecting any directly);
> **[DECIDE-2]** Mono ships as a **command-only** opt-in (`theme mono`), kept out of the cycle;
> **[DECIDE-3]** Classic gets the rainbow ambient blobs. Verified: classic (flat platinum + rainbow
> stripe + rainbow markers/games), mono (green phosphor + scanlines), cycle + persistence, zero
> console errors. Tweak freely from here.

## 0. Why this is cheap (context)

The café already themes itself entirely through CSS custom properties on `html[data-theme=…]`:

- `cafe.css` defines two palettes today — `html[data-theme="dark"]` (periwinkle) and
  `html[data-theme="light"]` (periwinkle) — each setting the same variable set:
  `--bg --surface --overlay --text --muted --subtle --line --accent --ok --warn --rose --love
  --pine --kbd-bg --shadow`.
- `js/theme.js` paints `data-theme`, persists `cafe.theme`, sets `<meta theme-color>`, and the
  titlebar `#themebtn` toggles. It currently only accepts `"dark"`/`"light"`.
- The **games** (`js/games/host.js` `readPalette()`) and the **ambient** scene read those same
  variables live and re-read on a `data-theme` MutationObserver — so anything that paints adapts
  to a new skin **with zero per-game code changes**.

**Therefore a skin = (1) one new `html[data-theme="…"]` variable block + (2) optional skin-only
chrome rules + (3) registering the skin in `theme.js`/the `theme` command.** That's the whole job.

This is café-only. The `/root` honeypot has its own separate theme system (`cg.theme`,
fire/matrix/…); **do not touch it.**

## 1. Decisions to confirm at approval

- **[DECIDE-1] Picker model.** Recommend: skins become additional `data-theme` values, so there's
  one theme axis with N options (no skin×light/dark matrix). The `#themebtn` **cycles**
  dark → light → classic → dark; `theme <name>` selects any directly. Simple, fits what's there.
- **[DECIDE-2] Ship Mono?** Recommend: build **Classic** for sure; build **Mono** as a
  **command-only opt-in** (`theme mono`), *kept out of the click-cycle*, labeled experimental —
  or abandon it. Rationale in §3. Your call at approval: *cycle it / command-only / abandon.*
- **[DECIDE-3] Rainbow lava-lamp.** Optional flourish: in Classic, make the minimized ambient use
  the six rainbow blobs instead of one accent hue. Recommend yes (it's adorable and on-theme).

## 2. Skin A — "Classic" (rainbow-Apple / platinum)  ← the one you're sure about

**Vibe:** late-80s/90s Apple. Flat **platinum** surfaces, crisp 1px borders, (almost) no shadow,
and the **six-colour rainbow** as the signature accent — placed as a thin stripe on the titlebar
and used to colour the things that are already multi-hued (CTF family markers, badges, Tetris
pieces, breakout rows, particles). Because the games read these vars, **Classic makes the arcade
render in full rainbow** — Tetris in six Apple colours is the payoff.

**Proposed palette** (owner-tweakable at approval):

```css
html[data-theme="classic"] {
  --bg: #e7e5dc;        /* warm platinum */
  --surface: #d8d5c8;   /* titlebar / panels */
  --overlay: #cdc9ba;   /* rows / kbd */
  --text: #1c1c19; --muted: #56544b; --subtle: #87857a;
  --line: #a9a698;      /* flat 1px borders */
  /* the Apple six, mapped onto the existing slots: */
  --ok:  #3a9e3a;  /* green  */
  --warn:#e07b00;  /* orange */
  --love:#d6322c;  /* red    */
  --rose:#b0359a;  /* magenta/violet */
  --accent:#7a3d97;/* violet (primary accent) */
  --pine:#1f7fc2;  /* blue   */
  --kbd-bg:#dedbce;
  --shadow: 0 1px 0 rgba(0,0,0,0.18);  /* flat: a hairline, not a soft drop */
}
```

**Skin-only chrome (Classic):**
- A thin **six-stripe rainbow bar** on the `.titlebar` (green→yellow→orange→red→violet→blue),
  echoing the logo. Pure CSS `linear-gradient` band; ~3px tall under/over the titlebar.
- Flatten the window: replace the big soft shadow with a 1px `--line` border + the hairline shadow.
- Keep the traffic-light dots (they're era-appropriate-ish) but flatten any gloss.
- Typography stays system-mono. **Constraint:** CSP (`script-src/style-src 'self'`, `font-src
  'self'`) forbids loading Chicago/pixel webfonts, so we evoke the era with **colour + flatness +
  the rainbow**, not a retro font. (Honest limitation — see §5.)

**Acceptance:** terminal, board, badges, all five games, and the ambient all read as flat platinum
with rainbow accents; contrast passes for `--text`/`--muted` on platinum; Tetris/breakout show the
six hues distinctly.

## 3. Skin B — "Mono" (green-on-black phosphor)  ← optional / experimental

**Vibe:** Apple ][ / VT100 P1-phosphor terminal — green on near-black, flat, optional faint
scanline/vignette.

**Proposed palette:**

```css
html[data-theme="mono"] {
  --bg:#001100; --surface:#002600; --overlay:#003a00;
  --text:#33ff66; --muted:#1f9a48; --subtle:#127a36; --line:#0a4a1f;
  --accent:#66ff99; --ok:#33ff66; --warn:#9dff5a; --rose:#5affc0; --love:#aaff33; --pine:#2fd07a;
  --kbd-bg:#002a10; --shadow: 0 0 0 1px rgba(51,255,102,0.25);
}
```

**The honest tradeoffs (why this might get abandoned):**
1. **It flattens the games to monochrome** — every var is a shade of green, so Tetris/breakout
   pieces differ only by brightness. Authentic, but it kills the colourful "juice." (The 4K glow
   does become a nice green neon.)
2. **It reads as the *dread* side.** Green-on-black is exactly the `/root` honeypot's `matrix`
   theme. The café's whole identity is the *warm* twin; a stark phosphor terminal undercuts that.
3. Optional scanlines add a CRT feel but cost a little perf/motion (gate behind
   `prefers-reduced-motion`).

**Recommendation:** if built, make it **`theme mono` only** (not in the cycle) with a wink in the
voice ("the night shift prefers it this way"), so it's an easter-egg skin that doesn't dilute the
default cozy vibe. If even that feels off-brand at approval, **abandon it** — Classic carries the
feature on its own.

## 4. Implementation plan (once approved)

1. **`theme.js`** — generalize from a dark/light toggle to a small theme **registry**:
   `THEMES = [{ id, label, meta }]` with a cycle order (`dark, light, classic` [+ `mono` if in
   cycle]). `set(id)` accepts any registered id; `current()`; `initTheme()` still defaults dark and
   honours `prefers-color-scheme: light` on first visit *only* between dark/light. Per-theme
   `<meta name="theme-color">`. `#themebtn` cycles and shows a **CSS/typographic indicator** of the
   current theme (a small swatch or glyph — **no emoji**, per the established typographic voice).
2. **`cafe.css`** — add the `html[data-theme="classic"]` and (if approved) `[data-theme="mono"]`
   variable blocks, plus skin-scoped chrome rules (`[data-theme="classic"] .titlebar` rainbow
   stripe + flat window; optional `[data-theme="mono"]` scanline overlay behind
   `@media (prefers-reduced-motion: no-preference)`).
3. **`app.js` `meta.theme`** — accept `dark|light|classic|mono`; bare `theme` cycles; update the
   `help` "look & feel" line and `about`.
4. **`index.html`** — generalize `#themebtn` `aria-label`/`title` to "Switch theme."
5. **Games/ambient** — no logic changes expected; verify palettes give good contrast and (if
   [DECIDE-3]) wire Classic's rainbow blobs in `window.js`/`cafe.css`.
6. **Save codes** — theme is a *preference*, not progress; leave it out of the save code (could
   encode it in 2 spare bits later; not now).

## 5. Constraints (don't break)
- **CSP** `script-src/style-src/font-src 'self'` — no external/retro webfonts; no inline scripts.
  Skins are pure CSS var blocks + the existing external modules.
- **Reduced motion** — any scanline/animated skin chrome must be off under
  `prefers-reduced-motion: reduce`.
- **Contrast/a11y** — verify `--text`/`--muted`/`--subtle` legibility on each skin (platinum is the
  one to watch; mono green-on-black is fine).
- **html-validate** stays green; the Playwright **smoke suite doesn't touch `/cafe`**, and `/root`
  is untouched, so both stay green.
- **`/root` is off-limits** — its theme system is separate; this is café-only.

## 6. Verify + deploy (once built)
- `npm run validate`; screenshot **each skin** (terminal, `ls`/`badges`, one game in 4K, the
  minimized ambient) at ~390 / 768 / 1440; confirm games + ambient adopt each palette; confirm the
  theme cycle + `theme <name>` + persistence + `<meta theme-color>`; reduced-motion check.
- Leak-guard pre-check; `npm run ci`; commit + push → Pages deploy; confirm `/cafe/` 200.

## 7. Out of scope / future
Retro webfonts (CSP); CRT barrel-distortion; per-skin sounds; auto theme by time of day; encoding
theme into the save code; more skins (amber phosphor, C64, etc. — trivial to add later given the
registry).
