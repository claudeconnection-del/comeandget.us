// host.js — runs a canvas game inside the café window. It suspends the terminal,
// mounts a device-pixel-scaled <canvas>, drives a requestAnimationFrame loop,
// routes the keyboard (and basic touch), and on quit tears everything down and
// hands focus back to the prompt. Games are theme-aware: the palette is read from
// the page's CSS variables and refreshed whenever the theme changes, so a game
// running in dark mode recolours instantly if you flip to periwinkle.
import { recordScore, highScore, unlock4k } from "./store.js";

const KEYMAP = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  a: "left", d: "right", w: "up", s: "down", A: "left", D: "right", W: "up", S: "down",
  " ": "space", Spacebar: "space", Enter: "enter",
};

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim() || "#888";
  return {
    bg: v("--bg"), surface: v("--surface"), overlay: v("--overlay"),
    text: v("--text"), muted: v("--muted"), subtle: v("--subtle"), line: v("--line"),
    accent: v("--accent"), ok: v("--ok"), warn: v("--warn"),
    rose: v("--rose"), love: v("--love"), pine: v("--pine"),
  };
}

const reduceMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// Run a single game. `create(host)` returns a game object (see the games for the
// shape). Resolves when the player quits, so the caller can chain a message.
export function runGame({ name, create, api, controls = "← → move · q quit", fancy = false, zoom = false }) {
  const win = document.querySelector(".window");
  const consoleEl = document.getElementById("console");

  const stage = document.createElement("div");
  stage.className = "game-stage";
  const hud = document.createElement("div");
  hud.className = "game-hud";
  const hudLeft = document.createElement("span");
  const hudRight = document.createElement("span");
  hudRight.className = "game-hud-hint";
  hudRight.textContent = controls;
  hud.appendChild(hudLeft);
  hud.appendChild(hudRight);
  const canvas = document.createElement("canvas");
  canvas.className = "game-canvas";
  stage.appendChild(hud);
  stage.appendChild(canvas);
  win.appendChild(stage);
  consoleEl.style.display = "none";
  // 4K games want room: auto-zoom only if the player wasn't already zoomed, and
  // remember so we can put the window back exactly how we found it on quit.
  const wasZoomed = win.classList.contains("zoomed");
  const autoZoomed = zoom && !wasZoomed;
  if (autoZoomed) document.dispatchEvent(new CustomEvent("cafe:zoom", { detail: { on: true } }));

  const ctx = canvas.getContext("2d");
  let palette = readPalette();
  const themeObs = new MutationObserver(() => { palette = readPalette(); });
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  let dpr = 1, W = 1, H = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, fancy ? 3 : 2);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const host = {
    get width() { return W; },
    get height() { return H; },
    get palette() { return palette; },
    get dpr() { return dpr; },
    fancy,
    reduced: reduceMotion(),
  };

  let game = create(host);
  let raf = 0, last = 0, alive = true, done = false;

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawOverlay() {
    const cw = Math.min(360, W * 0.82), ch = 168;
    const x = (W - cw) / 2, y = (H - ch) / 2;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = palette.surface;
    roundRect(ctx, x, y, cw, ch, 16); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5; ctx.strokeStyle = palette.accent;
    roundRect(ctx, x + 0.75, y + 0.75, cw - 1.5, ch - 1.5, 15); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = palette.accent;
    ctx.font = "700 26px ui-monospace, monospace";
    ctx.fillText("last call", W / 2, y + 42);
    const rec = highScore(name);
    ctx.fillStyle = palette.text;
    ctx.font = "16px ui-monospace, monospace";
    ctx.fillText("score  " + (game.score | 0), W / 2, y + 80);
    ctx.fillStyle = palette.muted;
    ctx.fillText("best  " + Math.max(rec, game.score | 0), W / 2, y + 104);
    ctx.fillStyle = palette.warn;
    ctx.font = "13px ui-monospace, monospace";
    ctx.fillText("R  play again      ·      Q  back to the café", W / 2, y + 138);
    ctx.restore();
  }

  function frame(t) {
    if (!alive) return;
    if (!last) last = t;
    let dt = t - last; last = t;
    if (dt > 100) dt = 100; // a tab-away shouldn't fast-forward the sim
    if (!game.over) game.tick(dt);
    ctx.clearRect(0, 0, W, H);
    game.draw({ ctx, w: W, h: H, palette, dpr, fancy, reduced: host.reduced });
    hudLeft.textContent = game.hud || (name + " · score " + (game.score | 0));
    if (game.over) drawOverlay();
    raf = requestAnimationFrame(frame);
  }

  function teardown() {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    themeObs.disconnect();
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onKeyUp, true);
    canvas.removeEventListener("pointerdown", onPointer);
    canvas.removeEventListener("pointermove", onPointer);
    stage.remove();
    consoleEl.style.display = "";
    // only undo a zoom WE applied — if the player was already maximized, leave it
    if (autoZoomed) document.dispatchEvent(new CustomEvent("cafe:zoom", { detail: { on: false } }));
    api.focus();
  }

  function quit() {
    if (done) return;
    done = true;
    const score = game.score | 0;
    teardown();
    const rec = recordScore(name, score);
    if (rec.best && score > 0) {
      api.print(api.sp("★ ", "c-warn"), api.sp("new high score — ", "c-ok bold"), api.sp(name + " · " + score, "c-text"));
    } else {
      api.print(api.sp("thanks for playing ", "c-muted"), api.sp(name, "c-text"), api.sp(" · score " + score, "c-muted"), api.sp("  (best " + Math.max(rec.prev, score) + ")", "c-subtle"));
    }
    // playing any game once is enough to earn the 4K glow-up
    if (!fancy && unlock4k()) {
      api.print(api.sp("◆ ", "c-warn"), api.sp("4K unlocked", "c-ok bold"), api.sp(" — the glow-up is on for every game: neon, particles, a little shake.", "c-text"));
      api.print(api.sp("  toggle it anytime with ", "c-muted"), api.kbd("4k"), api.sp(", or play one now: ", "c-muted"), api.kbd(name + " 4k"));
    }
    if (typeof game.onQuit === "function") { try { game.onQuit(api); } catch {} }
  }

  function restart() { game = create(host); last = 0; }

  function onKey(e) {
    const k = e.key;
    if (k === "q" || k === "Q" || k === "Escape") { e.preventDefault(); quit(); return; }
    if (game.over) {
      if (k === "r" || k === "R" || k === "Enter" || k === " ") { e.preventDefault(); restart(); }
      return;
    }
    const mapped = KEYMAP[k];
    if (mapped) { e.preventDefault(); game.key(mapped, true); }
    else if (typeof game.rawKey === "function") game.rawKey(k, true);
  }
  function onKeyUp(e) {
    const mapped = KEYMAP[e.key];
    if (mapped && typeof game.key === "function") game.key(mapped, false);
  }
  function onPointer(e) {
    if (typeof game.pointer !== "function") return;
    const r = canvas.getBoundingClientRect();
    game.pointer(e.clientX - r.left, e.clientY - r.top, e.type, e.pressure);
  }

  // capture phase so games win the arrows before anything else scrolls
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKeyUp, true);
  canvas.addEventListener("pointerdown", onPointer);
  canvas.addEventListener("pointermove", onPointer);

  raf = requestAnimationFrame(frame);
}
