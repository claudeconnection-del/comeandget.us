// Paints a grid of text rows into a <pre> with per-character colour, grouping
// runs of the same colour into one <span> to keep the DOM light. Used by the
// arcade modules so games can be multi-coloured. Input chars are game-owned
// (never user text), but we escape the few HTML-special ones anyway.

const esc = (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c);

export function paint(term, rows, colorOf) {
  let html = "";
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    let run = "";
    let rc = "\0";
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const col = colorOf(ch, x, y) || "inherit";
      if (col !== rc) {
        if (run) html += `<span style="color:${rc}">${run}</span>`;
        run = "";
        rc = col;
      }
      run += esc(ch);
    }
    if (run) html += `<span style="color:${rc}">${run}</span>`;
    html += "\n";
  }
  term.innerHTML = html;
}
