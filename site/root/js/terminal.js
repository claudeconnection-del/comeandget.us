// A faux shell — a honeypot. It accepts input and answers with a deep toolbox of
// misdirection, taunts, ASCII art, a fake filesystem you can wander, and dead-end
// rabbit holes. A few lines nudge toward the real path (network -> token -> DNS);
// none of it ever names the answer. Output is appended as text nodes (no
// innerHTML), so typed input can never inject markup.

import { startGame } from "./game.js";
import { startDoom } from "./doom.js";
import { startSnake } from "./snake.js";

export function initTerminal({ term, input, form, decode, flare, setPalette }) {
  function println(text = "") {
    term.appendChild(document.createTextNode((Array.isArray(text) ? text.join("\n") : text) + "\n"));
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
    }),
    var: D({
      log: D({
        "auth.log": F("00:00:00 sign-in OK   user=neo   from=10.13.37.66   token=replayed\n00:00:00 NOTICE  a policy would have stopped this. it was not enforced.\n00:00:01 sign-in OK   user=YOU    from=somewhere    we see you"),
        "syslog": F("kernel: it never sleeps\nkernel: it never sleeps\nkernel: it never sleeps"),
        rmm: D({ "agent.log": F("agent: checking in...\nagent: checking in...\nagent: do not remediate. observe.") }),
      }),
    }),
    etc: D({
      passwd: F("root:x:0:0:root:/root:/bin/false\nneo:x:1000:1000:Global Administrator:/home/neo:/bin/bash\nus:x:666:666:::"),
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

  const state = { cwd: ["root"], gaming: false, ritual: null };

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
    matrix: { vars: { "--bg": "#000600", "--ember": "#00ff66", "--spark": "#b9ffcf", "--ash": "#5fae7f", "--term-fg": "#d7ffe6" }, rain: { fade: "0,6,0", glow: "#00ff66", deep: "#0a7a33", body: "#19c764", bodyHot: "#7dffa8", head: "#d7ffe6", headHot: "#ffffff", ember: ["#d7ffe6", "#19c764", "#0a7a33"] } },
    ice: { vars: { "--bg": "#02060a", "--ember": "#38bdf8", "--spark": "#bae6fd", "--ash": "#7fb0c8", "--term-fg": "#e6f6ff" }, rain: { fade: "2,6,10", glow: "#38bdf8", deep: "#0c4a6e", body: "#2aa6e0", bodyHot: "#9bd8f6", head: "#e6f6ff", headHot: "#ffffff", ember: ["#e6f6ff", "#38bdf8", "#0c4a6e"] } },
    amber: { vars: { "--bg": "#0a0600", "--ember": "#ffb000", "--spark": "#ffe08a", "--ash": "#d8b878", "--term-fg": "#fff3d6" }, rain: { fade: "10,6,0", glow: "#ff8c00", deep: "#7a4a00", body: "#ffb000", bodyHot: "#ffd36b", head: "#fff3d6", headHot: "#ffffff", ember: ["#fff3d6", "#ffb000", "#7a4a00"] } },
    blood: { vars: { "--bg": "#080000", "--ember": "#ff3b3b", "--spark": "#ffb3b3", "--ash": "#cc8888", "--term-fg": "#ffe6e6" }, rain: { fade: "8,0,0", glow: "#ff1a1a", deep: "#5a0a0a", body: "#e02222", bodyHot: "#ff6b6b", head: "#ffe0e0", headHot: "#ffffff", ember: ["#ffe0e0", "#e02222", "#5a0a0a"] } },
    vapor: { vars: { "--bg": "#080010", "--ember": "#c77dff", "--spark": "#f0c6ff", "--ash": "#b39ddb", "--term-fg": "#f3e6ff" }, rain: { fade: "6,0,12", glow: "#b14bff", deep: "#3a155e", body: "#a855f7", bodyHot: "#d8a6ff", head: "#f3e6ff", headHot: "#ffffff", ember: ["#f3e6ff", "#ff6ad5", "#a855f7"] } },
    mono: { vars: { "--bg": "#040404", "--ember": "#cccccc", "--spark": "#ffffff", "--ash": "#999999", "--term-fg": "#f0f0f0" }, rain: { fade: "4,4,4", glow: "#888888", deep: "#333333", body: "#bdbdbd", bodyHot: "#eeeeee", head: "#ffffff", headHot: "#ffffff", ember: ["#ffffff", "#bdbdbd", "#555555"] } },
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

  // ---- commands ----------------------------------------------------------
  const CMD = {
    help: () => [
      "commands: help  whoami  sudo  ls [-a]  cd <dir>  cat <file>  pwd  find <x>  tree",
      "          grep <x>  decode <str>  dig  ping <h>  ps  net user  ipconfig  netstat",
      "          klist  token  systeminfo  env  history  uptime  date  fortune  hint",
      "          man <x>  echo <x>  theme <name>  ritual  games  clear  exit",
      "          arcade: galaga  doom  snake     ...and many more you'll have to find.",
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
    su: () => "# you are root. you were always root.",
    dsregcmd: () => "AzureAdJoined : YES\nTenantName : comeandget\nMDMUrl : Intune\nDeviceAuthStatus : SUCCESS (token replayed, nobody checked)",

    // filesystem
    pwd: () => fmtPath(state.cwd),
    ls: (io) => {
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
      const segs = resolve(io.rest);
      const node = nodeAt(segs);
      if (!node) return `cd: ${io.rest}: No such file or directory`;
      if (node.t !== "d") return `cd: ${io.rest}: Not a directory`;
      state.cwd = segs;
      return MOTD[fmtPath(segs)] || "";
    },
    cat: (io) => {
      if (!io.rest) return "cat: missing operand";
      const node = nodeAt(resolve(io.rest));
      if (!node) return `cat: ${io.rest}: No such file or directory`;
      if (node.t === "d") return `cat: ${io.rest}: Is a directory`;
      if (node.t === "x") return node.msg;
      return readBody(node);
    },
    find: (io) => {
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
      const lines = [];
      (function walk(node, depth, name) {
        lines.push("  ".repeat(depth) + name + (node.t === "d" ? "/" : ""));
        if (node.t === "d") for (const [n, c] of Object.entries(node.c)) if (!n.startsWith(".")) walk(c, depth + 1, n);
      })(nodeAt(state.cwd), 0, fmtPath(state.cwd));
      return lines.join("\n");
    },
    grep: (io) => {
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
    ping: (io) => `Pinging ${io.rest || "comeandget.us"} ...\nRequest timed out. they don't answer pings. only names.`,
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
  function applyTheme(name, quiet) {
    const th = THEMES[name];
    if (!th) return `no such theme '${name}'. try: theme list`;
    for (const [k, v] of Object.entries(th.vars)) document.documentElement.style.setProperty(k, v);
    if (setPalette && th.rain) setPalette(th.rain);
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
  function launch(starter) {
    if (state.gaming) return "";
    state.gaming = true;
    surge(700);
    starter({ term, input, flare, surge, onExit: (msg) => { state.gaming = false; println(msg); } });
    return "";
  }
  CMD.galaga = () => launch(startGame);
  CMD.invaders = () => launch(startGame);
  CMD.arcade = () => launch(startGame);
  CMD.game = () => launch(startGame);
  CMD.doom = () => launch(startDoom);
  CMD.descent = () => launch(startDoom);
  CMD.e1m1 = () => launch(startDoom);
  CMD.snake = () => launch(startSnake);
  CMD.games = () => "arcade: galaga   doom   snake   (also: theme <name>, ritual, fortune)";

  // --- man: documents only the fun parts ---
  const MANPAGES = {
    galaga: "GALAGA(6) — two waves and a boss. arrows move, space fires, q quits.",
    doom: "DOOM(6) — E1M1, an ASCII raycaster. wasd/arrows move & turn, space fires, q quits. find the $ exit or clear the imps.",
    snake: "SNAKE(6) — eat the *, don't bite the walls or yourself. arrows/wasd steer, q quits.",
    theme: "THEME(1) — recolours terminal AND rain. fire matrix ice amber blood vapor mono. sticks across reloads. 'theme random' rolls.",
    ritual: "RITUAL(7) — speak the four words of this place, in order. it opens onto nothing. that is the point.",
    fortune: "FORTUNE(6) — the rain's unsolicited opinion of you.",
    fire: "FIRE(1) — stokes the rain. cosmetic. deeply satisfying.",
    decode: "DECODE(1) — base64 or a JWT. the only genuinely useful tool in this room.",
    cowsay: "COWSAY(1) — a cow repeats you. wisdom not included.",
    hint: "HINT(1) — points at the real path without walking it for you.",
    "8ball": "8BALL(1) — ask a yes/no question. the rain answers.",
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

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value;
    input.value = "";
    if (state.gaming) return; // the game owns the keyboard
    println("PS C:\\> " + raw);
    if (state.ritual) { handleRitual(raw.trim()); return; }
    const res = run(raw);
    if (res) println(res);
  });

  term.addEventListener("click", () => { if (!state.gaming) input.focus(); });

  return { println };
}
