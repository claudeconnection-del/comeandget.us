// Fire-coloured Matrix rain with rising ember "flame" particles — the only
// ambient motion here. Colours come from a swappable palette (see setPalette),
// so theme commands can recolour the whole storm. Honours reduced-motion by
// painting a single static frame. flare() briefly stokes it.

const DEFAULT_GLYPHS =
  "01<>/\\|=+*#$@{}[]?!:;~^ABCDEF0123456789ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾊﾋﾌﾍﾎ";

const FIRE = {
  fade: "6,4,2", // rgba base for the trail-fade rectangle
  glow: "#ff5200",
  deep: "#a8330a",
  body: "#ff6f16",
  bodyHot: "#ffa648",
  head: "#ffe2a6",
  headHot: "#fff7da",
  ember: ["#ffe9ad", "#ff7a18", "#b3271e"],
};

export function createRain(canvas) {
  const ctx = canvas.getContext("2d");
  const reduce =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let cols = 0;
  let fontSize = 14;
  let drops = [];
  let flareUntil = 0;
  let embers = [];
  let pal = { ...FIRE };
  let glyphs = DEFAULT_GLYPHS.split("");

  const rnd = (n) => (Math.random() * n) | 0;
  const glyph = () => glyphs[rnd(glyphs.length)];

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
    ctx.fillStyle = `rgb(${pal.fade})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < cols; i++) {
      const runs = rnd(6);
      for (let r = 0; r < runs; r++) {
        const y = rnd(canvas.height / fontSize) * fontSize;
        ctx.fillStyle = r === 0 ? pal.body : pal.deep;
        ctx.fillText(glyph(), i * fontSize, y);
      }
    }
  }

  function spawnEmber(x, y) {
    if (embers.length > 160) return;
    embers.push({ x, y, vx: (Math.random() - 0.5) * 0.7, vy: -(0.4 + Math.random() * 1.0), life: 0, max: 36 + rnd(54), ch: glyph() });
  }

  function drawEmbers(hot) {
    ctx.shadowColor = pal.glow;
    for (let k = embers.length - 1; k >= 0; k--) {
      const e = embers[k];
      e.life++;
      e.x += e.vx;
      e.y += e.vy;
      e.vy -= 0.004;
      e.vx += (Math.random() - 0.5) * 0.06;
      const t = e.life / e.max;
      if (t >= 1 || e.y < -fontSize) { embers.splice(k, 1); continue; }
      ctx.fillStyle = t < 0.35 ? pal.ember[0] : t < 0.7 ? pal.ember[1] : pal.ember[2];
      ctx.globalAlpha = 1 - t;
      ctx.shadowBlur = hot ? 16 : 10;
      ctx.fillText(e.ch, e.x, e.y);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function frame() {
    const hot = performance.now() < flareUntil;
    ctx.fillStyle = `rgba(${pal.fade},0.075)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.shadowColor = pal.glow;
    for (let i = 0; i < cols; i++) {
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      ctx.shadowBlur = 0;
      ctx.fillStyle = pal.deep;
      ctx.fillText(glyph(), x, y - fontSize * 2);

      ctx.shadowBlur = hot ? 18 : 12;
      ctx.fillStyle = hot ? pal.bodyHot : pal.body;
      ctx.fillText(glyph(), x, y - fontSize);

      ctx.shadowBlur = hot ? 28 : 20;
      ctx.fillStyle = hot ? pal.headHot : pal.head;
      ctx.fillText(glyph(), x, y);

      if (y > canvas.height && Math.random() > 0.975) {
        drops[i] = Math.random() * -20;
        spawnEmber(x, canvas.height - rnd(fontSize * 2));
        if (hot) spawnEmber(x + rnd(fontSize), canvas.height - rnd(fontSize * 3));
      }
      drops[i] += hot ? 0.42 : 0.16 + Math.random() * 0.1;
    }

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
    return { flare() {}, setPalette(p) { pal = { ...pal, ...p }; if (p.glyphs) glyphs = p.glyphs.split(""); staticFrame(); } };
  }

  requestAnimationFrame(frame);
  return {
    flare(ms = 900) { flareUntil = performance.now() + ms; },
    setPalette(p) { pal = { ...pal, ...p }; if (p.glyphs) glyphs = p.glyphs.split(""); },
  };
}
