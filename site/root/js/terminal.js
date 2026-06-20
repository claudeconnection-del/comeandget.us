// A faux shell. It accepts input and answers — mostly misdirection and taunts,
// a few real nudges. It never names the answer. Output is appended as text nodes
// (no innerHTML), so typed input can't inject markup.

export function initTerminal({ term, input, form, decode, flare }) {
  function println(text = "") {
    term.appendChild(document.createTextNode(text + "\n"));
    term.scrollTop = term.scrollHeight;
  }

  const FILES = ["check-in.json", ".env", "secrets.txt", "flag.txt", "id_rsa", "notes.md"];

  function run(line) {
    const [cmd, ...rest] = line.split(/\s+/);
    const arg = rest.join(" ");
    switch ((cmd || "").toLowerCase()) {
      case "":
        return "";
      case "help":
      case "?":
        return [
          "available: help  whoami  sudo  ls  cat <file>  decode <str>  dig <name>",
          "           echo <text>  get-mgcontext  clear  exit",
          "everything you actually need is in what this page does, not what it says.",
        ].join("\n");
      case "whoami":
        return "neo@comeandget.onmicrosoft.com  (Global Administrator)";
      case "sudo":
      case "su":
        return "you are already Global Admin. that was never the hard part.";
      case "ls":
      case "dir":
      case "gci":
        return FILES.join("   ");
      case "cat":
      case "type":
      case "gc": {
        const f = (arg || "").replace(/^\.\//, "").toLowerCase();
        if (!f) return "cat: missing operand";
        if (f === "flag.txt") return "Access Denied. there is no flag here — the prize is a reply.";
        if (f === "check-in.json") return "// it's already on the wire. open the Network tab and read it there.";
        if (f === ".env" || f === "secrets.txt" || f === "id_rsa")
          return "Permission denied. (nice try.)";
        if (f === "notes.md") return "// the device keeps checking in. tokens it carries aren't signed. dig deeper — literally.";
        return `cat: ${arg}: No such file or directory`;
      }
      case "decode": {
        if (!arg) return "usage: decode <base64 or jwt>";
        const out = decode(arg);
        if (flare) flare(500);
        return out;
      }
      case "dig":
      case "nslookup":
      case "resolve-dnsname":
        return "use your own resolver. the record is published; we don't do your homework.";
      case "echo":
        return arg;
      case "get-mgcontext":
        return "Account: neo@comeandget.onmicrosoft.com   Scopes: Directory.ReadWrite.All   Role: Global Administrator";
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
        return "rm: refusing. you can't delete what was never really here.";
      default:
        return `'${cmd}' is not recognized as a command. try: help`;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value;
    input.value = "";
    println("PS C:\\> " + raw);
    if (flare) flare(280);
    const res = run(raw.trim());
    if (res) println(res);
  });

  // clicking anywhere in the terminal focuses the prompt
  term.addEventListener("click", () => input.focus());

  return { println };
}
