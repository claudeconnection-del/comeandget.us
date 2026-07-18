// Renders the device-posture dossier into the terminal. Output goes ONLY through
// the caller's println (which does createTextNode) — never innerHTML.

import { dossierLines } from "./lines.js";

export function printDossier(println, report) {
  if (typeof println !== "function") return;
  for (const line of dossierLines(report || {})) println(line);
}
