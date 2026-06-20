// Stillness is noticed. The longer you hold, the closer they lean.

export default {
  id: "idle-watcher",
  init(stage) {
    const subtle = stage.el.subtle;
    if (!subtle) return;

    const stages = [
      { after: 20000, text: "are you still there?" },
      { after: 45000, text: "they're getting closer." },
      { after: 80000, text: "don't blink." },
    ];
    let timers = [];

    function arm() {
      for (const t of timers) clearTimeout(t);
      subtle.classList.remove("breathe");
      subtle.textContent = "[ hold still ]";
      timers = stages.map((s) =>
        setTimeout(() => {
          subtle.textContent = s.text;
          subtle.classList.add("breathe");
        }, s.after)
      );
    }

    for (const ev of ["pointermove", "keydown", "pointerdown", "touchstart"]) {
      window.addEventListener(ev, arm, { passive: true });
    }
    arm();
  },
};
