# The Reflection: Device-Posture Mirror — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permission-free "spooky mirror" to the `/root` M365/Intune honeypot that reflects a visitor's real machine back as cryptic Intune-style device telemetry — ambient whispers building to a device-posture dossier.

**Architecture:** A self-contained client engine under `site/root/js/mirror/` (probes → derived sigil → cryptic lines → dossier) driven by an orchestrator wired into `agent.js`, plus two same-origin Pages Functions (`/api/mirror/echo` cookieless recognition, `/api/mirror` edge cross-check + KV memory). Identity is *derived* (recomputed each visit), never hoarded. Phase 1 (Tasks 1–5) is a fully working client-only mirror; Phase 2 (Tasks 6–8) layers edge truth + cross-storage memory.

**Tech Stack:** Vanilla ES modules (browser), Cloudflare Pages Functions (`onRequestGet`/`onRequestPost`), Web Crypto (`crypto.subtle`), KV (`PRESENCE`), Playwright over `wrangler pages dev`.

## Global Constraints

Every task's requirements implicitly include all of these — copied verbatim from the spec:

- **Reflect-to-self only.** Everything shown is the visitor's own machine/request, shown back to them. No third parties; no cross-site tracking; no LAN reach. **WebRTC and Battery API are excluded.**
- **Same-origin, CSP unchanged.** All probes are client-side; both endpoints are same-origin (`connect-src 'self'` already covers the POST). **No edit to `site/_headers`.**
- **Text-node output only.** The mirror renders exclusively through the terminal's `println` (which does `createTextNode`). Never `innerHTML`.
- **Orthogonal to the puzzle.** The mirror reads/writes **only** its own `cg.mirror.*` localStorage keys. It never touches the gate, the ritual, or the reckoning's `cg.haunt`, and never blocks/delays/alters the three-proofs solve.
- **Degrade silently.** Any probe may throw → omit it. Any edge field may be absent (`pages.dev`, local `wrangler dev`, no Bot Management) → omit it. `/api/mirror/*` must never return 500.
- **Reuse existing infra.** KV binding `PRESENCE` and secret `SIGN_KEY` only. No new binding, no new secret, no new KV namespace.
- **No answer strings.** Introduce no puzzle-answer text anywhere; the CI leak-guard (`tests/smoke.spec.js`) must stay green.
- **Zero runtime deps.** Everything self-hosted, matching the rest of the repo.

**Test invocation (all tasks):** the Playwright `webServer` auto-starts `wrangler pages dev` on port 4173. Run a single test with:
`npx playwright test tests/mirror.spec.js -g "<title>"`
Run everything with `npm run ci`.

---

### Task 1: The probe roster (`probes.js`)

**Files:**
- Create: `site/root/js/mirror/probes.js`
- Create: `tests/mirror.spec.js`

**Interfaces:**
- Produces: `export async function collectProbes(): Promise<Record<string, {value: any, osHint?: string}>>` — runs every probe, each isolated in try/catch; a failing probe is simply absent from the result. `osHint` ∈ `"windows" | "macos" | "ios" | "linux" | "android"` or absent. Keys: `libm, uach, emoji, webgl, canvas, screen, hardware, storage, net, intl, theme, engine, audio, clock`.

- [ ] **Step 1: Write the failing test**

Create `tests/mirror.spec.js`:

```js
import { test, expect } from "@playwright/test";

test.describe("the reflection — client probes", () => {
  test("collectProbes returns normalized shapes and never throws", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/root/");
    const result = await page.evaluate(async () => {
      const { collectProbes } = await import("/root/js/mirror/probes.js");
      return await collectProbes();
    });
    // core probes present in a headless-chromium/desktop context
    for (const k of ["libm", "webgl", "canvas", "screen", "hardware", "intl", "theme", "engine", "clock"]) {
      expect(result[k], `probe ${k} present`).toBeTruthy();
      expect(result[k]).toHaveProperty("value");
    }
    // every present probe has a defined value and, if osHint set, a valid enum
    const OS = new Set(["windows", "macos", "ios", "linux", "android"]);
    for (const [k, entry] of Object.entries(result)) {
      expect(entry.value, `${k}.value defined`).toBeDefined();
      if (entry.osHint !== undefined) expect(OS.has(entry.osHint), `${k}.osHint valid`).toBeTruthy();
    }
    expect(errors, `probe collection threw: ${errors.join(" | ")}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/mirror.spec.js -g "collectProbes returns normalized"`
Expected: FAIL — `Failed to fetch dynamically imported module .../mirror/probes.js` (file does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `site/root/js/mirror/probes.js`:

```js
// The probe roster. Each probe is a small, isolated reader of one facet of the
// visitor's machine — permission-free, no prompts, no network. collectProbes()
// runs them all; a probe that throws is simply absent (degrade silently). Every
// result is normalized to { value, osHint? }. Nothing here is stored or sent by
// this module — that is the orchestrator's job.

const OS = { WIN: "windows", MAC: "macos", IOS: "ios", LINUX: "linux", ANDROID: "android" };

// deterministic 32-bit FNV-1a over a string → 8-hex, used to compress raster/render
// signatures into a short stable token.
function fnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// ── OS / arithmetic accent ────────────────────────────────────────────────
// NOTE: modern V8 ships its own math impl, so pure JS Math is a strong ENGINE/
// build discriminator and entropy source more than an OS one. We keep a hashed
// signature for entropy; OS inference (lines.js) leans on webgl/uach/emoji.
function probeLibm() {
  const fns = ["tan", "sin", "cos", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh", "exp", "expm1", "log1p", "cbrt"];
  const xs = [1e300, -1e300, 0.5, Math.PI / 4, 1e-10, 17];
  let s = "";
  for (const f of fns) for (const x of xs) {
    const v = Math[f](x);
    s += (Number.isFinite(v) ? v.toExponential(15) : String(v)) + ",";
  }
  return { value: fnv1a(s) };
}

// ── UA Client Hints (high entropy; Chromium) ──────────────────────────────
async function probeUach() {
  const uaData = navigator.userAgentData;
  if (!uaData || !uaData.getHighEntropyValues) return null;
  const h = await uaData.getHighEntropyValues([
    "platform", "platformVersion", "architecture", "bitness", "model", "fullVersionList",
  ]);
  const plat = (h.platform || "").toLowerCase();
  let osHint;
  if (plat.includes("win")) osHint = OS.WIN;
  else if (plat.includes("mac")) osHint = OS.MAC;
  else if (plat.includes("android")) osHint = OS.ANDROID;
  else if (plat.includes("linux") || plat.includes("chrome os")) osHint = OS.LINUX;
  else if (plat.includes("ios") || plat.includes("iphone") || plat.includes("ipad")) osHint = OS.IOS;
  return { value: h, osHint };
}

// ── emoji rasterization (Apple vs Segoe vs Noto → OS) ─────────────────────
function probeEmoji() {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.font = "40px sans-serif";
  const w = ctx.measureText("😀🦄👋").width; // 😀🦄👋
  // pixel signature too, for entropy
  c.width = 64; c.height = 48;
  ctx.textBaseline = "top";
  ctx.font = "36px sans-serif";
  ctx.fillText("😀", 0, 0);
  const sig = fnv1a(c.toDataURL());
  return { value: { w: Math.round(w * 100) / 100, sig } };
}

// ── WebGL renderer (GPU + ANGLE backend → OS) ─────────────────────────────
function probeWebgl() {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
  if (!gl) return null;
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  const r = String(renderer || "");
  let osHint;
  if (/direct3d|d3d11|ANGLE.*Direct3D/i.test(r)) osHint = OS.WIN;
  else if (/metal|apple/i.test(r)) osHint = OS.MAC;
  else if (/adreno|mali|powervr/i.test(r)) osHint = OS.ANDROID;
  else if (/mesa|llvmpipe|vulkan|opengl/i.test(r)) osHint = OS.LINUX;
  return { value: { renderer: r, vendor: String(vendor || "") }, osHint };
}

// ── canvas 2D text hash (driver/font hinting) ─────────────────────────────
function probeCanvas() {
  const c = document.createElement("canvas");
  c.width = 240; c.height = 60;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.textBaseline = "alphabetic";
  ctx.font = "18px 'Arial'";
  ctx.fillStyle = "#f60";
  ctx.fillRect(1, 1, 62, 20);
  ctx.fillStyle = "#069";
  ctx.fillText("come and get us 🔥", 4, 30);
  ctx.strokeStyle = "rgba(120,0,60,0.7)";
  ctx.beginPath(); ctx.arc(60, 30, 18, 0, Math.PI * 2); ctx.stroke();
  return { value: fnv1a(c.toDataURL()) };
}

// ── screen / display ──────────────────────────────────────────────────────
function probeScreen() {
  const mq = (q) => (window.matchMedia && window.matchMedia(q).matches) || false;
  const gamut = mq("(color-gamut: p3)") ? "p3" : mq("(color-gamut: srgb)") ? "srgb" : "unknown";
  const hdr = mq("(dynamic-range: high)") ? "high" : "standard";
  return { value: {
    w: screen.width, h: screen.height, dpr: window.devicePixelRatio || 1,
    depth: screen.colorDepth, gamut, hdr,
  } };
}

// ── hardware / input ──────────────────────────────────────────────────────
function probeHardware() {
  const mq = (q) => (window.matchMedia && window.matchMedia(q).matches) || false;
  return { value: {
    cores: navigator.hardwareConcurrency || null,
    memory: navigator.deviceMemory || null,
    touch: navigator.maxTouchPoints || 0,
    pointer: mq("(pointer: fine)") ? "fine" : mq("(pointer: coarse)") ? "coarse" : "none",
    hover: mq("(hover: hover)") ? "hover" : "none",
  } };
}

// ── storage quota (rough disk bucket) ─────────────────────────────────────
async function probeStorage() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  const est = await navigator.storage.estimate();
  const gib = est.quota ? Math.round((est.quota / 1073741824) * 10) / 10 : null;
  return { value: { quotaGiB: gib } };
}

// ── network class ─────────────────────────────────────────────────────────
function probeNet() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return null;
  return { value: { effectiveType: c.effectiveType || null, downlink: c.downlink || null, rtt: c.rtt != null ? c.rtt : null } };
}

// ── locale / timezone ─────────────────────────────────────────────────────
function probeIntl() {
  const opts = Intl.DateTimeFormat().resolvedOptions();
  return { value: {
    tz: opts.timeZone || null,
    locale: opts.locale || null,
    calendar: opts.calendar || null,
    numbering: opts.numberingSystem || null,
    languages: (navigator.languages || [navigator.language]).slice(0, 6),
  } };
}

// ── OS theme / accessibility ──────────────────────────────────────────────
function probeTheme() {
  const mq = (q) => (window.matchMedia && window.matchMedia(q).matches) || false;
  return { value: {
    scheme: mq("(prefers-color-scheme: dark)") ? "dark" : "light",
    reducedMotion: mq("(prefers-reduced-motion: reduce)"),
    contrast: mq("(prefers-contrast: more)") ? "more" : mq("(prefers-contrast: less)") ? "less" : "no-preference",
    forcedColors: mq("(forced-colors: active)"),
  } };
}

// ── JS engine family (error-stack / quirks) ───────────────────────────────
function probeEngine() {
  let engine = "unknown";
  try {
    const stack = new Error().stack || "";
    if (/@\S+:\d+:\d+/.test(stack) && !/\bat\b/.test(stack)) engine = "spidermonkey";
    else if (/\n\s+at\s/.test(stack)) engine = "v8";
  } catch {}
  if (engine === "unknown") {
    if (typeof window.chrome !== "undefined") engine = "v8";
    else if (typeof window.InstallTrigger !== "undefined") engine = "spidermonkey";
    else if (/constructor/i.test(String(window.HTMLElement))) engine = "javascriptcore";
  }
  return { value: engine };
}

// ── audio DSP hash (OfflineAudioContext; silent, no permission) ───────────
async function probeAudio() {
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AC) return null;
  return await new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const ctx = new AC(1, 5000, 44100);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 10000;
      const comp = ctx.createDynamicsCompressor();
      osc.connect(comp); comp.connect(ctx.destination);
      osc.start(0);
      ctx.oncomplete = (e) => {
        const data = e.renderedBuffer.getChannelData(0);
        let acc = 0;
        for (let i = 4000; i < 5000; i++) acc += Math.abs(data[i]);
        finish({ value: acc.toString().slice(0, 16) });
      };
      ctx.startRendering();
      setTimeout(() => finish(null), 1000); // never hang the collection
    } catch { finish(null); }
  });
}

// ── clock resolution ──────────────────────────────────────────────────────
function probeClock() {
  let min = Infinity;
  let prev = performance.now();
  for (let i = 0; i < 50000 && min > 0; i++) {
    const t = performance.now();
    const d = t - prev;
    if (d > 0 && d < min) min = d;
    prev = t;
  }
  return { value: { minDeltaMs: Number.isFinite(min) ? min : null } };
}

const PROBES = {
  libm: probeLibm, uach: probeUach, emoji: probeEmoji, webgl: probeWebgl,
  canvas: probeCanvas, screen: probeScreen, hardware: probeHardware,
  storage: probeStorage, net: probeNet, intl: probeIntl, theme: probeTheme,
  engine: probeEngine, audio: probeAudio, clock: probeClock,
};

export async function collectProbes() {
  const out = {};
  await Promise.all(Object.entries(PROBES).map(async ([key, fn]) => {
    try {
      const r = await fn();
      if (r && r.value !== undefined && r.value !== null) out[key] = r;
    } catch { /* degrade silently — probe simply absent */ }
  }));
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/mirror.spec.js -g "collectProbes returns normalized"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/root/js/mirror/probes.js tests/mirror.spec.js
git commit -m "feat(reflection): permission-free device probe roster"
```

---

### Task 2: The derived sigil (`sigil.js`)

**Files:**
- Create: `site/root/js/mirror/sigil.js`
- Modify: `tests/mirror.spec.js` (append a test)

**Interfaces:**
- Consumes: `collectProbes()` output shape from Task 1.
- Produces:
  - `export function stableMaterial(probes): string` — deterministic serialization of only the stable dimensions (`libm, webgl.renderer, canvas, intl.tz, hardware.cores, screen.gamut, emoji.w`).
  - `export async function deriveSigil(probes): Promise<string>` — SHA-256 hex of `stableMaterial(probes)`. Recomputed every call; stored nowhere.

- [ ] **Step 1: Write the failing test**

Append to `tests/mirror.spec.js` inside the same `describe`:

```js
  test("deriveSigil is stable across repeated collection on the same machine", async ({ page }) => {
    await page.goto("/root/");
    const [a, b] = await page.evaluate(async () => {
      const { collectProbes } = await import("/root/js/mirror/probes.js");
      const { deriveSigil } = await import("/root/js/mirror/sigil.js");
      const s1 = await deriveSigil(await collectProbes());
      const s2 = await deriveSigil(await collectProbes());
      return [s1, s2];
    });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b); // recomputes to the same value — the resilience property
  });

  test("stableMaterial ignores volatile probes (theme/net/clock)", async ({ page }) => {
    await page.goto("/root/");
    const changed = await page.evaluate(async () => {
      const { deriveSigil } = await import("/root/js/mirror/sigil.js");
      const base = { webgl: { value: { renderer: "ANGLE (Direct3D11)" } }, intl: { value: { tz: "UTC" } },
        hardware: { value: { cores: 8 } }, screen: { value: { gamut: "srgb" } },
        emoji: { value: { w: 120 } }, canvas: { value: "abc" }, libm: { value: "def" } };
      const s1 = await deriveSigil(base);
      const s2 = await deriveSigil({ ...base, theme: { value: { scheme: "dark" } }, net: { value: { rtt: 50 } }, clock: { value: { minDeltaMs: 0.1 } } });
      return s1 === s2;
    });
    expect(changed, "volatile probes must not move the sigil").toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/mirror.spec.js -g "deriveSigil is stable"`
Expected: FAIL — module `sigil.js` not found.

- [ ] **Step 3: Write the implementation**

Create `site/root/js/mirror/sigil.js`:

```js
// The derived sigil: identity by RECOMPUTATION, not storage. We hash only the
// STABLE dimensions of the fingerprint, so clearing every store on the machine
// changes nothing — the arithmetic still has the same accent, the GPU still
// names itself, and the sigil re-derives. This is the whole of the "we still
// knew you" resilience: recognition, not an evercookie fighting the delete key.

const pick = (o, path, dflt) => {
  let n = o;
  for (const k of path) { if (n == null) return dflt; n = n[k]; }
  return n == null ? dflt : n;
};

export function stableMaterial(probes) {
  const p = probes || {};
  const parts = [
    "libm=" + pick(p, ["libm", "value"], "-"),
    "webgl=" + pick(p, ["webgl", "value", "renderer"], "-"),
    "canvas=" + pick(p, ["canvas", "value"], "-"),
    "tz=" + pick(p, ["intl", "value", "tz"], "-"),
    "cores=" + pick(p, ["hardware", "value", "cores"], "-"),
    "gamut=" + pick(p, ["screen", "value", "gamut"], "-"),
    "emoji=" + pick(p, ["emoji", "value", "w"], "-"),
  ];
  return parts.join("|");
}

export async function deriveSigil(probes) {
  const material = stableMaterial(probes);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/mirror.spec.js -g "deriveSigil is stable"` then `-g "stableMaterial ignores"`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add site/root/js/mirror/sigil.js tests/mirror.spec.js
git commit -m "feat(reflection): derived sigil — identity by recomputation"
```

---

### Task 3: OS inference + the voice (`lines.js`)

**Files:**
- Create: `site/root/js/mirror/lines.js`
- Modify: `tests/mirror.spec.js` (append)

**Interfaces:**
- Consumes: `collectProbes()` output.
- Produces:
  - `export function inferOS(probes): { os: string|null, confidence: "high"|"medium"|"low", signals: object }` — priority: `uach.osHint` (high) → `webgl.osHint` (medium) → `emoji`/`libm` tiebreak (low). Voice attributes the tell to "arithmetic," code uses the graphics/UA-CH stack.
  - `export function ambientLines(probes): string[]` — cryptic `[intune] …`-style one-liners, safe to drip during a session.
  - `export function dossierLines({ probes, os, edge, deltas, seen }): string[]` — the assembled device-posture report block. `edge`, `deltas`, `seen` may be undefined (client-only phase) and are simply omitted.

- [ ] **Step 1: Write the failing test**

Append to `tests/mirror.spec.js`:

```js
  test("inferOS reads Windows from a Direct3D WebGL backend", async ({ page }) => {
    await page.goto("/root/");
    const os = await page.evaluate(async () => {
      const { inferOS } = await import("/root/js/mirror/lines.js");
      return inferOS({ webgl: { value: { renderer: "ANGLE (NVIDIA, Direct3D11)" }, osHint: "windows" } });
    });
    expect(os.os).toBe("windows");
    expect(["high", "medium", "low"]).toContain(os.confidence);
  });

  test("dossierLines assembles a non-empty posture block and stays answer-clean", async ({ page }) => {
    await page.goto("/root/");
    const lines = await page.evaluate(async () => {
      const { inferOS, dossierLines } = await import("/root/js/mirror/lines.js");
      const probes = { webgl: { value: { renderer: "ANGLE (Apple M2, Metal)" }, osHint: "macos" },
        intl: { value: { tz: "America/New_York", languages: ["en-US"] } },
        hardware: { value: { cores: 10 } }, screen: { value: { w: 1512, h: 982, dpr: 2 } } };
      return dossierLines({ probes, os: inferOS(probes) });
    });
    expect(Array.isArray(lines)).toBeTruthy();
    expect(lines.length).toBeGreaterThan(3);
    const blob = lines.join("\n").toLowerCase();
    expect(blob).toContain("posture");
    expect(blob).not.toContain("mothman"); // never carries puzzle content
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/mirror.spec.js -g "inferOS reads Windows"`
Expected: FAIL — module `lines.js` not found.

- [ ] **Step 3: Write the implementation**

Create `site/root/js/mirror/lines.js`:

```js
// The voice. Findings → cryptic, terminal-dry, Microsoft-honeypot-flavored lines.
// The register matches /root: quietly menacing MDM/telemetry, never punitive.
// OS inference: uach (high) > webgl backend (medium) > emoji/libm (low). The copy
// attributes the tell to "arithmetic/handshake"; the signal is really the stack.

const ACCENT = {
  windows: "a redmond accent",
  macos: "answers in metal — cupertino, then",
  ios: "the small glass. cupertino, in your pocket",
  linux: "computes like a server. no one lives in a server",
  android: "green robot arithmetic",
};

export function inferOS(probes) {
  const p = probes || {};
  const uach = p.uach && p.uach.osHint;
  const webgl = p.webgl && p.webgl.osHint;
  const emoji = p.emoji && p.emoji.osHint;
  const libm = p.libm && p.libm.osHint;
  if (uach) return { os: uach, confidence: "high", signals: { uach, webgl, emoji } };
  if (webgl) return { os: webgl, confidence: "medium", signals: { webgl, emoji } };
  const t = emoji || libm;
  if (t) return { os: t, confidence: "low", signals: { emoji, libm } };
  return { os: null, confidence: "low", signals: {} };
}

const val = (o, path, dflt) => {
  let n = o; for (const k of path) { if (n == null) return dflt; n = n[k]; } return n == null ? dflt : n;
};

export function ambientLines(probes) {
  const p = probes || {};
  const out = [];
  const os = inferOS(p).os;
  if (os && ACCENT[os]) out.push(`[intune] posture sync — your arithmetic has ${ACCENT[os]}.`);
  const cores = val(p, ["hardware", "value", "cores"], null);
  if (cores) out.push(`[intune] ${cores} logical processors, and not one of them noticed us reading.`);
  const tz = val(p, ["intl", "value", "tz"], null);
  if (tz) out.push(`[telemetry] you keep time in ${tz}. we'll wait — we're good at it.`);
  const gpu = val(p, ["webgl", "value", "renderer"], null);
  if (gpu) out.push(`[intune] we can see what you draw with. ${gpu}.`);
  return out;
}

export function dossierLines({ probes, os, edge, deltas, seen } = {}) {
  const p = probes || {};
  const L = [];
  L.push("── INTUNE · DEVICE POSTURE (the one we didn't have to fake) ──");
  if (seen && seen.returning) {
    L.push(" NEO-WS01 checked in. so did you — again. we kept your shape from last");
    L.push(" time" + (seen.count ? ` (visit ${seen.count})` : "") + ". it hasn't changed.");
  }
  const resolved = (os && os.os) || inferOS(p).os;
  L.push(" enrolled OS   : " + (resolved ? resolved + (ACCENT[resolved] ? "  — " + ACCENT[resolved] : "") : "unreadable (you hide well)"));
  const gpu = val(p, ["webgl", "value", "renderer"], null);
  if (gpu) L.push(" display GPU   : " + gpu);
  const scr = val(p, ["screen", "value"], null);
  if (scr) L.push(" panel         : " + scr.w + "×" + scr.h + " @" + (scr.dpr || 1) + "x, " + (scr.gamut || "?") + "/" + (scr.hdr || "?"));
  const cores = val(p, ["hardware", "value", "cores"], null);
  const mem = val(p, ["hardware", "value", "memory"], null);
  if (cores || mem) L.push(" compute       : " + (cores || "?") + " cores" + (mem ? " · ~" + mem + " GiB class" : ""));
  const tz = val(p, ["intl", "value", "tz"], null);
  const langs = val(p, ["intl", "value", "languages"], null);
  if (tz) L.push(" locale        : " + tz + (langs ? "  " + langs.join(",") : ""));
  if (edge && edge.country) L.push(" edge          : exited via " + edge.country + (edge.asOrganization ? " · " + edge.asOrganization : "") + (edge.httpProtocol ? " · " + edge.httpProtocol : ""));
  if (edge && (edge.tlsVersion || edge.ja3)) L.push(" handshake     : " + [edge.tlsVersion, edge.tlsCipher, edge.ja3 ? "ja3 " + edge.ja3 : null].filter(Boolean).join(" · "));
  if (deltas && deltas.length) {
    L.push(" ── discrepancies ──");
    for (const d of deltas) L.push("  · " + d);
    L.push(" the tenant believes the handshake. it always does.");
  } else {
    L.push(" compliance    : noncompliant — not the device's. yours.");
  }
  L.push("──────────────────────────────────────────────────────────");
  return L;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/mirror.spec.js -g "inferOS reads Windows"` then `-g "dossierLines assembles"`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add site/root/js/mirror/lines.js tests/mirror.spec.js
git commit -m "feat(reflection): OS inference + the Intune-register voice"
```

---

### Task 4: The dossier renderer (`dossier.js`)

**Files:**
- Create: `site/root/js/mirror/dossier.js`
- Modify: `tests/mirror.spec.js` (append)

**Interfaces:**
- Consumes: `dossierLines(...)` from Task 3.
- Produces: `export function printDossier(println, report): void` — calls `println` once per line (text-node output only). `report` is the `{ probes, os, edge, deltas, seen }` object passed to `dossierLines`.

- [ ] **Step 1: Write the failing test**

Append to `tests/mirror.spec.js`:

```js
  test("printDossier emits each posture line through println (text only)", async ({ page }) => {
    await page.goto("/root/");
    const emitted = await page.evaluate(async () => {
      const { inferOS } = await import("/root/js/mirror/lines.js");
      const { printDossier } = await import("/root/js/mirror/dossier.js");
      const captured = [];
      const probes = { webgl: { value: { renderer: "ANGLE (Direct3D11)" }, osHint: "windows" }, hardware: { value: { cores: 8 } } };
      printDossier((s) => captured.push(String(s)), { probes, os: inferOS(probes) });
      return captured;
    });
    expect(emitted.length).toBeGreaterThan(3);
    expect(emitted.join("\n")).toContain("DEVICE POSTURE");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/mirror.spec.js -g "printDossier emits"`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `site/root/js/mirror/dossier.js`:

```js
// Renders the device-posture dossier into the terminal. Output goes ONLY through
// the caller's println (which does createTextNode) — never innerHTML.

import { dossierLines } from "./lines.js";

export function printDossier(println, report) {
  if (typeof println !== "function") return;
  for (const line of dossierLines(report || {})) println(line);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/mirror.spec.js -g "printDossier emits"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/root/js/mirror/dossier.js tests/mirror.spec.js
git commit -m "feat(reflection): dossier renderer (text-node only)"
```

---

### Task 5: Orchestrator + wiring (`mirror.js`, `agent.js`, `shell.js`)

**Files:**
- Create: `site/root/js/mirror.js`
- Modify: `site/root/js/agent.js` (add wiring after `initTerminal`)
- Modify: `site/root/js/shell.js` (accept `getMirror`, add `dsregcmd /status` branch)
- Modify: `tests/smoke.spec.js` (add the 3 new files to the `SHIPPED` array — leak-guard coverage)
- Modify: `tests/mirror.spec.js` (append integration tests)

**Interfaces:**
- Consumes: `collectProbes` (T1), `deriveSigil` (T2), `ambientLines`/`inferOS` (T3), `printDossier` (T4).
- Produces: `export function createMirror({ println, run, vigil, flare }): { reveal(reason?): Promise<void>, primed: boolean }`.
  - Reads `?mirror=now` → reveals immediately; `?mirror=off` → fully inert.
  - Drips 1 ambient line per idle interval; after `AMBIENT_THRESHOLD` drips **or** a recognized return, auto-reveals once.
  - `reveal()` collects probes, derives the sigil, prints the dossier once, sets a session guard. Client-only in this phase (`edge`/`deltas`/`seen` absent).
  - Reads/writes **only** `localStorage["cg.mirror.seen"]` (`{count, last}`).
- `shell.js`: `initTerminal` gains a `getMirror` option; `dsregcmd` gains: if `io.rest` matches `/\/status\b/i`, call `getMirror()?.reveal("dsregcmd")` and return a short "fetching live posture…" string; otherwise unchanged.

- [ ] **Step 1: Write the failing integration test**

Append to `tests/mirror.spec.js`:

```js
  test("?mirror=now surfaces the device-posture dossier in the terminal", async ({ page }) => {
    await page.goto("/root/?mirror=now");
    await expect(page.locator("#term")).toContainText("DEVICE POSTURE", { timeout: 8000 });
  });

  test("dsregcmd /status pulls the real posture; bare dsregcmd keeps the fake", async ({ page }) => {
    await page.goto("/root/?mirror=off"); // keep auto-reveal from racing the assertion
    await page.fill("#cmd", "dsregcmd");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("AzureAdJoined : YES");
    await expect(page.locator("#term")).not.toContainText("DEVICE POSTURE");
    await page.fill("#cmd", "dsregcmd /status");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("DEVICE POSTURE", { timeout: 8000 });
  });

  test("the mirror never touches the puzzle's haunt state", async ({ page }) => {
    await page.goto("/root/?mirror=now");
    await expect(page.locator("#term")).toContainText("DEVICE POSTURE", { timeout: 8000 });
    const haunt = await page.evaluate(() => localStorage.getItem("cg.haunt"));
    expect(haunt, "mirror must not create/modify cg.haunt").toBeNull();
    const seen = await page.evaluate(() => localStorage.getItem("cg.mirror.seen"));
    expect(seen, "mirror owns cg.mirror.seen").not.toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/mirror.spec.js -g "surfaces the device-posture"`
Expected: FAIL — `?mirror=now` does nothing (mirror not wired).

- [ ] **Step 3a: Write the orchestrator**

Create `site/root/js/mirror.js`:

```js
// The Reflection — orchestrator. Boots from agent.js. Drips ambient Intune-style
// telemetry, watches a threshold (accreted drips OR a recognized return), and
// surfaces the device-posture dossier once. Reads/writes ONLY cg.mirror.seen.
// Strictly parallel to the puzzle: it never reads or writes gate/ritual/haunt.

import { collectProbes } from "./mirror/probes.js";
import { deriveSigil } from "./mirror/sigil.js";
import { ambientLines, inferOS } from "./mirror/lines.js";
import { printDossier } from "./mirror/dossier.js";

const SEEN_KEY = "cg.mirror.seen";
const AMBIENT_THRESHOLD = 3;      // drips before the dossier accretes
const AMBIENT_INTERVAL_MS = 38000;
const FIRST_DRIP_MS = 12000;

function seenGet() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "null") || { count: 0 }; }
  catch { return { count: 0 }; }
}
function seenBump() {
  const s = seenGet();
  const next = { count: (s.count || 0) + 1, last: Date.now() };
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch {}
  return next;
}

export function createMirror({ println, run, vigil, flare } = {}) {
  const param = new URLSearchParams(location.search).get("mirror");
  const inert = param === "off";
  const say = (s) => { try { println && println(s); } catch {} };

  const prior = seenGet();
  const nowSeen = inert ? prior : seenBump();     // this visit counts (unless inert)
  const returning = (prior.count || 0) >= 1;

  let revealed = false;
  let drips = 0;
  let ambientTimer = null;

  async function reveal(reason) {
    if (revealed || inert) return;
    revealed = true;
    if (ambientTimer) clearInterval(ambientTimer);
    let probes = {};
    try { probes = await collectProbes(); } catch {}
    try { await deriveSigil(probes); } catch {} // derived, used by Phase 2; harmless now
    const seen = { count: nowSeen.count, returning: returning };
    printDossier(say, { probes, os: inferOS(probes), seen });
    if (flare) try { flare(700); } catch {}
  }

  function startAmbient() {
    if (inert) return;
    let lines = [];
    const dripOne = async () => {
      if (revealed) return;
      if (!lines.length) {
        try { lines = ambientLines(await collectProbes()); } catch { lines = []; }
      }
      const line = lines.shift();
      if (line) { say(line); drips++; }
      if (drips >= AMBIENT_THRESHOLD || returning) reveal("threshold");
    };
    setTimeout(dripOne, FIRST_DRIP_MS);
    ambientTimer = setInterval(dripOne, AMBIENT_INTERVAL_MS);
  }

  if (param === "now") { reveal("param"); }
  else { startAmbient(); }

  return { reveal, primed: !inert };
}
```

- [ ] **Step 3b: Wire into `agent.js`**

In `site/root/js/agent.js`, change the `initTerminal` call and add the mirror after it. Replace lines 53–65 (the `initTerminal` block through `runDecode = ...`) with:

```js
// The interactive faux terminal.
let mirror = null;
const { println, run } = initTerminal({
  term: document.getElementById("term"),
  input: document.getElementById("cmd"),
  form: document.getElementById("cmdline"),
  decode: decodeToText,
  flare: rain.flare,
  setPalette: rain.setPalette,
  setLite: rain.setLite,
  audio,
  vigil,
  getMirror: () => mirror,
});
runDecode = (id) => run("decode " + id);

// The Reflection — device-posture mirror. Parallel to the puzzle; renders into
// the terminal log. dsregcmd /status pulls it on demand (see shell.js).
import("./mirror.js").then(({ createMirror }) => {
  mirror = createMirror({ println, run, vigil, flare: rain.flare });
}).catch((e) => console.error("[mirror] failed to wake", e));
```

- [ ] **Step 3c: Wire `dsregcmd /status` into `shell.js`**

In `site/root/js/shell.js`, add `getMirror` to the destructured `initTerminal` params (line 15):

```js
export function initTerminal({ term, input, form, decode, flare, setPalette, setLite, audio, vigil, getMirror }) {
```

Then replace the existing `dsregcmd` command (line 435) with:

```js
    dsregcmd: (io) => {
      if (/\/status\b/i.test(io.rest || "")) {
        const m = getMirror && getMirror();
        if (m && m.reveal) { m.reveal("dsregcmd"); return "AzureAdJoined : YES\n+ fetching live device posture from the tenant..."; }
      }
      return "AzureAdJoined : YES\nTenantName : comeandget\nMDMUrl : Intune\nDeviceAuthStatus : SUCCESS (token replayed, nobody checked)";
    },
```

- [ ] **Step 3d: Extend the leak-guard `SHIPPED` list**

In `tests/smoke.spec.js`, add these entries to the `SHIPPED` array (after `"/root/js/vigil.js",` at line 69):

```js
  "/root/js/mirror.js",
  "/root/js/mirror/probes.js",
  "/root/js/mirror/sigil.js",
  "/root/js/mirror/lines.js",
  "/root/js/mirror/dossier.js",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/mirror.spec.js -g "surfaces the device-posture"` then `-g "dsregcmd /status pulls"` then `-g "never touches the puzzle"`
Expected: PASS all three.
Then regression: `npx playwright test tests/smoke.spec.js -g "explorable and never leaks"` (exercises bare `dsregcmd`) → PASS.

- [ ] **Step 5: Commit**

```bash
git add site/root/js/mirror.js site/root/js/agent.js site/root/js/shell.js tests/smoke.spec.js tests/mirror.spec.js
git commit -m "feat(reflection): orchestrator + agent/shell wiring; dsregcmd /status"
```

---

### Task 6: Cookieless recognition endpoint (`/api/mirror/echo`)

**Files:**
- Create: `functions/api/mirror/_lib.js`
- Create: `functions/api/mirror/echo.js`
- Modify: `tests/mirror.spec.js` (append)

**Interfaces:**
- Produces (in `_lib.js`):
  - `export async function hmacB64url(signKey, msg): Promise<string>` — base64url raw HMAC-SHA256.
  - `export async function echoToken(signKey, firstSeenSec): Promise<string>` — `b64url(firstSeenSec) + "." + hmacB64url(signKey, b64url(firstSeenSec))`. Self-authenticating; storage-free.
  - `export async function verifyEchoToken(signKey, token): Promise<number|null>` — returns `firstSeenSec` if the HMAC checks out, else `null`.
  - `export function json(obj, status?, extraHeaders?)` and `export function b64url(str)` (local copies to keep the endpoint self-contained; DRY within the mirror module).
- Produces (in `echo.js`): `onRequestGet` — returns 304 + `X-Vigil-Seen: 1` when `If-None-Match` carries a token we signed; else 200 (body `"."`, `ETag`, `Cache-Control: no-cache`, `X-Vigil-Seen: 0`).

- [ ] **Step 1: Write the failing test**

Append to `tests/mirror.spec.js`:

```js
  test("the echo channel recognizes a returning browser cookielessly", async ({ page }) => {
    await page.goto("/root/");
    const first = await page.request.get("/api/mirror/echo");
    expect(first.ok()).toBeTruthy();
    expect(first.headers()["x-vigil-seen"]).toBe("0");
    const etag = first.headers()["etag"];
    expect(etag, "echo must issue an ETag").toBeTruthy();
    // hand the token back the way a browser cache would
    const second = await page.request.get("/api/mirror/echo", { headers: { "If-None-Match": etag } });
    expect(second.headers()["x-vigil-seen"]).toBe("1");
    // a forged token is not recognized
    const forged = await page.request.get("/api/mirror/echo", { headers: { "If-None-Match": '"deadbeef.deadbeef"' } });
    expect(forged.headers()["x-vigil-seen"]).toBe("0");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/mirror.spec.js -g "echo channel recognizes"`
Expected: FAIL — 404/no such route (endpoint missing).

- [ ] **Step 3a: Write `_lib.js`**

Create `functions/api/mirror/_lib.js`:

```js
// Shared helpers for the mirror API (leading underscore = import-only, never
// routed). Self-authenticating tokens over SIGN_KEY: no storage needed to prove
// "we issued this before". No puzzle answer, no key material, is ever hardcoded.

export function b64url(str) {
  const bytes = new TextEncoder().encode(String(str));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s) {
  let t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  const bin = atob(t);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export async function hmacB64url(signKey, msg) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(signKey || "")),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(msg)));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function echoToken(signKey, firstSeenSec) {
  const body = b64url(String(firstSeenSec));
  return body + "." + (await hmacB64url(signKey, body));
}

export async function verifyEchoToken(signKey, token) {
  if (!signKey || typeof token !== "string") return null;
  const raw = token.replace(/^"|"$/g, "").replace(/^W\//, ""); // tolerate quoted/weak ETag
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!timingSafeEqual(sig, await hmacB64url(signKey, body))) return null;
  const n = Number(b64urlDecode(body));
  return Number.isFinite(n) ? n : null;
}

export function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}
```

- [ ] **Step 3b: Write `echo.js`**

Create `functions/api/mirror/echo.js`:

```js
// GET /api/mirror/echo — the cookieless recognition leg. We stamp a
// self-authenticating ETag; the browser (Cache-Control: no-cache) revalidates on
// return and hands it back via If-None-Match. A valid HMAC = "we issued this
// browser a token before" = returning. No cookie, no JS storage, no KV write.

import { echoToken, verifyEchoToken } from "./_lib.js";

export async function onRequestGet({ request, env }) {
  const signKey = env && env.SIGN_KEY;
  const inm = request.headers.get("If-None-Match");
  const seenAt = inm ? await verifyEchoToken(signKey, inm) : null;

  if (seenAt) {
    return new Response(null, {
      status: 304,
      headers: {
        "ETag": inm,
        "Cache-Control": "no-cache",
        "X-Vigil-Seen": "1",
        "X-Vigil-First": String(seenAt),
      },
    });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const token = signKey ? await echoToken(signKey, nowSec) : String(nowSec);
  return new Response(".", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "ETag": `"${token}"`,
      "Cache-Control": "no-cache",
      "X-Vigil-Seen": "0",
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/mirror.spec.js -g "echo channel recognizes"`
Expected: PASS.
(Note: requires `SIGN_KEY` in `.dev.vars`. If absent locally, forged/real both read `0`; the assertion on `"1"` needs the key — `.dev.vars` already carries `SIGN_KEY` for the vigil tests.)

- [ ] **Step 5: Commit**

```bash
git add functions/api/mirror/_lib.js functions/api/mirror/echo.js tests/mirror.spec.js
git commit -m "feat(reflection): cookieless self-authenticating echo channel"
```

---

### Task 7: Edge cross-check + KV memory + the fpc cookie (`/api/mirror`)

**Files:**
- Create: `functions/api/mirror/index.js`
- Modify: `tests/mirror.spec.js` (append)

**Interfaces:**
- Consumes: `_lib.js` helpers (T6), `PRESENCE` KV, `SIGN_KEY`.
- Produces: `onRequestPost({ request, env })` — body `{ sigil: string, os?: string, tz?: string, langs?: string[], echoSeen?: boolean }`. Returns `json({ edge, deltas, seen })` and sets the `fpc` cookie.
  - `edge`: `{ country, city, asOrganization, httpProtocol, tlsVersion, tlsCipher, clientTcpRtt, ja3 }` — each field present only if `request.cf` supplies it.
  - `deltas`: `string[]` — cross-checks (claimed-OS vs edge/UA, tz vs country, header-locale vs client-locale, not-a-browser). Empty when nothing conflicts.
  - `seen`: `{ count, firstSeen, returning }` — from KV keyed by `m:` + `hmacB64url(SIGN_KEY, sigil).slice(0,32)`, corroborated by the `fpc` cookie and `echoSeen`.
  - Sets `Set-Cookie: fpc=<b64url(firstSeen).hmac>; Secure; HttpOnly; SameSite=Lax; Path=/root; Max-Age=7776000`.
  - Never 500s: bad JSON → 400 `{error}`; absent `cf`/KV → fields omitted, still 200.

- [ ] **Step 1: Write the failing test**

Append to `tests/mirror.spec.js`:

```js
  test("POST /api/mirror returns a shape, degrades without cf, and remembers on return", async ({ page }) => {
    await page.goto("/root/");
    const sigil = "a".repeat(64);
    const r1 = await page.request.post("/api/mirror", { data: { sigil, os: "windows", tz: "UTC", langs: ["en-US"] } });
    expect(r1.ok(), "must not 500 even with thin cf").toBeTruthy();
    const d1 = await r1.json();
    expect(d1).toHaveProperty("edge");
    expect(d1).toHaveProperty("deltas");
    expect(Array.isArray(d1.deltas)).toBeTruthy();
    expect(d1).toHaveProperty("seen");
    // an fpc cookie is set, wearing its Microsoft costume
    const setCookie = r1.headers()["set-cookie"] || "";
    expect(setCookie.toLowerCase()).toContain("fpc=");
    // second POST with the same sigil is recognized as returning (KV memory)
    const r2 = await page.request.post("/api/mirror", { data: { sigil, os: "windows" } });
    const d2 = await r2.json();
    expect(d2.seen.returning, "same sigil on second call = returning").toBeTruthy();
    expect(d2.seen.count).toBeGreaterThanOrEqual(2);
    // never leaks a puzzle answer
    expect(JSON.stringify(d1).toLowerCase()).not.toContain("mothman");
  });

  test("POST /api/mirror rejects bad json without 500", async ({ page }) => {
    await page.goto("/root/");
    const res = await page.request.post("/api/mirror", { headers: { "content-type": "application/json" }, data: "not json at all" });
    expect(res.status()).toBe(400);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/mirror.spec.js -g "returns a shape, degrades"`
Expected: FAIL — route missing.

- [ ] **Step 3: Write the implementation**

Create `functions/api/mirror/index.js`:

```js
// POST /api/mirror — the brain. Reflects the edge's view of THIS request back to
// the visitor, cross-checks it against what the client believes about itself, and
// remembers the machine by its derived sigil (salted one-way hash in KV, 90d TTL).
// Reuses PRESENCE + SIGN_KEY; sets one disguised cookie (fpc). Never 500s: every
// edge field and KV op degrades to omission.

import { b64url, b64urlDecode, hmacB64url, timingSafeEqual, json } from "./_lib.js";

const TTL = 7776000; // 90 days
const COOKIE = "fpc"; // Microsoft's own "fingerprint cookie" name — the costume

async function kvKey(signKey, sigil) {
  return "m:" + (await hmacB64url(signKey, sigil)).slice(0, 32);
}

async function fpcValue(signKey, firstSeenSec) {
  const body = b64url(String(firstSeenSec));
  return body + "." + (await hmacB64url(signKey, "fpc." + body));
}
async function fpcFirstSeen(signKey, value) {
  if (typeof value !== "string") return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  if (!timingSafeEqual(parts[1], await hmacB64url(signKey, "fpc." + parts[0]))) return null;
  const n = Number(b64urlDecode(parts[0]));
  return Number.isFinite(n) ? n : null;
}
function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const m = raw.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

function readEdge(cf) {
  if (!cf || typeof cf !== "object") return {};
  const e = {};
  const put = (k, v) => { if (v !== undefined && v !== null && v !== "") e[k] = v; };
  put("country", cf.country);
  put("city", cf.city);
  put("asOrganization", cf.asOrganization);
  put("httpProtocol", cf.httpProtocol);
  put("tlsVersion", cf.tlsVersion);
  put("tlsCipher", cf.tlsCipher);
  put("clientTcpRtt", cf.clientTcpRtt);
  put("ja3", cf.botManagement && cf.botManagement.ja3Hash); // present only with Bot Management
  return e;
}

// timezone → rough continent, to spot tz/country conflicts without a full db
function tzContinent(tz) {
  if (typeof tz !== "string" || !tz.includes("/")) return null;
  return tz.split("/")[0];
}
const COUNTRY_CONTINENT = {
  US: "America", CA: "America", BR: "America", MX: "America",
  GB: "Europe", DE: "Europe", FR: "Europe", NL: "Europe", IE: "Europe",
  JP: "Asia", CN: "Asia", IN: "Asia", SG: "Asia",
  AU: "Australia", NZ: "Pacific", ZA: "Africa",
};

function computeDeltas({ os, tz, langs, edge, request }) {
  const out = [];
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  const chPlat = (request.headers.get("Sec-CH-UA-Platform") || "").replace(/"/g, "").toLowerCase();

  // claimed OS vs the request's own headers
  if (os) {
    const claim = os.toLowerCase();
    const headerSaysWin = ua.includes("windows") || chPlat.includes("windows");
    const headerSaysMac = ua.includes("mac os") || ua.includes("macintosh") || chPlat.includes("macos");
    const headerSaysLinux = (ua.includes("linux") && !ua.includes("android")) || chPlat.includes("linux");
    if (claim === "windows" && (headerSaysMac || headerSaysLinux)) out.push("your papers say windows; your headers say otherwise.");
    if (claim === "macos" && headerSaysWin) out.push("your handshake says mac; your papers say windows. we believe the handshake.");
    if (claim === "linux" && (headerSaysWin || headerSaysMac)) out.push("you compute like a server but dress like a desktop.");
  }
  // tz vs edge country
  const cont = tzContinent(tz);
  const edgeCont = edge.country && COUNTRY_CONTINENT[edge.country];
  if (cont && edgeCont && cont !== edgeCont) out.push("you keep " + cont + " time but you left through " + edge.country + ".");
  // header-locale vs client languages
  const accept = (request.headers.get("Accept-Language") || "").toLowerCase();
  if (Array.isArray(langs) && langs.length && accept) {
    const primary = String(langs[0] || "").toLowerCase().split("-")[0];
    if (primary && !accept.includes(primary)) out.push("you speak " + langs[0] + " to us, and something else to the wire.");
  }
  // not-a-browser
  if (edge.ja3 && (!ua || ua.includes("curl") || ua.includes("python") || ua.includes("wget") || ua.includes("headless"))) {
    out.push("you came without a face. we kept your handshake anyway. it's a nice one.");
  }
  return out;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const sigil = body && typeof body.sigil === "string" ? body.sigil.slice(0, 128) : "";
  if (!/^[0-9a-f]{16,128}$/.test(sigil)) return json({ error: "bad sigil" }, 400);

  const signKey = env && env.SIGN_KEY;
  const edge = readEdge(request.cf);
  const deltas = computeDeltas({ os: body.os, tz: body.tz, langs: body.langs, edge, request });

  // recognition: KV (authoritative) corroborated by the fpc cookie and echoSeen
  const nowSec = Math.floor(Date.now() / 1000);
  let count = 0, firstSeen = nowSec;
  const KV = env && env.PRESENCE;
  if (KV && signKey) {
    const key = await kvKey(signKey, sigil);
    let prev = null;
    try { prev = await KV.get(key, "json"); } catch { prev = null; }
    if (prev && typeof prev === "object") {
      count = Number(prev.c) || 0;
      firstSeen = Number(prev.f) || nowSec;
    }
    count += 1;
    try {
      await KV.put(key, JSON.stringify({ f: firstSeen, c: count, d: deltas.length }), { expirationTtl: TTL });
    } catch { /* transient KV error must not 500 */ }
  }
  // corroborate first-seen from the cookie (handles a cleared KV / sigil drift)
  const cookieFirst = signKey ? await fpcFirstSeen(signKey, readCookie(request, COOKIE)) : null;
  if (cookieFirst && cookieFirst < firstSeen) firstSeen = cookieFirst;
  const returning = count >= 2 || !!cookieFirst || body.echoSeen === true;

  const headers = {};
  if (signKey) {
    const val = await fpcValue(signKey, firstSeen);
    headers["Set-Cookie"] = `${COOKIE}=${val}; Secure; HttpOnly; SameSite=Lax; Path=/root; Max-Age=${TTL}`;
  }
  return json({ edge, deltas, seen: { count: Math.max(count, 1), firstSeen, returning } }, 200, headers);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/mirror.spec.js -g "returns a shape, degrades"` then `-g "rejects bad json"`
Expected: PASS both. (Recognition/`returning` on the 2nd call requires the simulated KV, which `wrangler pages dev` provides from the `PRESENCE` binding name.)

- [ ] **Step 5: Commit**

```bash
git add functions/api/mirror/index.js tests/mirror.spec.js
git commit -m "feat(reflection): edge cross-check + KV memory + fpc cookie"
```

---

### Task 8: Fuse server truth into the dossier + full-suite gate

**Files:**
- Modify: `site/root/js/mirror.js` (the `reveal` path calls the endpoints)
- Modify: `tests/mirror.spec.js` (append the end-to-end test)

**Interfaces:**
- Consumes: `/api/mirror/echo` (T6), `POST /api/mirror` (T7).
- Produces: `reveal()` now, after deriving the sigil, fetches `/api/mirror/echo` (reads `X-Vigil-Seen`) and POSTs `{ sigil, os, tz, langs, echoSeen }` to `/api/mirror`, then renders `dossierLines` with the returned `edge`/`deltas`/`seen`. All network is best-effort: any failure falls back to the client-only dossier (Phase-1 behavior).

- [ ] **Step 1: Write the failing end-to-end test**

Append to `tests/mirror.spec.js`:

```js
  test("the dossier fuses edge truth and recognizes a return end-to-end", async ({ page }) => {
    // first visit primes server memory for this browser's sigil
    await page.goto("/root/?mirror=now");
    await expect(page.locator("#term")).toContainText("DEVICE POSTURE", { timeout: 8000 });
    // a real edge line only appears when cf/KV are live; locally we at least assert
    // the report renders and the return path is exercised without errors
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.reload();
    await page.goto("/root/?mirror=now");
    await expect(page.locator("#term")).toContainText("DEVICE POSTURE", { timeout: 8000 });
    // returning line surfaces because cg.mirror.seen.count >= 2 now
    await expect(page.locator("#term")).toContainText("again", { timeout: 8000 });
    expect(errors, `reveal path errored: ${errors.join(" | ")}`).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/mirror.spec.js -g "fuses edge truth"`
Expected: FAIL — the "again" line requires the server `seen.returning`/`count` fusion not yet wired (client-only `returning` is based on localStorage, which the test's reload exercises, but the edge/deltas fusion and echoSeen are not sent).

- [ ] **Step 3: Update `reveal` in `site/root/js/mirror.js`**

Replace the `reveal` function body with the network-fused version:

```js
  async function reveal(reason) {
    if (revealed || inert) return;
    revealed = true;
    if (ambientTimer) clearInterval(ambientTimer);
    let probes = {};
    try { probes = await collectProbes(); } catch {}
    const os = inferOS(probes);
    let sigil = "";
    try { sigil = await deriveSigil(probes); } catch {}

    // best-effort server enrichment — any failure falls back to the client-only dossier
    let edge, deltas, seen = { count: nowSeen.count, returning };
    try {
      let echoSeen = false;
      try {
        const echo = await fetch("/api/mirror/echo", { cache: "no-store" });
        echoSeen = echo.headers.get("X-Vigil-Seen") === "1";
      } catch {}
      if (sigil) {
        const res = await fetch("/api/mirror", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sigil, os: os.os || undefined,
            tz: (probes.intl && probes.intl.value && probes.intl.value.tz) || undefined,
            langs: (probes.intl && probes.intl.value && probes.intl.value.languages) || undefined,
            echoSeen,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          edge = data.edge;
          deltas = data.deltas;
          if (data.seen) seen = { count: Math.max(data.seen.count || 0, nowSeen.count), returning: data.seen.returning || returning };
        }
      }
    } catch { /* offline / endpoint absent → client-only dossier */ }

    printDossier(say, { probes, os, edge, deltas, seen });
    if (flare) try { flare(700); } catch {}
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/mirror.spec.js -g "fuses edge truth"`
Expected: PASS.

- [ ] **Step 5: Run the full gate**

Run: `npm run ci`
Expected: `html-validate` passes; the entire Playwright suite (existing smoke + new mirror) passes; leak-guard green.

- [ ] **Step 6: Commit**

```bash
git add site/root/js/mirror.js tests/mirror.spec.js
git commit -m "feat(reflection): fuse edge truth + cross-storage recognition into the dossier"
```

---

## Self-Review (completed against the spec)

**Spec coverage:**
- Full probe roster minus WebRTC/Battery → Task 1 (all 14 keys). ✓
- Derived sigil, recompute-not-hoard → Task 2. ✓
- OS inference + Intune-register voice → Task 3. ✓
- Ambient → dossier, threshold D (accreted OR return), `dsregcmd /status`, `?mirror=now` → Tasks 4–5, 8. ✓
- Cookieless ETag channel → Task 6. ✓
- Edge cross-check (`request.cf`, JA3 feature-detected), KV salted-hash memory + 90d TTL, `fpc` cookie → Task 7. ✓
- Fuse + recognition end-to-end, full CI → Task 8. ✓
- Orthogonal to puzzle (only `cg.mirror.*`), no CSP change, no new binding/secret, no answer strings, degrade-no-500 → enforced in Global Constraints + asserted in Tasks 5, 7, 8. ✓

**Type consistency:** `collectProbes → {key:{value,osHint}}` consumed identically by `stableMaterial`/`inferOS`/`ambientLines`/`dossierLines`; `createMirror({println,run,vigil,flare}) → {reveal, primed}` matches `agent.js` wiring and `shell.js` `getMirror().reveal`; `deriveSigil` hex → `/api/mirror` `sigil` regex `^[0-9a-f]{16,128}$` (64-hex passes); `_lib.js` exports (`b64url, b64urlDecode, hmacB64url, timingSafeEqual, json, echoToken, verifyEchoToken`) all consumed by `echo.js`/`index.js`. ✓

**Placeholder scan:** No TBD/TODO/"handle errors"; every code step carries complete code; every run step has an exact command + expected result. ✓
