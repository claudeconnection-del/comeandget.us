// breakout.js — a canvas Breakout. Move with ← →, space (or tap) to launch.
// Three lives, theme-coloured brick rows, gentle speed-up. Clear the wall to win.
// 4K mode adds glow, a coloured burst when a brick shatters, and a little shake.
import { rr, makeFx } from "./fx.js";

export function breakout(host) {
  const BR = 6, BC = 9; // brick rows / cols
  let bricks, paddle, ball, score, lives, over, won, launched, left, right;
  const fx = makeFx();

  function layout() {
    const w = host.width, h = host.height;
    const margin = Math.min(w, h) * 0.06;
    const gw = w - margin * 2;
    const bw = gw / BC, bh = Math.max(14, h * 0.035);
    bricks = [];
    for (let r = 0; r < BR; r++) for (let c = 0; c < BC; c++) {
      bricks.push({ x: margin + c * bw, y: margin + 28 + r * bh, w: bw - 4, h: bh - 4, row: r, alive: true });
    }
    paddle = { w: Math.max(96, w * 0.21), h: Math.max(10, h * 0.022), x: w / 2, y: h - margin }; // chill: a generous paddle
  }
  function resetBall() {
    ball = { x: paddle.x, y: paddle.y - 14, r: Math.max(5, Math.min(host.width, host.height) * 0.012), vx: 0, vy: 0, speed: Math.max(0.24, host.height * 0.00052) };
    launched = false;
  }
  function reset() {
    layout();
    score = 0; lives = 3; over = false; won = false; left = right = false;
    resetBall();
  }
  reset();

  const ROWCOLORS = (p) => [p.love, p.rose, p.warn, p.ok, p.pine, p.accent];

  function launch() {
    if (launched) return;
    launched = true;
    ball.vx = ball.speed * 0.5;
    ball.vy = -ball.speed;
  }

  return {
    get over() { return over; },
    get score() { return score; },
    get hud() { return (host.fancy ? "breakout 4K · score " : "breakout · score ") + score + " · lives " + lives; },
    key(n, down) {
      if (n === "left") left = down;
      else if (n === "right") right = down;
      else if ((n === "space" || n === "up") && down) launch();
    },
    pointer(px, py, type) {
      if (type === "pointermove" || type === "pointerdown") paddle.x = px;
      if (type === "pointerdown") launch();
    },
    tick(dt) {
      fx.update(dt);
      if (over) return;
      const w = host.width, h = host.height;
      const pv = w * 0.0016 * dt;
      if (left) paddle.x -= pv;
      if (right) paddle.x += pv;
      paddle.x = Math.max(paddle.w / 2, Math.min(w - paddle.w / 2, paddle.x));
      if (!launched) { ball.x = paddle.x; ball.y = paddle.y - 14; return; }

      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.x < ball.r) { ball.x = ball.r; ball.vx *= -1; }
      if (ball.x > w - ball.r) { ball.x = w - ball.r; ball.vx *= -1; }
      if (ball.y < ball.r) { ball.y = ball.r; ball.vy *= -1; }
      if (ball.vy > 0 && ball.y + ball.r >= paddle.y - paddle.h / 2 && ball.y < paddle.y && Math.abs(ball.x - paddle.x) <= paddle.w / 2 + ball.r) {
        const rel = (ball.x - paddle.x) / (paddle.w / 2);
        const ang = rel * 1.05;
        ball.vx = ball.speed * Math.sin(ang);
        ball.vy = -ball.speed * Math.cos(ang);
        ball.y = paddle.y - paddle.h / 2 - ball.r;
        if (host.fancy && !host.reduced) fx.burst(ball.x, ball.y, host.palette.accent, 8, 0.3);
      }
      const cols = ROWCOLORS(host.palette);
      for (const b of bricks) {
        if (!b.alive) continue;
        if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w && ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h) {
          b.alive = false;
          score += (BR - b.row) * 5;
          if (host.fancy && !host.reduced) { fx.burst(b.x + b.w / 2, b.y + b.h / 2, cols[b.row % cols.length], 12, 0.35); fx.shakeAdd(3); }
          const ox = Math.min(ball.x + ball.r - b.x, b.x + b.w - (ball.x - ball.r));
          const oy = Math.min(ball.y + ball.r - b.y, b.y + b.h - (ball.y - ball.r));
          if (ox < oy) ball.vx *= -1; else ball.vy *= -1;
          ball.speed = Math.min(ball.speed * 1.007, host.height * 0.0011);
          const sp = Math.hypot(ball.vx, ball.vy) || 1;
          ball.vx = ball.vx / sp * ball.speed; ball.vy = ball.vy / sp * ball.speed;
          break;
        }
      }
      if (bricks.every((b) => !b.alive)) { won = true; over = true; score += 200; if (host.fancy && !host.reduced) fx.shakeAdd(10); return; }
      if (ball.y - ball.r > h) {
        lives--;
        if (host.fancy && !host.reduced) fx.shakeAdd(8);
        if (lives <= 0) { over = true; return; }
        resetBall();
      }
    },
    draw(g) {
      const { ctx, palette, fancy } = g;
      const cols = ROWCOLORS(palette);
      ctx.save();
      if (fancy && !g.reduced) fx.applyShake(ctx);
      for (const b of bricks) {
        if (!b.alive) continue;
        ctx.save();
        if (fancy) { ctx.shadowColor = cols[b.row % cols.length]; ctx.shadowBlur = 10; }
        ctx.fillStyle = cols[b.row % cols.length];
        rr(ctx, b.x, b.y, b.w, b.h, 4);
        ctx.restore();
      }
      ctx.save();
      if (fancy) { ctx.shadowColor = palette.accent; ctx.shadowBlur = 14; }
      ctx.fillStyle = palette.accent;
      rr(ctx, paddle.x - paddle.w / 2, paddle.y - paddle.h / 2, paddle.w, paddle.h, paddle.h / 2);
      ctx.restore();
      ctx.save();
      if (fancy) { ctx.shadowColor = palette.text; ctx.shadowBlur = 14; }
      ctx.fillStyle = palette.text;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, 7); ctx.fill();
      ctx.restore();
      fx.draw(ctx);
      ctx.restore();
      if (won) {
        ctx.fillStyle = palette.ok; ctx.textAlign = "center"; ctx.font = "700 22px ui-monospace, monospace";
        ctx.fillText("wall cleared", g.w / 2, g.h * 0.4);
      } else if (!launched) {
        ctx.fillStyle = palette.muted; ctx.textAlign = "center"; ctx.font = "14px ui-monospace, monospace";
        ctx.fillText("space / tap to serve", g.w / 2, g.h * 0.55);
      }
    },
  };
}
