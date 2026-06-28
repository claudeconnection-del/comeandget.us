// tetris.js — a canvas Tetris. Standard rules (10×20, 7-bag, soft/hard drop,
// ghost piece, wall kicks). Pass { fancy:true } for the unlockable "4K" skin:
// a crisper, glowing board with particle bursts, a little screen-shake, and a
// buttery interpolated fall. Cleared lines tally toward the unlock via store.js.
import { addLines } from "./store.js";

const COLS = 10, ROWS = 20;

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
const COLORKEY = { I: "ok", O: "warn", T: "accent", S: "pine", Z: "love", J: "rose", L: "text" };
const SCORE = [0, 100, 300, 500, 800];

function rotateCW(m) {
  const n = m.length, out = m.map((r) => r.slice());
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[x][n - 1 - y] = m[y][x];
  return out;
}
function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function tetris(host, { fancy = false } = {}) {
  let grid, bag, cur, score, lines, level, over, dropAcc, softDrop, shake, particles;

  function newBag() {
    const keys = Object.keys(SHAPES);
    for (let i = keys.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [keys[i], keys[j]] = [keys[j], keys[i]]; }
    return keys;
  }
  function take() {
    if (!bag.length) bag = newBag();
    return bag.shift();
  }
  function makePiece(type) {
    const m = SHAPES[type].map((r) => r.slice());
    return { type, m, x: ((COLS - m[0].length) / 2) | 0, y: type === "I" ? -1 : 0 };
  }
  function collide(p, nx, ny, nm) {
    const m = nm || p.m;
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m[y].length; x++) {
      if (!m[y][x]) continue;
      const gx = nx + x, gy = ny + y;
      if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
      if (gy >= 0 && grid[gy][gx]) return true;
    }
    return false;
  }
  let nextType;
  function spawn() {
    cur = makePiece(nextType);
    nextType = take();
    softDrop = false;
    if (collide(cur, cur.x, cur.y)) over = true;
  }
  function reset() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    bag = newBag();
    nextType = take();
    score = 0; lines = 0; level = 1; over = false;
    dropAcc = 0; softDrop = false; shake = 0; particles = [];
    spawn();
  }
  reset();

  function interval() { return softDrop ? 35 : Math.max(70, 800 - (level - 1) * 65); }

  function spawnRowParticles(ry, colors) {
    const { cell, ox, oy } = lastGeom;
    for (let x = 0; x < COLS; x++) {
      for (let k = 0; k < 2; k++) {
        particles.push({
          x: ox + (x + 0.5) * cell, y: oy + (ry + 0.5) * cell,
          vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.9) * 0.4,
          life: 1, color: colors[x] || host.palette.warn, size: cell * (0.18 + Math.random() * 0.18),
        });
      }
    }
  }

  function lock() {
    for (let y = 0; y < cur.m.length; y++) for (let x = 0; x < cur.m[y].length; x++) {
      if (cur.m[y][x] && cur.y + y >= 0) grid[cur.y + y][cur.x + x] = cur.type;
    }
    // find full rows
    const full = [];
    for (let y = 0; y < ROWS; y++) if (grid[y].every((c) => c)) full.push(y);
    if (full.length) {
      if (fancy && !host.reduced) {
        shake = Math.min(12, 4 + full.length * 2);
        for (const ry of full) spawnRowParticles(ry, grid[ry].map((t) => host.palette[COLORKEY[t]] || host.palette.warn));
      }
      for (const y of full) { grid.splice(y, 1); grid.unshift(Array(COLS).fill(0)); }
      const n = full.length;
      lines += n;
      score += SCORE[n] * level;
      level = 1 + Math.floor(lines / 10);
      addLines(n, n === 4);
    }
    spawn();
  }

  function move(dx) { if (!collide(cur, cur.x + dx, cur.y)) cur.x += dx; }
  function rotate() {
    const nm = rotateCW(cur.m);
    for (const k of [0, -1, 1, -2, 2]) { if (!collide(cur, cur.x + k, cur.y, nm)) { cur.m = nm; cur.x += k; return; } }
  }
  function hardDrop() {
    let d = 0;
    while (!collide(cur, cur.x, cur.y + 1)) { cur.y++; d++; }
    score += d * 2;
    dropAcc = 0;
    lock();
  }
  function stepDown() {
    if (!collide(cur, cur.x, cur.y + 1)) { cur.y++; if (softDrop) score += 1; }
    else lock();
  }

  let lastGeom = { cell: 20, ox: 0, oy: 0 };

  function drawCell(ctx, px, py, cell, color, glow) {
    ctx.save();
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = cell * 0.6; }
    ctx.fillStyle = color;
    const pad = cell * 0.06;
    rr(ctx, px + pad, py + pad, cell - pad * 2, cell - pad * 2, cell * 0.18); ctx.fill();
    ctx.restore();
    // bevel highlight
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    rr(ctx, px + cell * 0.12, py + cell * 0.12, cell * 0.76, cell * 0.22, cell * 0.1); ctx.fill();
  }

  return {
    get over() { return over; },
    get score() { return score; },
    get hud() { return (fancy ? "tetris 4K · " : "tetris · ") + "score " + score + " · lines " + lines + " · lv " + level; },
    key(n, down) {
      if (n === "down") { softDrop = down; return; }
      if (!down) return;
      if (n === "left") move(-1);
      else if (n === "right") move(1);
      else if (n === "up") rotate();
      else if (n === "space") hardDrop();
    },
    pointer(px, py, type) {
      if (type !== "pointerdown") return;
      const { ox, cell } = lastGeom;
      if (py < host.height * 0.25) { rotate(); return; }
      if (py > host.height * 0.8) { hardDrop(); return; }
      const mid = ox + (COLS * cell) / 2;
      move(px < mid ? -1 : 1);
    },
    tick(dt) {
      dropAcc += dt;
      const iv = interval();
      while (dropAcc >= iv && !over) { dropAcc -= iv; stepDown(); }
      if (shake > 0) shake = Math.max(0, shake - dt * 0.03);
      if (particles.length) {
        for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.0016 * dt; p.life -= dt * 0.002; }
        particles = particles.filter((p) => p.life > 0);
      }
    },
    draw(g) {
      const { ctx, palette, fancy: fy } = g;
      const panelW = 5;
      const cell = Math.max(10, Math.floor(Math.min((g.h - 24) / ROWS, (g.w - 24) / (COLS + panelW))));
      const boardW = COLS * cell, boardH = ROWS * cell;
      const totalW = boardW + panelW * cell;
      const ox = (g.w - totalW) / 2, oy = (g.h - boardH) / 2;
      lastGeom = { cell, ox, oy };

      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

      // board frame
      ctx.fillStyle = palette.surface;
      rr(ctx, ox - 6, oy - 6, boardW + 12, boardH + 12, 12); ctx.fill();
      ctx.fillStyle = palette.bg;
      rr(ctx, ox, oy, boardW, boardH, 6); ctx.fill();
      // grid lines
      ctx.strokeStyle = palette.line; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
      for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(ox + x * cell, oy); ctx.lineTo(ox + x * cell, oy + boardH); ctx.stroke(); }
      for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(ox, oy + y * cell); ctx.lineTo(ox + boardW, oy + y * cell); ctx.stroke(); }
      ctx.globalAlpha = 1;

      // settled blocks
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if (grid[y][x]) drawCell(ctx, ox + x * cell, oy + y * cell, cell, palette[COLORKEY[grid[y][x]]] || palette.text, fy);
      }

      if (!over) {
        // ghost
        let gy = cur.y;
        while (!collide(cur, cur.x, gy + 1)) gy++;
        ctx.globalAlpha = 0.22;
        for (let y = 0; y < cur.m.length; y++) for (let x = 0; x < cur.m[y].length; x++) {
          if (cur.m[y][x] && gy + y >= 0) { ctx.fillStyle = palette[COLORKEY[cur.type]]; const pad = cell * 0.06; rr(ctx, ox + (cur.x + x) * cell + pad, oy + (gy + y) * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.18); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
        // active piece (interpolated fall in fancy mode)
        const frac = (fy && !g.reduced && !softDrop && !over) ? Math.min(0.85, dropAcc / interval()) : 0;
        const color = palette[COLORKEY[cur.type]];
        for (let y = 0; y < cur.m.length; y++) for (let x = 0; x < cur.m[y].length; x++) {
          if (cur.m[y][x] && cur.y + y >= 0) drawCell(ctx, ox + (cur.x + x) * cell, oy + (cur.y + y + frac) * cell, cell, color, fy);
        }
      }

      // particles
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // side panel: NEXT + stats
      const px = ox + boardW + cell * 0.8;
      ctx.fillStyle = palette.muted; ctx.font = Math.round(cell * 0.62) + "px ui-monospace, monospace"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText("NEXT", px, oy + 2);
      const nm = SHAPES[nextType];
      for (let y = 0; y < nm.length; y++) for (let x = 0; x < nm[y].length; x++) {
        if (nm[y][x]) drawCell(ctx, px + x * cell * 0.7, oy + cell * 1.1 + y * cell * 0.7, cell * 0.7, palette[COLORKEY[nextType]], fy);
      }
      ctx.fillStyle = palette.text; ctx.font = Math.round(cell * 0.5) + "px ui-monospace, monospace";
      const sy = oy + cell * 5.2;
      ctx.fillStyle = palette.muted; ctx.fillText("lines", px, sy);
      ctx.fillStyle = palette.text; ctx.fillText(String(lines), px, sy + cell * 0.7);
      ctx.fillStyle = palette.muted; ctx.fillText("level", px, sy + cell * 1.8);
      ctx.fillStyle = palette.text; ctx.fillText(String(level), px, sy + cell * 2.5);
      if (fy) { ctx.fillStyle = palette.accent; ctx.font = "700 " + Math.round(cell * 0.5) + "px ui-monospace, monospace"; ctx.fillText("◆ 4K", px, sy + cell * 3.8); }

      ctx.restore();
    },
  };
}
