// store.js — tiny localStorage helpers for the games: per-game high scores plus
// the global "4K" upgrade. 4K is the glow-up every game shares (neon, particles,
// a little shake, crisper/bigger). It's easy to get — finish any game once (or
// land a Tetris) — and freely toggleable once unlocked. Progress is cosmetic and
// browser-local; the window's 🔴 "clear" never touches it.
const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const set = (k, v) => { try { localStorage.setItem(k, String(v)); } catch {} };

const U = "cafe.4k.unlocked"; // "1" once 4K is available
const P = "cafe.4k.pref";     // "on" | "off" — default-launch preference

export const highScore = (game) => Number(get("cafe.hs." + game, 0)) || 0;

export function recordScore(game, score) {
  const prev = highScore(game);
  if (score > prev) { set("cafe.hs." + game, score); return { best: true, prev }; }
  return { best: false, prev };
}

export const totalLines = () => Number(get("cafe.lines", 0)) || 0;
export const is4kUnlocked = () => get(U, "0") === "1";
export const fourkPref = () => get(P, "on") !== "off"; // default on once unlocked
export const setFourk = (on) => set(P, on ? "on" : "off");
// Should a launch default to 4K? Only when it's unlocked and the toggle is on.
export const fourkDefault = () => is4kUnlocked() && fourkPref();

// Grant 4K. Returns true the one time it actually flips from locked → unlocked.
export function unlock4k() {
  if (is4kUnlocked()) return false;
  set(U, "1");
  return true;
}

// Tally cleared Tetris lines and grant 4K on the marquee path (10 cumulative
// lines OR a single Tetris). Any game's end also unlocks it (see host.js).
export function addLines(n, wasTetris) {
  const total = totalLines() + n;
  set("cafe.lines", total);
  let justUnlocked = false;
  if (!is4kUnlocked() && (total >= 10 || wasTetris)) justUnlocked = unlock4k();
  return { total, justUnlocked };
}
