// idle.js — Brew Tycoon: a cozy idle clicker. Tap the cup to brew, spend cups on
// auto-brewers, watch the café run itself. It never ends — quit with q. Progress
// persists (with a gentle "while you were away" catch-up). 4K adds glow, a bean
// burst on every tap, and a soft pulse.
import { rr, makeFx } from "./fx.js";

const KEY = "cafe.idle";
const UPGRADES = [
  { id: "grinder", name: "hand grinder", base: 15, cps: 0.2 },
  { id: "press", name: "french press", base: 100, cps: 1 },
  { id: "barista", name: "barista", base: 1100, cps: 8 },
  { id: "roaster", name: "drum roaster", base: 12000, cps: 47 },
  { id: "cart", name: "coffee cart", base: 130000, cps: 260 },
  { id: "franchise", name: "franchise", base: 1400000, cps: 1400 },
];

function loadSave() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } }
function fmt(n) {
  if (!isFinite(n) || n <= 0) return "0";
  if (n < 1000) return n < 10 ? n.toFixed(1) : Math.floor(n).toString();
  const u = ["K", "M", "B", "T", "q", "Q"]; let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n).toString()) + u[i];
}

export function idle(host) {
  const fx = makeFx();
  let cups, total, counts, pulse, away, awayT, saveAcc;

  const cps = () => { let c = 0; for (let i = 0; i < UPGRADES.length; i++) c += UPGRADES[i].cps * counts[i]; return c; };
  const cost = (i) => Math.floor(UPGRADES[i].base * Math.pow(1.15, counts[i]));
  const clickPower = () => 1 + Math.floor(cps() * 0.05);

  function reset() {
    const s = loadSave();
    cups = Number(s.cups) || 0;
    total = Number(s.total) || 0;
    counts = UPGRADES.map((_, i) => Number((s.counts || [])[i]) || 0);
    pulse = 0; saveAcc = 0; away = 0; awayT = 0;
    if (s.ts) { // catch up for time away, capped at 8h
      const secs = Math.min((Date.now() - Number(s.ts)) / 1000, 8 * 3600);
      const earned = cps() * secs;
      if (earned > 1) { cups += earned; total += earned; away = earned; awayT = 4200; }
    }
  }
  reset();

  function save() { try { localStorage.setItem(KEY, JSON.stringify({ cups, total, counts, ts: Date.now() })); } catch {} }
  function brew(n, x, y) {
    cups += n; total += n; pulse = 1;
    if (host.fancy && !host.reduced) { fx.burst(x, y, host.palette.warn, 9, 0.4); fx.shakeAdd(2.2); }
  }
  function buy(i) {
    if (i < 0 || i >= UPGRADES.length) return;
    const c = cost(i);
    if (cups < c) return;
    cups -= c; counts[i]++; save();
    if (host.fancy && !host.reduced) fx.shakeAdd(2.5);
  }

  const L = { cup: { x: 0, y: 0, r: 1 }, ups: [] };

  return {
    get over() { return false; },
    get score() { return Math.floor(total); },
    get hud() { return (host.fancy ? "brew 4K · " : "brew · ") + fmt(cups) + " cups · " + fmt(cps()) + "/sec"; },
    onQuit() { save(); },
    key(n, down) { if (down && n === "space") brew(clickPower(), L.cup.x, L.cup.y); },
    rawKey(k) { const i = "123456".indexOf(k); if (i >= 0) buy(i); },
    pointer(px, py, type) {
      if (type !== "pointerdown") return;
      if (Math.hypot(px - L.cup.x, py - L.cup.y) <= L.cup.r) { brew(clickPower(), L.cup.x, L.cup.y); return; }
      for (const u of L.ups) if (px >= u.x && px <= u.x + u.w && py >= u.y && py <= u.y + u.h) { buy(u.i); return; }
    },
    tick(dt) {
      fx.update(dt);
      if (pulse > 0) pulse = Math.max(0, pulse - dt * 0.005);
      if (awayT > 0) awayT = Math.max(0, awayT - dt);
      const c = cps();
      if (c) { const g = c * dt / 1000; cups += g; total += g; }
      saveAcc += dt; if (saveAcc > 3000) { saveAcc = 0; save(); }
    },
    draw(g) {
      const { ctx, palette, fancy } = g;
      const wide = g.w >= 620;
      const panelW = wide ? Math.min(330, g.w * 0.42) : g.w;
      const cupW = wide ? g.w - panelW : g.w;
      const cupH = wide ? g.h : g.h * 0.42;

      // ── cup zone ──
      const cx = cupW / 2;
      const cy = wide ? g.h * 0.52 : cupH * 0.56;
      const r = Math.max(38, Math.min(cupW, cupH) * 0.24);
      L.cup = { x: cx, y: cy, r: r * 1.05 };

      ctx.save();
      if (fancy && !g.reduced) fx.applyShake(ctx);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      // big count + rate
      ctx.fillStyle = palette.text; ctx.font = "700 " + Math.round(r * 0.52) + "px ui-monospace, monospace";
      ctx.fillText(fmt(cups), cx, cy - r - r * 0.62);
      ctx.fillStyle = palette.muted; ctx.font = Math.round(r * 0.22) + "px ui-monospace, monospace";
      ctx.fillText("cups   ·   " + fmt(cps()) + " / sec", cx, cy - r - r * 0.22);

      // the mug
      const s = 1 + pulse * 0.07;
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
      // handle
      ctx.lineWidth = r * 0.16; ctx.strokeStyle = palette.warn;
      if (fancy) { ctx.shadowColor = palette.warn; ctx.shadowBlur = 16; }
      ctx.beginPath(); ctx.arc(cx + r * 0.82, cy + r * 0.05, r * 0.4, -1.1, 1.1); ctx.stroke();
      // body
      ctx.fillStyle = palette.warn;
      if (fancy) { ctx.shadowColor = palette.warn; ctx.shadowBlur = 28; }
      rr(ctx, cx - r * 0.85, cy - r * 0.72, r * 1.6, r * 1.5, r * 0.26);
      ctx.shadowBlur = 0;
      // coffee surface
      ctx.fillStyle = palette.bg;
      rr(ctx, cx - r * 0.66, cy - r * 0.56, r * 1.22, r * 0.3, r * 0.12);
      ctx.restore();

      ctx.fillStyle = palette.muted; ctx.font = Math.round(r * 0.2) + "px ui-monospace, monospace";
      ctx.fillText("tap to brew  (+" + fmt(clickPower()) + ")", cx, cy + r * 1.04);
      fx.draw(ctx);
      ctx.restore();

      if (awayT > 0 && away > 1) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, awayT / 900);
        ctx.textAlign = "center"; ctx.fillStyle = palette.ok; ctx.font = Math.round(r * 0.2) + "px ui-monospace, monospace";
        ctx.fillText("welcome back — brewed " + fmt(away) + " while away", cx, wide ? g.h * 0.1 : cupH * 0.12);
        ctx.restore();
      }

      // ── upgrades panel ──
      const ox = wide ? cupW : 0;
      const oy = wide ? 0 : cupH;
      const pw = wide ? panelW : g.w;
      const ph = wide ? g.h : g.h - cupH;
      ctx.fillStyle = palette.surface;
      ctx.fillRect(ox, oy, pw, ph);
      const pad = 14;
      const rowH = Math.max(44, Math.min(66, (ph - pad * 2) / UPGRADES.length));
      ctx.textBaseline = "middle"; ctx.textAlign = "left";
      L.ups = [];
      for (let i = 0; i < UPGRADES.length; i++) {
        const u = UPGRADES[i];
        const rx = ox + pad, ry = oy + pad + i * rowH, rw = pw - pad * 2, rh = rowH - 8;
        const afford = cups >= cost(i);
        L.ups.push({ i, x: rx, y: ry, w: rw, h: rh });
        ctx.save();
        if (afford && fancy) { ctx.shadowColor = palette.accent; ctx.shadowBlur = 12; }
        ctx.globalAlpha = afford ? 1 : 0.5;
        ctx.fillStyle = afford ? palette.overlay : palette.bg;
        rr(ctx, rx, ry, rw, rh, 9);
        ctx.restore();
        ctx.fillStyle = afford ? palette.text : palette.muted;
        ctx.font = "600 " + Math.round(rh * 0.32) + "px ui-monospace, monospace"; ctx.textAlign = "left";
        ctx.fillText((i + 1) + "  " + u.name, rx + 12, ry + rh * 0.36);
        ctx.fillStyle = palette.muted; ctx.font = Math.round(rh * 0.25) + "px ui-monospace, monospace";
        ctx.fillText("+" + u.cps + "/sec   ·   own " + counts[i], rx + 12, ry + rh * 0.71);
        ctx.fillStyle = afford ? palette.warn : palette.subtle; ctx.textAlign = "right";
        ctx.font = "600 " + Math.round(rh * 0.3) + "px ui-monospace, monospace";
        ctx.fillText(fmt(cost(i)), rx + rw - 12, ry + rh * 0.5);
      }
    },
  };
}
