// index.js — wires the arcade into the terminal: `games` lists them, each name
// launches one, and `4k` toggles the shared glow-up. Per-launch overrides too:
// `tetris 4k` forces the upgrade, `snake plain` forces classic.
import { runGame } from "./host.js";
import { snake } from "./snake.js";
import { tetris } from "./tetris.js";
import { breakout } from "./breakout.js";
import { pong } from "./pong.js";
import { highScore, is4kUnlocked, fourkPref, setFourk, fourkDefault } from "./store.js";

const GAMES = [
  { id: "tetris", make: tetris, controls: "← → move · ↑ rotate · ↓ soft · space drop · q quit", blurb: "stack & clear" },
  { id: "snake", make: snake, controls: "← ↑ → ↓ / WASD · q quit", blurb: "eat the bean" },
  { id: "breakout", make: breakout, controls: "← → move · space serve · q quit", blurb: "break the wall" },
  { id: "pong", make: pong, controls: "↑ ↓ / W S move · q quit", blurb: "first to five" },
];

// did the player ask for/against 4K on this launch?
function wants(argv) {
  const a = (argv || []).map((s) => s.toLowerCase());
  if (a.some((x) => ["4k", "hd", "fancy", "glow", "on"].includes(x))) return "on";
  if (a.some((x) => ["plain", "classic", "2d", "off"].includes(x))) return "off";
  return null;
}

function play(api, g, argv) {
  const w = wants(argv);
  let fancy;
  if (w === "on") {
    if (!is4kUnlocked()) { api.print(api.sp("4K unlocks after your first game — ", "c-muted"), api.sp("here's a classic round to earn it.", "c-text")); fancy = false; }
    else fancy = true;
  } else if (w === "off") fancy = false;
  else fancy = fourkDefault();
  runGame({ name: g.id, create: (host) => g.make(host, { fancy }), api, controls: g.controls, fancy, zoom: fancy });
}

export function gameCommands() {
  const cmds = {
    games: ({ api }) => {
      api.print(api.sp("the arcade", "c-accent bold"), api.sp("  ·  little canvas games, theme-matched", "c-muted"));
      api.blank();
      for (const g of GAMES) {
        api.print(api.sp("  " + g.id.padEnd(10), "c-text"), api.sp(("best " + highScore(g.id)).padEnd(11), "c-muted"), api.sp(g.blurb, "c-subtle"));
      }
      api.blank();
      if (is4kUnlocked()) {
        api.print(api.sp("◆ 4K is " + (fourkPref() ? "on" : "off"), "c-warn"), api.sp(" — flip it with ", "c-muted"), api.kbd("4k"), api.sp(", or per game: ", "c-muted"), api.kbd("tetris 4k"), api.sp(" / ", "c-muted"), api.kbd("snake plain"));
      } else {
        api.print(api.sp("◇ finish any game once ", "c-muted"), api.sp("(or land a Tetris)", "c-subtle"), api.sp(" to unlock the ", "c-muted"), api.sp("4K", "c-warn"), api.sp(" glow-up.", "c-muted"));
      }
    },
    "4k": ({ argv, api }) => {
      if (!is4kUnlocked()) {
        api.print(api.sp("◇ 4K isn't poured yet — ", "c-muted"), api.sp("finish any game once (or clear a Tetris)", "c-text"), api.sp(" and it's yours: neon, particles, a little shake, crisper and bigger.", "c-muted"));
        return;
      }
      const a = (argv[0] || "").toLowerCase();
      const on = a === "on" ? true : a === "off" ? false : !fourkPref();
      setFourk(on);
      api.print(api.sp("◆ 4K " + (on ? "on" : "off"), "c-warn"), api.sp(on ? " — every game launches in glorious 4K. " : " — every game launches classic. ", "c-text"), api.sp("(override per game: ", "c-muted"), api.kbd("pong 4k"), api.sp(" · ", "c-muted"), api.kbd("snake plain"), api.sp(")", "c-muted"));
    },
  };
  for (const g of GAMES) cmds[g.id] = ({ argv, api }) => play(api, g, argv);
  return cmds;
}
