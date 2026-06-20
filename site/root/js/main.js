import { createRain } from "./matrix.js";

const rain = createRain(document.getElementById("rain"));
const out = document.getElementById("out");

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

// A breadcrumb for the Application tab (a Graph scope, base64).
try {
  localStorage.setItem("entra.session", "c2NvcGU9RGlyZWN0b3J5LlJlYWRXcml0ZS5BbGwgLy8gZ2xvYmFsIGFkbWluLiBub3cgZmluaXNoLg==");
} catch {}

// Console boot — the device session talks here.
console.log("%cEntra / Intune session — neo@comeandget.onmicrosoft.com (Global Administrator)", EMBER + ";font-size:15px");
console.log("%cthe device still checks in. Network tab -> check-in.json", EMBER);
console.log("%cb64: dGhpcyBpcyBhbiBlbnRyYSBhY2Nlc3MgdG9rZW4uIGFsZyBub25lIG1lYW5zIG5vYm9keSB2ZXJpZmllZCBpdC4gcmVhZCB0aGUgY2xhaW1zLg==", ASH);
console.log("%c// atob() it, or call decode(). then: help()  whoami()  sudo()", ASH);

// The hunt's reactive call: the device phones Intune home on load.
fetch("check-in.json")
  .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
  .then((j) => {
    rain.flare(1100);
    out.innerHTML =
      `<span class="hit">// ${j.deviceName} (${j.complianceState}) checked in to Intune</span>  ./check-in.json [200]`;
    console.log(
      "%cdevice reported in. _token is an Entra access token (alg:none). decode its payload.",
      SPARK
    );
  })
  .catch((err) => {
    out.textContent = `// device unreachable [${err}]`;
  });

// Console toys — interacting with the clues stokes the fire.
window.help = function () {
  rain.flare(700);
  console.log("%cthe rabbit hole:", SPARK + ";font-size:14px");
  console.log("%c 1. read what the device sends home  -> ./check-in.json", EMBER);
  console.log("%c 2. _token is an Entra access token (JWT). decode the payload (middle part)", EMBER);
  console.log("%c 3. mind the alg. it is 'none'. nobody is verifying.", EMBER);
  console.log("%c 4. the payload points to DNS: dig TXT _rabbit.comeandget.us", EMBER);
  console.log("%c 5. decode the record, answer the riddle in the subject line. you know the address.", EMBER);
  console.log("%ctool: decode('<base64 or jwt>')", ASH);
};

window.whoami = function () {
  console.log("%cneo@comeandget.onmicrosoft.com  (Global Administrator)", EMBER);
};

window.sudo = function () {
  rain.flare(900);
  console.log("%cyou are already Global Admin. that was never the hard part.", SPARK);
};

window.decode = function (s) {
  if (typeof s !== "string") return "decode('<base64 or jwt string>')";
  try {
    if (s.split(".").length >= 2) {
      const [h, p] = s.split(".");
      const parse = (x) => {
        try { return JSON.parse(b64urlDecode(x)); } catch { return b64urlDecode(x); }
      };
      rain.flare(800);
      console.log("%cheader :", ASH, parse(h));
      console.log("%cpayload:", SPARK, parse(p));
      return parse(p);
    }
    const text = b64urlDecode(s);
    rain.flare(500);
    console.log("%c" + text, SPARK);
    return text;
  } catch {
    return "not base64 / not a token";
  }
};

// a single nudge on first click — no rain speed-up, so the default pacing holds
let nudged = false;
document.querySelector("main").addEventListener("click", () => {
  if (!nudged) {
    nudged = true;
    console.log("%cthe answers are not on the page. they are in what it sends. open the console.", SPARK);
  }
});
