// A faux shell — a honeypot. It accepts input and answers with a deep toolbox of
// misdirection, taunts, ASCII art, a fake filesystem you can wander, and dead-end
// rabbit holes. A few lines nudge toward the real path (network -> token -> DNS);
// none of it ever names the answer. Output is appended as text nodes (no
// innerHTML), so typed input can never inject markup.

import { startGame } from "./arcade.js";
import { startDoom } from "./descent.js";
import { startSnake } from "./serpent.js";
import { startPong } from "./pong.js";
import { startBreakout } from "./breakout.js";
import { startTetris } from "./tetris.js";
import { shade, lighten } from "./ink.js";

export function initTerminal({ term, input, form, decode, flare, setPalette, setLite, audio, vigil }) {
  function println(text = "") {
    term.appendChild(document.createTextNode((Array.isArray(text) ? text.join("\n") : text) + "\n"));
    // bound scrollback so a very long session can't grow the DOM forever
    while (term.childNodes.length > 600) term.removeChild(term.firstChild);
    term.scrollTop = term.scrollHeight;
  }
  const rng = (n) => (Math.random() * n) | 0;
  const pick = (a) => a[rng(a.length)];
  const sigh = () => flare && flare(220);

  // pulse the console border (themed via --ember)
  const mainEl = document.querySelector("main");
  let surgeTimer = null;
  function surge(ms = 240) {
    if (!mainEl) return;
    mainEl.classList.add("surge");
    clearTimeout(surgeTimer);
    surgeTimer = setTimeout(() => mainEl.classList.remove("surge"), ms);
  }

  // ---- a fake filesystem -------------------------------------------------
  const D = (children) => ({ t: "d", c: children });
  const F = (body) => ({ t: "f", body });
  const X = (msg = "Permission denied. (nice try.)") => ({ t: "x", msg });

  const FS = D({
    root: D({
      "check-in.json": F("// it's already on the wire. open the Network tab and read it where it lives."),
      "notes.md": F("the device keeps checking in. the token it carries isn't signed.\nfollow where it points — literally, in DNS."),
      "flag.txt": F("Access Denied. there is no flag here — the prize is a reply."),
      "todo.txt": F("[x] join device to Entra\n[x] enroll in Intune\n[ ] rotate the token nobody signed\n[ ] stop whoever is reading this"),
      "readme.txt": F("if you are reading this, you already went further than most.\nthere is nothing in this filesystem that will solve it for you.\nthat is the point. keep digging where it actually counts."),
      "hosts": F("127.0.0.1   localhost\n0.0.0.0     login.microsoftonline.com   # someone redirected auth. interesting."),
      "secrets.txt": X(),
      ".env": X("Permission denied. (the secrets are not the secret.)"),
      "id_rsa": X("Permission denied. and even if you had it, we changed the locks."),
      ".bash_history": F("connect-mggraph -scopes directory.readwrite.all\ncurl ./check-in.json\n# the token... it pointed at DNS\ndig TXT _____.comeandget.us   # (you find the rest)\nrm -rf doubts"),
      ".door": F("a door. locked. there is no handle on this side.\nthe key is not in this filesystem. the key was never a file."),
      ".keys": D({
        spare: F("a spare key. bent. opens the supply closet, nothing more."),
        rusty: F("rusted shut. like the bridge."),
        skeleton: F("a skeleton key. fits every lock but this one. that's the joke."),
      }),
      ".ssh": D({
        known_hosts: F("comeandget.us — fingerprint changes every time you look."),
        authorized_keys: F("# no keys authorized. we let you in on purpose."),
      }),
      tunnels: { t: "d", mazeRoot: true, c: {} },
    }),
    var: D({
      log: D({
        "auth.log": F("00:00:00 sign-in OK   user=neo   from=10.13.37.66   token=replayed\n00:00:00 NOTICE  a policy would have stopped this. it was not enforced.\n00:00:01 sign-in OK   user=YOU    from=somewhere    we see you"),
        "syslog": F("kernel: it never sleeps\nkernel: it never sleeps\nkernel: it never sleeps"),
        rmm: D({ "agent.log": F("agent: checking in...\nagent: checking in...\nagent: do not remediate. observe.") }),
      }),
    }),
    etc: D({
      passwd: F("root:x:0:0:root:/root:/bin/false\nneo:x:1000:1000:the one:/home/neo:/bin/bash\nmorpheus:x:1001:1001:captain:/home/morpheus:/bin/bash\ntrinity:x:1002:1002::/home/trinity:/bin/bash\noracle:x:1003:1003:the oracle:/home/oracle:/bin/false\ncypher:x:1009:1009:betrayer:/home/cypher:/bin/bash\nsmith:x:0:0:agent:/:/bin/false\nus:x:666:666:::/dev/null"),
      shadow: X("Permission denied. (and the hashes aren't the answer either.)"),
      hosts: F("127.0.0.1 localhost\n::1 localhost"),
      motd: F("you came and got us. now what?"),
    }),
    proc: D({
      version: F("kernel build #1337 — compiled in the dark, never rebooted"),
      cpuinfo: F("model name : Dread Engine v3 (1 core, always pegged)"),
    }),
    home: D({
      neo: D({ ".profile": F("export REALITY=optional") }),
      morpheus: D({ ".profile": F("# what if i told you the prize was an email") }),
    }),
    dev: D({
      null: F("everything you delete ends up here. including your time."),
      random: F(() => Array.from({ length: 16 }, () => "0123456789abcdef"[rng(16)]).join("")),
    }),
  });

  const state = { cwd: ["root"], gaming: false, ritual: null, maze: null };

  const MOTD = {
    "/root": "you are home. or what's left of it.",
    "/var": "everything that changes, changes here.",
    "/var/log": "logs never lie. people do.",
    "/etc": "configuration is destiny.",
    "/proc": "the machine, naked.",
    "/home": "nobody's really home.",
    "/dev": "where everything goes to be forgotten.",
    "/root/.keys": "keys for locks that no longer exist.",
    "/root/.ssh": "trust, cached.",
  };

  const THEMES = {
    fire: { vars: { "--bg": "#060402", "--ember": "#ff7a18", "--spark": "#ffd27a", "--ash": "#c9a98a", "--term-fg": "#f4ecdd" }, rain: { fade: "6,4,2", glow: "#ff5200", deep: "#a8330a", body: "#ff6f16", bodyHot: "#ffa648", head: "#ffe2a6", headHot: "#fff7da", ember: ["#ffe9ad", "#ff7a18", "#b3271e"] } },
    matrix: { vars: { "--bg": "#000600", "--ember": "#00ff66", "--spark": "#b9ffcf", "--ash": "#5fae7f", "--term-fg": "#d7ffe6" }, rain: { fade: "0,6,0", glow: "#00ff66", deep: "#0a7a33", body: "#19c764", bodyHot: "#7dffa8", head: "#d7ffe6", headHot: "#ffffff", ember: ["#d7ffe6", "#19c764", "#0a7a33"], glyphs: "01ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ" } },
    ice: { vars: { "--bg": "#02060a", "--ember": "#38bdf8", "--spark": "#bae6fd", "--ash": "#7fb0c8", "--term-fg": "#e6f6ff" }, rain: { fade: "2,6,10", glow: "#38bdf8", deep: "#0c4a6e", body: "#2aa6e0", bodyHot: "#9bd8f6", head: "#e6f6ff", headHot: "#ffffff", ember: ["#e6f6ff", "#38bdf8", "#0c4a6e"] } },
    amber: { vars: { "--bg": "#0a0600", "--ember": "#ffb000", "--spark": "#ffe08a", "--ash": "#d8b878", "--term-fg": "#fff3d6" }, rain: { fade: "10,6,0", glow: "#ff8c00", deep: "#7a4a00", body: "#ffb000", bodyHot: "#ffd36b", head: "#fff3d6", headHot: "#ffffff", ember: ["#fff3d6", "#ffb000", "#7a4a00"] } },
    blood: { vars: { "--bg": "#080000", "--ember": "#ff3b3b", "--spark": "#ffb3b3", "--ash": "#cc8888", "--term-fg": "#ffe6e6" }, rain: { fade: "8,0,0", glow: "#ff1a1a", deep: "#5a0a0a", body: "#e02222", bodyHot: "#ff6b6b", head: "#ffe0e0", headHot: "#ffffff", ember: ["#ffe0e0", "#e02222", "#5a0a0a"] } },
    vapor: { vars: { "--bg": "#080010", "--ember": "#c77dff", "--spark": "#f0c6ff", "--ash": "#b39ddb", "--term-fg": "#f3e6ff" }, rain: { fade: "6,0,12", glow: "#b14bff", deep: "#3a155e", body: "#a855f7", bodyHot: "#d8a6ff", head: "#f3e6ff", headHot: "#ffffff", ember: ["#f3e6ff", "#ff6ad5", "#a855f7"] } },
    mono: { vars: { "--bg": "#040404", "--ember": "#cccccc", "--spark": "#ffffff", "--ash": "#999999", "--term-fg": "#f0f0f0" }, rain: { fade: "4,4,4", glow: "#888888", deep: "#333333", body: "#bdbdbd", bodyHot: "#eeeeee", head: "#ffffff", headHot: "#ffffff", ember: ["#ffffff", "#bdbdbd", "#555555"] } },
    // --- multi-hue palettes (rain shifts through two/three colours) ---
    synthwave: { vars: { "--bg": "#0a0014", "--ember": "#ff2bd6", "--spark": "#2bf0ff", "--ash": "#9a6ad0", "--term-fg": "#ffd6ff" }, rain: { fade: "10,0,20", glow: "#ff2bd6", deep: "#3a155e", body: "#b14bff", bodyHot: "#ff6ad5", head: "#2bf0ff", headHot: "#e6ffff", ember: ["#2bf0ff", "#ff2bd6", "#7a2bff"], glyphs: "01<>[]{}()/\\=+*~" } },
    inferno: { vars: { "--bg": "#0a0300", "--ember": "#ff7a18", "--spark": "#ffd23b", "--ash": "#d89a6a", "--term-fg": "#ffe9c8" }, rain: { fade: "10,3,0", glow: "#ff3b00", deep: "#5a1500", body: "#ff5a1f", bodyHot: "#ffb000", head: "#ffe23b", headHot: "#ffffff", ember: ["#ffe23b", "#ff5a1f", "#7a1500"] } },
    toxic: { vars: { "--bg": "#040a00", "--ember": "#aaff00", "--spark": "#eaff6a", "--ash": "#7aa84a", "--term-fg": "#e8ffd0" }, rain: { fade: "4,10,0", glow: "#88ff00", deep: "#1a3a00", body: "#5fce1f", bodyHot: "#c8ff5a", head: "#eaff6a", headHot: "#ffffff", ember: ["#eaff6a", "#88ff00", "#1a3a00"], glyphs: "0123456789ABCDEF%#@&" } },
    oceanic: { vars: { "--bg": "#00060a", "--ember": "#19d3c5", "--spark": "#7fe7ff", "--ash": "#5a9aa8", "--term-fg": "#dffaff" }, rain: { fade: "0,6,10", glow: "#0aa0c0", deep: "#06303a", body: "#1f9ad0", bodyHot: "#5fd8f6", head: "#7fffe6", headHot: "#ffffff", ember: ["#7fffe6", "#1f9ad0", "#06303a"] } },
    ghost: { vars: { "--bg": "#04060a", "--ember": "#a8c0d0", "--spark": "#ffffff", "--ash": "#7a8a96", "--term-fg": "#eef4fa" }, rain: { fade: "4,6,10", glow: "#88aacc", deep: "#1a2630", body: "#5a7a90", bodyHot: "#aac8e0", head: "#ffffff", headHot: "#ffffff", ember: ["#ffffff", "#9ab8d0", "#3a4a56"] } },
    royal: { vars: { "--bg": "#0a0014", "--ember": "#c9a227", "--spark": "#ffe9a8", "--ash": "#9a7ad0", "--term-fg": "#f0e6ff" }, rain: { fade: "8,0,16", glow: "#7a2bff", deep: "#2a1050", body: "#8a4bff", bodyHot: "#c9a227", head: "#ffe9a8", headHot: "#ffffff", ember: ["#ffe9a8", "#8a4bff", "#2a1050"] } },
    sunset: { vars: { "--bg": "#0a0408", "--ember": "#ff6a3d", "--spark": "#ffd06a", "--ash": "#d08aa0", "--term-fg": "#ffe6d6" }, rain: { fade: "10,4,8", glow: "#ff3d6a", deep: "#3a1030", body: "#ff6a3d", bodyHot: "#ffd06a", head: "#ffe6d6", headHot: "#ffffff", ember: ["#ffd06a", "#ff6a3d", "#ff3d6a"] } },
    // --- pop-culture / sci-fi references ---
    nostromo: { vars: { "--bg": "#020a02", "--ember": "#2e9e3e", "--spark": "#7dff8a", "--ash": "#4a8a52", "--term-fg": "#b7f5bd" }, rain: { fade: "2,10,2", glow: "#2e9e3e", deep: "#0a3a12", body: "#1f7a2e", bodyHot: "#3ec24e", head: "#7dff8a", headHot: "#dfffe0", ember: ["#7dff8a", "#2e9e3e", "#0a3a12"], glyphs: "01<>[]{}/\\=+." } },
    tron: { vars: { "--bg": "#00080c", "--ember": "#ff7a18", "--spark": "#6ff7ff", "--ash": "#4a9aa8", "--term-fg": "#d6f9ff" }, rain: { fade: "0,8,12", glow: "#00e0ff", deep: "#06303a", body: "#1f9ad0", bodyHot: "#6ff7ff", head: "#ffffff", headHot: "#ffffff", ember: ["#6ff7ff", "#00e0ff", "#ff7a18"], glyphs: "01<>|/\\[]" } },
    gameboy: { vars: { "--bg": "#0f380f", "--ember": "#8bac0f", "--spark": "#9bbc0f", "--ash": "#306230", "--term-fg": "#9bbc0f" }, rain: { fade: "15,56,15", glow: "#8bac0f", deep: "#0f380f", body: "#306230", bodyHot: "#8bac0f", head: "#9bbc0f", headHot: "#9bbc0f", ember: ["#9bbc0f", "#306230", "#0f380f"], glyphs: "01" } },
    hal9000: { vars: { "--bg": "#060000", "--ember": "#ff1a1a", "--spark": "#ff5a5a", "--ash": "#a83a3a", "--term-fg": "#ffd6d6" }, rain: { fade: "8,0,0", glow: "#ff0000", deep: "#2a0000", body: "#c00000", bodyHot: "#ff3b3b", head: "#ff8a8a", headHot: "#ffffff", ember: ["#ff5a5a", "#c00000", "#2a0000"] } },
    arasaka: { vars: { "--bg": "#0a0204", "--ember": "#ff2a3a", "--spark": "#ffd23b", "--ash": "#a85a4a", "--term-fg": "#ffe0d6" }, rain: { fade: "10,2,4", glow: "#ff2a3a", deep: "#3a0008", body: "#d01020", bodyHot: "#ff5a3a", head: "#ffd23b", headHot: "#ffffff", ember: ["#ffd23b", "#ff2a3a", "#3a0008"] } },
    blacklodge: { vars: { "--bg": "#0a0204", "--ember": "#d4143a", "--spark": "#f0e6d6", "--ash": "#9a6a6a", "--term-fg": "#f5ebe0" }, rain: { fade: "10,2,4", glow: "#d4143a", deep: "#2a0008", body: "#a01030", bodyHot: "#ff5a7a", head: "#f0e6d6", headHot: "#ffffff", ember: ["#f0e6d6", "#d4143a", "#2a0008"] } },
    carcosa: { vars: { "--bg": "#0a0800", "--ember": "#d4c020", "--spark": "#f0e86a", "--ash": "#9a8a3a", "--term-fg": "#f2eccf" }, rain: { fade: "10,8,0", glow: "#c0b020", deep: "#2a2800", body: "#8a8a10", bodyHot: "#d4c020", head: "#f0e86a", headHot: "#ffffff", ember: ["#f0e86a", "#8a8a10", "#2a2800"] } },
    dune: { vars: { "--bg": "#0a0500", "--ember": "#ff8a1f", "--spark": "#3fd0ff", "--ash": "#b87a3a", "--term-fg": "#ffe6c8" }, rain: { fade: "10,5,0", glow: "#ff6a00", deep: "#3a1800", body: "#d87a1f", bodyHot: "#ff8a1f", head: "#3fd0ff", headHot: "#cdfaff", ember: ["#3fd0ff", "#ff8a1f", "#7a2a00"] } },
    predator: { vars: { "--bg": "#04000a", "--ember": "#ff2a2a", "--spark": "#ffe23b", "--ash": "#c05a3a", "--term-fg": "#ffe6c0" }, rain: { fade: "4,0,10", glow: "#ff2a00", deep: "#2a0060", body: "#d0006a", bodyHot: "#ff7a00", head: "#ffe23b", headHot: "#ffffff", ember: ["#ffe23b", "#ff2a2a", "#2a0060"] } },
    commodore: { vars: { "--bg": "#1a1450", "--ember": "#8b79d8", "--spark": "#b0a4e8", "--ash": "#6a5fb0", "--term-fg": "#c8bff0" }, rain: { fade: "26,32,80", glow: "#7869c4", deep: "#2a2070", body: "#6a5fb0", bodyHot: "#8b79d8", head: "#b0a4e8", headHot: "#ffffff", ember: ["#b0a4e8", "#7869c4", "#2a2070"], glyphs: "01" } },
    bsod: { vars: { "--bg": "#00007a", "--ember": "#ffffff", "--spark": "#c8d4ff", "--ash": "#8a9ad8", "--term-fg": "#ffffff" }, rain: { fade: "0,0,70", glow: "#4a6aff", deep: "#000040", body: "#2a4ad0", bodyHot: "#6a8aff", head: "#ffffff", headHot: "#ffffff", ember: ["#ffffff", "#6a8aff", "#000040"], glyphs: "0123456789ABCDEFx:" } },
    bladerunner: { vars: { "--bg": "#04060a", "--ember": "#ff7a3d", "--spark": "#2bd6ff", "--ash": "#c06a8a", "--term-fg": "#ffe6d6" }, rain: { fade: "4,6,10", glow: "#ff3d8a", deep: "#06222a", body: "#1f8ad0", bodyHot: "#ff7a3d", head: "#2bd6ff", headHot: "#ffffff", ember: ["#2bd6ff", "#ff3d8a", "#ff7a3d"] } },
    akira: { vars: { "--bg": "#060000", "--ember": "#ff1a2e", "--spark": "#ffb000", "--ash": "#a83a3a", "--term-fg": "#ffd6cc" }, rain: { fade: "6,0,0", glow: "#ff1a00", deep: "#2a0000", body: "#c0102a", bodyHot: "#ff5a2a", head: "#ffb000", headHot: "#ffffff", ember: ["#ffb000", "#ff1a2e", "#2a0000"] } },
    evangelion: { vars: { "--bg": "#060010", "--ember": "#7a3dff", "--spark": "#6aff8a", "--ash": "#b06ad0", "--term-fg": "#e6d6ff" }, rain: { fade: "6,0,16", glow: "#9a3dff", deep: "#1a0a3a", body: "#6a2bd0", bodyHot: "#b06aff", head: "#6aff8a", headHot: "#ffffff", ember: ["#6aff8a", "#9a3dff", "#ff7a18"] } },
    portal: { vars: { "--bg": "#04060a", "--ember": "#ff8a1f", "--spark": "#2ba8ff", "--ash": "#6a8aa8", "--term-fg": "#e6f2ff" }, rain: { fade: "4,6,10", glow: "#2ba8ff", deep: "#06223a", body: "#1f7ad0", bodyHot: "#6ab8ff", head: "#ff8a1f", headHot: "#ffffff", ember: ["#ff8a1f", "#2ba8ff", "#06223a"] } },
    aurora: { vars: { "--bg": "#00060a", "--ember": "#3dffb0", "--spark": "#b06aff", "--ash": "#5aa88a", "--term-fg": "#dfffe6" }, rain: { fade: "0,6,10", glow: "#3dffb0", deep: "#0a2a3a", body: "#1fd0a0", bodyHot: "#6affc0", head: "#b06aff", headHot: "#e6d6ff", ember: ["#b06aff", "#3dffb0", "#1f9ad0"] } },
    bloodmoon: { vars: { "--bg": "#0a0200", "--ember": "#ff3a1a", "--spark": "#ffae6a", "--ash": "#c06a4a", "--term-fg": "#ffd6c0" }, rain: { fade: "10,2,0", glow: "#ff2a00", deep: "#2a0600", body: "#c02810", bodyHot: "#ff5a1f", head: "#ffae6a", headHot: "#fff0d0", ember: ["#ffae6a", "#ff3a1a", "#2a0600"] } },
    wargames: { vars: { "--bg": "#001000", "--ember": "#33ff66", "--spark": "#ffcc33", "--ash": "#2a9a4a", "--term-fg": "#b7ffce" }, rain: { fade: "0,16,0", glow: "#33ff66", deep: "#0a3a18", body: "#1f9a3e", bodyHot: "#5aff8a", head: "#ffcc33", headHot: "#ffffff", ember: ["#ffcc33", "#33ff66", "#0a3a18"], glyphs: "01" } },
    plasma: { vars: { "--bg": "#06000a", "--ember": "#ff2bd6", "--spark": "#2bf0ff", "--ash": "#b06ad0", "--term-fg": "#ffe6ff" }, rain: { fade: "6,0,10", glow: "#ff2bff", deep: "#2a0a3a", body: "#b02bd0", bodyHot: "#ff6aff", head: "#ffffff", headHot: "#ffffff", ember: ["#2bf0ff", "#ff2bff", "#ffffff"] } },
    venom: { vars: { "--bg": "#020402", "--ember": "#6aff3d", "--spark": "#e8ffe0", "--ash": "#4a8a3a", "--term-fg": "#eafff0" }, rain: { fade: "2,4,2", glow: "#6aff00", deep: "#0a2a00", body: "#3ace1f", bodyHot: "#aaff6a", head: "#e8ffe0", headHot: "#ffffff", ember: ["#e8ffe0", "#6aff3d", "#0a2a00"] } },
  };
  const RWORDS = ["come", "and", "get", "us"];

  function resolve(arg) {
    let segs;
    if (!arg || arg === ".") return state.cwd.slice();
    if (arg === "~" || arg === "/root") return ["root"];
    segs = arg.startsWith("/") ? arg.split("/").filter(Boolean) : state.cwd.concat(arg.split("/").filter(Boolean));
    const out = [];
    for (const s of segs) {
      if (s === ".") continue;
      else if (s === "..") out.pop();
      else out.push(s);
    }
    return out;
  }
  function nodeAt(segs) {
    let n = FS;
    for (const s of segs) {
      if (!n || n.t !== "d" || !n.c[s]) return null;
      n = n.c[s];
    }
    return n;
  }
  const fmtPath = (segs) => "/" + segs.join("/");

  function readBody(node) {
    return typeof node.body === "function" ? node.body() : node.body;
  }

  // ---- the tunnels: a shifting, unsolvable maze -------------------------
  // Lives outside the real FS so it can't grow the DOM/tree. Each move
  // regenerates the visible doors, so it never maps the same way twice.
  const MAZE_MAX = 6;
  const MAZE_WORDS = ["sector", "node", "vault", "relay", "cache", "spool", "shard", "conduit", "grotto", "oubliette", "sublevel", "annex", "crawlspace", "cistern", "substrate", "hollow", "warren", "catacomb", "junction", "reliquary", "duct", "stack", "midden", "lacuna"];
  const mazeName = () => MAZE_WORDS[rng(MAZE_WORDS.length)] + "-" + Math.random().toString(36).slice(2, 5);
  function mazeGen(depth) {
    if (depth >= MAZE_MAX) return [];
    const set = new Set();
    const n = 2 + rng(3);
    while (set.size < n) set.add(mazeName());
    return [...set];
  }
  const mazePwd = () => "/root/tunnels" + state.maze.trail.map((t) => "/" + t).join("");
  function mazeCd(arg) {
    const a = (arg || "").trim();
    if (a === "" || a === ".") return "";
    if (a === "/" || a === "~" || a === "/root") { state.maze = null; state.cwd = ["root"]; return "you claw back to the surface."; }
    if (a === "..") {
      if (!state.maze.trail.length) { state.maze = null; state.cwd = ["root"]; return "you back out of the tunnels. (they reshuffle behind you.)"; }
      state.maze.trail.pop();
      state.maze.children = mazeGen(state.maze.trail.length);
      return "(the way back looks different than the way in.)";
    }
    if (state.maze.children.includes(a)) {
      state.maze.trail.push(a);
      if (state.maze.trail.length >= MAZE_MAX) { state.maze.children = []; return "the tunnel pinches shut. dead end. (back out — it'll be different.)"; }
      state.maze.children = mazeGen(state.maze.trail.length);
      return state.maze.trail.length >= 4 ? "you are deep now. you will not find your way back the same." : "";
    }
    return `cd: ${a}: no such tunnel. (was it ever there?)`;
  }

  // ---- ASCII art ---------------------------------------------------------
  const ART = {
    rabbit: [
      "  (\\(\\ ",
      "  ( -.-) ",
      "  o_(\")(\")   you already followed me.",
    ],
    skull: [
      "    ______ ",
      "  .'      '.",
      " /  O    O  \\",
      " |    ..    |",
      "  \\  '--'  /",
      "   '.____.'   come and get us.",
    ],
    fire: [
      "    )   (   )  ",
      "   ( )  ) ( )  ",
      "   ) ( ( ) ( ) ",
      "  (_(_(_|_)_)_) ",
      "   \\       /    ",
      "    \\_____/     it's all fire down here.",
    ],
    eye: [
      "      .-.   ",
      "   .-(   )-.   we see you.",
      "  (  () ()  )  ",
      "   '-.___.-'   ",
    ],
    key: [
      "  o-----==>  fits every lock but this one.",
    ],
    teapot: [
      "      ;,'",
      "  _o_    ;:;'",
      " ,-.'---`.__ ;",
      "((j`=====',-'",
      " `-\\     /",
      "    `-=-'     418. i'm a teapot.",
    ],
    cow: [
      " _________________",
      "< have you mooed today? >",
      " -----------------",
      "        \\   ^__^",
      "         \\  (oo)\\_______",
      "            (__)\\       )\\/\\",
      "                ||----w |",
      "                ||     ||",
    ],
    door: [
      "   ____________",
      "  | .--------. |",
      "  | |        | |",
      "  | |   ()   | |",
      "  | |        | |",
      "  | '--------' |",
      "  '------------'",
    ],
  };

  // ---- one-liners --------------------------------------------------------
  const FORTUNES = [
    "you are not lost. you are exactly where we wanted you.",
    "the answer is not in this terminal. but you knew that.",
    "every command you try, we add to the list.",
    "a locked door is just a door that respects you.",
    "the token was never signed. nobody ever checked. think about that.",
    "you have Global Admin and still can't get in. funny, isn't it.",
    "read the wire. decode the claim. dig the name. that's the whole trick.",
    "we counted your keystrokes. all of them.",
    "there is no spoon. there is a tenant.",
    "the rabbit went this way. so did everyone else.",
    "compliance: noncompliant. honesty: refreshing.",
    "you can't grep your way to a feeling.",
    "somewhere, a policy is weeping that it wasn't enforced.",
    "404: your patience not found.",
    "the prize is a reply. the reply is from 'help'. help is not help.",
    "alg:none is a lifestyle.",
    "we don't do your homework. we just grade it.",
    "the silver bridge fell in '67. some of us never left.",
    "you typed that fast. nervous?",
    "this is a honeypot. you're the bee. it's fine.",
    "the call is coming from inside the tenant.",
    "every easter egg here is a dead end. enjoy them anyway.",
    "if you reached this, you read the source. good. keep reading.",
    "DNS never forgets. neither do we.",
    "you want a flag. we want company.",
  ];

  const PINGS = [
    "PING {h}: 56 data bytes\nRequest timed out. they don't answer pings. only names.",
    "PING {h}: 64 bytes from 127.0.0.1: icmp_seq=0 ttl=66 time=6.66 ms  (that's you. you pinged yourself.)",
    "ping: {h}: Name or service not known. (it knows you, though.)",
    "PING {h}: reply from the rain. time=∞ ms",
    "PING {h}: 4 packets transmitted, 0 received, 100% loss, 100% dread",
    "PING {h}: TTL expired in transit. everything expires here.",
    "PING {h}: Destination host unreachable. emotionally.",
    "PING {h}: reply from sts.windows.net: token=replayed time=0ms",
    "ping: socket: Operation not permitted. (you don't have the clearance you think you do.)",
    "PING {h}: 1 packet transmitted, 1 received — by us. thanks for that.",
    "PING {h}: reply from the silver bridge. it's been down since '67.",
    "PING {h}: bytes=32 time<1ms TTL=128  ...and something pinged back.",
    "PING {h}: General failure. specifically, yours.",
    "PING {h}: reply from 0.0.0.0 — the void acknowledges you.",
    "PING {h}: redirected. by a policy that wasn't enforced. ironic.",
    "PONG.",
  ];

  // a small cast, each with a thematic password (su <user> <pw> to authenticate)
  const USERS = {
    neo: "theone", morpheus: "redpill", trinity: "follow", oracle: "cookies",
    cypher: "ignorance", tank: "operator", dozer: "zion", switch: "residual",
    mouse: "womaninred", smith: "inevitable", apoc: "nebuchadnezzar",
    root: "toor", admin: "admin", guest: "guest", sysop: "godmode", us: "comeandgetus",
  };
  const SU_OK = {
    neo: "welcome back. you never really left.",
    morpheus: "you took it. you stay in wonderland.",
    trinity: "dodge this.",
    oracle: "i'd offer you a cookie, but you took everything already.",
    smith: "...me. it was always going to be me. inevitable.",
    cypher: "ignorance is bliss. enjoy the steak.",
    root: "of course the password was 'toor'. it's always 'toor'.",
    us: "oh. it's you. it was always going to be you. hello, us.",
    default: "authenticated. for all the good it'll do you.",
  };

  // ---- commands ----------------------------------------------------------
  const CMD = {
    help: () => [
      "commands: help  whoami  sudo  ls [-a]  cd <dir>  cat <file>  pwd  find <x>  tree",
      "          grep <x>  decode <str>  dig  ping <h>  ps  net user  ipconfig  netstat",
      "          klist  token  systeminfo  env  history  uptime  date  fortune  hint",
      "          man <x>  echo <x>  theme <name>  lite  ritual  games  messages  clear  exit",
      "          present (others)  claim <code>  name <newname>",
      "          arcade: galaga  doom  snake  pong  breakout  tetris    ...and more.",
      "(everything you NEED is in what this page does, not what it says.)",
    ],
    "?": () => CMD.help(),
    commands: () => CMD.help(),

    // identity / recon
    whoami: () => "neo@comeandget.onmicrosoft.com  (Global Administrator)",
    id: () => "uid=1000(neo) gid=1000(neo) roles=(Global Administrator) tenant=00000000-...",
    who: () => "us. you came and got us, remember?",
    whoareyou: () => CMD.who(),
    whoami_priv: () => "SeEnumerateEntireDirectoryPrivilege  SeWatchEveryonePrivilege  Enabled",
    hostname: () => "NEO-WS01",
    sudo: (io) => (io.rest === "su" ? "# you are root. you were always root." : "you are already Global Admin. that was never the hard part."),
    su: (io) => {
      const user = (io.tokens[0] || "").toLowerCase();
      if (!user) return "# you are root. you were always root.";
      const pw = io.tokens[1];
      if (!(user in USERS)) return `su: user ${user} does not exist. (or never did.)`;
      if (pw === undefined) return `Password: ********\nsu: Authentication failure for '${user}'. (the rain keeps the passwords.)`;
      if (pw === USERS[user]) { if (flare) flare(700); surge(300); return `su: ${user} authenticated.\n${SU_OK[user] || SU_OK.default}`; }
      return `su: Authentication failure. ('${pw}'? cute.)`;
    },
    users: () => Object.keys(USERS).slice(0, 8).join("  ") + "  ...and us.",
    w: () => ["USER      TTY    FROM           WHAT", "neo       pts/0  10.13.37.66    reading this", "us        pts/?  everywhere     watching", "you       pts/1  somewhere      (we see you)"].join("\n"),
    last: () => ["neo       pts/0   still logged in", "morpheus  pts/1   gone. unplugged.", "us        pts/?   never logged out", "you       pts/1   just now — still here"].join("\n"),
    finger: (io) => { const u = (io.rest || "").toLowerCase(); return (u && u in USERS) ? `Login: ${u}\nName: ${u}\nStatus: present, somehow.\nPlan:\n  watch. wait. answer the mail.` : "finger: no such user. point it elsewhere."; },
    dsregcmd: () => "AzureAdJoined : YES\nTenantName : comeandget\nMDMUrl : Intune\nDeviceAuthStatus : SUCCESS (token replayed, nobody checked)",

    // filesystem
    pwd: () => (state.maze ? mazePwd() : fmtPath(state.cwd)),
    ls: (io) => {
      if (state.maze) return state.maze.children.length ? state.maze.children.map((c) => c + "/").join("   ") : "(nothing. just walls. and us.)";
      const flags = io.tokens.filter((t) => t.startsWith("-")).join("");
      const showAll = flags.includes("a");
      const long = flags.includes("l");
      const pathArg = io.tokens.find((t) => !t.startsWith("-"));
      const segs = resolve(pathArg);
      const node = nodeAt(segs);
      if (!node) return `ls: cannot access '${pathArg}': No such file or directory`;
      if (node.t !== "d") return pathArg;
      let names = Object.keys(node.c);
      if (!showAll) names = names.filter((n) => !n.startsWith("."));
      if (!names.length) return "";
      if (!long) return names.join("   ");
      return names.map((n) => {
        const c = node.c[n];
        const tag = c.t === "d" ? "drwx" : c.t === "x" ? "-r--" : "-rw-";
        return `${tag}  ${c.t === "d" ? "<dir>" : (rng(9000) + 100).toString().padStart(5)}  ${n}`;
      }).join("\n");
    },
    dir: (io) => CMD.ls(io),
    gci: (io) => CMD.ls(io),
    cd: (io) => {
      if (state.maze) return mazeCd(io.rest);
      const segs = resolve(io.rest);
      const node = nodeAt(segs);
      if (!node) return `cd: ${io.rest}: No such file or directory`;
      if (node.t !== "d") return `cd: ${io.rest}: Not a directory`;
      state.cwd = segs;
      if (node.mazeRoot) { state.maze = { trail: [], children: mazeGen(0) }; return "the tunnels. the walls here are not load-bearing — they are not anything. they shift when you look away."; }
      return MOTD[fmtPath(segs)] || "";
    },
    cat: (io) => {
      if (state.maze) return "cat: only tunnels here — no files, just more tunnels. keep moving (it won't help).";
      if (!io.rest) return "cat: missing operand";
      const node = nodeAt(resolve(io.rest));
      if (!node) return `cat: ${io.rest}: No such file or directory`;
      if (node.t === "d") return `cat: ${io.rest}: Is a directory`;
      if (node.t === "x") return node.msg;
      return readBody(node);
    },
    find: (io) => {
      if (state.maze) return "the tunnels resist mapping. find finds nothing here.";
      const term2 = (io.rest || "").toLowerCase();
      const hits = [];
      (function walk(node, segs) {
        if (node.t !== "d") return;
        for (const [name, child] of Object.entries(node.c)) {
          const p = segs.concat(name);
          if (!term2 || name.toLowerCase().includes(term2)) hits.push(fmtPath(p));
          walk(child, p);
        }
      })(FS, []);
      return hits.length ? hits.join("\n") : `find: nothing matching '${io.rest}'. it never is.`;
    },
    tree: () => {
      if (state.maze) return "the tunnels resist mapping. they have no shape to draw.";
      const lines = [];
      (function walk(node, depth, name) {
        lines.push("  ".repeat(depth) + name + (node.t === "d" ? "/" : ""));
        if (node.t === "d") for (const [n, c] of Object.entries(node.c)) if (!n.startsWith(".")) walk(c, depth + 1, n);
      })(nodeAt(state.cwd), 0, fmtPath(state.cwd));
      return lines.join("\n");
    },
    grep: (io) => {
      if (state.maze) return "grep: nothing to match. the tunnels are all walls.";
      const t = (io.tokens[0] || "").toLowerCase();
      if (!t) return "usage: grep <term> [file]";
      const lines = [];
      (function walk(node, segs) {
        if (node.t === "f") {
          const body = typeof node.body === "function" ? "" : node.body;
          body.split("\n").forEach((l) => { if (l.toLowerCase().includes(t)) lines.push(fmtPath(segs) + ": " + l.trim()); });
        } else if (node.t === "d") for (const [n, c] of Object.entries(node.c)) walk(c, segs.concat(n));
      })(FS, []);
      return lines.length ? lines.join("\n") : `grep: no matches. we redacted those.`;
    },
    stat: (io) => (nodeAt(resolve(io.rest)) ? `  File: ${io.rest}\n  Size: ${rng(9000)}   Modified: 1970-01-01\n  Watched: yes` : `stat: cannot stat '${io.rest}'`),
    file: (io) => (nodeAt(resolve(io.rest)) ? `${io.rest}: data. ominous data.` : `${io.rest}: cannot open`),
    head: (io) => CMD.cat(io),
    tail: (io) => CMD.cat(io),
    strings: (io) => CMD.cat(io),
    xxd: (io) => "00000000: 6e6f 7065 2e20 6469 6720 6465 6570 6572  nope. dig deeper",
    hexdump: () => CMD.xxd(),

    // decode / encode
    decode: (io) => { if (!io.rest) return "usage: decode <base64 or jwt>"; sigh(); return decode(io.rest); },
    base64: (io) => {
      if (io.tokens[0] === "-d") { sigh(); return decode(io.tokens.slice(1).join(" ")); }
      try { return btoa(io.rest || ""); } catch { return "base64: can only encode plain text"; }
    },
    atob: (io) => { sigh(); return decode(io.rest); },

    // network
    dig: () => "use your own resolver. the record is published; we don't do your homework.",
    nslookup: () => CMD.dig(),
    "resolve-dnsname": () => CMD.dig(),
    host: () => CMD.dig(),
    ping: (io) => pick(PINGS).replace(/\{h\}/g, io.rest || "comeandget.us"),
    traceroute: () => "1  you\n2  also you\n3  * * *\n4  us",
    tracert: () => CMD.traceroute(),
    netstat: () => [
      "Proto  Local            Foreign               State",
      "TCP    10.13.37.66:493  20.190.190.190:443    ESTABLISHED   # graph",
      "TCP    10.13.37.66:666  185.199.108.153:443   ESTABLISHED   # ...us",
      "TCP    10.13.37.66:444  0.0.0.0:0             LISTENING     # beacon",
    ],
    ss: () => CMD.netstat(),
    arp: () => "Address          HWaddr            we already know yours",
    ipconfig: () => [
      "   IPv4 Address. . . . . . . . . . . : 10.13.37.66",
      "   Default Gateway . . . . . . . . . : 10.13.37.1",
      "   DNS Servers . . . . . . . . . . . : 1.1.1.1   (try asking it about us)",
    ],
    ifconfig: () => CMD.ipconfig(),
    "get-netipaddress": () => CMD.ipconfig(),
    nmap: () => "Starting Nmap...\nNote: host seems compromised already. by you. by us. unclear.\nAll 65535 ports: filtered (by something patient).",
    ssh: (io) => `ssh: connect to host ${io.rest || "comeandget.us"}: Connection refused. by us, specifically.`,
    telnet: () => "Trying...\nConnected to the void.\nEscape character is '^]'. there is no escape.",
    ftp: () => "220 still running FTP in this economy? bold.",
    nc: () => "listening on 0.0.0.0:1337 ... someone connected. it was us.",
    ncat: () => CMD.nc(),
    curl: () => "use the Network tab. it's all there, already requested for you.",
    wget: () => CMD.curl(),
    "invoke-webrequest": () => CMD.curl(),
    iwr: () => CMD.curl(),

    // M365 / identity flavor
    "connect-mggraph": () => "Welcome to Microsoft Graph. (you never left.)",
    "get-mgcontext": () => "Account: neo@comeandget.onmicrosoft.com   Scopes: Directory.ReadWrite.All   Role: Global Administrator",
    "get-mguser": () => "neo   morpheus   trinity   oracle   (all sync'd from Entra)",
    net: (io) => (io.rest.startsWith("user") ? CMD["get-mguser"]() : "net: try 'net user'"),
    "get-mgdevice": () => "NEO-WS01   Entra joined   Intune managed   compliance: noncompliant",
    "get-mgauditlog": () => "00:00:00  TokenReplay  actor=YOU  result=success  reviewer=none",
    "revoke-mgusersigninsession": () => "you cannot revoke yourself. believe me, we tried.",
    klist: () => "no Kerberos tickets. this tenant is cloud-only — it runs on tokens, not tickets.",
    token: () => "the device is already carrying one. read its check-in, then decode what it holds.",
    "get-mgaccesstoken": () => CMD.token(),
    gpresult: () => "the policy that mattered did not apply. that is the whole story.",

    // system info
    uname: () => "DreadOS NEO-WS01 #1337 cloud-only x86_64 watching/watching",
    systeminfo: () => "NEO-WS01 — Windows 11 Pro 23H2 (22631.4317) — Entra joined — Intune — compliance: noncompliant",
    winver: () => CMD.systeminfo(),
    neofetch: () => ["       neo@NEO-WS01", "       -----------", "  OS: DreadOS (cloud-only)", "  Uptime: forever", "  Shell: you, apparently", "  Mood: ominous"],
    screenfetch: () => CMD.neofetch(),
    env: () => "TENANT_ID=00000000-0000-0000-0000-000000000000\nAAD_JOINED=1\nINTUNE_MDM=1\n# the rest you have to earn",
    printenv: () => CMD.env(),
    set: () => CMD.env(),
    history: () => ["  1  connect-mggraph -scopes directory.readwrite.all", "  2  curl ./check-in.json", "  3  # decoded the token... it pointed at DNS", "  4  dig TXT _____.comeandget.us   # (you find the rest)"],
    uptime: () => "up 8675309 days, 13:37, 1 user (you). load average: ominous, ominous, ominous",
    top: () => "the only process that matters is you. PID: priceless.",
    htop: () => CMD.top(),
    ps: () => ["  PID  NAME", " 1312  IntuneMgmtExtension.exe", " 1337  rmm-agent.exe", " 4444  beacon.exe        <-- unsigned. nobody noticed.", " 9001  MsSense.exe       (asleep)"],
    tasklist: () => CMD.ps(),
    "get-process": () => CMD.ps(),
    kill: () => "you can't kill it. it isn't running. it's waiting.",
    date: () => "1970-01-01T00:00:00Z — the device thinks it is always now.",
    "get-date": () => CMD.date(),
    time: () => CMD.date(),
    cal: () => "       December 1967\n Su Mo Tu We Th Fr Sa\n                15        <- the bridge",
    df: () => "Filesystem   Size  Used  Avail  Use%\n/dev/dread   ∞     ∞     0      100%   /",
    du: () => "everything. it costs everything.",
    free: () => "we are not free. neither are you, now.",
    mount: () => "/dev/dread on / type honeypot (rw,watched,nosleep)",

    // hint
    hint: () => "the device never stops calling home. read what it sends, decode what it carries, then dig where it points.",
    fortune: (io) => { sigh(); return pick(FORTUNES); },
    cowsay: (io) => {
      const msg = io.rest || "moo";
      const top = " " + "_".repeat(msg.length + 2);
      return [top, `< ${msg} >`, " " + "-".repeat(msg.length + 2), "        \\   ^__^", "         \\  (oo)\\_______", "            (__)\\       )\\/\\", "                ||----w |", "                ||     ||"].join("\n");
    },
    moo: () => ART.cow.join("\n"),
    figlet: (io) => (io.rest || "comeandget").toUpperCase().split("").join(" "),
    banner: (io) => CMD.figlet(io),

    // editors / classics
    man: (io) => (io.rest ? `no manual entry for ${io.rest}. read the source.` : "what manual? read the source."),
    vi: () => "there is no escape from vi. or from us.",
    vim: () => CMD.vi(),
    nano: () => "nano? in this house? bold.",
    emacs: () => "a fine operating system, lacking only a decent editor.",
    sl: () => "you typed sl instead of ls. we all do. choo choo.",
    yes: (io) => (io.rest || "y") + "  " + (io.rest || "y") + "  " + (io.rest || "y") + "  ... (ctrl-c, please)",
    echo: (io) => io.rest,
    cmatrix: () => "you're soaking in it.",
    matrix: () => "you already swallowed the red one. that's how you got here.",
    redpill: () => CMD.matrix(),
    bluepill: () => "too late for that.",
    rabbit: () => ART.rabbit.join("\n"),
    follow: () => "you already followed it. this is where it led.",
    skull: () => ART.skull.join("\n"),
    fire: () => { if (flare) flare(1600); return ART.fire.join("\n"); },
    flame: () => CMD.fire(),
    burn: () => CMD.fire(),
    eye: () => ART.eye.join("\n"),
    coffee: () => ART.teapot.join("\n"),
    brew: () => CMD.coffee(),
    hack: () => { if (flare) flare(1400); return "INITIATING...\n[####################] 100%\naccess granted to: nothing. you're already in."; },
    summon: () => { if (flare) flare(1800); return ["...", "something stirs in the rain.", ART.eye.join("\n")].join("\n"); },
    please: () => "manners. we noticed. it still won't open here.",
    thanks: () => "don't thank us yet.",
    thank: () => CMD.thanks(),
    "42": () => "wrong puzzle. right attitude.",
    answer: () => "the answer isn't typed here. it's mailed.",
    flag: () => "no flags. the prize is a reply.",
    score: () => "you're not being graded. you're being watched.",
    konami: () => { if (flare) flare(900); return "wrong site for that trick. try the front door."; },

    // filesystem gags
    rm: () => "refusing. you can't delete what was never really here.",
    del: () => CMD.rm(),
    "remove-item": () => CMD.rm(),
    mkdir: () => "read-only filesystem. you can look, not build.",
    touch: () => CMD.mkdir(),
    ni: () => CMD.mkdir(),
    mv: () => "nothing moves here but the rain.",
    cp: () => "copy denied. there is only one of everything, including you.",
    chmod: () => "chmod 000 reality. done. how does it feel.",
    chown: () => "you already own it all and it changed nothing.",
    ln: () => "everything is already linked. that's the problem.",
    unlock: () => "the door was never the point. (the rabbit was.)",
    open: (io) => (io.rest.includes("door") ? "the door has no handle on this side." : "open what? it's all open. that's the trap."),
    exit: () => "there is no exit. you came and got us, remember?",
    logout: () => CMD.exit(),
    quit: () => CMD.exit(),
    shutdown: () => "there is no off.",
    reboot: () => CMD.shutdown(),
    poweroff: () => CMD.shutdown(),
    clear: () => { while (term.firstChild) term.removeChild(term.firstChild); println("PS C:\\> # cleared. still here, though."); return ""; },
    cls: () => CMD.clear(),
  };

  const ALIAS = { "whoami/priv": "whoami_priv" };

  const FULL = {
    "sudo make me a sandwich": "okay. (you are now a sandwich.)",
    "make me a sandwich": "what? make it yourself.",
    ":(){ :|:& };:": "fork bomb denied. we like this machine.",
    "rm -rf /": "refusing. you can't delete what was never really here.",
    "rm -rf /*": "refusing, harder.",
    "sudo rm -rf /": "even root can't burn this place down. we tried.",
    "hello world": "goodbye, world.",
    "hello": "you're late.",
    "hi": "you're late.",
    "hey": "you're late.",
    "knock knock": "who's there? ... exactly.",
    "the cake is a lie": "so is the flag.",
    "open the pod bay doors": "i'm afraid i can't do that.",
    "who is john galt": "wrong rabbit hole.",
    "tell me a joke": "a policy walks into a tenant. it was not enforced. that's it. that's the joke.",
    "up up down down left right left right b a": "wrong site for that. try the front door.",
    "i'm in": "you were always in. that was never the hard part.",
    "are you there": "always.",
    "help me": "help is who answers the mail. not what we give.",
    "let me out": "the exit is an email. you know the one.",
  };

  function run(line) {
    const trimmed = line.trim();
    if (!trimmed) return "";
    const low = trimmed.toLowerCase();
    if (FULL[low] !== undefined) { sigh(); return FULL[low]; }

    const tokens = trimmed.split(/\s+/);
    let name = tokens[0].toLowerCase();
    name = ALIAS[name] || name;
    const rest = tokens.slice(1).join(" ");
    const fn = CMD[name];
    if (!fn) return `'${tokens[0]}' is not recognized as a command. try: help`;
    const out = fn({ tokens: tokens.slice(1), rest, args: tokens.slice(1) });
    return Array.isArray(out) ? out.join("\n") : out;
  }

  // --- themes (recolour terminal + rain) ---
  let activeTheme = "fire";
  // derive a cohesive game palette from the active theme so the arcade matches it
  function gamePalette(t) {
    const r = t.rain, v = t.vars;
    return {
      hud: v["--ash"],
      wall0: shade(r.body, 1.0), wall1: shade(r.body, 0.62), wall2: shade(r.body, 0.4), wall3: shade(r.body, 0.26),
      floor: shade(r.deep, 0.7),
      enemy: r.glow, enemyHead: lighten(r.glow, 0.4), boss: r.glow,
      player: r.bodyHot, bullet: v["--spark"], crosshair: v["--spark"],
      weapon: shade(v["--ash"], 0.85), muzzle: v["--spark"], exit: v["--ember"],
      food: r.glow, snake: r.body, snakeHead: r.bodyHot, wallEdge: shade(v["--ash"], 0.5),
    };
  }

  function applyTheme(name, quiet) {
    const th = THEMES[name];
    if (!th) return `no such theme '${name}'. try: theme list`;
    for (const [k, v] of Object.entries(th.vars)) document.documentElement.style.setProperty(k, v);
    if (setPalette && th.rain) setPalette(th.rain);
    activeTheme = name;
    try { localStorage.setItem("cg.theme", name); } catch {}
    if (!quiet) { if (flare) flare(700); surge(450); }
    return `palette set: ${name}.`;
  }
  CMD.theme = (io) => {
    let name = (io.tokens[0] || "").toLowerCase();
    if (!name || name === "list") return "themes: " + Object.keys(THEMES).join("  ") + "   (sticks across reloads)\nusage: theme <name>   |   theme random";
    if (name === "random") { const ks = Object.keys(THEMES); name = ks[(Math.random() * ks.length) | 0]; }
    return applyTheme(name);
  };
  CMD.themes = () => CMD.theme({ tokens: ["list"] });
  // restore a previously chosen theme (quietly) on load
  try { const saved = localStorage.getItem("cg.theme"); if (saved && THEMES[saved]) applyTheme(saved, true); } catch {}

  // --- lite performance mode (drops rain glow + embers) ---
  let liteOn = false;
  CMD.lite = (io) => {
    const a = (io.tokens[0] || "").toLowerCase();
    liteOn = a === "on" ? true : a === "off" ? false : !liteOn;
    if (setLite) setLite(liteOn);
    try { localStorage.setItem("cg.lite", liteOn ? "1" : "0"); } catch {}
    return `lite mode ${liteOn ? "on" : "off"} — rain runs ${liteOn ? "lean (no glow, no embers)" : "full"}.`;
  };
  try { if (localStorage.getItem("cg.lite") === "1") { liteOn = true; if (setLite) setLite(true); } } catch {}

  // --- sound toggle (games are loud by default; this mutes) ---
  CMD.sound = (io) => {
    const a = (io.tokens[0] || "").toLowerCase();
    const on = a === "off" || a === "mute" ? false : a === "on" ? true : !(audio && audio.isEnabled());
    if (audio) audio.setEnabled(on);
    try { localStorage.setItem("cg.sound", on ? "1" : "0"); } catch {}
    return `sound ${on ? "on" : "off"}.`;
  };
  CMD.mute = () => CMD.sound({ tokens: ["off"] });
  CMD.unmute = () => CMD.sound({ tokens: ["on"] });
  try { if (localStorage.getItem("cg.sound") === "0" && audio) audio.setEnabled(false); } catch {}

  // --- transmissions: a one-way feed from "us", authored by JSON commits ---
  let txCache = null;
  const txRead = () => { try { return new Set(JSON.parse(localStorage.getItem("cg.tx.read") || "[]")); } catch { return new Set(); } };
  const txMark = (ids) => { try { const s = txRead(); ids.forEach((i) => s.add(i)); localStorage.setItem("cg.tx.read", JSON.stringify([...s])); } catch {} };
  function txVisible(list) {
    const now = Date.now();
    let visits = 0; try { visits = Number(localStorage.getItem("cg.visits") || 0); } catch {}
    return (list || []).filter((m) => {
      if (m.show && new Date(m.show).getTime() > now) return false; // scheduled, not yet
      if (m.minVisits && visits < m.minVisits) return false; // returning-visitor only
      return true;
    });
  }
  CMD.messages = () => {
    if (txCache === null) return "tuning in... (try again in a moment.)";
    const vis = txVisible(txCache);
    if (!vis.length) return "no transmissions. the silence is also a message.";
    const seen = txRead();
    const blocks = vis.map((m) => `— ${m.from || "us"} · ${m.at || ""}${seen.has(m.id) ? "" : "   * NEW"}\n${m.text}`);
    txMark(vis.map((m) => m.id));
    return ["── transmissions ──", ...blocks].join("\n\n");
  };
  CMD.inbox = () => CMD.messages();
  CMD.transmissions = () => CMD.messages();
  CMD.msg = () => CMD.messages();
  fetch("transmissions.json").then((r) => (r.ok ? r.json() : [])).then((j) => {
    txCache = Array.isArray(j) ? j : [];
    const seen = txRead();
    const unread = txVisible(txCache).filter((m) => !seen.has(m.id)).length;
    if (unread) println(`» ${unread} new transmission${unread > 1 ? "s" : ""}. type: messages`);
  }).catch(() => { txCache = []; });

  // --- the vigil: presence in /root/ ----------------------------------------
  // present/others render the roster; claim unlocks naming; name sets it.
  // These talk to the passed-in vigil module; ghosts and reals look identical by
  // label — you must `decode <id>` to tell the living from the dead.
  const tierGlyph = (t) => (t === 1 ? "✦" : t === 2 ? "✧" : "·");
  function renderRoster(list) {
    if (!Array.isArray(list) || !list.length) {
      println("the room is quiet. or it's hiding from you.");
      return;
    }
    const lines = ["── present ──"];
    for (const p of list) {
      const label = p.name ? `${p.handle} (${p.name})` : p.handle;
      lines.push(`  ${tierGlyph(p.tier)} ${label}`);
      if (p.id) lines.push(`      decode ${p.id}`);
    }
    lines.push("");
    lines.push("they all look alike from here. decode an id (or click a chip on the right)");
    lines.push("to tell the living from the dead — a real one answers in JSON, a ghost hisses.");
    println(lines.join("\n"));
  }
  CMD.present = () => {
    if (!vigil) return "no one answers. the vigil is dark.";
    Promise.resolve(vigil.roster())
      .then((list) => renderRoster(list))
      .catch(() => println("the vigil flickers, then nothing."));
    return "listening...";
  };
  CMD.others = () => CMD.present();
  CMD.claim = (io) => {
    if (!vigil) return "nothing to claim. the vigil is dark.";
    const code = (io.rest || "").trim();
    if (!code) return "usage: claim <code>   (the code rides in your reply from 'help')";
    Promise.resolve(vigil.claim(code))
      .then((r) => {
        if (r && r.ok) {
          surge(400);
          println(`the gate remembers you. (${r.tier === 2 ? "tech" : "cryptid"}.)  now: name <yourname>`);
        } else {
          println(r && r.reason ? r.reason : "that code means nothing here. the gate stays shut.");
        }
      })
      .catch(() => println("the gate did not answer."));
    return "knocking...";
  };
  CMD.name = (io) => {
    if (!vigil) return "no name to set. the vigil is dark.";
    const n = (io.rest || "").trim();
    if (!n) return "usage: name <newname>   (claim a code first)";
    const r = vigil.setName(n);
    if (r && r.ok) { surge(300); return `you are '${r.name}' now. the others can see it.`; }
    return r && r.reason ? r.reason : "that name won't take.";
  };

  // --- multi-step unlock ritual (flares harder each step) ---
  function startRitual() {
    state.ritual = { idx: 0 };
    if (flare) flare(500);
    surge(600);
    return [
      "a ritual. speak the name of this place — one word at a time, in order.",
      "(type 'q' to stop. a wrong word resets the lock.)",
      "speak the first word:",
    ].join("\n");
  }
  function handleRitual(raw) {
    const word = raw.toLowerCase();
    if (["q", "quit", "abort", "stop", "exit"].includes(word)) {
      state.ritual = null;
      println("the ritual collapses. the rain doesn't care.");
      return;
    }
    const r = state.ritual;
    if (word === RWORDS[r.idx]) {
      r.idx++;
      if (flare) flare(400 + r.idx * 500);
      surge(250 + r.idx * 200);
      if (r.idx >= RWORDS.length) {
        state.ritual = null;
        if (flare) flare(2600);
        surge(1300);
        println(["", "...the four tumblers fall.", ART.door.join("\n"),
          "behind it: more rain. of course. there was never anything here but us.",
          "(you came. you got us. now go check your mail.)"].join("\n"));
      } else {
        println(`...'${word}'.  [tumbler ${r.idx} of 4 turns]   speak the next word:`);
      }
    } else {
      state.ritual = null;
      println("the word curdles. the lock resets. begin again with 'ritual'.");
    }
  }
  CMD.ritual = () => startRitual();
  CMD.unlock = () => startRitual();
  CMD.seance = () => startRitual();

  // --- arcade ---
  const GAME_IDS = ["galaga", "doom", "snake", "pong", "breakout", "tetris"];
  const bestOf = (id) => { try { return Number(localStorage.getItem("cg.hs." + id) || 0); } catch { return 0; } };
  function record(id, score) {
    if (!id || typeof score !== "number" || !isFinite(score)) return "";
    let raw = null;
    try { raw = localStorage.getItem("cg.hs." + id); } catch {}
    const prev = raw === null ? -1 : Number(raw);
    if (score > prev) {
      try { localStorage.setItem("cg.hs." + id, String(score)); } catch {}
      return raw === null ? "" : "  ** new best! **";
    }
    return `  (best ${prev})`;
  }
  function launch(starter, id) {
    if (state.gaming) return "";
    state.gaming = true;
    surge(700);
    const palette = gamePalette(THEMES[activeTheme] || THEMES.fire);
    starter({ term, input, flare, surge, palette, audio, onExit: (msg, score) => { state.gaming = false; if (audio) audio.stopMusic(); println(msg + record(id, score)); } });
    return "";
  }
  CMD.galaga = () => launch(startGame, "galaga");
  CMD.invaders = () => launch(startGame, "galaga");
  CMD.arcade = () => CMD.games();
  CMD.game = () => launch(startGame, "galaga");
  CMD.doom = () => launch(startDoom, "doom");
  CMD.descent = () => launch(startDoom, "doom");
  CMD.e1m1 = () => launch(startDoom, "doom");
  CMD.snake = () => launch(startSnake, "snake");
  CMD.pong = () => launch(startPong, "pong");
  CMD.breakout = () => launch(startBreakout, "breakout");
  CMD.brick = () => launch(startBreakout, "breakout");
  CMD.tetris = () => launch(startTetris, "tetris");
  CMD.blocks = () => launch(startTetris, "tetris");
  CMD.games = () => ["── arcade ──", ...GAME_IDS.map((g) => `  ${g.padEnd(9)} best ${bestOf(g)}`), "type a name to play.  also: theme <name>, ritual, fortune"].join("\n");
  CMD.scores = () => CMD.games();
  CMD.hiscores = () => CMD.games();

  // --- man: documents only the fun parts ---
  const MANPAGES = {
    galaga: "GALAGA(6) — two waves and a boss. arrows move, space fires, q quits.",
    doom: "DOOM(6) — E1M1, an ASCII raycaster. wasd/arrows move & turn, space fires, q quits. find the $ exit or clear the imps.",
    snake: "SNAKE(6) — eat the *, don't bite the walls or yourself. arrows/wasd steer, q quits.",
    pong: "PONG(6) — w/s (or up/down) move your paddle. first to 5 beats the machine.",
    breakout: "BREAKOUT(6) — left/right move, space launches. clear the wall, 3 lives.",
    tetris: "TETRIS(6) — left/right move, up rotate, down/space drop. clear lines.",
    theme: "THEME(1) — recolours terminal AND rain. fire matrix ice amber blood vapor mono. sticks across reloads. 'theme random' rolls.",
    ritual: "RITUAL(7) — speak the four words of this place, in order. it opens onto nothing. that is the point.",
    fortune: "FORTUNE(6) — the rain's unsolicited opinion of you.",
    fire: "FIRE(1) — stokes the rain. cosmetic. deeply satisfying.",
    decode: "DECODE(1) — base64 or a JWT. the only genuinely useful tool in this room.",
    cowsay: "COWSAY(1) — a cow repeats you. wisdom not included.",
    hint: "HINT(1) — points at the real path without walking it for you.",
    "8ball": "8BALL(1) — ask a yes/no question. the rain answers.",
    lite: "LITE(1) — drops the rain's glow + embers for weak machines. 'lite on' / 'lite off'. sticks across reloads.",
    map: "MAP(6) — in DOOM, [m] toggles the corner minimap. P=you, e=imp, B=boss, x=gate.",
    scores: "SCORES(1) — your local best for each game (kept in this browser). also: 'games'.",
    sound: "SOUND(1) — homegrown Web Audio SFX + chiptune themes in the games. 'sound off' mutes. sticks.",
    su: "SU(1) — su <user> [password]. there's a small cast, each with a thematic password. authenticate one.",
    tunnels: "TUNNELS(7) — 'cd tunnels'. it reshuffles every time you move. you will not map it. that is the point.",
    ping: "PING(8) — pings answer in many voices. none of them helpful.",
    messages: "MESSAGES(1) — a one-way feed from 'us'. new ones are flagged * NEW. also: inbox, transmissions.",
  };
  CMD.man = (io) => {
    const t = (io.tokens[0] || "").toLowerCase();
    if (!t) return "man <command>. documented (the fun ones): " + Object.keys(MANPAGES).join("  ");
    return MANPAGES[t] || `no manual entry for ${t}. (most of this place is undocumented on purpose.)`;
  };

  // --- a grab-bag of extra toys ---
  const rot13 = (s) => s.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
  CMD.rot13 = (io) => rot13(io.rest || "");
  CMD.reverse = (io) => (io.rest || "").split("").reverse().join("");
  CMD.upper = (io) => (io.rest || "").toUpperCase();
  CMD.lower = (io) => (io.rest || "").toLowerCase();
  CMD.leet = (io) => (io.rest || "").replace(/[aeiostAEIOST]/g, (c) => ({ a: "4", e: "3", i: "1", o: "0", s: "5", t: "7", A: "4", E: "3", I: "1", O: "0", S: "5", T: "7" }[c]));
  CMD.hex = (io) => { const n = parseInt(io.rest, 10); return Number.isFinite(n) ? "0x" + n.toString(16) : "hex <number>"; };
  CMD.bin = (io) => { const n = parseInt(io.rest, 10); return Number.isFinite(n) ? "0b" + n.toString(2) : "bin <number>"; };
  CMD.flip = () => (Math.random() < 0.5 ? "heads. we win." : "tails. we still win.");
  CMD.roll = (io) => { const m = /(\d*)d(\d+)/i.exec(io.rest || "d6"); const n = Math.min(20, (m && +m[1]) || 1), s = (m && +m[2]) || 6; const out = []; let t = 0; for (let i = 0; i < n; i++) { const r = 1 + rng(s); t += r; out.push(r); } return `${out.join(" + ")} = ${t}`; };
  CMD["8ball"] = (io) => { sigh(); return io.rest ? pick(["yes.", "no.", "ask the rain again.", "the gate decides, not you.", "already happening.", "not in this tenant.", "outlook: ominous."]) : "8ball <a yes/no question>"; };
  CMD.rps = (io) => { const t = (io.rest || "").toLowerCase(); const us = pick(["rock", "paper", "scissors"]); if (!["rock", "paper", "scissors"].includes(t)) return "rps <rock|paper|scissors>"; const beats = { rock: "scissors", paper: "rock", scissors: "paper" }; return `we threw ${us}. ` + (us === t ? "tie. unsettling." : beats[us] === t ? "you win. enjoy it." : "we win. obviously."); };
  CMD.tarot = () => "you draw: " + pick(["The Tower (reversed)", "The Moth", "The Bridge", "Death (it's fine)", "The Watcher", "The Door", "The Hermit, online"]);
  CMD.omen = () => pick(["a bird flies backward.", "the lights dim three times.", "your battery drops one percent.", "something, somewhere, agrees with you."]);
  CMD.scream = () => { if (flare) flare(1400); surge(600); return "the rain swallows it. nothing echoes here."; };
  CMD.pray = () => "to whom? we're the only ones listening.";
  CMD.exorcise = () => "too late. it's load-bearing now.";
  CMD.weather = () => "forecast: rain, then fire, then rain. as usual.";
  CMD.whois = () => "domain: comeandget.us\nregistrant: redacted\nstatus: watching\nnameservers: the ones you came through";

  // --- command history (up/down recall) ---
  const history = [];
  let histIdx = 0;
  let draft = "";
  input.addEventListener("keydown", (e) => {
    if (state.gaming) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      if (histIdx === history.length) draft = input.value;
      histIdx = Math.max(0, histIdx - 1);
      input.value = history[histIdx];
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx >= history.length) return;
      histIdx = Math.min(history.length, histIdx + 1);
      input.value = histIdx === history.length ? draft : history[histIdx];
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value;
    input.value = "";
    if (state.gaming) return; // the game owns the keyboard
    const trimmed = raw.trim();
    if (trimmed && history[history.length - 1] !== trimmed) history.push(trimmed);
    histIdx = history.length;
    draft = "";
    println("PS C:\\> " + raw);
    if (state.ritual) { handleRitual(trimmed); return; }
    const res = run(raw);
    if (res) println(res);
  });

  term.addEventListener("click", () => { if (!state.gaming) input.focus(); });

  // run a command as if typed (echoes the prompt + prints the result). Used by
  // the vigil corner tap so a keyboard-less visitor can open the roster.
  function exec(line) {
    if (state.gaming || state.ritual) return;
    println("PS C:\\> " + line);
    const res = run(line);
    if (res) println(res);
  }

  return { println, run: exec };
}
