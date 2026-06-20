import { createStage, boot } from "./registry.js";

import gate from "./secrets/gate.js";
import hotspots from "./secrets/hotspots.js";
import idleWatcher from "./secrets/idle-watcher.js";
import motionGlitch from "./secrets/motion-glitch.js";
import ambientGlitch from "./secrets/ambient-glitch.js";
import memory from "./secrets/memory.js";
import konami from "./secrets/konami.js";

const stage = createStage();

boot([memory, hotspots, idleWatcher, motionGlitch, ambientGlitch, konami, gate], stage);

// For the ones who open the console. (base64 — decode it.)
const HINT = "c2V2ZW4gbGVzc2VyIG5hbWVzIHNwZWxsIHRoZSB3aW5nZWQgb25lLiBwb2ludCBwbGVhc2FudCwgMTk2Ny4=";
const style = "color:#b3271e;font-family:monospace;font-size:13px";
console.log("%ccome and get us.", style + ";font-size:18px");
console.log("%cyou're reading the walls. good.", style);
console.log("%c" + HINT, "color:#444;font-family:monospace");
console.log("%c// atob() me", "color:#2a2a2c;font-family:monospace");
