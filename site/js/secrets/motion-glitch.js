// Move too fast and something at the edge of vision flinches with you.
// Brief tension, then the screen settles again.

export default {
  id: "motion-glitch",
  init(stage) {
    let last = null;
    let cooldown = 0;

    window.addEventListener("pointermove", (e) => {
      if (!stage.state.awake) return;
      const now = performance.now();
      if (last) {
        const dt = now - last.t || 1;
        const v = Math.hypot(e.clientX - last.x, e.clientY - last.y) / dt;
        if (v > 3.2 && now > cooldown) {
          cooldown = now + 2600;
          stage.glitchBurst(700);
          stage.say("something moved when you did.", { hold: 1600 });
        }
      }
      last = { x: e.clientX, y: e.clientY, t: now };
    });
  },
};
