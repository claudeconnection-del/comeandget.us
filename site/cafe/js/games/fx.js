// fx.js — shared canvas helpers so every game's "4K" upgrade feels the same:
// rounded fills, a little particle system, and a decaying screen-shake. Cheap,
// allocation-light, and theme-agnostic (callers pass in palette colours).

export function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
  c.fill();
}

export function makeFx() {
  let parts = [];
  let shake = 0;
  return {
    // spray n motes outward from (x,y) in `color`
    burst(x, y, color, n = 12, spread = 0.42, ttl = 520, gravity = 0.0016) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = Math.random() * spread;
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - spread * 0.4, life: 1, color, size: 1.5 + Math.random() * 3, ttl, g: gravity });
      }
    },
    shakeAdd(v) { shake = Math.min(16, Math.max(shake, v)); },
    update(dt) {
      if (shake > 0) shake = Math.max(0, shake - dt * 0.03);
      if (parts.length) {
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt / p.ttl; }
        parts = parts.filter((p) => p.life > 0);
      }
    },
    applyShake(ctx) { if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); },
    draw(ctx) {
      for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    },
    get count() { return parts.length; },
  };
}
