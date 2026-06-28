// window.js — the three macOS traffic-light dots do real, cozy things:
//   🔴 close    → clears the scrollback (your badges, scores & unlocks stay put)
//   🟡 minimize → tucks the window away and drifts a calm, on-theme ambient scene
//   🟢 zoom      → grows the window larger within the browser (not OS fullscreen)
// The arcade can ask for room via a `cafe:zoom` event (4K games auto-zoom).
export function initWindow(api) {
  const win = document.querySelector(".window");
  const close = document.getElementById("btn-close");
  const min = document.getElementById("btn-min");
  const zoom = document.getElementById("btn-zoom");
  const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // 🔴 clear the screen — never the progress
  if (close) close.addEventListener("click", () => {
    api.clearScreen();
    api.print(api.sp("✧ ", "c-warn"), api.sp("the night shift wiped the counter for you — your badges, scores & unlocks are safe. ☕", "c-muted"));
    api.focus();
  });

  // 🟢 zoom (toggle), plus react to game auto-zoom requests
  const setZoom = (on) => win.classList.toggle("zoomed", on);
  if (zoom) zoom.addEventListener("click", () => { win.classList.toggle("zoomed"); api.focus(); });
  document.addEventListener("cafe:zoom", (e) => setZoom(!!(e.detail && e.detail.on)));

  // 🟡 minimize → ambient backdrop
  const ambient = document.createElement("div");
  ambient.className = "ambient";
  ambient.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 3; i++) { const s = document.createElement("div"); s.className = "steam s" + i; ambient.appendChild(s); }
  if (!reduced) for (let i = 0; i < 18; i++) {
    const m = document.createElement("div"); m.className = "mote";
    m.style.left = (Math.random() * 100).toFixed(1) + "%";
    m.style.setProperty("--d", (9 + Math.random() * 9).toFixed(2) + "s");
    m.style.setProperty("--delay", (-Math.random() * 14).toFixed(2) + "s");
    m.style.setProperty("--dx", (Math.random() * 60 - 30).toFixed(0) + "px");
    m.style.setProperty("--mo", (0.3 + Math.random() * 0.5).toFixed(2));
    ambient.appendChild(m);
  }
  const hint = document.createElement("p");
  hint.className = "ambient-hint";
  hint.textContent = "the café is resting — tap anywhere to come back ☕";
  ambient.appendChild(hint);
  document.body.appendChild(ambient);

  const setMin = (on) => {
    document.body.classList.toggle("minimized", on);
    if (!on) api.focus();
  };
  if (min) min.addEventListener("click", () => setMin(!document.body.classList.contains("minimized")));
  ambient.addEventListener("click", () => setMin(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("minimized")) setMin(false); });
}
