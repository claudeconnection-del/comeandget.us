import { createStage, boot } from "./stage.js";

import gate from "./whispers/threshold.js";
import hotspots from "./whispers/lures.js";
import idleWatcher from "./whispers/stillness.js";
import motionGlitch from "./whispers/tremor.js";
import ambientGlitch from "./whispers/flux.js";
import memory from "./whispers/echoes.js";
import konami from "./whispers/relic.js";

const stage = createStage();

// The feign: the page plays dead, then wakes. Default 60s; override with
// ?wake=<ms> (e.g. ?wake=0 to skip it). Wake is scheduled only after every
// secret has registered its onWake hook.
boot([memory, hotspots, idleWatcher, motionGlitch, ambientGlitch, konami, gate], stage).then(() => {
  const param = new URLSearchParams(location.search).get("wake");
  const delay = param !== null ? Math.max(0, Number(param) || 0) : 60000;
  if (delay <= 0) stage.wake();
  else setTimeout(() => stage.wake(), delay);
});

// For the ones who open the console. (base64 — decode it.)
const HINT = "c2V2ZW4gbGVzc2VyIG5hbWVzIHNwZWxsIHRoZSB3aW5nZWQgb25lLiBwb2ludCBwbGVhc2FudCwgMTk2Ny4=";
const style = "color:#b3271e;font-family:monospace;font-size:13px";
console.log("%ccome and get us.", style + ";font-size:18px");
console.log("%cyou're reading the walls. good.", style);
console.log("%c" + HINT, "color:#444;font-family:monospace");
console.log("%c// atob() me", "color:#2a2a2c;font-family:monospace");
