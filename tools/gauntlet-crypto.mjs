// AES-256-GCM over WebCrypto, so the exact same code path runs in Node 18+ (the
// seed generator, the tests) and in the browser (the shell's `unseal` verb).
//
// The IV is derived from the key rather than random. That is safe here because a
// key is single-use — one key seals exactly one message, forever — and it buys
// reproducibility: regenerating the gauntlet yields a byte-identical artifact, so
// the repo stays diff-clean and CI can assert on it.

const S = globalThis.crypto.subtle;

function hexToBytes(h) {
  const a = new Uint8Array(h.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
  return a;
}

function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s) {
  const bin = atob(String(s).trim());
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

async function keyFrom(keyHex) {
  if (!/^[0-9a-f]{64}$/.test(String(keyHex))) throw new Error("key must be 64 hex chars");
  return S.importKey("raw", hexToBytes(keyHex), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function seal(keyHex, plaintext) {
  const iv = hexToBytes(keyHex).slice(0, 12);
  const k = await keyFrom(keyHex);
  const ct = new Uint8Array(
    await S.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(String(plaintext)))
  );
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return b64(out);
}

export async function open(keyHex, blobB64) {
  const raw = unb64(blobB64);
  const k = await keyFrom(keyHex);
  const pt = await S.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, k, raw.slice(12));
  return new TextDecoder().decode(pt);
}
