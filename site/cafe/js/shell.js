// shell.js — terminal core: printing, input/history, click-to-focus, dispatch.
// Output is built from text nodes + classed <span>s (never innerHTML), so nothing
// typed can inject markup. Commands are registered by the other modules.
export function createTerminal() {
  const term = document.getElementById("term");
  const consoleEl = document.getElementById("console");
  const input = document.getElementById("cmd");
  const form = document.getElementById("cmdline");

  const scroll = () => { consoleEl.scrollTop = consoleEl.scrollHeight; };
  const node = (x) => (typeof x === "string" ? document.createTextNode(x) : x);
  const sp = (text, cls) => { const s = document.createElement("span"); if (cls) s.className = cls; s.textContent = text; return s; };
  const kbd = (text) => sp(text, "kbd");
  function print(...parts) {
    for (const p of parts) term.appendChild(node(p));
    term.appendChild(document.createTextNode("\n"));
    while (term.childNodes.length > 1200) term.removeChild(term.firstChild);
    scroll();
  }
  const blank = () => { term.appendChild(document.createTextNode("\n")); scroll(); };
  const clearScreen = () => { while (term.firstChild) term.removeChild(term.firstChild); };

  const api = { print, blank, sp, kbd, scroll, clearScreen, focus: () => input.focus() };

  const commands = new Map();
  const aliases = new Map();
  const register = (map) => { for (const [n, fn] of Object.entries(map)) commands.set(n, fn); };
  const alias = (map) => { for (const [a, t] of Object.entries(map)) aliases.set(a, t); };
  const names = () => [...commands.keys()];

  async function run(raw) {
    const line = raw.trim();
    if (!line) return;
    const argv = line.split(/\s+/);
    let name = argv[0].toLowerCase();
    if (aliases.has(name)) name = aliases.get(name);
    const fn = commands.get(name);
    if (!fn) {
      print(sp(argv[0], "c-love"), sp(": command not found. try ", "c-muted"), kbd("help"), sp(" or ", "c-muted"), kbd("ls"), sp(".", "c-muted"));
      return;
    }
    const rest = line.slice(argv[0].length).trim();
    try {
      const out = await fn({ argv: argv.slice(1), rest, raw: line, api });
      if (typeof out === "string") print(out);
      else if (Array.isArray(out)) for (const l of out) print(l);
    } catch (e) {
      print(sp("oops — that one tripped: " + ((e && e.message) || e), "c-love"));
    }
  }

  // command history (up/down) + Ctrl+C to abandon a line
  const history = []; let hi = 0; let draft = "";
  input.addEventListener("keydown", (e) => {
    if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === "c" || e.key === "C")) {
      const sel = String(window.getSelection ? window.getSelection() : "") || input.selectionStart !== input.selectionEnd;
      if (sel) return;
      e.preventDefault();
      print(sp("~ % ", "c-accent"), input.value + "^C");
      input.value = ""; hi = history.length; draft = ""; return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault(); if (!history.length) return;
      if (hi === history.length) draft = input.value;
      hi = Math.max(0, hi - 1); input.value = history[hi];
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (e.key === "ArrowDown") {
      e.preventDefault(); if (hi >= history.length) return;
      hi = Math.min(history.length, hi + 1);
      input.value = hi === history.length ? draft : history[hi];
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value; input.value = "";
    const line = raw.trim();
    if (line && history[history.length - 1] !== line) history.push(line);
    hi = history.length; draft = "";
    print(sp("~ % ", "c-accent"), raw);
    run(raw);
  });

  // click the console to focus (a selection is a copy gesture — leave it be)
  consoleEl.addEventListener("pointerup", (e) => {
    if (e.pointerType && e.pointerType !== "mouse") { input.focus(); return; }
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed && String(sel)) return;
    input.focus();
  });

  return { api, register, alias, names, run };
}
