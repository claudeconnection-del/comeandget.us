// ASCII Breakout. left/right move the paddle, clear the bricks, 3 lives, q quits.
import { paint } from "./ink.js";

export function startBreakout({ term, input, flare, surge, onExit, palette }) {
  const P = palette || {};
  const W = 40, H = 22, TOP = 2, ROWS = 3, PADW = 7;
  const ROWCH = ["=", "▬", "*"]; // per-row brick char (-> per-row colour)
  const COLOR = (ch, x, y) => {
    if (y === 0) return P.hud || "#b9b29a";
    switch (ch) {
      case "#": return P.wallEdge;
      case "=": return P.boss;
      case "▬": return P.enemy;
      case "*": return P.exit;
      case "▀": return P.player;
      case "o": return P.bullet;
      default: return "inherit";
    }
  };
  const brick = Array.from({ length: H }, () => Array(W).fill(""));
  let count = 0;
  for (let r = 0; r < ROWS; r++) for (let x = 2; x < W - 2; x++) { brick[TOP + r][x] = ROWCH[r]; count++; }

  let px = (W / 2 - PADW / 2) | 0, bx = W / 2, by = H - 4, vx = 0.5, vy = -0.8;
  let lives = 3, score = 0, over = false, won = false, stuck = true;
  const keys = Object.create(null);

  const savedHTML = term.innerHTML, savedMax = term.style.maxHeight, savedOverflow = term.style.overflow;
  term.classList.add("gaming");
  if (input) { input.blur(); input.disabled = true; }

  function onKey(e) {
    const k = e.key.toLowerCase();
    if (["arrowleft", "arrowright", "a", "d", " ", "spacebar", "q", "escape"].includes(k)) e.preventDefault();
    keys[k] = true;
    if (k === " " || k === "spacebar") stuck = false;
    if (k === "q" || k === "escape") end("you walked away from the wall.");
  }
  function onUp(e) { keys[e.key.toLowerCase()] = false; }
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onUp, true);
  const timer = setInterval(step, 50);

  function step() {
    if (over) return;
    if (keys["arrowleft"] || keys["a"]) px = Math.max(1, px - 2);
    if (keys["arrowright"] || keys["d"]) px = Math.min(W - 1 - PADW, px + 2);
    if (stuck) { bx = px + PADW / 2; by = H - 4; return render(); }

    bx += vx; by += vy;
    if (bx <= 1 || bx >= W - 2) { vx *= -1; bx = Math.max(1, Math.min(W - 2, bx)); }
    if (by <= 1) { vy *= -1; by = 1; }
    const cy = by | 0, cx = bx | 0;
    if (brick[cy] && brick[cy][cx]) { brick[cy][cx] = ""; count--; vy *= -1; score += 10; flare && flare(150); surge && surge(120); }
    if (by >= H - 3 && bx >= px && bx < px + PADW) { vy = -Math.abs(vy); vx += (bx - (px + PADW / 2)) * 0.12; }
    if (by >= H - 1) {
      lives--;
      if (lives <= 0) return end("the wall won. GAME OVER.");
      stuck = true; vx = 0.5; vy = -0.8;
    }
    if (count <= 0) { won = true; return end("WALL CLEARED. the rain breaks with you."); }
    render();
  }

  function render() {
    const g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) =>
      (x === 0 || x === W - 1 || y === 0) ? "#" : (brick[y][x] || " ")));
    for (let i = 0; i < PADW; i++) if (g[H - 2] && g[H - 2][px + i] !== undefined) g[H - 2][px + i] = "▀";
    if (g[by | 0]) g[by | 0][bx | 0] = "o";
    const hud = ` BREAKOUT   score ${score}   lives ${lives}   ${stuck ? "[space] launch  " : ""}[<- ->] move  [q] quit`;
    paint(term, [hud, ...g.map((r) => r.join(""))], COLOR);
  }

  function end(msg) {
    if (over) return;
    over = true;
    clearInterval(timer);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onUp, true);
    term.classList.remove("gaming");
    term.style.maxHeight = savedMax; term.style.overflow = savedOverflow;
    term.innerHTML = savedHTML;
    if (input) { input.disabled = false; input.focus(); }
    if (won) { flare && flare(2000); surge && surge(800); }
    onExit && onExit(`${msg}  (score ${score})`, score);
  }

  render();
}
