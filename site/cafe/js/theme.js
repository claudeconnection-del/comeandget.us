// theme.js — Rosé Pine dark (default) ⇄ periwinkle light, persisted in localStorage.
// Defaults to dark, but honors prefers-color-scheme: light on a first visit.
const KEY = "cafe.theme";

function paint(t) {
  document.documentElement.setAttribute("data-theme", t);
  const b = document.getElementById("themebtn");
  if (b) b.textContent = t === "dark" ? "☾" : "☀";
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", t === "dark" ? "#191724" : "#f2f3fc");
}

export function current() { return document.documentElement.getAttribute("data-theme") || "dark"; }

export function set(t) {
  if (t !== "dark" && t !== "light") return current();
  paint(t);
  try { localStorage.setItem(KEY, t); } catch {}
  return t;
}

export function initTheme() {
  let t;
  try { t = localStorage.getItem(KEY); } catch {}
  if (t !== "dark" && t !== "light") {
    t = (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
  }
  paint(t);
  const b = document.getElementById("themebtn");
  if (b) b.addEventListener("click", () => set(current() === "dark" ? "light" : "dark"));
}
