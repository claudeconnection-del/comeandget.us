// theme.js — café skins: dark periwinkle (default) ⇄ light periwinkle, plus a flat
// rainbow-Apple "classic" skin and an opt-in green-phosphor "mono". Persisted in
// localStorage. The titlebar button cycles dark→light→classic; `theme <name>` (in
// app.js) can also select `mono` directly.
const KEY = "cafe.theme";
const THEMES = ["dark", "light", "classic", "mono"]; // every valid skin
const CYCLE = ["dark", "light", "classic"];          // what the titlebar button rotates through
const META = { dark: "#161528", light: "#f2f3fc", classic: "#d8d5c8", mono: "#001100" };
const GLYPH = { dark: "☾", light: "☀", classic: "", mono: "▦" }; // classic shows a rainbow chip (CSS)

function paint(t) {
  document.documentElement.setAttribute("data-theme", t);
  const b = document.getElementById("themebtn");
  if (b) { b.textContent = GLYPH[t] || ""; b.className = "themebtn tb-" + t; }
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", META[t] || META.dark);
}

export function current() { return document.documentElement.getAttribute("data-theme") || "dark"; }

export function set(t) {
  if (!THEMES.includes(t)) return current();
  paint(t);
  try { localStorage.setItem(KEY, t); } catch {}
  return t;
}

export function cycle() {
  const i = CYCLE.indexOf(current());
  return set(CYCLE[(i + 1) % CYCLE.length]);
}

export function initTheme() {
  let t;
  try { t = localStorage.getItem(KEY); } catch {}
  if (!THEMES.includes(t)) {
    t = (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
  }
  paint(t);
  const b = document.getElementById("themebtn");
  if (b) b.addEventListener("click", () => cycle());
}
