// ASCII Pong vs a passable AI. w/s or up/down to move, first to 5, q quits.
import { paint } from "./ink.js";

export function startPong({ term, input, flare, surge, onExit, palette }) {
  const P = palette || {};
  const W = 46, H = 20, WIN = 5, PAD = 3;
  const COLOR = (ch, x, y) => {
    if (y === 0) return P.hud || "#b9b29a";
    switch (ch) {
      case "#": return P.wallEdge;
      case "▌": return P.player;
      case "▐": return P.enemy;
      case "O": return P.bullet;
      case ":": return P.floor;
      default: return "inherit";
    }
  };
  let py1 = (H / 2) | 0, py2 = (H / 2) | 0;
  let bx = W / 2, by = H / 2, vx = 0.6, vy = 0.4;
  let s1 = 0, s2 = 0, over = false, won = false;
  const keys = Object.create(null);

  const savedHTML = term.innerHTML, savedMax = term.style.maxHeight, savedOverflow = term.style.overflow;
  term.classList.add("gaming");
  if (input) { input.blur(); input.disabled = true; }

  function onKey(e) {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "w", "s", "q", "escape"].includes(k)) e.preventDefault();
    keys[k] = true;
    if (k === "q" || k === "escape") end("you left the table.");
  }
  function onUp(e) { keys[e.key.toLowerCase()] = false; }
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onUp, true);
  const timer = setInterval(step, 55);

  function reset(dir) { bx = W / 2; by = H / 2; vx = 0.6 * dir; vy = Math.random() - 0.5; }

  function step() {
    if (over) return;
    if (keys["arrowup"] || keys["w"]) py1 = Math.max(1, py1 - 1);
    if (keys["arrowdown"] || keys["s"]) py1 = Math.min(H - PAD - 1, py1 + 1);
    const target = by - PAD / 2;
    if (py2 < target) py2 = Math.min(H - PAD - 1, py2 + 0.7);
    else if (py2 > target) py2 = Math.max(1, py2 - 0.7);

    bx += vx; by += vy;
    if (by <= 1 || by >= H - 2) { vy *= -1; by = Math.max(1, Math.min(H - 2, by)); }
    if (bx <= 2 && by >= py1 && by < py1 + PAD) { vx = Math.abs(vx) * 1.04; vy += (by - (py1 + PAD / 2)) * 0.18; flare && flare(110); }
    if (bx >= W - 3 && by >= py2 && by < py2 + PAD) { vx = -Math.abs(vx) * 1.04; vy += (by - (py2 + PAD / 2)) * 0.18; }
    if (bx < 1) { s2++; reset(-1); }
    else if (bx > W - 2) { s1++; reset(1); flare && flare(240); surge && surge(160); }
    if (s1 >= WIN) { won = true; return end("YOU WIN. the rain applauds."); }
    if (s2 >= WIN) return end("you lost to a machine. GAME OVER.");
    render();
  }

  function render() {
    const g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) =>
      (x === 0 || x === W - 1 || y === 0 || y === H - 1) ? "#" : (x === (W / 2 | 0) && y % 2 === 0) ? ":" : " "));
    for (let i = 0; i < PAD; i++) {
      if (g[(py1 | 0) + i]) g[(py1 | 0) + i][1] = "▌";
      if (g[(py2 | 0) + i]) g[(py2 | 0) + i][W - 2] = "▐";
    }
    if (g[by | 0]) g[by | 0][bx | 0] = "O";
    const hud = ` PONG   you ${s1} : ${s2} cpu   first to ${WIN}   [w/s] move  [q] quit`;
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
    onExit && onExit(`${msg}  (${s1}:${s2})`, s1);
  }

  render();
}
