// A faux shell — a honeypot. It accepts input and answers with a deep toolbox of
// misdirection, taunts, ASCII art, a fake filesystem you can wander, and dead-end
// rabbit holes. A few lines nudge toward the real path (network -> token -> DNS);
// none of it ever names the answer. Output is appended as text nodes (no
// innerHTML), so typed input can never inject markup.

export function initTerminal({ term, input, form, decode, flare }) {
  function println(text = "") {
    term.appendChild(document.createTextNode((Array.isArray(text) ? text.join("\n") : text) + "\n"));
    term.scrollTop = term.scrollHeight;
  }
  const rng = (n) => (Math.random() * n) | 0;
  const pick = (a) => a[rng(a.length)];
  const sigh = () => flare && flare(220);

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

  const state = { cwd: ["root"] };

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
      "          man <x>  echo <x>  clear  exit    ...and many more you'll have to find.",
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
      return "";
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

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value;
    input.value = "";
    println("PS C:\\> " + raw);
    const res = run(raw);
    if (res) println(res);
  });

  term.addEventListener("click", () => input.focus());

  return { println };
}
