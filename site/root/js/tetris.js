// ASCII Tetris. ←/→ move, ↑ rotate, ↓ soft drop, space hard drop, q quits.
import { paint } from "./ink.js";

export function startTetris({ term, input, flare, surge, onExit, palette }) {
  const P = palette || {};
  const W = 10, H = 20;
  const COLOR = (ch, x, y) => {
    if (y === 0) return P.hud || "#b9b29a";
    switch (ch) {
      case "#": return P.wallEdge;
      case "I": return P.bullet;
      case "O": return P.exit;
      case "T": return P.boss;
      case "S": return P.player;
      case "Z": return P.enemy;
      case "J": return P.crosshair;
      case "L": return P.enemyHead || P.bodyHot;
      default: return "inherit";
    }
  };
  const SHAPES = {
    I: [[0, 1], [1, 1], [2, 1], [3, 1]],
    O: [[1, 0], [2, 0], [1, 1], [2, 1]],
    T: [[1, 0], [0, 1], [1, 1], [2, 1]],
    S: [[1, 0], [2, 0], [0, 1], [1, 1]],
    Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
    J: [[0, 0], [0, 1], [1, 1], [2, 1]],
    L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  };
  const TYPES = Object.keys(SHAPES);
  const well = Array.from({ length: H }, () => Array(W).fill(""));
  let cur = null, score = 0, lines = 0, over = false;

  const savedHTML = term.innerHTML, savedMax = term.style.maxHeight, savedOverflow = term.style.overflow;
  term.classList.add("gaming");
  if (input) { input.blur(); input.disabled = true; }

  const collide = (cells, ox, oy) => cells.some(([x, y]) => {
    const gx = ox + x, gy = oy + y;
    return gx < 0 || gx >= W || gy >= H || (gy >= 0 && well[gy][gx]);
  });

  function spawn() {
    const t = TYPES[(Math.random() * TYPES.length) | 0];
    cur = { type: t, cells: SHAPES[t].map((c) => c.slice()), ox: 3, oy: 0 };
    if (collide(cur.cells, cur.ox, cur.oy)) { over = true; end("the stack reached the sky. GAME OVER."); }
  }

  function rotate() {
    const r = cur.cells.map(([x, y]) => [y, -x]);
    const minx = Math.min(...r.map((c) => c[0])), miny = Math.min(...r.map((c) => c[1]));
    const norm = r.map(([x, y]) => [x - minx, y - miny]);
    if (!collide(norm, cur.ox, cur.oy)) cur.cells = norm;
  }

  function move(dx, dy) {
    if (!collide(cur.cells, cur.ox + dx, cur.oy + dy)) { cur.ox += dx; cur.oy += dy; return true; }
    return false;
  }

  function lock() {
    cur.cells.forEach(([x, y]) => { if (cur.oy + y >= 0) well[cur.oy + y][cur.ox + x] = cur.type; });
    let cleared = 0;
    for (let y = H - 1; y >= 0; y--) {
      if (well[y].every((c) => c)) { well.splice(y, 1); well.unshift(Array(W).fill("")); cleared++; y++; }
    }
    if (cleared) { score += [0, 100, 300, 500, 800][cleared]; lines += cleared; flare && flare(200 + cleared * 200); surge && surge(150 + cleared * 150); }
    spawn();
  }

  function drop() { if (!move(0, 1)) lock(); }

  function onKey(e) {
    if (over) return;
    const k = e.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "spacebar", "q", "escape"].includes(k)) e.preventDefault();
    if (k === "arrowleft") move(-1, 0);
    else if (k === "arrowright") move(1, 0);
    else if (k === "arrowup") rotate();
    else if (k === "arrowdown") drop();
    else if (k === " " || k === "spacebar") { while (move(0, 1)); lock(); }
    else if (k === "q" || k === "escape") return end("you stopped stacking.");
    if (!over) render();
  }
  window.addEventListener("keydown", onKey, true);
  const timer = setInterval(() => { if (!over) { drop(); render(); } }, 520);

  function render() {
    const g = well.map((row) => row.map((c) => c || " "));
    if (cur) cur.cells.forEach(([x, y]) => { if (cur.oy + y >= 0 && g[cur.oy + y]) g[cur.oy + y][cur.ox + x] = cur.type; });
    const rows = g.map((row) => "#" + row.join("") + "#");
    rows.push("#".repeat(W + 2));
    const hud = ` TETRIS   score ${score}   lines ${lines}   [←→] move [↑] rotate [↓/space] drop [q] quit`;
    paint(term, [hud, ...rows], COLOR);
  }

  function end(msg) {
    if (term._tetrisEnded) return;
    term._tetrisEnded = true;
    over = true;
    clearInterval(timer);
    window.removeEventListener("keydown", onKey, true);
    term.classList.remove("gaming");
    term.style.maxHeight = savedMax; term.style.overflow = savedOverflow;
    term.innerHTML = savedHTML;
    delete term._tetrisEnded;
    if (input) { input.disabled = false; input.focus(); }
    onExit && onExit(`${msg}  (score ${score}, lines ${lines})`);
  }

  spawn();
  render();
}
