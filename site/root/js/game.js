// A tiny ASCII Galaga/Invaders, played inside the terminal. It takes over the
// keyboard and renders frames into #term, then fully restores the terminal on
// exit (win, death, or quit). Self-contained; one game at a time.

export function startGame({ term, input, flare, surge, onExit }) {
  const W = 40;
  const H = 14;
  const TARGET = 8;

  let px = (W / 2) | 0;
  let bullets = [];
  let enemies = [];
  let dir = 1;
  let score = 0;
  let tick = 0;
  let over = false;
  let won = false;

  for (let r = 0; r < 2; r++) {
    for (let c = 4; c < W - 4; c += 4) enemies.push({ x: c, y: r + 1, alive: true });
  }

  const savedHTML = term.innerHTML;
  const savedMax = term.style.maxHeight;
  const savedOverflow = term.style.overflow;
  term.classList.add("gaming");
  if (input) { input.blur(); input.disabled = true; }

  function onKey(e) {
    const k = e.key;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", " ", "Spacebar", "q", "Q", "Escape"].includes(k)) {
      e.preventDefault();
    }
    if (k === "ArrowLeft") px = Math.max(1, px - 1);
    else if (k === "ArrowRight") px = Math.min(W - 2, px + 1);
    else if (k === " " || k === "Spacebar" || k === "ArrowUp") {
      if (bullets.length < 3) { bullets.push({ x: px, y: H - 2 }); flare && flare(150); }
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

    bullets.forEach((b) => {
      enemies.forEach((en) => {
        if (en.alive && en.x === b.x && en.y === b.y) {
          en.alive = false; b.y = -1; score++; flare && flare(280); surge && surge(200);
        }
      });
    });
    bullets = bullets.filter((b) => b.y >= 0);

    if (enemies.some((en) => en.alive && en.y >= H - 1)) {
      return end("an enemy reached the line. life lost. GAME OVER.");
    }
    if (score >= TARGET || enemies.every((en) => !en.alive)) {
      won = true;
      return end("WAVE CLEARED. the rain salutes you.");
    }
    render();
  }

  function render() {
    const grid = Array.from({ length: H }, () => Array(W).fill(" "));
    enemies.forEach((en) => { if (en.alive && en.y >= 0 && en.y < H) grid[en.y][en.x] = "W"; });
    bullets.forEach((b) => { if (b.y >= 0 && b.y < H) grid[b.y][b.x] = "|"; });
    grid[H - 1][px] = "A";
    const hud = ` SCORE ${score}/${TARGET}    [<- ->] move   [space] fire   [q] quit`;
    term.textContent = hud + "\n" + grid.map((r) => r.join("")).join("\n");
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
