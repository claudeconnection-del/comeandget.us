// ASCII Galaga/Invaders with two waves and a boss, played inside the terminal.
// Arrows move, space fires, q quits. Wave 1 is a row of grunts; clear it and
// wave 2 drops more plus a boss that eats several hits. Self-contained with
// clean teardown that restores the terminal.

import { paint } from "./ink.js";

const COLOR = (ch, x, y) => {
  if (y === 0) return ch === "♥" ? "#ff3b3b" : "#b9b29a"; // HUD
  switch (ch) {
    case "W": return "#ff6b6b"; // grunt
    case "M": return "#ff2a2a"; // boss
    case "|": return "#9bdcff"; // bullet
    case "A": return "#7cfc55"; // player
    default: return "inherit";
  }
};

export function startGame({ term, input, flare, surge, onExit }) {
  const W = 40;
  const H = 16;

  let px = (W / 2) | 0;
  let bullets = [];
  let enemies = [];
  let boss = null;
  let dir = 1;
  let score = 0;
  let wave = 1;
  let tick = 0;
  let over = false;
  let won = false;

  function spawnWave(n) {
    enemies = [];
    const rows = n === 1 ? 1 : 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 4; c < W - 4; c += 4) enemies.push({ x: c, y: r + 1, alive: true });
    }
    if (n >= 2) boss = { x: (W / 2) | 0, y: 1, hp: 6, alive: true };
  }
  spawnWave(1);

  const savedHTML = term.innerHTML;
  const savedMax = term.style.maxHeight;
  const savedOverflow = term.style.overflow;
  term.classList.add("gaming");
  if (input) { input.blur(); input.disabled = true; }

  function onKey(e) {
    const k = e.key;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", " ", "Spacebar", "q", "Q", "Escape"].includes(k)) e.preventDefault();
    if (k === "ArrowLeft") px = Math.max(1, px - 1);
    else if (k === "ArrowRight") px = Math.min(W - 2, px + 1);
    else if (k === " " || k === "Spacebar" || k === "ArrowUp") {
      if (bullets.length < 4) { bullets.push({ x: px, y: H - 2 }); flare && flare(140); }
    } else if (k === "q" || k === "Q" || k === "Escape") {
      end("you bailed. they respect that. a little.");
    }
  }
  window.addEventListener("keydown", onKey, true);
  const timer = setInterval(step, 90);

  function step() {
    if (over) return;
    tick++;

    bullets.forEach((b) => (b.y -= 1));
    bullets = bullets.filter((b) => b.y >= 0);

    if (tick % 4 === 0) {
      let edge = false;
      enemies.forEach((en) => { if (en.alive && (en.x + dir < 1 || en.x + dir > W - 2)) edge = true; });
      if (edge) { dir *= -1; enemies.forEach((en) => { if (en.alive) en.y += 1; }); }
      else enemies.forEach((en) => { if (en.alive) en.x += dir; });
    }
    if (boss && boss.alive && tick % 2 === 0) {
      boss.x += dir;
      if (boss.x <= 1 || boss.x >= W - 2) boss.x = Math.max(1, Math.min(W - 2, boss.x));
    }

    bullets.forEach((b) => {
      enemies.forEach((en) => {
        if (en.alive && en.x === b.x && en.y === b.y) { en.alive = false; b.y = -1; score++; flare && flare(280); surge && surge(180); }
      });
      if (boss && boss.alive && b.y === boss.y && Math.abs(b.x - boss.x) <= 1) {
        boss.hp--; b.y = -1; flare && flare(340); surge && surge(240);
        if (boss.hp <= 0) { boss.alive = false; score += 5; }
      }
    });
    bullets = bullets.filter((b) => b.y >= 0);

    if (enemies.some((en) => en.alive && en.y >= H - 1)) return end("an enemy reached the line. GAME OVER.");

    if (enemies.every((en) => !en.alive) && (!boss || !boss.alive)) {
      if (wave === 1) {
        wave = 2;
        spawnWave(2);
        flare && flare(1200);
        surge && surge(700);
      } else {
        won = true;
        return end("BOSS DOWN. both waves cleared. the rain salutes you.");
      }
    }
    render();
  }

  function render() {
    const grid = Array.from({ length: H }, () => Array(W).fill(" "));
    enemies.forEach((en) => { if (en.alive && en.y >= 0 && en.y < H) grid[en.y][en.x] = "W"; });
    if (boss && boss.alive) {
      for (let dx = -1; dx <= 1; dx++) if (boss.x + dx >= 0 && boss.x + dx < W) grid[boss.y][boss.x + dx] = "M";
    }
    bullets.forEach((b) => { if (b.y >= 0 && b.y < H) grid[b.y][b.x] = "|"; });
    grid[H - 1][px] = "A";
    const bossHp = boss && boss.alive ? `  BOSS ${"♥".repeat(boss.hp)}` : "";
    const hud = ` WAVE ${wave}   SCORE ${score}${bossHp}    [<- ->] move  [space] fire  [q] quit`;
    paint(term, [hud, ...grid.map((r) => r.join(""))], COLOR);
  }

  function end(msg) {
    if (over) return;
    over = true;
    clearInterval(timer);
    window.removeEventListener("keydown", onKey, true);
    term.classList.remove("gaming");
    term.style.maxHeight = savedMax;
    term.style.overflow = savedOverflow;
    term.innerHTML = savedHTML;
    if (input) { input.disabled = false; input.focus(); }
    if (won) { flare && flare(2200); surge && surge(900); }
    onExit && onExit(`${msg}  (score ${score})`);
  }

  render();
}
