// app.js — wire the terminal: theme, meta commands, the CTF, the tools, the
// arcade, and the live window buttons.
import { createTerminal } from "./shell.js";
import { initTheme, set as setTheme, current as curTheme } from "./theme.js";
import { cafeCommands } from "./ctf.js";
import { toolCommands } from "./tools.js";
import { gameCommands } from "./games/index.js";
import { initWindow } from "./window.js";

initTheme();
const term = createTerminal();
const { api } = term;
initWindow(api);

const meta = {
  help: () => {
    api.print(api.sp("byte café", "welcome"), api.sp(" — a cozy capture-the-flag playground", "c-muted"));
    api.blank();
    api.print(api.sp("playing", "c-accent bold"));
    api.print(api.sp("  ls", "c-text"), api.sp("                   the board — every challenge", "c-muted"));
    api.print(api.sp("  open <name>", "c-text"), api.sp("          read a challenge", "c-muted"));
    api.print(api.sp("  submit <name> <flag>", "c-text"), api.sp(" hand in a cafe{...}", "c-muted"));
    api.print(api.sp("  hint <name>", "c-text"), api.sp("          a gentle nudge (more each time)", "c-muted"));
    api.print(api.sp("  badges", "c-text"), api.sp(" · ", "c-muted"), api.sp("progress", "c-text"), api.sp("     your shelf & score", "c-muted"));
    api.blank();
    api.print(api.sp("tools", "c-accent bold"), api.sp("  (for solving)", "c-muted"));
    api.print(api.sp("  cat <file>    curl -I <file>    dig [TYPE] <name>", "c-text"));
    api.print(api.sp("  grep <pat> <file>    strings <file>    file <file>", "c-text"));
    api.print(api.sp("  decode <s>    base64 -d <s>    rot13 <s>", "c-text"));
    api.blank();
    api.print(api.sp("arcade", "c-accent bold"), api.sp("  (take a break)", "c-muted"));
    api.print(api.sp("  games", "c-text"), api.sp("                the lineup — tetris · snake · breakout · pong · idle", "c-muted"));
    api.print(api.sp("  4k", "c-text"), api.sp("                   toggle the glow-up once you've unlocked it", "c-muted"));
    api.blank();
    api.print(api.sp("look & feel", "c-accent bold"));
    api.print(api.sp("  theme dark|light    clear", "c-text"), api.sp("     (or tap the ☾/☀ and the dots up top)", "c-muted"));
    api.blank();
    api.print(api.sp("new here? try ", "c-muted"), api.kbd("open welcome-mat"), api.sp(" then ", "c-muted"), api.kbd("ls"), api.sp(". have fun.", "c-muted"));
  },
  about: () => {
    api.print(api.sp("byte café", "welcome"));
    api.print(api.sp("a friendly little CTF in a cozy terminal — the warm twin of comeandget.us.", "c-text"));
    api.print(api.sp("the same regulars work the night shift here. on this side they just want you caffeinated.", "c-muted"));
    api.print(api.sp("it all runs in your browser. nothing tracked, nothing bites. browse with ", "c-muted"), api.kbd("ls"), api.sp(".", "c-muted"));
  },
  clear: () => api.clearScreen(),
  theme: ({ argv }) => {
    const a = (argv[0] || "").toLowerCase();
    if (a === "dark" || a === "light") { setTheme(a); api.print(api.sp("theme: " + a, "c-accent")); }
    else if (!a) { const nx = curTheme() === "dark" ? "light" : "dark"; setTheme(nx); api.print(api.sp("theme: " + nx, "c-accent"), api.sp("  (you can also tap ☾/☀ up top)", "c-muted")); }
    else api.print(api.sp("usage: ", "c-muted"), api.kbd("theme dark|light"));
  },
  exit: () => api.print(api.sp("there's no leaving a café this cozy — just close the tab when you're done.", "c-muted")),
};

term.register(meta);
term.register(cafeCommands());
term.register(toolCommands());
term.register(gameCommands());
term.alias({ "?": "help", commands: "help", menu: "ls", cls: "clear", quit: "exit", q: "exit", arcade: "games", play: "games", blocks: "tetris", hd: "4k", brew: "idle", clicker: "idle" });

api.focus();
