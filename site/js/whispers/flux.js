// The signal is never quite stable. At long, irregular intervals the text
// throws a single sharp chroma colour-jump, then settles. Nothing else.
// Fully silent under prefers-reduced-motion.

export default {
  id: "ambient-glitch",
  init(stage) {
    const reduce =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let paused = false;
    let timer = null;

    const wait = (min, span) => min + Math.random() * span;

    function schedule(ms) {
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    }

    function tick() {
      if (paused) return;
      stage.glitch(); // one sharp chroma colour-jump
      schedule(wait(8000, 10000)); // infrequent: next jump in ~8–18s
    }

    document.addEventListener("visibilitychange", () => {
      paused = document.hidden;
      if (!paused && stage.state.awake) schedule(wait(1500, 2000));
    });

    // Stays silent through the feign; first stutter comes after the page wakes.
    stage.onWake(() => schedule(wait(1200, 2500)));
  },
};
