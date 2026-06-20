// The old code arms the sigil and lights every gate at once.

const SEQ = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
];

export default {
  id: "konami",
  init(stage) {
    let i = 0;
    window.addEventListener("keydown", (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      i = key === SEQ[i].toLowerCase() ? i + 1 : key === SEQ[0].toLowerCase() ? 1 : 0;
      if (i === SEQ.length) {
        i = 0;
        stage.el.sigil?.classList.add("armed");
        for (const h of document.querySelectorAll(".hot")) h.classList.add("warm");
        stage.say("the gate is lit. seven names, then the eighth.", { hold: 4000 });
        stage.glitchBurst(600);
      }
    });
  },
};
