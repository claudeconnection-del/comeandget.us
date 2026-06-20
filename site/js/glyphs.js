// Pure, dependency-free cipher helpers.
// The plaintext and the key never live here. Only the algorithm does.

const A = 65;

export function vigenere(text, key, decrypt = false) {
  const k = key.toUpperCase().replace(/[^A-Z]/g, "");
  if (!k) return text;
  let ki = 0;
  let out = "";
  for (const ch of text) {
    const c = ch.toUpperCase();
    if (c >= "A" && c <= "Z") {
      const p = c.charCodeAt(0) - A;
      const kk = k[ki % k.length].charCodeAt(0) - A;
      const v = decrypt ? (p - kk + 26) % 26 : (p + kk) % 26;
      out += String.fromCharCode(A + v);
      ki++;
    } else {
      out += ch;
    }
  }
  return out;
}

export async function sha256hex(str) {
  const data = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
