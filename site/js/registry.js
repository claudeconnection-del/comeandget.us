// Shared stage passed to every secret module. Each secret gets the same
// handful of primitives so the modules stay isolated and individually testable.

const $ = (sel) => document.querySelector(sel);

export function createStage() {
  const el = {
    line: $("#line"),
    subtle: $("#subtle"),
    sigil: $("#sigil"),
    reveal: $("#reveal"),
    scanlines: $("#scanlines"),
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

    glitchBurst(ms = 900) {
      if (!el.scanlines) return;
      el.scanlines.classList.add("on");
      document.body.classList.add("shudder");
      setTimeout(() => {
        el.scanlines.classList.remove("on");
        document.body.classList.remove("shudder");
      }, ms);
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
