// window.js — the three macOS traffic-light dots do real, cozy things:
//   🔴 close    → clears the scrollback (your badges, scores & unlocks stay put)
//   🟡 minimize → tucks the window away and drifts a calm, on-theme ambient scene,
//                 with a little corner panel to tune the particles, glow & drift
//   🟢 zoom      → grows the window larger within the browser (not OS fullscreen)
// The arcade can ask for room via a `cafe:zoom` event (4K games auto-zoom).
const AKEY = "cafe.amb";
// minimalist by default — gentle particles, a soft low glow, an unhurried drift,
// and the controls tucked away (open:false) until you ask for them
const AMB_DEFAULTS = { count: 12, glow: 20, drift: 38, open: false };
function loadAmb() { try { return Object.assign({}, AMB_DEFAULTS, JSON.parse(localStorage.getItem(AKEY) || "{}")); } catch { return { ...AMB_DEFAULTS }; } }
function saveAmb(s) { try { localStorage.setItem(AKEY, JSON.stringify(s)); } catch {} }

export function initWindow(api) {
  const win = document.querySelector(".window");
  const close = document.getElementById("btn-close");
  const min = document.getElementById("btn-min");
  const zoom = document.getElementById("btn-zoom");
  const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // 🔴 clear the screen — never the progress
  if (close) close.addEventListener("click", () => {
    api.clearScreen();
    api.print(api.sp("the night shift wiped the counter — your badges, scores and unlocks are safe.", "c-muted"));
    api.focus();
  });

  // 🟢 zoom (toggle), plus react to game auto-zoom requests
  const setZoom = (on) => win.classList.toggle("zoomed", on);
  if (zoom) zoom.addEventListener("click", () => { win.classList.toggle("zoomed"); api.focus(); });
  document.addEventListener("cafe:zoom", (e) => setZoom(!!(e.detail && e.detail.on)));

  // 🟡 minimize → ambient backdrop
  const settings = loadAmb();
  const ambient = document.createElement("div");
  ambient.className = "ambient";
  ambient.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 3; i++) { const b = document.createElement("div"); b.className = "blob b" + i; ambient.appendChild(b); }

  const motesWrap = document.createElement("div");
  motesWrap.className = "motes";
  ambient.appendChild(motesWrap);

  function buildMotes() {
    motesWrap.textContent = "";
    if (reduced) return;
    for (let i = 0; i < (settings.count | 0); i++) {
      const m = document.createElement("div");
      m.className = "mote";
      m.style.left = (Math.random() * 100).toFixed(1) + "%";
      m.style.setProperty("--d", (9 + Math.random() * 9).toFixed(2) + "s");
      m.style.setProperty("--delay", (-Math.random() * 14).toFixed(2) + "s");
      m.style.setProperty("--dx", (Math.random() * 60 - 30).toFixed(0) + "px");
      m.style.setProperty("--mo", (0.3 + Math.random() * 0.5).toFixed(2));
      motesWrap.appendChild(m);
    }
  }
  function applyVars() {
    ambient.style.setProperty("--amb-glow", (settings.glow / 100).toFixed(2));
    ambient.style.setProperty("--amb-speed", (0.5 + (settings.drift / 100) * 1.5).toFixed(2));
  }
  applyVars();
  buildMotes();

  const hint = document.createElement("p");
  hint.className = "ambient-hint";
  hint.textContent = "the café is resting — tap to come back";
  ambient.appendChild(hint);

  // the corner adjustments panel — collapsed by default, with a show/hide toggle
  const controls = document.createElement("div");
  controls.className = "ambient-controls";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "ac-toggle";
  const tlabel = document.createElement("span");
  tlabel.textContent = "ambience";
  const chev = document.createElement("span");
  chev.className = "ac-chev";
  chev.setAttribute("aria-hidden", "true");
  toggle.appendChild(tlabel);
  toggle.appendChild(chev);
  const body = document.createElement("div");
  body.className = "ac-body";
  const addSlider = (label, key, min2, max2) => {
    const row = document.createElement("label");
    row.className = "ac-row";
    const span = document.createElement("span");
    span.textContent = label;
    const inp = document.createElement("input");
    inp.type = "range"; inp.min = String(min2); inp.max = String(max2); inp.step = "1"; inp.value = String(settings[key]);
    inp.addEventListener("input", () => {
      settings[key] = Number(inp.value);
      saveAmb(settings);
      if (key === "count") buildMotes(); else applyVars();
    });
    row.appendChild(span);
    row.appendChild(inp);
    body.appendChild(row);
  };
  addSlider("particles", "count", 0, 40);
  addSlider("glow", "glow", 0, 100);
  addSlider("drift", "drift", 0, 100);
  controls.appendChild(toggle);
  controls.appendChild(body);

  let acOpen = !!settings.open; // default collapsed
  const applyOpen = () => {
    controls.classList.toggle("open", acOpen);
    toggle.setAttribute("aria-expanded", acOpen ? "true" : "false");
    chev.textContent = acOpen ? "▾" : "▸";
  };
  applyOpen();

  // ghost the collapsed pill after 5s of no interaction — but only once the user
  // has interacted at least once (hover or expand), so it stays fully visible and
  // discoverable until then. Any interaction (or re-opening the scene) wakes it.
  let acInteracted = false;
  let ghostTimer = 0;
  const scheduleGhost = () => {
    clearTimeout(ghostTimer);
    controls.classList.remove("ghosted");
    if (!acInteracted) return;
    ghostTimer = setTimeout(() => { if (!acOpen) controls.classList.add("ghosted"); }, 5000);
  };
  const acInteract = () => { acInteracted = true; scheduleGhost(); };

  toggle.addEventListener("click", (e) => { e.stopPropagation(); acOpen = !acOpen; settings.open = acOpen; saveAmb(settings); applyOpen(); acInteract(); });
  controls.addEventListener("pointerenter", acInteract);
  controls.addEventListener("pointerleave", scheduleGhost);
  // fiddling with the panel must never dismiss the ambient view
  controls.addEventListener("click", (e) => e.stopPropagation());
  controls.addEventListener("pointerdown", (e) => { e.stopPropagation(); acInteract(); });
  ambient.appendChild(controls);

  document.body.appendChild(ambient);

  const setMin = (on) => {
    document.body.classList.toggle("minimized", on);
    if (on) scheduleGhost(); else api.focus(); // re-arm the idle fade each time we rest
  };
  if (min) min.addEventListener("click", () => setMin(!document.body.classList.contains("minimized")));
  ambient.addEventListener("click", () => setMin(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("minimized")) setMin(false); });
}
