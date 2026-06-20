// The signal is never quite stable. At irregular intervals the page stutters —
// usually a single subtle artifact, occasionally a short flurry to ramp tension,
// then it settles again. Fully silent under prefers-reduced-motion.

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
      if (Math.random() < 0.14) {
        // rare flurry: a handful of quick stutters in close succession
        const n = 2 + Math.floor(Math.random() * 3);
        let i = 0;
        const flurry = setInterval(() => {
          stage.glitch(Math.random() < 0.4 ? "strong" : "mild");
          if (++i >= n) clearInterval(flurry);
        }, 110);
      } else {
        stage.glitch("mild");
      }
      schedule(wait(3500, 7000)); // next stutter in 3.5–10.5s
    }

    document.addEventListener("visibilitychange", () => {
      paused = document.hidden;
      if (!paused) schedule(wait(1500, 2000));
    });

    schedule(wait(2500, 3000)); // first stutter shortly after arrival
  },
};
