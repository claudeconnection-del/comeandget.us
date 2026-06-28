// snake.js — a cozy canvas Snake. Rounded segments, theme-coloured. In 4K mode
// it gains soft glow, a little bean-burst on every bite, and a death shake.
import { rr, makeFx } from "./fx.js";

export function snake(host) {
  let cell, cols, rows, body, dir, queue, food, score, over, acc, step;
  const fx = makeFx();

  function layout() {
    cell = Math.max(14, Math.floor(Math.min(host.width, host.height) / 20));
    cols = Math.max(8, Math.floor((host.width - 16) / cell));
    rows = Math.max(8, Math.floor((host.height - 16) / cell));
  }
  function placeFood() {
    for (let i = 0; i < 200; i++) {
      const f = { x: (Math.random() * cols) | 0, y: (Math.random() * rows) | 0 };
      if (!body.some((s) => s.x === f.x && s.y === f.y)) { food = f; return; }
    }
    food = { x: 0, y: 0 };
  }
  function reset() {
    layout();
    const cx = cols >> 1, cy = rows >> 1;
    body = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    dir = { x: 1, y: 0 }; queue = [];
    score = 0; over = false; acc = 0; step = 130;
    placeFood();
  }
  reset();

  const ox = () => (host.width - cols * cell) / 2;
  const oy = () => (host.height - rows * cell) / 2;

  function turn(nx, ny) {
    const cur = queue.length ? queue[queue.length - 1] : dir;
    if (cur.x === -nx && cur.y === -ny) return; // no reversing
    if (cur.x === nx && cur.y === ny) return;
    if (queue.length < 2) queue.push({ x: nx, y: ny });
  }

  return {
    get over() { return over; },
    get score() { return score; },
    get hud() { return (host.fancy ? "snake 4K · score " : "snake · score ") + score; },
    key(n, down) {
      if (!down) return;
      if (n === "left") turn(-1, 0);
      else if (n === "right") turn(1, 0);
      else if (n === "up") turn(0, -1);
      else if (n === "down") turn(0, 1);
    },
    pointer(px, py, type) {
      if (type !== "pointerdown") return;
      const hx = ox() + (body[0].x + 0.5) * cell, hy = oy() + (body[0].y + 0.5) * cell;
      if (Math.abs(px - hx) > Math.abs(py - hy)) turn(px > hx ? 1 : -1, 0);
      else turn(0, py > hy ? 1 : -1);
    },
    tick(dt) {
      fx.update(dt);
      acc += dt;
      while (acc >= step && !over) {
        acc -= step;
        if (queue.length) dir = queue.shift();
        const head = { x: body[0].x + dir.x, y: body[0].y + dir.y };
        if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows || body.some((s) => s.x === head.x && s.y === head.y)) {
          over = true;
          if (host.fancy && !host.reduced) { fx.shakeAdd(12); fx.burst(ox() + (body[0].x + 0.5) * cell, oy() + (body[0].y + 0.5) * cell, host.palette.love, 22, 0.5); }
          break;
        }
        body.unshift(head);
        if (head.x === food.x && head.y === food.y) {
          score += 10; step = Math.max(60, step - 3);
          if (host.fancy && !host.reduced) { fx.burst(ox() + (food.x + 0.5) * cell, oy() + (food.y + 0.5) * cell, host.palette.love, 12); fx.shakeAdd(4); }
          placeFood();
        } else body.pop();
      }
    },
    draw(g) {
      const { ctx, palette, fancy } = g;
      const bx = ox(), by = oy();
      ctx.save();
      if (fancy && !g.reduced) fx.applyShake(ctx);
      // board
      ctx.fillStyle = palette.surface;
      rr(ctx, bx - 6, by - 6, cols * cell + 12, rows * cell + 12, 14);
      // faint grid dots
      ctx.fillStyle = palette.line; ctx.globalAlpha = 0.5;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { ctx.beginPath(); ctx.arc(bx + (x + 0.5) * cell, by + (y + 0.5) * cell, 1, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      // food
      ctx.save();
      if (fancy) { ctx.shadowColor = palette.love; ctx.shadowBlur = 16; }
      ctx.fillStyle = palette.love;
      rr(ctx, bx + food.x * cell + cell * 0.2, by + food.y * cell + cell * 0.2, cell * 0.6, cell * 0.6, cell * 0.3);
      ctx.restore();
      // snake
      for (let i = body.length - 1; i >= 0; i--) {
        const s = body[i], head = i === 0;
        ctx.save();
        if (fancy) { ctx.shadowColor = head ? palette.warn : palette.pine; ctx.shadowBlur = head ? 18 : 10; }
        ctx.fillStyle = head ? palette.warn : (i % 2 ? palette.pine : palette.ok);
        const pad = cell * 0.12;
        rr(ctx, bx + s.x * cell + pad, by + s.y * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.3);
        ctx.restore();
      }
      fx.draw(ctx);
      ctx.restore();
    },
  };
}
