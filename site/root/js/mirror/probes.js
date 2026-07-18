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
  ctx.fillText("come and get us 🔥", 4, 30);
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
