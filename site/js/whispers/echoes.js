// The door remembers faces.

const KEY = "cg.visits";

export default {
  id: "memory",
  init(stage) {
    let visits = 0;
    try {
      visits = Number(localStorage.getItem(KEY) || "0") + 1;
      localStorage.setItem(KEY, String(visits));
    } catch {
      visits = 1; // private mode, etc.
    }

    if (stage.el.count) {
      stage.el.count.textContent = visits > 1 ? `seen ${visits}×` : "seen once";
    }

    if (visits >= 2) {
      const msg = visits === 2 ? "you came back." : `${visits} times now. we're flattered.`;
      stage.onWake(() => setTimeout(() => stage.say(msg, { hold: 2600 }), 2600));
    }
  },
};
