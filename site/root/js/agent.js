import { createRain } from "./rain.js";
import { initTerminal } from "./shell.js";
import { createAudio } from "./audio.js";
import { createVigil } from "./vigil.js";

const rain = createRain(document.getElementById("rain"));
const audio = createAudio();

const EMBER = "color:#ff7a18;font-family:monospace";
const SPARK = "color:#ffd27a;font-family:monospace";
const ASH = "color:#7a3a0c;font-family:monospace";

function b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return decodeURIComponent(
    atob(s)
      .split("")
      .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
  );
}

// Returns a printable string (used by the on-page terminal and console decode()).
function decodeToText(s) {
  if (typeof s !== "string" || !s) return "usage: decode <base64 or jwt>";
  try {
    if (s.split(".").length >= 2) {
      const [h, p] = s.split(".");
      const part = (x) => {
        try { return JSON.stringify(JSON.parse(b64urlDecode(x)), null, 2); } catch { return b64urlDecode(x); }
      };
      return "header:\n" + part(h) + "\npayload:\n" + part(p);
    }
    return b64urlDecode(s);
  } catch {
    return "not base64 / not a token";
  }
}

// The vigil: presence for /root/. Owns identity, the heartbeat, and the ghosted
// corner display. The corner's tap runs the `present` terminal command, so it
// forwards through a holder that the terminal fills in once it exists.
let runPresent = () => {};
const vigil = createVigil({
  flare: rain.flare,
  audio,
  mount: document.getElementById("vigil"),
  present: () => runPresent(),
});

// The interactive faux terminal.
const { println, run } = initTerminal({
  term: document.getElementById("term"),
  input: document.getElementById("cmd"),
  form: document.getElementById("cmdline"),
  decode: decodeToText,
  flare: rain.flare,
  setPalette: rain.setPalette,
  setLite: rain.setLite,
  audio,
  vigil,
});
runPresent = () => run("present");

// A breadcrumb for the Application tab (a Graph scope, base64).
try {
  localStorage.setItem("entra.session", "c2NvcGU9RGlyZWN0b3J5LlJlYWRXcml0ZS5BbGwgLy8gZ2xvYmFsIGFkbWluLiBub3cgZmluaXNoLg==");
} catch {}

// Console boot — the device session talks here too.
console.log("%cEntra / Intune session — neo@comeandget.onmicrosoft.com (Global Administrator)", EMBER + ";font-size:15px");
console.log("%cthe device still checks in. Network tab -> check-in.json", EMBER);
console.log("%cb64: dGhpcyBpcyBhbiBlbnRyYSBhY2Nlc3MgdG9rZW4uIGFsZyBub25lIG1lYW5zIG5vYm9keSB2ZXJpZmllZCBpdC4gcmVhZCB0aGUgY2xhaW1zLg==", ASH);
console.log("%c// atob() it, or use the terminal on the page. decode() works here too.", ASH);

// Console decoder for those who prefer devtools.
window.decode = function (s) {
  const t = decodeToText(s);
  console.log("%c" + t, SPARK);
  rain.flare(500);
  return t;
};

// The hunt's reactive call: the device phones Intune home on load.
fetch("check-in.json")
  .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
  .then((j) => {
    rain.flare(1100);
    println(`// ${j.deviceName} (${j.complianceState}) checked in to Intune  ./check-in.json [200]`);
    console.log(
      "%cdevice reported in. _token is an Entra access token (alg:none). decode its payload.",
      SPARK
    );
  })
  .catch((err) => {
    println(`// device unreachable [${err}]`);
  });
