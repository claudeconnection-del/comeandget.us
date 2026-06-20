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

// A breadcrumb for the Application tab.
try {
  localStorage.setItem("rmm.session", "cHJpdj1TWVNURU0gLy8geW91IGVzY2FsYXRlZC4gbm93IGZpbmlzaCB0aGUgam9iLg==");
} catch {}

// Console boot — the agent talks here.
console.log("%croot@comeandget — local_admin (SYSTEM / uid=0)", EMBER + ";font-size:15px");
console.log("%cthe agent never stopped checking in. Network tab -> check-in.json", EMBER);
console.log("%cb64: YWxnOm5vbmUgaXMgbm90IGEgYnVnLiBpdCBpcyBhbiBpbnZpdGF0aW9uLiBkZWNvZGUgd2hhdCB0aGUgYWdlbnQgc2VuZHMu", ASH);
console.log("%c// atob() it, or call decode(). then: help()  whoami()  sudo()", ASH);

// The hunt's reactive call: the agent phones home on load.
fetch("check-in.json")
  .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
  .then((j) => {
    rain.flare(1100);
    out.innerHTML =
      `<span class="hit">// ${j.agent_id} @ ${j.hostname} checked in</span>  ./check-in.json [200]`;
    console.log(
      "%cagent reported in. the _token in check-in.json is a JWT (alg:none). decode its payload.",
      SPARK
    );
  })
  .catch((err) => {
    out.textContent = `// agent unreachable [${err}]`;
  });

// Console toys — interacting with the clues stokes the fire.
window.help = function () {
  rain.flare(700);
  console.log("%cthe rabbit hole:", SPARK + ";font-size:14px");
  console.log("%c 1. read what the agent sends home  -> ./check-in.json", EMBER);
  console.log("%c 2. the _token is a JWT. decode the payload (the middle part)", EMBER);
  console.log("%c 3. mind the alg. it is 'none'. nobody is checking.", EMBER);
  console.log("%c 4. answer the riddle in the subject line. you know the address.", EMBER);
  console.log("%ctool: decode('<base64 or jwt>')", ASH);
};

window.whoami = function () {
  console.log("%clocal_admin  (SYSTEM / uid=0)", EMBER);
};

window.sudo = function () {
  rain.flare(900);
  console.log("%cyou are already root. that was never the hard part.", SPARK);
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

// minor on-page reactivity
let nudged = false;
document.querySelector("main").addEventListener("click", () => {
  rain.flare(450);
  if (!nudged) {
    nudged = true;
    console.log("%cthe answers are not on the page. they are in what it does. open the console.", SPARK);
  }
});
