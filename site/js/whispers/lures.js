// Seven invisible zones. Each hides a lesser being. Their initials, taken in
// order, spell the winged one whose name unseals the sigil.

export default {
  id: "hotspots",
  init(stage) {
    const hots = [...document.querySelectorAll(".hot")];
    if (!hots.length) return;

    // Cache each hotspot's centre. The hotspots don't move, so measuring once
    // (and only on resize/scroll) keeps pointermove off the layout path — it was
    // calling getBoundingClientRect for every hotspot on every move (forced
    // reflow per event).
    let centres = [];
    const measure = () => {
      centres = hots.map((h) => {
        const r = h.getBoundingClientRect();
        return { h, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      });
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    window.addEventListener("scroll", measure, { passive: true });

    // Warm a hotspot when the cursor drifts near it.
    window.addEventListener("pointermove", (e) => {
      if (!stage.state.awake) return;
      for (const { h, cx, cy } of centres) {
        const near = Math.hypot(e.clientX - cx, e.clientY - cy) < 120;
        h.classList.toggle("warm", near || h.classList.contains("found"));
      }
    });

    for (const h of hots) {
      const order = Number(h.dataset.order);
      const being = h.dataset.being;
      const mark = () => {
        if (!stage.state.awake) return;
        if (!h.classList.contains("found")) {
          h.classList.add("found", "warm");
          stage.state.found.add(order);
        }
        const tag = String(order).padStart(2, "0");
        stage.reveal(
          `<span class="name"><b>${tag}</b> &middot; ${being}</span>` +
            `<span class="found">${stage.state.found.size} / 7 marked &mdash; their first letters, in order</span>`
        );
      };
      h.addEventListener("pointerenter", mark);
      h.addEventListener("click", mark);
    }
  },
};
