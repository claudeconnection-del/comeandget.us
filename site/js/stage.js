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
    stage: $("main"),
    count: $("#count"),
  };

  const state = {
    found: new Set(), // orders of discovered beings
    opened: false,
    awake: false, // the feign: nothing reacts until the page wakes
  };

  let restore = null;
  let chromaTimer = null;
  const wakeCbs = [];

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

    // Run fn when the page wakes (or now, if it already has). Reactive secrets
    // use this so they stay completely inert during the 60s feign.
    onWake(fn) {
      if (state.awake) {
        try { fn(); } catch (e) { console.error("[onWake]", e); }
      } else {
        wakeCbs.push(fn);
      }
    },

    // End the feign: lift dormancy, release every waiting secret, and give the
    // single "tell" — one chroma colour-jump on the text.
    wake() {
      if (state.awake) return;
      state.awake = true;
      document.body.classList.remove("dormant");
      for (const fn of wakeCbs.splice(0)) {
        try { fn(); } catch (e) { console.error("[wake]", e); }
      }
      this.glitch();
    },

    // The only glitch: a sharp chroma colour-jump on the text. No positional
    // motion, no scanlines, no tearing. Suppressed under prefers-reduced-motion.
    glitch() {
      const target = el.stage;
      if (!target || reduceMotion()) return;
      target.classList.remove("gl-chroma");
      void target.offsetWidth; // restart the keyframes
      target.classList.add("gl-chroma");
      clearTimeout(chromaTimer);
      chromaTimer = setTimeout(() => target.classList.remove("gl-chroma"), 520);
    },

    glitchBurst() {
      this.glitch();
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
