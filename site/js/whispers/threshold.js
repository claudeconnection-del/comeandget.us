import { vigenere, sha256hex } from "../glyphs.js";

// sha256("MOTHMAN") — the key itself is never stored, only this fingerprint.
const KEY_HASH = "94ab9ea33d821423babf837af3a3dc89d6dd62c9badf655708f98896fecc427d";

const FLAVOR = {
  WHO: "us. the ones the maps forgot.",
  US: "yes. us. you said it first.",
  HELP: "help is the name we answer to. not the thing we give.",
  NAME: "we have seven lesser ones. say them in order and the eighth appears.",
  HELLO: "you're late.",
  MOTH: "warmer.",
};

export default {
  id: "gate",
  async init(stage) {
    const sigil = stage.el.sigil;
    if (!sigil) return;
    const cipher = sigil.dataset.sigil || "";
    let buffer = "";

    async function open(key) {
      if (stage.state.opened) return;
      stage.state.opened = true;
      const plain = vigenere(cipher, key, true);
      const m = plain.match(/PLEASE/i);
      const local = (m ? m[0] : plain.slice(-6)).toLowerCase();
      const addr = `${local}@comeandget.us`;

      sigil.classList.remove("armed");
      sigil.classList.add("opened");
      sigil.textContent = plain.replace(/(.{4})/g, "$1 ").trim();
      stage.glitchBurst(1400);
      stage.say("it opens.", { revert: false });
      stage.reveal(
        `<span class="name">the seal breaks: <b>${plain}</b></span>` +
          `<a href="mailto:${addr}" id="door">▷ ${addr}</a>` +
          `<span class="found">his name. in the subject line. nowhere else will do.</span>`
      );
    }

    window.addEventListener("keydown", async (e) => {
      if (!stage.state.awake) return;
      if (e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) {
        buffer = (buffer + e.key.toUpperCase()).slice(-24);
      } else {
        return;
      }

      for (const [word, reply] of Object.entries(FLAVOR)) {
        if (buffer.endsWith(word)) stage.say(reply);
      }

      if (buffer.length >= 7) {
        const candidate = buffer.slice(-7);
        if ((await sha256hex(candidate)) === KEY_HASH) {
          await open(candidate);
        }
      }
    });

    // Solvers who decrypt offline can also just click the sealed sigil
    // once they believe — but it stays sealed without the spoken name.
    sigil.addEventListener("click", () => {
      if (!stage.state.awake) return;
      if (!stage.state.opened) stage.say("it's sealed. speak, don't touch.");
    });
  },
};
