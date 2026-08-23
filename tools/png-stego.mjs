// A minimal, deterministic PNG writer that carries two payloads:
//   * the REAL one, in a tEXt chunk (keyword "Comment") — what `exiftool`,
//     `strings`, or any PNG parser surfaces;
//   * a DECOY one, LSB-encoded into the pixel bytes — what a solver reaching for
//     `zsteg` finds first. Submitting the decoy brands them via the reckoning.
// Node built-ins only (zlib). Not a general-purpose PNG library.

import { deflateSync, inflateSync } from "node:zlib";

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

// The image itself: a dark, plausibly-screenshot-ish gradient. Deterministic so
// regenerating the gauntlet produces a byte-identical file.
function rawScanlines(width, height) {
  const row = width * 3;
  const raw = Buffer.alloc(height * (row + 1));
  for (let y = 0; y < height; y++) {
    const off = y * (row + 1);
    raw[off] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const p = off + 1 + x * 3;
      raw[p] = (x * 5 + y * 3) & 0x3f;
      raw[p + 1] = (x * 3 + y * 7) & 0x3f;
      raw[p + 2] = (x * 7 + y * 5) & 0x3f;
    }
  }
  return raw;
}

// Walk pixel bytes only (skipping the per-row filter byte) so encode and decode
// agree on the bit order.
function* pixelByteOffsets(width, height) {
  const row = width * 3;
  for (let y = 0; y < height; y++) {
    const off = y * (row + 1) + 1;
    for (let x = 0; x < row; x++) yield off + x;
  }
}

function bitsOf(bytes) {
  const bits = [];
  const pushByte = (b) => { for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1); };
  pushByte(bytes.length & 0xff); // 1-byte length prefix
  for (const b of bytes) pushByte(b);
  return bits;
}

export function makeStegoPng({ width = 32, height = 32, text = "", decoy = "" }) {
  const raw = rawScanlines(width, height);

  const decoyBytes = Buffer.from(String(decoy), "utf8");
  const bits = bitsOf(decoyBytes);
  const offsets = pixelByteOffsets(width, height);
  let bi = 0;
  for (const off of offsets) {
    if (bi >= bits.length) break;
    raw[off] = (raw[off] & 0xfe) | bits[bi++];
  }
  if (bi < bits.length) throw new Error("image too small for the decoy payload");

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const tEXt = Buffer.concat([
    Buffer.from("Comment\0", "latin1"),
    Buffer.from(String(text), "latin1"),
  ]);

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("tEXt", tEXt),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function eachChunk(buf) {
  const out = [];
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    out.push({ type, data: buf.subarray(i + 8, i + 8 + len) });
    i += 12 + len;
  }
  return out;
}

export function readTextChunk(buf) {
  for (const { type, data } of eachChunk(buf)) {
    if (type !== "tEXt") continue;
    const z = data.indexOf(0);
    return { keyword: data.toString("latin1", 0, z), text: data.toString("latin1", z + 1) };
  }
  return null;
}

// Recover the LSB decoy — the same walk the encoder used. Exists so tests can
// prove the decoy is present, distinct, and exactly what we intended to plant.
export function readDecoyLsb(buf) {
  const ihdr = eachChunk(buf).find((c) => c.type === "IHDR");
  const idat = eachChunk(buf).filter((c) => c.type === "IDAT").map((c) => c.data);
  if (!ihdr || !idat.length) return null;
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const raw = inflateSync(Buffer.concat(idat));

  const offsets = [...pixelByteOffsets(width, height)];
  const bitAt = (i) => raw[offsets[i]] & 1;
  const byteAt = (start) => {
    let v = 0;
    for (let i = 0; i < 8; i++) v = (v << 1) | bitAt(start + i);
    return v;
  };
  const len = byteAt(0);
  const bytes = Buffer.alloc(len);
  for (let n = 0; n < len; n++) bytes[n] = byteAt(8 + n * 8);
  return bytes.toString("utf8");
}
