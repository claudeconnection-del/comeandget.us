// Paints a grid of text rows into a <pre> with per-character colour, grouping
// runs of the same colour into one <span> to keep the DOM light. Used by the
// arcade modules so games can be multi-coloured. Input chars are game-owned
// (never user text), but we escape the few HTML-special ones anyway.

const esc = (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c);

// colour helpers so games can derive a palette from the active theme
const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const hexToRgb = (h) => {
  h = h.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const toHex = (r, g, b) => "#" + [r, g, b].map((x) => clamp(x).toString(16).padStart(2, "0")).join("");
export const shade = (h, f) => { const [r, g, b] = hexToRgb(h); return toHex(r * f, g * f, b * f); };
export const lighten = (h, f) => { const [r, g, b] = hexToRgb(h); return toHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f); };

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
