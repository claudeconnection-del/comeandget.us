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

  const rnd = (n) => (Math.random() * n) | 0;
  const glyph = () => GLYPHS[rnd(GLYPHS.length)];

  function size() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    fontSize = Math.max(12, Math.round(window.innerWidth / 80));
    cols = Math.ceil(canvas.width / fontSize);
    drops = Array.from({ length: cols }, () => Math.random() * -40);
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

  function frame() {
    const hot = performance.now() < flareUntil;
    ctx.fillStyle = "rgba(6,4,2,0.11)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < cols; i++) {
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      // ember just behind the head
      ctx.shadowBlur = 0;
      ctx.fillStyle = hot ? "#ff9d3c" : "#c2480a";
      ctx.fillText(glyph(), x, y - fontSize);

      // bright spark head
      ctx.shadowColor = "#ff7a18";
      ctx.shadowBlur = hot ? 16 : 8;
      ctx.fillStyle = hot ? "#fff3cf" : "#ffd27a";
      ctx.fillText(glyph(), x, y);
      ctx.shadowBlur = 0;

      if (y > canvas.height && Math.random() > 0.975) drops[i] = Math.random() * -20;
      drops[i] += hot ? 0.95 : 0.5 + Math.random() * 0.25;
    }
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
