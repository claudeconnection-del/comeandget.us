// A faux shell. It accepts input and answers — mostly misdirection and taunts,
// a few real nudges toward the real path (network -> token -> DNS). It never
// names the answer. Output is appended as text nodes (no innerHTML), so typed
// input can't inject markup.

export function initTerminal({ term, input, form, decode, flare }) {
  function println(text = "") {
    term.appendChild(document.createTextNode(text + "\n"));
    term.scrollTop = term.scrollHeight;
  }

  const FILES = ["check-in.json", ".env", "secrets.txt", "flag.txt", "id_rsa", "notes.md", "hosts"];

  const HELP = [
    "commands: help  whoami  sudo  ls  cat <file>  decode <str>  dig <name>  ping <host>",
    "          ps  net user  ipconfig  klist  token  systeminfo  env  history  hint",
    "          echo <text>  get-mgcontext  date  man <x>  clear  exit",
    "(more exist than are listed. everything you NEED is in what this page does, not says.)",
  ].join("\n");

  function cat(file) {
    const f = (file || "").replace(/^\.?\//, "").toLowerCase();
    if (!f) return "cat: missing operand";
    switch (f) {
      case "flag.txt":
        return "Access Denied. there is no flag here — the prize is a reply.";
      case "check-in.json":
        return "// it's already on the wire. open the Network tab and read it there.";
      case "notes.md":
        return "// the device keeps checking in. the token it carries isn't signed. follow where it points — literally, in DNS.";
      case "hosts":
        return "127.0.0.1   localhost\n0.0.0.0     login.microsoftonline.com   # someone redirected auth. interesting.";
      case ".env":
      case "secrets.txt":
      case "id_rsa":
        return "Permission denied. (nice try.)";
      default:
        return `cat: ${file}: No such file or directory`;
    }
  }

  function run(line) {
    const [cmd, ...rest] = line.split(/\s+/);
    const arg = rest.join(" ");
    switch ((cmd || "").toLowerCase()) {
      case "":
        return "";
      case "help":
      case "?":
        return HELP;
      case "whoami":
        return "neo@comeandget.onmicrosoft.com  (Global Administrator)";
      case "who":
      case "whoareyou":
        return "us. you came and got us, remember?";
      case "sudo":
      case "su":
        return "you are already Global Admin. that was never the hard part.";
      case "ls":
      case "dir":
      case "gci":
        return FILES.join("   ");
      case "cat":
      case "type":
      case "gc":
        return cat(arg);
      case "decode": {
        if (!arg) return "usage: decode <base64 or jwt>";
        if (flare) flare(500);
        return decode(arg);
      }
      case "dig":
      case "nslookup":
      case "resolve-dnsname":
        return "use your own resolver. the record is published; we don't do your homework.";
      case "echo":
        return arg;
      case "get-mgcontext":
        return "Account: neo@comeandget.onmicrosoft.com   Scopes: Directory.ReadWrite.All   Role: Global Administrator";
      case "token":
      case "get-mgaccesstoken":
      case "access_token":
        return "the device is already carrying one. read its check-in, then decode what it holds.";
      case "klist":
        return "no Kerberos tickets. this tenant is cloud-only — it runs on tokens, not tickets.";
      case "hint":
        return "the device never stops calling home. read what it sends, decode what it carries, then dig where it points.";
      case "ipconfig":
      case "ifconfig":
      case "get-netipaddress":
        return [
          "   IPv4 Address. . . . . . . . . . . : 10.13.37.66",
          "   Default Gateway . . . . . . . . . : 10.13.37.1",
          "   DNS Servers . . . . . . . . . . . : 1.1.1.1   (try asking it about us)",
        ].join("\n");
      case "ping":
        return `Pinging ${arg || "comeandget.us"} ...\nRequest timed out. they don't answer pings. only names.`;
      case "ps":
      case "tasklist":
      case "get-process":
        return [
          "  PID  NAME",
          " 1312  IntuneMgmtExtension.exe",
          " 1337  rmm-agent.exe",
          " 4444  beacon.exe        <-- unsigned. nobody noticed.",
          " 9001  MsSense.exe       (asleep)",
        ].join("\n");
      case "net":
      case "get-mguser":
        return "users: neo  morpheus  trinity  oracle  (all sync'd from Entra)";
      case "uname":
      case "systeminfo":
      case "winver":
      case "neofetch":
        return "NEO-WS01 — Windows 11 Pro 23H2 (22631.4317) — Entra joined — Intune managed — compliance: noncompliant";
      case "env":
      case "printenv":
        return "TENANT_ID=00000000-0000-0000-0000-000000000000\nAAD_JOINED=1\nINTUNE_MDM=1\n# the rest you have to earn";
      case "history":
        return [
          "  1  Connect-MgGraph -Scopes Directory.ReadWrite.All",
          "  2  curl ./check-in.json",
          "  3  # decoded the token... it pointed at DNS",
          "  4  dig TXT _____.comeandget.us   # (you find the rest)",
        ].join("\n");
      case "date":
      case "get-date":
        return "1970-01-01T00:00:00Z — the device thinks it is always now.";
      case "curl":
      case "wget":
      case "invoke-webrequest":
      case "iwr":
        return "use the Network tab. it's all there, already requested for you.";
      case "man":
        return arg ? `no manual entry for ${arg}. read the source.` : "what manual? read the source.";
      case "cd":
        return "/root is as deep as it goes.";
      case "mkdir":
      case "touch":
      case "ni":
        return "read-only filesystem. you can look, not build.";
      case "vi":
      case "vim":
      case "nano":
      case "emacs":
        return "there is no escape from vim. or from us.";
      case "matrix":
      case "redpill":
        return "you already swallowed the red one. that is how you got here.";
      case "bluepill":
        return "too late for that.";
      case "rabbit":
      case "follow":
        return "you already followed it. this is where it led.";
      case "pwd":
        return "/root";
      case "clear":
      case "cls":
        while (term.firstChild) term.removeChild(term.firstChild);
        println("PS C:\\> # cleared. still here, though.");
        return "";
      case "exit":
      case "logout":
      case "quit":
        return "there is no exit. you came and got us, remember?";
      case "rm":
      case "del":
      case "remove-item":
        return "refusing. you can't delete what was never really here.";
      default:
        return `'${cmd}' is not recognized as a command. try: help`;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value;
    input.value = "";
    println("PS C:\\> " + raw);
    if (flare) flare(220);
    const res = run(raw.trim());
    if (res) println(res);
  });

  // clicking anywhere in the terminal focuses the prompt
  term.addEventListener("click", () => input.focus());

  return { println };
}
