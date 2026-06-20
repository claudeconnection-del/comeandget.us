// Shared stage passed to every secret module. Each secret gets the same
// handful of primitives so the modules stay isolated and individually testable.

const $ = (sel) => document.querySelector(sel);

// Accessibility: honour the OS "reduce motion" setting. When set, the glitch
// engine goes quiet entirely.
const reduceMotion = () =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createStage() {
  const el = {
    line: $("#line"),
    subtle: $("#subtle"),
    sigil: $("#sigil"),
    reveal: $("#reveal"),
    scanlines: $("#scanlines"),
    scanbar: $("#scanbar"),
    stage: $("main"),
    count: $("#count"),
  };

  const state = {
    found: new Set(), // orders of discovered beings
    opened: false,
  };

  let restore = null;

  const stage = {
    el,
    state,

    // Speak a line in the prompt with a brief glitch, optionally reverting.
    say(text, { revert = true, hold = 3200 } = {}) {
      if (!el.line) return;
      if (restore) clearTimeout(restore);
      const original = stage._home ?? el.line.textContent;
      el.line.textContent = text;
      el.line.classList.remove("glitch");
      void el.line.offsetWidth;
      el.line.classList.add("glitch");
      if (revert) {
        restore = setTimeout(() => {
          el.line.textContent = original;
        }, hold);
      } else {
        stage._home = text;
      }
    },

    reveal(html) {
      if (el.reveal) el.reveal.innerHTML = html;
    },

    // One intermittent glitch. "mild" = a quick, subtle artifact (the ambient
    // texture); "strong" = a layered burst (signal tearing, scanlines, a sweep).
    // Each artifact is brief and self-clearing so the page stays readable, and
    // the whole thing is suppressed under prefers-reduced-motion.
    glitch(level = "mild") {
      const target = el.stage;
      if (!target || reduceMotion()) return;

      // Composite animations layer cleanly: at most one transform/clip animation
      // on <main> (gl-mild or gl-tear) plus chroma-split on the text children.
      const strong = level === "strong";
      const fx = ["gl-chroma"];
      if (strong) fx.push("gl-tear");
      else if (Math.random() < 0.72) fx.push("gl-mild");
      target.classList.add(...fx);

      if (el.scanbar && (strong || Math.random() < 0.35)) {
        el.scanbar.classList.remove("sweep");
        void el.scanbar.offsetWidth;
        el.scanbar.classList.add("sweep");
      }
      if (el.scanlines && strong) el.scanlines.classList.add("on");

      const dur = strong ? 480 : 130 + Math.random() * 170;
      setTimeout(() => {
        target.classList.remove(...fx);
        if (el.scanlines) el.scanlines.classList.remove("on");
      }, dur);
    },

    // Back-compat: a stronger burst, with scanlines held for `ms` to ramp tension.
    glitchBurst(ms = 700) {
      this.glitch("strong");
      if (el.scanlines && !reduceMotion()) {
        el.scanlines.classList.add("on");
        setTimeout(() => el.scanlines.classList.remove("on"), ms);
      }
    },
  };

  return stage;
}

export async function boot(secrets, stage) {
  for (const secret of secrets) {
    try {
      await secret.init(stage);
    } catch (err) {
      // A failing secret must never take the whole gate down.
      console.error(`[${secret.id ?? "secret"}] failed to wake`, err);
    }
  }
}
