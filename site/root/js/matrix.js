// Fire-coloured Matrix rain — the only thing that moves here.
// Bright spark heads, ember trails fading to ash. Honours reduced-motion by
// painting a single static frame instead of animating. flare() briefly stokes it.

const GLYPHS =
  "01<>/\\|=+*#$@{}[]?!:;~^ABCDEF0123456789ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾊﾋﾌﾍﾎ".split("");

export function createRain(canvas) {
  const ctx = canvas.getContext("2d");
  const reduce =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let cols = 0;
  let fontSize = 14;
  let drops = [];
  let flareUntil = 0;
  let embers = []; // rising flame particles

  const rnd = (n) => (Math.random() * n) | 0;
  const glyph = () => GLYPHS[rnd(GLYPHS.length)];

  function size() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    fontSize = Math.max(11, Math.round(window.innerWidth / 94));
    cols = Math.ceil(canvas.width / fontSize);
    drops = Array.from({ length: cols }, () => Math.random() * -40);
    embers = [];
    ctx.font = `${fontSize}px ${getComputedStyle(canvas).fontFamily || "monospace"}`;
    ctx.textBaseline = "top";
  }

  function staticFrame() {
    ctx.fillStyle = "#060402";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < cols; i++) {
      const runs = rnd(6);
      for (let r = 0; r < runs; r++) {
        const y = rnd(canvas.height / fontSize) * fontSize;
        ctx.fillStyle = r === 0 ? "#ff7a18" : "#5a2a08";
        ctx.fillText(glyph(), i * fontSize, y);
      }
    }
  }

  // a glyph that breaks loose and rises like a flame/ember, cooling as it goes
  function spawnEmber(x, y) {
    if (embers.length > 160) return;
    embers.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.7,
      vy: -(0.4 + Math.random() * 1.0),
      life: 0,
      max: 36 + rnd(54),
      ch: glyph(),
    });
  }

  function drawEmbers(hot) {
    ctx.shadowColor = "#ff6a00";
    for (let k = embers.length - 1; k >= 0; k--) {
      const e = embers[k];
      e.life++;
      e.x += e.vx;
      e.y += e.vy;
      e.vy -= 0.004; // buoyant: accelerates upward
      e.vx += (Math.random() - 0.5) * 0.06; // flicker drift
      const t = e.life / e.max;
      if (t >= 1 || e.y < -fontSize) {
        embers.splice(k, 1);
        continue;
      }
      // cools as it rises: white-gold -> orange -> red
      ctx.fillStyle = t < 0.35 ? "#ffe9ad" : t < 0.7 ? "#ff7a18" : "#b3271e";
      ctx.globalAlpha = 1 - t;
      ctx.shadowBlur = hot ? 16 : 10;
      ctx.fillText(e.ch, e.x, e.y);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function frame() {
    const hot = performance.now() < flareUntil;
    // low alpha = long-lived, bright trails (the motion blur), kept rich at the
    // slow fall speed below
    ctx.fillStyle = "rgba(6,4,2,0.075)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.shadowColor = "#ff5200";
    for (let i = 0; i < cols; i++) {
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      // deep ember, two back (no glow, cheap)
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#a8330a";
      ctx.fillText(glyph(), x, y - fontSize * 2);

      // bright orange body, one back (glowing)
      ctx.shadowBlur = hot ? 18 : 12;
      ctx.fillStyle = hot ? "#ffa648" : "#ff6f16";
      ctx.fillText(glyph(), x, y - fontSize);

      // blazing spark head (strong glow)
      ctx.shadowBlur = hot ? 28 : 20;
      ctx.fillStyle = hot ? "#fff7da" : "#ffe2a6";
      ctx.fillText(glyph(), x, y);

      // when a column lands at the bottom, it poofs up into embers
      if (y > canvas.height && Math.random() > 0.975) {
        drops[i] = Math.random() * -20;
        spawnEmber(x, canvas.height - rnd(fontSize * 2));
        if (hot) spawnEmber(x + rnd(fontSize), canvas.height - rnd(fontSize * 3));
      }
      drops[i] += hot ? 0.42 : 0.16 + Math.random() * 0.1;
    }

    // ambient embers drifting up from the fire at the bottom
    const spawns = hot ? 3 : 1;
    for (let s = 0; s < spawns; s++) {
      if (Math.random() < 0.7) spawnEmber(rnd(canvas.width), canvas.height - rnd(fontSize * 3));
    }
    drawEmbers(hot);

    ctx.shadowBlur = 0;
    requestAnimationFrame(frame);
  }

  size();
  window.addEventListener("resize", size, { passive: true });

  if (reduce) {
    staticFrame();
    window.addEventListener("resize", staticFrame, { passive: true });
    return { flare() {} };
  }

  requestAnimationFrame(frame);
  return {
    flare(ms = 900) {
      flareUntil = performance.now() + ms;
    },
  };
}
