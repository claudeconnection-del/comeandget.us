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

    if (visits === 2) {
      setTimeout(() => stage.say("you came back.", { hold: 2600 }), 2600);
    } else if (visits >= 3) {
      setTimeout(
        () => stage.say(`${visits} times now. we're flattered.`, { hold: 2600 }),
        2600
      );
    }
  },
};
