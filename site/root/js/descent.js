// A tiny ASCII raycaster — "E1M1", DOOM-flavored. First-person, real-time,
// rendered into the terminal. Move with WASD/arrows, turn with left/right,
// fire with space, quit with q. Reach the glowing exit ($) or clear the imps.
// Self-contained with clean teardown, like the other arcade modules.

export function startDoom({ term, input, flare, surge, onExit }) {
  const MAP = [
    "##################",
    "#S...............#",
    "#..##..####..##..#",
    "#..##........##..#",
    "#......####......#",
    "#..##..#..#..##..#",
    "#..##..#e.#..##..#",
    "#......####......#",
    "#..##........##..#",
    "#..##..####..##..#",
    "#e............e.X#",
    "##################",
  ];
  const VW = 56, VH = 18, FOV = Math.PI / 3;
  // no full block — keeps near walls from blowing out to a wall of white
  const SHADE = ["▓", "▒", "░", "·"];
  const shadeFor = (dist, side) => {
    let i = dist < 2 ? 0 : dist < 4 ? 1 : dist < 7 ? 2 : 3;
    if (side) i = Math.min(3, i + 1); // side faces one step lighter = visible corners
    return SHADE[i];
  };

  const tileAt = (x, y) => {
    const r = MAP[Math.floor(y)];
    if (!r) return "#";
    const c = r[Math.floor(x)];
    return c === undefined ? "#" : c;
  };
  const solid = (x, y) => { const c = tileAt(x, y); return c === "#" || c === "X"; };

  let px = 1.5, py = 1.5, pa = 0.3;
  const enemies = [];
  for (let y = 0; y < MAP.length; y++) {
    for (let x = 0; x < MAP[y].length; x++) {
      const c = MAP[y][x];
      if (c === "S") { px = x + 0.5; py = y + 0.5; }
      if (c === "e") enemies.push({ x: x + 0.5, y: y + 0.5, alive: true });
    }
  }
  const totalE = enemies.length;
  let health = 100, kills = 0, over = false, won = false, flashUntil = 0;
  const keys = Object.create(null);

  const savedHTML = term.innerHTML;
  const savedMax = term.style.maxHeight;
  const savedOverflow = term.style.overflow;
  const savedColor = term.style.color;
  term.classList.add("gaming");
  term.style.color = "#a7b388"; // dim phosphor so the level isn't blinding
  if (input) { input.blur(); input.disabled = true; }

  const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  function fire() {
    flare && flare(140);
    flashUntil = performance.now() + 130;
    let best = null, bestD = 9;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - px, e.y - py);
      const rel = Math.abs(norm(Math.atan2(e.y - py, e.x - px) - pa));
      if (rel < 0.14 && d < bestD) { best = e; bestD = d; }
    }
    if (best) { best.alive = false; kills++; flare && flare(320); surge && surge(220); }
  }

  function onKeyDown(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d", " ", "spacebar", "q", "escape"].includes(k)) e.preventDefault();
    keys[k] = true;
    if (k === " " || k === "spacebar") fire();
    if (k === "q" || k === "escape") end("you retreat into the rain. E1M1 unfinished.");
  }
  function onKeyUp(e) { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; }
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);

  const timer = setInterval(step, 70);

  function step() {
    if (over) return;
    const turn = 0.13, spd = 0.13;
    if (keys["arrowleft"]) pa -= turn;
    if (keys["arrowright"]) pa += turn;
    const fwd = (keys["arrowup"] || keys["w"]) ? 1 : (keys["arrowdown"] || keys["s"]) ? -1 : 0;
    const str = keys["d"] ? 1 : keys["a"] ? -1 : 0;
    if (fwd) {
      const nx = px + Math.cos(pa) * spd * fwd, ny = py + Math.sin(pa) * spd * fwd;
      if (!solid(nx, py)) px = nx;
      if (!solid(px, ny)) py = ny;
    }
    if (str) {
      const nx = px + Math.cos(pa + Math.PI / 2) * spd * str, ny = py + Math.sin(pa + Math.PI / 2) * spd * str;
      if (!solid(nx, py)) px = nx;
      if (!solid(px, ny)) py = ny;
    }

    // damage when an imp is in your face; win at the exit
    for (const e of enemies) {
      if (e.alive && Math.hypot(e.x - px, e.y - py) < 0.7) health -= 4;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (tileAt(px + dx * 0.6, py + dy * 0.6) === "X") { won = true; return end("LEVEL COMPLETE. E1M1 cleared. the rain roars."); }
    }
    if (kills >= totalE && totalE) { won = true; return end("all imps down. the gate ahead is yours. (E1M1 cleared)"); }
    if (health <= 0) return end("you died. GAME OVER. (the rain takes everyone eventually)");
    render();
  }

  function render() {
    const buf = Array.from({ length: VH }, () => Array(VW).fill(" "));
    const zbuf = new Array(VW).fill(Infinity);
    for (let col = 0; col < VW; col++) {
      const ra = pa - FOV / 2 + (col / VW) * FOV;
      const cos = Math.cos(ra), sin = Math.sin(ra);
      let dist = 0, hit = "#", side = false;
      let pcx = Math.floor(px), pcy = Math.floor(py);
      for (let s = 0; s < 300; s++) {
        dist += 0.04;
        const hx = px + cos * dist, hy = py + sin * dist;
        const cx = Math.floor(hx), cy = Math.floor(hy);
        const c = tileAt(hx, hy);
        if (c === "#" || c === "X") { hit = c; side = cx !== pcx; break; } // entered via x-boundary = side face
        pcx = cx; pcy = cy;
      }
      const corrected = dist * Math.cos(ra - pa);
      zbuf[col] = corrected;
      const h = Math.min(VH, Math.round(VH / (corrected + 0.0001)));
      const top = ((VH - h) / 2) | 0;
      const sh = hit === "X" ? "$" : shadeFor(corrected, side);
      for (let r = 0; r < VH; r++) {
        buf[r][col] = r < top ? " " : r >= top + h ? "." : sh;
      }
    }
    // billboard the imps — drawn solid so they're the brightest thing on screen
    const sprites = enemies.filter((e) => e.alive).map((e) => ({ e, d: Math.hypot(e.x - px, e.y - py) })).sort((a, b) => b.d - a.d);
    for (const { e, d } of sprites) {
      const rel = norm(Math.atan2(e.y - py, e.x - px) - pa);
      if (Math.abs(rel) > FOV / 2 || d < 0.4) continue;
      const col = Math.round((0.5 + rel / FOV) * VW);
      const h = Math.min(VH, Math.round(VH / d));
      const top = ((VH - h) / 2) | 0;
      const w = Math.max(1, (h / 3) | 0);
      for (let cc = col - (w >> 1); cc <= col + (w >> 1); cc++) {
        if (cc < 0 || cc >= VW || d > zbuf[cc]) continue;
        for (let r = top; r < top + h && r < VH; r++) {
          buf[r][cc] = (r - top) / h < 0.22 ? "@" : "█";
        }
      }
    }
    // crosshair
    const ccx = (VW / 2) | 0, ccy = (VH / 2) | 0;
    if (buf[ccy]) buf[ccy][ccx] = "+";
    // weapon + muzzle flash (firing feedback)
    const gx = (VW / 2) | 0;
    if (performance.now() < flashUntil) {
      for (let dx = -1; dx <= 1; dx++) if (buf[VH - 3] && buf[VH - 3][gx + dx] !== undefined) buf[VH - 3][gx + dx] = "*";
    }
    if (buf[VH - 2]) buf[VH - 2][gx] = "█";
    if (buf[VH - 1]) { for (let dx = -1; dx <= 1; dx++) if (buf[VH - 1][gx + dx] !== undefined) buf[VH - 1][gx + dx] = "█"; }

    const bar = "│".repeat(Math.max(0, Math.round(health / 10))).padEnd(10, " ");
    const hud = ` E1M1   HP [${bar}]   KILLS ${kills}/${totalE}    [wasd/←→] move  [space] fire  [q] quit`;
    term.textContent = hud + "\n" + buf.map((r) => r.join("")).join("\n");
  }

  function end(msg) {
    if (over) return;
    over = true;
    clearInterval(timer);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    term.classList.remove("gaming");
    term.style.maxHeight = savedMax;
    term.style.overflow = savedOverflow;
    term.style.color = savedColor;
    term.innerHTML = savedHTML;
    if (input) { input.disabled = false; input.focus(); }
    if (won) { flare && flare(2400); surge && surge(1000); }
    onExit && onExit(`${msg}  (kills ${kills}/${totalE})`);
  }

  render();
}
