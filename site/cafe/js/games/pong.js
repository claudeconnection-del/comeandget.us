// pong.js — a canvas Pong against a calm house barista. You're the left paddle
// (↑ ↓ / W S / drag), first to 5 wins. 4K mode adds glow, a hit-burst, and a
// little shake when a point lands.
import { rr, makeFx } from "./fx.js";

export function pong(host) {
  let pl, ai, ball, ps, as, over, up, down;
  const fx = makeFx();
  const WIN = 5;

  function dims() { return { w: host.width, h: host.height, pw: Math.max(9, host.width * 0.014), ph: Math.max(54, host.height * 0.18) }; }
  function serve(dir) {
    const { w, h } = dims();
    const speed = Math.max(0.28, h * 0.0006);
    const a = (Math.random() - 0.5) * 0.6;
    ball = { x: w / 2, y: h / 2, r: Math.max(5, Math.min(w, h) * 0.012), vx: dir * speed * Math.cos(a), vy: speed * Math.sin(a), speed };
  }
  function reset() {
    const { h } = dims();
    pl = h / 2; ai = h / 2; ps = 0; as = 0; over = false; up = down = false;
    serve(Math.random() < 0.5 ? -1 : 1);
  }
  reset();

  return {
    get over() { return over; },
    get score() { return ps; },
    get hud() { return (host.fancy ? "pong 4K · " : "pong · ") + "you " + ps + " — " + as + " house"; },
    key(n, down2) {
      if (n === "up") up = down2;
      else if (n === "down") down = down2;
    },
    pointer(px, py, type) { if (type === "pointermove" || type === "pointerdown") pl = py; },
    tick(dt) {
      fx.update(dt);
      if (over) return;
      const { w, h, pw, ph } = dims();
      const pv = h * 0.0018 * dt;
      if (up) pl -= pv;
      if (down) pl += pv;
      pl = Math.max(ph / 2, Math.min(h - ph / 2, pl));
      // calm AI: tracks the ball lazily with a low cap + a wide dead zone, so
      // the house is easy to beat
      const aiv = h * 0.00085 * dt;
      if (ai < ball.y - 22) ai += aiv; else if (ai > ball.y + 22) ai -= aiv;
      ai = Math.max(ph / 2, Math.min(h - ph / 2, ai));

      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.y < ball.r) { ball.y = ball.r; ball.vy *= -1; if (host.fancy && !host.reduced) fx.burst(ball.x, ball.y, host.palette.muted, 6, 0.25); }
      if (ball.y > h - ball.r) { ball.y = h - ball.r; ball.vy *= -1; if (host.fancy && !host.reduced) fx.burst(ball.x, ball.y, host.palette.muted, 6, 0.25); }

      const px = 18 + pw, ax = w - 18 - pw;
      // left paddle
      if (ball.vx < 0 && ball.x - ball.r <= px && Math.abs(ball.y - pl) <= ph / 2 + ball.r) {
        const rel = (ball.y - pl) / (ph / 2);
        ball.speed = Math.min(ball.speed * 1.035, h * 0.0013);
        ball.vx = Math.abs(ball.speed * Math.cos(rel * 0.9));
        ball.vy = ball.speed * Math.sin(rel * 0.9);
        ball.x = px + ball.r;
        if (host.fancy && !host.reduced) fx.burst(ball.x, ball.y, host.palette.accent, 10, 0.35);
      }
      // right paddle (house)
      if (ball.vx > 0 && ball.x + ball.r >= ax && Math.abs(ball.y - ai) <= ph / 2 + ball.r) {
        const rel = (ball.y - ai) / (ph / 2);
        ball.speed = Math.min(ball.speed * 1.035, h * 0.0013);
        ball.vx = -Math.abs(ball.speed * Math.cos(rel * 0.9));
        ball.vy = ball.speed * Math.sin(rel * 0.9);
        ball.x = ax - ball.r;
        if (host.fancy && !host.reduced) fx.burst(ball.x, ball.y, host.palette.pine, 10, 0.35);
      }
      // points
      if (ball.x < -ball.r) { as++; if (host.fancy && !host.reduced) fx.shakeAdd(9); if (as >= WIN) over = true; else serve(-1); }
      else if (ball.x > w + ball.r) { ps++; if (host.fancy && !host.reduced) fx.shakeAdd(9); if (ps >= WIN) over = true; else serve(1); }
    },
    draw(g) {
      const { ctx, palette, fancy } = g;
      const { w, h, pw, ph } = dims();
      ctx.save();
      if (fancy && !g.reduced) fx.applyShake(ctx);
      // net
      ctx.strokeStyle = palette.line; ctx.globalAlpha = 0.7; ctx.lineWidth = 2; ctx.setLineDash([8, 12]);
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // scores
      ctx.fillStyle = palette.subtle; ctx.font = "700 40px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(String(ps), w * 0.32, 16);
      ctx.fillText(String(as), w * 0.68, 16);
      // paddles
      ctx.save();
      if (fancy) { ctx.shadowColor = palette.accent; ctx.shadowBlur = 16; }
      ctx.fillStyle = palette.accent; rr(ctx, 18, pl - ph / 2, pw, ph, pw / 2);
      ctx.restore();
      ctx.save();
      if (fancy) { ctx.shadowColor = palette.pine; ctx.shadowBlur = 16; }
      ctx.fillStyle = palette.pine; rr(ctx, w - 18 - pw, ai - ph / 2, pw, ph, pw / 2);
      ctx.restore();
      // ball
      ctx.save();
      if (fancy) { ctx.shadowColor = palette.text; ctx.shadowBlur = 16; }
      ctx.fillStyle = palette.text; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, 7); ctx.fill();
      ctx.restore();
      fx.draw(ctx);
      ctx.restore();
      if (over) {
        ctx.fillStyle = ps > as ? palette.ok : palette.love; ctx.textAlign = "center"; ctx.font = "700 22px ui-monospace, monospace";
        ctx.fillText(ps > as ? "you win — the house buys the next round" : "the house wins — rematch?", w / 2, h * 0.45);
      }
    },
  };
}
