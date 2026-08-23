// The ledger's renderer. Every state the endpoint can return has a rendering here,
// and one rule governs all of them: a number appears only when the server actually
// measured it. An unreachable ledger paints no digits at all — a board of zeroes
// would read as "nobody has tried", which is a lie the outage did not earn.

import { createRain } from "./rain.js";

createRain(document.getElementById("rain"));

const main = document.querySelector("main.board");
const el = (id) => document.getElementById(id);

function setState(state, message) {
  main.dataset.state = state;
  main.setAttribute("aria-busy", state === "loading" ? "true" : "false");
  el("state").textContent = message;
}

function duration(seconds) {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

const day = (unix) =>
  new Date(unix * 1000).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

function rung({ key, label, count, width, you, terminal }) {
  const row = document.createElement("div");
  row.className = terminal ? "rung rung--terminal" : "rung";
  row.dataset.rung = terminal ? "terminal" : key;
  if (you) row.dataset.you = "1";

  const name = document.createElement("span");
  name.className = "label";
  name.textContent = label;

  // The bar restates the count visually, so it is hidden from assistive tech
  // rather than read out twice.
  const track = document.createElement("span");
  track.className = "track";
  track.setAttribute("aria-hidden", "true");
  if (!terminal) {
    const bar = document.createElement("span");
    bar.className = "bar";
    track.appendChild(bar);
    requestAnimationFrame(() => bar.style.setProperty("--w", `${width}%`));
  }

  const n = document.createElement("span");
  n.className = "count";
  n.textContent = terminal ? "?" : String(count);

  row.append(name, track, n);
  return row;
}

function paragraphs(parent, lines) {
  for (const text of lines) {
    const p = document.createElement("p");
    p.textContent = text;
    parent.appendChild(p);
  }
}

function methodology(d) {
  const lines = [
    "A solver is a browser holding a signed cookie, not a person. Clearing cookies, or picking up a second device, makes a second solver.",
    "The door counts cookie-capable browsers only. Self-identified crawlers are excluded, and scripted clients are not counted there at all — which is why the wire can stand higher than the door. They are counted from the wire onward, like everyone else.",
    "The reply carries no number because this server cannot see one. It happens in an inbox. Rather than publish a figure nothing here can check, it stays a question mark.",
    `Every figure above is counted, never estimated. Read at ${new Date(d.asOf * 1000).toLocaleTimeString()}.`,
  ];
  if (d.truncated) {
    lines.unshift("The record listing reached its cap, so these counts are floors rather than totals.");
  }

  el("method").innerHTML = "";
  const h = document.createElement("h2");
  h.textContent = "how these numbers are made";
  el("method").appendChild(h);
  paragraphs(el("method"), lines);
}

function asides(d) {
  const items = [
    ["still climbing", String(d.climbing), false],
    ["fastest clear", d.pace ? duration(d.pace.fastest) : "—", false],
    ["typical clear", d.pace ? duration(d.pace.median) : "not enough finishers to say", !d.pace],
  ];

  el("asides").innerHTML = "";
  for (const [term, value, muted] of items) {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    if (muted) dd.className = "muted";
    wrap.append(dt, dd);
    el("asides").appendChild(wrap);
  }
}

function render(d) {
  el("since").textContent = d.since ? ` · since ${day(d.since)}` : "";

  el("door").innerHTML = "";
  const strong = document.createElement("b");
  strong.textContent = String(d.arrived);
  el("door").append(
    strong,
    document.createTextNode(d.arrived === 1 ? " has stood at the door." : " have stood at the door.")
  );

  // Scaled to the tallest rung, not to arrivals: the door is context, and letting
  // it set the scale would squash the whole chain into a sliver. Nothing here is
  // presented as a share of anything, so the relative scale stays honest.
  const top = Math.max(...d.rungs.map((r) => r.count), 1);

  el("ladder").innerHTML = "";
  for (const r of d.rungs) {
    el("ladder").appendChild(
      rung({
        key: r.key,
        label: r.label,
        count: r.count,
        width: (r.count / top) * 100,
        you: Boolean(d.you && d.you.rung === r.key),
      })
    );
  }
  el("ladder").appendChild(rung({ label: d.terminal.label, terminal: true }));

  el("horizon-note").textContent =
    "the instrumentation stops at that line. what happens past it happens in an inbox.";

  asides(d);
  methodology(d);
  setState(d.empty ? "empty" : "ok", "no one has come this way yet.");
}

function unreachable() {
  // Nothing measured, so nothing rendered. No zeroes, no bars, no timestamps.
  el("ladder").innerHTML = "";
  el("asides").innerHTML = "";
  el("method").innerHTML = "";
  el("since").textContent = "";
  el("door").textContent = "";
  el("horizon-note").textContent = "no numbers, rather than wrong ones.";
  setState("unreachable", "the ledger is unreachable.");
}

(async () => {
  try {
    const res = await fetch("/root/progress/data", { headers: { accept: "application/json" } });
    const d = await res.json();
    if (!d || d.ok !== true) throw new Error("unavailable");
    render(d);
  } catch {
    unreachable();
  }
})();
