# /root gauntlet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/root`'s ~3 spoon-fed hops with a 5-gate chain (network header → `alg:none` JWT → PNG stego → AES-GCM scattered-key → fixed `_rabbit` DNS terminal) that self-instruments a per-gate funnel, while the prize/riddle/sieve stay byte-for-byte fixed.

**Architecture:** A build-time **seed generator** (`tools/seed-gauntlet.mjs`) deterministically writes every gate artifact (reworked `check-in.json` JWT, an introspection JSON at a hashed path, a stego PNG, an AES-GCM ciphertext, a final instruction file) plus a committed **gate-path manifest** (`functions/root/_gates.js`). A **funnel middleware** recognizes those hashed paths, attributes each fetch to a solver via a first-party HMAC'd `rg` cookie (Path=/root), and records progress in one KV key per solver (`fs:<sid>`). The `comeandget-tracker` (separate repo) reads `fs:*` + Cloudflare DNS analytics to render the gauntlet view.

**Tech Stack:** Cloudflare Pages + Pages Functions (Workers runtime), WebCrypto (`crypto.subtle`), one KV namespace (`PRESENCE`), Node 18+ ESM for the seed generator and the tracker, Playwright for site smoke tests, `node --test` for the tracker.

## Global Constraints

- Zero runtime dependencies on the deployed site — every artifact self-hosted; no new npm dep ships. (Seed generator uses only Node built-ins: `node:crypto`, `node:zlib`, `node:fs`.)
- CSP unchanged: `default-src 'self'; connect-src 'self'`. No new client beacon, no third-party host.
- **FIXED, never touched:** the `_rabbit.comeandget.us` TXT record, its riddle, the final subject answer, and the external sieve auto-reply.
- No puzzle answer ships. The CI leak-guard (reads `PUZZLE_ANSWER`/`secret/answer.txt`) must stay green — nothing this plan commits may contain the riddle answer.
- Secrets stay in env / `secret/` (gitignored): `SIGN_KEY`, `CODE_ARG1`, `CODE_ARG2` already exist. The DNS fragment `FR4` lives only in `secret/gauntlet.json` (build input) and in the `_shard` DNS record — never committed.
- KV write budget: dedup per solver; ≤ ~5 writes per unique solver total across the whole chain.
- Screen-reader parity: no decoy enters the accessibility tree; new gate artifacts are non-DOM (headers/files/DNS).
- Match existing idioms: base64url + HMAC helpers as in `functions/api/mirror/_lib.js`; fail-soft (never 500) as in `functions/api/mirror/index.js`; text-node-only shell output as in `site/root/js/shell.js`.

---

## Interface Contract — the KV funnel schema (shared with comeandget-tracker)

Per-solver progress, one key each, in the existing `PRESENCE` namespace:

```
key:   fs:<sid>          # sid = 22-char base64url random, minted per solver
value: {
  "first": <sec>,        # first gate hit
  "g": { "g1": <sec>, "g2": <sec>, "g3": <sec>, "g4seal": <sec>, "g4open": <sec> },
  "tier": <0|1|2|3>,     # reckoning tier, if branded (else absent)
  "ua": "<short-ua-class>" # "browser" | "curl" | "bot" | "other"
}
expirationTtl: 7776000   # 90 days
metadata (mirror of value for cheap KV.list): { first, tier, ua, gmax: "<last gate>" }
```

Gate order for drop-off math: `g1 → g2 → g3 → g4seal → g4open`, then DNS (`_rabbit`) read from Cloudflare DNS analytics separately.

---

## File Structure

**comeandget.us (site + functions):**
- Create `tools/seed-gauntlet.mjs` — build-time generator; writes all artifacts + the manifest. One responsibility: produce deterministic gate content.
- Create `functions/root/_gates.js` — **generated**, committed. Exports `GATE_PATHS` (map of path → counter id) + `HEADER_HEX` (the G1 header value). Import-only (leading `_`).
- Create `functions/root/_funnel.js` — solver-id cookie mint/verify + `recordGate(env, sid, gate, request)` KV writer. Import-only.
- Modify `functions/root/_middleware.js` — add G1 header injection + funnel recording; keep the AI-cloak.
- Create `site/root/.well-known/<h2>.json` — **generated** G2 introspection artifact (points to the PNG).
- Create `site/root/a/<h3>.png` — **generated** G3 stego PNG.
- Create `site/root/a/<h4>.txt` — **generated** G4 AES-GCM ciphertext (base64).
- Create `site/root/a/<h5>.txt` — **generated** G4 final file (the fixed G5 instruction).
- Modify `site/root/check-in.json` — **generated** reworked JWT (no plaintext DNS name).
- Modify `site/root/js/shell.js` — add the `unseal <ciphertext>` verb + fragment-aware hints; retag decoy filesystem strings.
- Modify `tests/smoke.spec.js` (or add `tests/gauntlet.spec.js`) — gate + funnel tests.
- Create `secret/gauntlet.json` (gitignored) — the 4 fragment inputs incl. `FR4`.

**comeandget-tracker (separate repo, Part 2):**
- Modify `server.mjs` — read `fs:*` KV; add `dnsAnalyticsAdaptiveGroups` query; shape a `gauntlet` block.
- Modify `public/index.html` — render the gauntlet funnel view.
- Modify `analytics.mjs` / `test/*.test.mjs` — pure funnel math + tests.

---

## Part 0 — Branch & fragment seed

### Task 0: Create the work branch and the gitignored fragment file

**Files:**
- Create: `secret/gauntlet.json` (gitignored — confirm `secret/` is in `.gitignore`)

- [ ] **Step 1: Branch off main**

```bash
cd "C:/Code/Domain work/comeandget.us"
git checkout main && git pull --ff-only
git checkout -b feat/root-gauntlet
```

- [ ] **Step 2: Confirm `secret/` is ignored**

Run: `git check-ignore secret/gauntlet.json`
Expected: prints `secret/gauntlet.json` (already ignored per README). If not, add `secret/` to `.gitignore` and commit that.

- [ ] **Step 3: Write the fragment inputs** (FR1–FR3 will ship in-context; FR4 is DNS-only)

```json
{
  "FR1": "emberwire",
  "FR2": "kestrel",
  "FR3": "obsidian",
  "FR4": "PUBLISH-THIS-IN-_shard-TXT",
  "order": ["FR1", "FR2", "FR3", "FR4"],
  "sep": ":"
}
```

Note: `FR4`'s real value is chosen here AND published by Ops (CGU-9) as the `_shard.comeandget.us` TXT record. FR1–FR3 are arbitrary words the seed generator embeds into the header/JWT/PNG respectively.

- [ ] **Step 4: Commit the branch marker** (nothing secret committed yet)

```bash
git commit --allow-empty -m "chore(gauntlet): start feat/root-gauntlet"
```

---

## Part 1 — Seed generator (the linchpin)

### Task 1: Shared derivation helpers used by generator, functions, and tests

**Files:**
- Create: `tools/gauntlet-derive.mjs`
- Test: `tests/gauntlet-derive.test.mjs` (run with `node --test`)

**Interfaces:**
- Produces: `sha256hex(str) -> Promise<string>`, `deriveKeyHex(fragments, order, sep) -> Promise<string>` (64 hex = 32 bytes), `pathHash(str) -> string` (first 16 hex of sha256), `hex(str)`/`unhex(str)` for the header.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256hex, deriveKeyHex, pathHash, hex, unhex } from "../tools/gauntlet-derive.mjs";

test("pathHash is 16 lowercase hex chars, stable", async () => {
  const p = await pathHash("kestrel");
  assert.match(p, /^[0-9a-f]{16}$/);
  assert.equal(p, await pathHash("kestrel"));
});

test("deriveKeyHex concatenates in order with sep then sha256", async () => {
  const frags = { FR1: "a", FR2: "b", FR3: "c", FR4: "d" };
  const expect = await sha256hex("a:b:c:d");
  assert.equal(await deriveKeyHex(frags, ["FR1","FR2","FR3","FR4"], ":"), expect);
});

test("hex/unhex round-trip", () => {
  assert.equal(unhex(hex("GET ./check-in.json")), "GET ./check-in.json");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/gauntlet-derive.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```js
// tools/gauntlet-derive.mjs — pure derivation shared by the generator + tests.
import { createHash } from "node:crypto";

export async function sha256hex(str) {
  return createHash("sha256").update(String(str), "utf8").digest("hex");
}
export async function deriveKeyHex(fragments, order, sep) {
  const joined = order.map((k) => fragments[k]).join(sep);
  return sha256hex(joined);
}
export async function pathHash(str) {
  return (await sha256hex(str)).slice(0, 16);
}
export function hex(str) {
  return Buffer.from(String(str), "utf8").toString("hex");
}
export function unhex(h) {
  return Buffer.from(String(h), "hex").toString("utf8");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/gauntlet-derive.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/gauntlet-derive.mjs tests/gauntlet-derive.test.mjs
git commit -m "feat(gauntlet): derivation helpers (sha256, key, path-hash, hex)"
```

### Task 2: PNG stego writer (real tEXt chunk + decoy LSB)

**Files:**
- Create: `tools/png-stego.mjs`
- Test: `tests/png-stego.test.mjs`

**Interfaces:**
- Produces: `makeStegoPng({ width, height, text, decoy }) -> Buffer` — a valid PNG (RGB, 8-bit) carrying a `tEXt` chunk (keyword `Comment`, value `text`) and `decoy` LSB-encoded into the pixel bytes; `readTextChunk(buf) -> {keyword,text}` for tests.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeStegoPng, readTextChunk } from "../tools/png-stego.mjs";

test("emits a valid PNG signature and IHDR/IEND", () => {
  const buf = makeStegoPng({ width: 32, height: 32, text: "shard-3:obsidian -> next: /root/a/deadbeefdeadbeef.txt", decoy: "ashfall" });
  assert.deepEqual([...buf.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  assert.ok(buf.includes(Buffer.from("IHDR")));
  assert.ok(buf.subarray(-8).includes(Buffer.from("IEND")));
});

test("tEXt chunk carries the real payload", () => {
  const buf = makeStegoPng({ width: 16, height: 16, text: "hello-real", decoy: "decoy" });
  assert.equal(readTextChunk(buf).text, "hello-real");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/png-stego.test.mjs` → FAIL (module not found).

- [ ] **Step 3: Implement**

```js
// tools/png-stego.mjs — minimal deterministic PNG writer with a tEXt chunk and a
// decoy LSB payload. Node built-ins only (zlib). Not a general PNG lib.
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
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

export function makeStegoPng({ width = 32, height = 32, text = "", decoy = "" }) {
  // raw RGB scanlines with a filter byte (0) per row; fill with a dark noise-ish gradient
  const row = width * 3;
  const raw = Buffer.alloc(height * (row + 1));
  for (let y = 0; y < height; y++) {
    const off = y * (row + 1);
    raw[off] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const p = off + 1 + x * 3;
      raw[p] = (x * 5 + y * 3) & 0x3f;       // R (dark)
      raw[p + 1] = (x * 3 + y * 7) & 0x3f;   // G
      raw[p + 2] = (x * 7 + y * 5) & 0x3f;   // B
    }
  }
  // LSB-encode the decoy string (length-prefixed) into the pixel bytes (skip filter bytes)
  const decoyBytes = Buffer.from(String(decoy), "utf8");
  const bits = [];
  const pushByte = (b) => { for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1); };
  pushByte(decoyBytes.length & 0xff);
  for (const b of decoyBytes) pushByte(b);
  let bi = 0;
  for (let y = 0; y < height && bi < bits.length; y++) {
    const off = y * (row + 1) + 1;
    for (let x = 0; x < row && bi < bits.length; x++) {
      raw[off + x] = (raw[off + x] & 0xfe) | bits[bi++];
    }
  }
  const idat = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGB

  const tEXt = Buffer.concat([Buffer.from("Comment\0", "latin1"), Buffer.from(String(text), "latin1")]);

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk("IHDR", ihdr),
    chunk("tEXt", tEXt),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function readTextChunk(buf) {
  let i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === "tEXt") {
      const z = data.indexOf(0);
      return { keyword: data.toString("latin1", 0, z), text: data.toString("latin1", z + 1) };
    }
    i += 12 + len;
  }
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/png-stego.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/png-stego.mjs tests/png-stego.test.mjs
git commit -m "feat(gauntlet): deterministic PNG stego writer (tEXt + decoy LSB)"
```

### Task 3: AES-256-GCM seal/open helper (Node + Workers parity)

**Files:**
- Create: `tools/gauntlet-crypto.mjs`
- Test: `tests/gauntlet-crypto.test.mjs`

**Interfaces:**
- Produces: `seal(keyHex, plaintext) -> Promise<string>` (base64 of `iv(12) || ciphertext||tag`), `open(keyHex, blobB64) -> Promise<string>`. Uses WebCrypto (`globalThis.crypto.subtle`), so identical code runs in Node 18+ and Workers.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { seal, open } from "../tools/gauntlet-crypto.mjs";

test("round-trips with the right key", async () => {
  const key = "a".repeat(64);
  const blob = await seal(key, "dig TXT _rabbit.comeandget.us");
  assert.equal(await open(key, blob), "dig TXT _rabbit.comeandget.us");
});

test("fails closed on a wrong key", async () => {
  const blob = await seal("a".repeat(64), "secret");
  await assert.rejects(() => open("b".repeat(64), blob));
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (module not found).

- [ ] **Step 3: Implement**

```js
// tools/gauntlet-crypto.mjs — AES-256-GCM using WebCrypto (Node 18+ and Workers).
// iv is deterministic-from-key so the generator's output is reproducible in CI.
const S = globalThis.crypto.subtle;
function hexToBytes(h) { const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i*2,2),16); return a; }
function b64(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function unb64(s) { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return a; }

async function keyFrom(keyHex) {
  return S.importKey("raw", hexToBytes(keyHex), { name: "AES-GCM" }, false, ["encrypt","decrypt"]);
}
export async function seal(keyHex, plaintext) {
  const iv = hexToBytes(keyHex).slice(0, 12); // deterministic IV from key (single-use key)
  const k = await keyFrom(keyHex);
  const ct = new Uint8Array(await S.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(plaintext)));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64(out);
}
export async function open(keyHex, blobB64) {
  const raw = unb64(blobB64); const iv = raw.slice(0, 12); const ct = raw.slice(12);
  const k = await keyFrom(keyHex);
  return new TextDecoder().decode(await S.decrypt({ name: "AES-GCM", iv }, k, ct));
}
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/gauntlet-crypto.mjs tests/gauntlet-crypto.test.mjs
git commit -m "feat(gauntlet): AES-256-GCM seal/open (WebCrypto, Node+Workers parity)"
```

### Task 4: The seed generator — writes every artifact + the manifest

**Files:**
- Create: `tools/seed-gauntlet.mjs`
- Modify: `package.json` (add `"seed:gauntlet": "node tools/seed-gauntlet.mjs"`)
- Test: `tests/seed-gauntlet.test.mjs`

**Interfaces:**
- Consumes: `secret/gauntlet.json` (fragments), the three helper modules.
- Produces (on disk): `site/root/check-in.json`, `site/root/.well-known/<h2>.json`, `site/root/a/<h3>.png`, `site/root/a/<h4>.txt`, `site/root/a/<h5>.txt`, and `functions/root/_gates.js` exporting `GATE_PATHS` + `HEADER_HEX`.

Derivation chain (all paths derived so they can't be guessed):
- `h2 = pathHash("introspect:" + FR2)` → G2 introspection path `/root/.well-known/<h2>.json`
- `h3 = pathHash("png:" + FR2 + FR3)` → PNG path `/root/a/<h3>.png`
- `h4 = pathHash("seal:" + keyHex)` → ciphertext path `/root/a/<h4>.txt`
- `h5 = pathHash("open:" + keyHex)` → final path `/root/a/<h5>.txt` (this string is the decrypted plaintext)
- `keyHex = deriveKeyHex(fragments, order, sep)`

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { deriveKeyHex, pathHash } from "../tools/gauntlet-derive.mjs";
import { open } from "../tools/gauntlet-crypto.mjs";
import { readTextChunk } from "../tools/png-stego.mjs";

const FR = JSON.parse(readFileSync("secret/gauntlet.json", "utf8"));

test("generator produces a decryptable chain that ends at the fixed instruction", async () => {
  execFileSync(process.execPath, ["tools/seed-gauntlet.mjs"]);
  const gates = readFileSync("functions/root/_gates.js", "utf8");
  assert.match(gates, /GATE_PATHS/);

  const key = await deriveKeyHex(FR, FR.order, FR.sep);
  const h4 = await pathHash("seal:" + key);
  const blob = readFileSync(`site/root/a/${h4}.txt`, "utf8").trim();
  const finalPath = await open(key, blob);              // decrypt
  assert.match(finalPath, /^\/root\/a\/[0-9a-f]{16}\.txt$/);

  const instruction = readFileSync("site/root" + finalPath.replace(/^\/root/, ""), "utf8");
  assert.match(instruction, /_rabbit\.comeandget\.us/);
  assert.match(instruction, /please@comeandget\.us/);

  // PNG carries the real fragment hint, header hex decodes, JWT has no plaintext DNS name
  const h3 = await pathHash("png:" + FR.FR2 + FR.FR3);
  assert.equal(readTextChunk(readFileSync(`site/root/a/${h3}.png`)).keyword, "Comment");
  assert.ok(!readFileSync("site/root/check-in.json", "utf8").includes("_rabbit"));
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (generator missing).

- [ ] **Step 3: Implement the generator**

```js
// tools/seed-gauntlet.mjs — deterministically (re)write every gauntlet artifact.
// Run: npm run seed:gauntlet. Reads secret/gauntlet.json (gitignored).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deriveKeyHex, pathHash, sha256hex, hex } from "./gauntlet-derive.mjs";
import { seal } from "./gauntlet-crypto.mjs";
import { makeStegoPng } from "./png-stego.mjs";

const FR = JSON.parse(readFileSync("secret/gauntlet.json", "utf8"));
const b64url = (s) => Buffer.from(s, "utf8").toString("base64url");

const keyHex = await deriveKeyHex(FR, FR.order, FR.sep);
const h2 = await pathHash("introspect:" + FR.FR2);
const h3 = await pathHash("png:" + FR.FR2 + FR.FR3);
const h4 = await pathHash("seal:" + keyHex);
const h5 = await pathHash("open:" + keyHex);
const introspectPath = `/root/.well-known/${h2}.json`;
const pngPath = `/root/a/${h3}.png`;
const sealPath = `/root/a/${h4}.txt`;
const finalPath = `/root/a/${h5}.txt`;

mkdirSync("site/root/.well-known", { recursive: true });
mkdirSync("site/root/a", { recursive: true });

// ---- G1 header hex: real breadcrumb + fragment FR1 -------------------------
const headerText = `GET ./check-in.json — mind the alg. shard-1:${FR.FR1}`;
const HEADER_HEX = hex(headerText);

// ---- G1 artifact: check-in.json with a reworked alg:none JWT ---------------
// The JWT no longer names DNS. A custom claim carries FR2; the "next" claim
// tells the solver to hash it into the introspection path.
const jwtHeader = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
const jwtPayload = b64url(JSON.stringify({
  iss: "https://sts.windows.net/00000000-0000-0000-0000-000000000000/",
  aud: "https://graph.microsoft.com",
  appid: "1b730954-1685-4b74-9bfd-dac224a7b894",
  scp: "Directory.ReadWrite.All",
  roles: ["Global Administrator"],
  note: "alg:none — we did not sign this, and nobody checked",
  cnf: { kid: FR.FR2 },                                  // FR2 hides here
  next: "sha256('introspect:'+kid), first 16 hex, under /root/.well-known/<that>.json",
}));
const token = `${jwtHeader}.${jwtPayload}.`;
const motd = b64url("decode the _token. mind the alg. the kid is a shard; the 'next' claim says where it points.");
writeFileSync("site/root/check-in.json", JSON.stringify({
  schema: "intune.deviceCheckin/v2",
  deviceName: "NEO-WS01",
  entraDeviceId: "7f3a1c20-9b4e-4c2a-bf21-0d11e9a7c655",
  joinType: "Entra joined", managedBy: "Intune (MDM)", ownership: "Corporate",
  complianceState: "noncompliant", osVersion: "Windows 11 Pro 23H2 (22631.4317)",
  lastSync: "1970-01-01T00:00:00Z", userPrincipalName: "neo@comeandget.onmicrosoft.com",
  assignedRoles: ["Global Administrator"], tenantId: "00000000-0000-0000-0000-000000000000",
  notes: "token replay observed from a new location. do not revoke. observe.",
  motd, _token: token,
}, null, 2) + "\n");

// ---- G2 artifact: introspection JSON points at the PNG ---------------------
writeFileSync(`site/root${introspectPath.replace("/root","")}`, JSON.stringify({
  sub: "device-introspection",
  status: "noncompliant",
  attestation: `the compliance evidence is an image: ${pngPath}. read what is written in it, not what it shows.`,
}, null, 2) + "\n");

// ---- G3 artifact: stego PNG (real tEXt fragment + decoy LSB) ----------------
const pngText = `shard-3:${FR.FR3} · sealed instruction at ${sealPath} · key = sha256(shard1:shard2:shard3:shard4) — shard-4 is in DNS (dig TXT _shard.comeandget.us)`;
writeFileSync(`site/root${pngPath.replace("/root","")}`,
  makeStegoPng({ width: 96, height: 64, text: pngText, decoy: "ashfall" }));

// ---- G4 artifacts: ciphertext + final instruction --------------------------
writeFileSync(`site/root${sealPath.replace("/root","")}`, (await seal(keyHex, finalPath)) + "\n");
writeFileSync(`site/root${finalPath.replace("/root","")}`,
  "dig TXT _rabbit.comeandget.us — decode the record, then answer the riddle in the subject line to please@comeandget.us\n");

// ---- Manifest for the middleware -------------------------------------------
writeFileSync("functions/root/_gates.js",
`// GENERATED by tools/seed-gauntlet.mjs — do not edit by hand.
export const HEADER_HEX = ${JSON.stringify(HEADER_HEX)};
export const GATE_PATHS = ${JSON.stringify({
  "/root/check-in.json": "g1",
  [introspectPath]: "g2",
  [pngPath]: "g3",
  [sealPath]: "g4seal",
  [finalPath]: "g4open",
}, null, 2)};
`);

console.log("seeded gauntlet:", { introspectPath, pngPath, sealPath, finalPath });
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/seed-gauntlet.test.mjs`
Expected: PASS (chain decrypts, ends at the fixed instruction, JWT has no `_rabbit`).

- [ ] **Step 5: Commit** (commit the generator, the manifest, and the generated artifacts)

```bash
git add tools/seed-gauntlet.mjs tests/seed-gauntlet.test.mjs functions/root/_gates.js site/root/check-in.json site/root/.well-known site/root/a package.json
git commit -m "feat(gauntlet): seed generator + generated gate artifacts + manifest"
```

---

## Part 2 — Funnel middleware (telemetry)

### Task 5: Solver-id cookie + KV recorder

**Files:**
- Create: `functions/root/_funnel.js`
- Test: `tests/funnel.test.mjs` (unit-test the pure cookie helpers with a fake SIGN_KEY)

**Interfaces:**
- Consumes: `hmacB64url`-style HMAC (reimplement locally to keep `functions/root` self-contained, matching `functions/api/mirror/_lib.js`).
- Produces: `getOrMintSid(request, signKey) -> {sid, setCookie|null}`, `uaClass(request) -> "browser"|"curl"|"bot"|"other"`, `recordGate(env, sid, gate, request) -> Promise<void>` (dedups: only writes when `gate` is new for `sid`).

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mintSid, verifySid, uaClass } from "../functions/root/_funnel.js";

test("sid cookie round-trips under the same key, rejects tampering", async () => {
  const { sid, cookie } = await mintSid("KEY");
  const value = cookie.match(/rg=([^;]+)/)[1];
  assert.equal(await verifySid("KEY", value), sid);
  assert.equal(await verifySid("KEY", value.slice(0, -2) + "xx"), null);
});

test("uaClass buckets", () => {
  assert.equal(uaClass({ headers: new Map([["user-agent","curl/8.1"]]) }), "curl");
});
```

(Adapt the header accessor to Workers `Headers`; the test uses a Map with a `.get`-like shim — provide `uaClass` reading `request.headers.get`.)

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement**

```js
// functions/root/_funnel.js — solver id (first-party HMAC cookie, Path=/root) +
// KV progress recorder. Import-only. No PII: sid is random, not derived from IP.
const enc = new TextEncoder();
async function hmac(signKey, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(String(signKey||"")), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(msg)));
  let bin = ""; for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function eq(a, b) { if (typeof a!=="string"||typeof b!=="string"||a.length!==b.length) return false; let d=0; for (let i=0;i<a.length;i++) d|=a.charCodeAt(i)^b.charCodeAt(i); return d===0; }
function randSid() { const a = new Uint8Array(16); crypto.getRandomValues(a); let bin=""; for (const b of a) bin+=String.fromCharCode(b); return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }

export async function mintSid(signKey) {
  const sid = randSid();
  const value = sid + "." + (await hmac(signKey, sid));
  const cookie = `rg=${value}; Secure; HttpOnly; SameSite=Lax; Path=/root; Max-Age=7776000`;
  return { sid, value, cookie };
}
export async function verifySid(signKey, value) {
  if (typeof value !== "string") return null;
  const i = value.lastIndexOf("."); if (i < 0) return null;
  const sid = value.slice(0, i), sig = value.slice(i + 1);
  return eq(sig, await hmac(signKey, sid)) ? sid : null;
}
function readCookie(request, name) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)"+name+"=([^;]+)"));
  return m ? m[1] : null;
}
export async function getOrMintSid(request, signKey) {
  const existing = await verifySid(signKey, readCookie(request, "rg"));
  if (existing) return { sid: existing, setCookie: null };
  const { sid, cookie } = await mintSid(signKey);
  return { sid, setCookie: cookie };
}
export function uaClass(request) {
  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  if (!ua) return "other";
  if (ua.includes("curl") || ua.includes("wget") || ua.includes("python") || ua.includes("dig")) return "curl";
  if (/(bot|crawler|spider|headless)/.test(ua)) return "bot";
  if (ua.includes("mozilla")) return "browser";
  return "other";
}
export async function recordGate(env, sid, gate, request) {
  const KV = env && env.PRESENCE; if (!KV || !sid) return;
  const key = `fs:${sid}`; const nowSec = Math.floor(Date.now()/1000);
  let rec = null; try { rec = await KV.get(key, "json"); } catch { rec = null; }
  if (!rec || typeof rec !== "object") rec = { first: nowSec, g: {} };
  if (rec.g && rec.g[gate]) return; // dedup: already recorded this gate
  rec.g = rec.g || {}; rec.g[gate] = nowSec; rec.ua = uaClass(request);
  const order = ["g1","g2","g3","g4seal","g4open"];
  const gmax = order.filter((g) => rec.g[g]).pop() || gate;
  try { await KV.put(key, JSON.stringify(rec), { expirationTtl: 7776000, metadata: { first: rec.first, tier: rec.tier || 0, ua: rec.ua, gmax } }); } catch {}
}
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/root/_funnel.js tests/funnel.test.mjs
git commit -m "feat(gauntlet): funnel solver-id cookie + KV progress recorder"
```

### Task 6: Wire the funnel + G1 header into the root middleware

**Files:**
- Modify: `functions/root/_middleware.js`
- Test: extend `tests/smoke.spec.js` (Playwright) — see Task 9.

**Interfaces:**
- Consumes: `GATE_PATHS`, `HEADER_HEX` from `_gates.js`; `getOrMintSid`, `recordGate` from `_funnel.js`.

- [ ] **Step 1: Read the current middleware** (`functions/root/_middleware.js`, 23 lines) to preserve the AI-cloak exactly.

- [ ] **Step 2: Replace with the extended version**

```js
// Path-scoped middleware for /root/*: (1) AI-cloak counter-signs (unchanged),
// (2) inject the G1 X-Intune-Checkin header on the /root/ document, (3) record
// funnel progress when a gate artifact is fetched. Fail-soft: telemetry never
// breaks the response.
import { GATE_PATHS, HEADER_HEX } from "./_gates.js";
import { getOrMintSid, recordGate } from "./_funnel.js";

const AI_UA = /\b(gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|claude-user|anthropic-ai|perplexitybot|perplexity-user|bytespider|ccbot|cohere-ai|google-extended|applebot-extended|meta-externalagent|meta-externalfetcher|amazonbot|novaact|youbot|diffbot|ai2bot|duckassistbot|timpibot|omgilibot|petalbot|mistralai-user)\b/i;

export async function onRequest({ request, env, next }) {
  const res = await next();
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/index\.html$/, "/");
  const ua = request.headers.get("user-agent") || "";
  const headers = new Headers(res.headers);
  let body = null, mutated = false;

  // (2) G1 header on the document
  const isDoc = (path === "/root/" || path === "/root") && (res.headers.get("content-type") || "").includes("text/html");
  if (isDoc) headers.set("X-Intune-Checkin", HEADER_HEX);

  // (3) funnel: is this a gate artifact?
  const gate = GATE_PATHS[path];
  let setCookie = null;
  if (gate && env && env.SIGN_KEY) {
    try {
      const { sid, setCookie: sc } = await getOrMintSid(request, env.SIGN_KEY);
      setCookie = sc;
      await recordGate(env, sid, gate, request);
    } catch { /* telemetry must never 500 */ }
    if (setCookie) headers.append("Set-Cookie", setCookie);
  }

  // (1) AI-cloak (unchanged behavior)
  if (AI_UA.test(ua) && (res.headers.get("content-type") || "").includes("text/html")) {
    body = (await res.text()).replace(/emberline|ashfall|cinderkey/gi, "smokesign");
    mutated = true;
    headers.delete("content-length");
  }

  if (!mutated && !isDoc && !setCookie) return res;
  return new Response(mutated ? body : res.body, { status: res.status, statusText: res.statusText, headers });
}
```

Note: when not mutating the body we pass `res.body` through with the new headers.

- [ ] **Step 3: Local smoke** — `npm run dev`, then:

```bash
curl -sI http://localhost:8788/root/ | grep -i x-intune-checkin
curl -sI http://localhost:8788/root/check-in.json | grep -i set-cookie
```

Expected: the header is present on `/root/`; a `rg=` cookie is set on the gate artifact.

- [ ] **Step 4: Commit**

```bash
git add functions/root/_middleware.js
git commit -m "feat(gauntlet): G1 header + funnel recording in root middleware"
```

### Task 7: Surface the reckoning tier to KV

**Files:**
- Modify: `site/root/js/vigil.js` (the beat body already sends `e`; add `tier` when haunted) — read `vigil.js:230-297` first.
- Modify: `functions/api/vigil/beat.js:59-96` — persist a numeric `ht` (haunt tier) alongside `e`, same self-brand trust model.
- Modify: `functions/api/vigil/_lib.js:234-239` — `publicPresence` already gates `e`; leave roster output unchanged (tier is for the tracker's KV read, not the public roster).

- [ ] **Step 1: Write the failing test** (add to `tests/smoke.spec.js`, mirror the existing `e:1` test)

```js
// a beat carrying ht:3 stores the tier; any other shape is dropped
```

(Full Playwright assertion added in Task 9's suite; the shape check mirrors the existing echo-brand test in the reckoning spec.)

- [ ] **Step 2:** In `beat.js`, after the `echo` line, add:

```js
const htier = Number(body.ht);
const ht = (htier === 1 || htier === 2 || htier === 3) ? htier : 0;
```

Then include `ht: ht || undefined` in `record` and `ht` in the `metadata` object, and add `(prev.ht||0) !== (record.ht||0)` to the `changed` check.

- [ ] **Step 3:** In `vigil.js` where the beat body is assembled, add `ht: <cg.haunt tier>` when the reckoning has branded this browser (read from the same place `e` is set).

- [ ] **Step 4: Run** the reckoning + beat tests → PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/api/vigil/beat.js site/root/js/vigil.js
git commit -m "feat(gauntlet): persist reckoning tier to KV for the tracker"
```

---

## Part 3 — Shell integration

### Task 8: The `unseal` verb + fragment-aware hints

**Files:**
- Modify: `site/root/js/shell.js` — add `CMD.unseal`; retag two decoy filesystem strings so they hint the new chain without naming answers. Read `shell.js:395-420` (help text) and `shell.js:1080-1151` (dispatch) first.

**Interfaces:**
- Consumes: the shell's `decode`/`flare`/`println`; `open` logic reimplemented inline over `crypto.subtle` (the shell is a browser module — cannot import `tools/`).

- [ ] **Step 1: Read** `shell.js:1080-1151` to confirm how `CMD.<name>(args)` receives the argument string and how async output is printed (pattern: `CMD.claim` uses `Promise.resolve(...).then(r => println(...))` and returns a sync string).

- [ ] **Step 2: Add `CMD.unseal`** (near `CMD.claim`, ~line 871):

```js
// unseal <base64> — AES-256-GCM open using a key you assembled from the shards.
// Prompts for the key; never contains it. Pure atmosphere + a real primitive.
CMD.unseal = (io) => {
  const blob = (io || "").trim();
  if (!blob) return "usage: unseal <base64>   (key = sha256 of the four shards, in order, ':'-joined)";
  const keyHex = (window.prompt("assembled key (64 hex):") || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(keyHex)) return "that is not a 256-bit key. four shards. sha256. mind the order.";
  (async () => {
    try {
      const S = crypto.subtle;
      const kb = new Uint8Array(keyHex.match(/../g).map((h) => parseInt(h, 16)));
      const raw = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
      const key = await S.importKey("raw", kb, { name: "AES-GCM" }, false, ["decrypt"]);
      const pt = new TextDecoder().decode(await S.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12)));
      flare && flare(600);
      println("the seal gives: " + pt);
    } catch {
      println("the seal holds. a shard is wrong, or out of order.");
    }
  })();
  return "working the lock…";
};
```

- [ ] **Step 3: Retag hints** — change the decoy `.bash_history` and `notes.md` lines so they reference "shards" and "the wire/header" instead of the old direct DNS hint (keep them oblique; never name `_rabbit`'s answer). Add `unseal` to the `help` command list at `shell.js:404-405`.

- [ ] **Step 4: Manual check** — `npm run dev`, open `/root/`, run `unseal <the generated blob>` with the correct key → prints the final path; wrong key → "the seal holds."

- [ ] **Step 5: Commit**

```bash
git add site/root/js/shell.js
git commit -m "feat(gauntlet): add unseal verb + shard-aware shell hints"
```

---

## Part 4 — Tests & preview

### Task 9: End-to-end gate + funnel Playwright suite

**Files:**
- Create: `tests/gauntlet.spec.js`

- [ ] **Step 1: Write the tests** (each asserts one gate; run against `wrangler pages dev` like the existing `smoke.spec.js`):

```js
// 1. GET /root/ carries X-Intune-Checkin; hex decodes to a check-in.json pointer + shard-1.
// 2. check-in.json JWT is alg:none and does NOT contain "_rabbit".
// 3. sha256('introspect:'+kid).slice(0,16) resolves to a served /root/.well-known/<h>.json.
// 4. that JSON points to a served PNG; the PNG tEXt chunk names the sealed path + shard-3.
// 5. fetching the sealed path returns base64; AES-GCM open with the assembled key yields a /root/a/<h>.txt path.
// 6. that final file contains "_rabbit.comeandget.us" and "please@comeandget.us" (the fixed instruction).
// 7. fetching each gate path sets/reuses an rg cookie; a second fetch with the cookie does not double-count (assert via a KV read helper or the tracker path if available).
// 8. AI UA on /root/ still yields smokesign, never cinderkey.
// 9. leak-guard: none of the generated files contain the PUZZLE_ANSWER (reuse the existing guard test).
```

Provide full assertions using the fragments from `secret/gauntlet.json` and the helpers in `tools/` (import them in the spec).

- [ ] **Step 2: Run the whole gate**

Run: `npm run ci`
Expected: HTML validate + all Playwright specs PASS; leak-guard green.

- [ ] **Step 3: Commit**

```bash
git add tests/gauntlet.spec.js
git commit -m "test(gauntlet): end-to-end gate chain + funnel + leak-guard"
```

### Task 10: Deploy to a Cloudflare Pages preview and walk it (CGU-8)

- [ ] **Step 1: Publish the `_shard` TXT record** (Ops / CGU-9) with `FR4`, and confirm: `dig +short TXT _shard.comeandget.us`.

- [ ] **Step 2: Deploy the branch to a preview alias (NOT main)**

```bash
npx wrangler pages deploy site --branch feat/root-gauntlet
```

Expected: a `https://feat-root-gauntlet.<project>.pages.dev` preview URL. Confirm `SIGN_KEY`/`PRESENCE` are bound to preview.

- [ ] **Step 3: Manually walk the full chain on the preview** — header → check-in.json → introspection → PNG (download + read tEXt) → assemble key (incl. `dig TXT _shard`) → `unseal` → `dig TXT _rabbit` (unchanged) → email path. Verify the fixed terminal and sieve are intact.

- [ ] **Step 4: Confirm funnel** — after the walk, read `fs:*` from KV (via the tracker or `wrangler kv key list`) and confirm one `fs:<sid>` with `g1..g4open` timestamps.

- [ ] **Step 5:** Do NOT merge yet — hand to the user for sign-off.

---

## Part 5 — comeandget-tracker gauntlet view (separate repo)

> Independently testable via `node --test`. Consumes the KV funnel schema above. Build after the site preview is green.

### Task 11: Read `fs:*` and shape a gauntlet funnel

**Files:**
- Modify: `C:\Code\Domain work\comeandget-tracker\server.mjs` — add `readGauntlet(cfg)` (KV list `fs:` + metadata) and fold a `gauntlet` block into `shapeSection('root', …)`.
- Modify: `analytics.mjs` — pure `gauntletFunnel(solvers)` → `{ stages:[{gate,count,dropPct}], medianGapSec, cheatRatePct, methodMix }`.
- Test: `test/gauntlet.test.mjs`.

- [ ] **Step 1: Write the failing pure-function test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { gauntletFunnel } from "../analytics.mjs";

test("funnel counts, drop-off, cheat rate, velocity", () => {
  const solvers = [
    { first: 0, g: { g1: 0, g2: 60, g3: 180, g4seal: 240, g4open: 300 }, tier: 0, ua: "curl" },
    { first: 0, g: { g1: 0, g2: 30 }, tier: 3, ua: "bot" },
    { first: 0, g: { g1: 0 }, tier: 0, ua: "browser" },
  ];
  const f = gauntletFunnel(solvers);
  assert.equal(f.stages[0].count, 3);           // g1
  assert.equal(f.stages[1].count, 2);           // g2
  assert.equal(f.stages[4].count, 1);           // g4open
  assert.equal(f.cheatRatePct, 33);             // 1 of 3 branded
  assert.ok(f.medianGapSec > 0);
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement `gauntletFunnel`** (pure; add to `analytics.mjs`)

```js
export function gauntletFunnel(solvers) {
  const order = ["g1","g2","g3","g4seal","g4open"];
  const stages = order.map((g) => ({ gate: g, count: solvers.filter((s) => s.g && s.g[g] != null).length }));
  const top = stages[0].count || 1;
  for (let i = 0; i < stages.length; i++) {
    const prev = i === 0 ? stages[0].count : stages[i-1].count || 1;
    stages[i].dropPct = Math.round(100 * (1 - stages[i].count / (prev || 1)));
    stages[i].ofTopPct = Math.round(100 * stages[i].count / top);
  }
  const gaps = [];
  for (const s of solvers) {
    const ts = order.map((g) => s.g && s.g[g]).filter((t) => t != null);
    for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i-1]);
  }
  gaps.sort((a,b) => a-b);
  const medianGapSec = gaps.length ? gaps[Math.floor(gaps.length/2)] : 0;
  const branded = solvers.filter((s) => (s.tier||0) >= 1).length;
  const cheatRatePct = solvers.length ? Math.round(100 * branded / solvers.length) : 0;
  const methodMix = solvers.reduce((m,s) => ((m[s.ua||"other"] = (m[s.ua||"other"]||0)+1), m), {});
  return { stages, medianGapSec, cheatRatePct, methodMix, total: solvers.length };
}
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit** (in the tracker repo — note it is not a git repo per exploration; init or commit into the parent as the user prefers)

```bash
cd "C:/Code/Domain work/comeandget-tracker"
node --test test/gauntlet.test.mjs
```

### Task 12: DNS analytics query + render the gauntlet view

**Files:**
- Modify: `server.mjs` — add a `dnsAnalyticsAdaptiveGroups` query for `_rabbit`/`_shard` TXT query volume; degrade to `null` if the token lacks DNS-analytics scope.
- Modify: `public/index.html` — a gauntlet panel: horizontal funnel bars (G1→G4open) + a DNS-reached tile + cheat-rate + median-velocity + method-mix donut.

- [ ] **Step 1:** Add the GraphQL query (guarded; on auth error set `gauntlet.dns = null`):

```graphql
query($zone: String!, $since: Time!, $until: Time!) {
  viewer { zones(filter: {zoneTag: $zone}) {
    dnsAnalyticsAdaptiveGroups(limit: 100, filter: {datetime_geq: $since, datetime_leq: $until, queryName_in: ["_rabbit.comeandget.us","_shard.comeandget.us"]}) {
      count dimensions { queryName }
    }
  } }
}
```

- [ ] **Step 2:** Shape `{ funnel: gauntletFunnel(solvers), dns: {rabbit, shard} }` into `/api/data` under `section=root`.

- [ ] **Step 3:** Render the panel in `index.html` (follow the existing funnel/among the root-theme section). Show the DNS tile as "reached the exfil channel."

- [ ] **Step 4: Manual check** — `node server.mjs`, open the dashboard root view, confirm the gauntlet funnel renders from live KV; DNS tile shows counts or a graceful "DNS analytics not authorized" note.

- [ ] **Step 5: Commit.**

---

## Self-Review notes

- **Spec coverage:** G1 (Task 6), G2 (Task 4 JWT+introspection), G3 (Tasks 2,4), G4 (Tasks 3,4,8), G5 fixed (Task 4 final file asserts it), telemetry (Tasks 5,6,7), tracker (Tasks 11,12), preview (Task 10), `_shard` ops (Task 10 step 1). Counter-intel kept (middleware AI-cloak preserved verbatim in Task 6; decoy LSB in Task 2; tier→KV in Task 7).
- **No answer ships:** every generated file decrypts only to the *instruction* (`dig TXT _rabbit`), never the riddle answer; Task 9 step-9 re-runs the leak-guard.
- **Type consistency:** gate ids (`g1,g2,g3,g4seal,g4open`) identical across `_gates.js`, `_funnel.js`, `gauntletFunnel`; `keyHex` (64 hex) consistent across `deriveKeyHex`/`seal`/`open`/`unseal`.
- **Open risk:** `wrangler pages deploy --branch` preview must have `SIGN_KEY`+`PRESENCE` bound to the *preview* environment (Task 10 step 2). If preview bindings are absent, the header still ships but the funnel silently no-ops (fail-soft) — acceptable for the manual walk.
