// ASCII Snake. Arrows/WASD steer, eat *, don't bite the walls or yourself.
// Self-contained with clean teardown, matching the other arcade modules.

import { paint } from "./ink.js";

const COLOR = (ch, x, y) => {
  if (y === 0) return "#b9b29a"; // HUD
  switch (ch) {
    case "#": return "#5a5a4a"; // wall
    case "@": return "#aef58a"; // head
    case "o": return "#5fae5f"; // body
    case "*": return "#ff5d5d"; // food
    default: return "inherit";
  }
};

export function startSnake({ term, input, flare, surge, onExit }) {
  const W = 38, H = 16;
  let snake = [{ x: 8, y: 8 }];
  let dir = { x: 1, y: 0 };
  let pending = dir;
  let food = spawn();
  let score = 0, over = false;

  const savedHTML = term.innerHTML;
  const savedMax = term.style.maxHeight;
  const savedOverflow = term.style.overflow;
  term.classList.add("gaming");
  if (input) { input.blur(); input.disabled = true; }

  function spawn() {
    let p;
    do { p = { x: 1 + Math.floor(Math.random() * (W - 2)), y: 1 + Math.floor(Math.random() * (H - 2)) }; }
    while (snake && snake.some((s) => s.x === p.x && s.y === p.y));
    return p;
  }

  function onKey(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d", "q", "escape"].includes(k)) e.preventDefault();
    if ((k === "arrowleft" || k === "a") && dir.x !== 1) pending = { x: -1, y: 0 };
    else if ((k === "arrowright" || k === "d") && dir.x !== -1) pending = { x: 1, y: 0 };
    else if ((k === "arrowup" || k === "w") && dir.y !== 1) pending = { x: 0, y: -1 };
    else if ((k === "arrowdown" || k === "s") && dir.y !== -1) pending = { x: 0, y: 1 };
    else if (k === "q" || k === "escape") end("you slithered off. (snake abandoned)");
  }
  window.addEventListener("keydown", onKey, true);
  const timer = setInterval(step, 110);

  function step() {
    if (over) return;
    dir = pending;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x <= 0 || head.x >= W - 1 || head.y <= 0 || head.y >= H - 1 || snake.some((s) => s.x === head.x && s.y === head.y)) {
      return end("you bit the dark. GAME OVER.");
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) { score++; flare && flare(260); surge && surge(180); food = spawn(); }
    else snake.pop();
    render();
  }

  function render() {
    const g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || x === W - 1 || y === 0 || y === H - 1) ? "#" : " "));
    g[food.y][food.x] = "*";
    snake.forEach((s, i) => { g[s.y][s.x] = i === 0 ? "@" : "o"; });
    const hud = ` SNAKE   score ${score}    [wasd/←→] steer   [q] quit`;
    paint(term, [hud, ...g.map((r) => r.join(""))], COLOR);
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
    onExit && onExit(`${msg}  (score ${score})`);
  }

  render();
}
