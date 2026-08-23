import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { pathHash, deriveKeyHex } from "../tools/gauntlet-derive.mjs";
import { open } from "../tools/gauntlet-crypto.mjs";
import { readTextChunk } from "../tools/png-stego.mjs";
import { GATE_PATHS, HEADER_HEX } from "../functions/root/_gates.js";

// Fragments arm the end-to-end decryption walk. Present locally / via
// GAUNTLET_FRAGMENTS in CI; absent, those tests skip (structural ones still run).
function loadFragments() {
  if (existsSync("secret/gauntlet.json")) return JSON.parse(readFileSync("secret/gauntlet.json", "utf8"));
  if (process.env.GAUNTLET_FRAGMENTS) { try { return JSON.parse(process.env.GAUNTLET_FRAGMENTS); } catch { /* skip */ } }
  return null;
}
const FR = loadFragments();
const pathFor = (g) => Object.keys(GATE_PATHS).find((p) => GATE_PATHS[p] === g);
const decodeHex = (h) => Buffer.from(h, "hex").toString("utf8");

test.describe("the /root gauntlet", () => {
  test("G1: the document carries the X-Intune-Checkin breadcrumb (not in the HTML)", async ({ page }) => {
    const res = await page.request.get("/root/");
    const hex = res.headers()["x-intune-checkin"];
    expect(hex, "the /root document must carry the header breadcrumb").toBeTruthy();
    expect(hex).toBe(HEADER_HEX);
    expect(decodeHex(hex).toLowerCase()).toContain("check-in.json");

    // the honest breadcrumb is NOT in the rendered HTML body — only the header
    const html = await res.text();
    expect(html).not.toContain(HEADER_HEX);
  });

  test("funnel: a gate fetch issues a stable first-party rg cookie", async ({ page }) => {
    const first = await page.request.get("/root/check-in.json");
    const setCookie = first.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
    expect(setCookie.length, "first gate fetch should mint the rg cookie").toBeGreaterThan(0);
    expect(setCookie[0].value).toMatch(/rg=[^;]+/);
    expect(setCookie[0].value).toContain("Path=/root");
    expect(setCookie[0].value).toContain("HttpOnly");

    // second fetch (cookie now in the jar) must NOT re-mint — the solver is known
    const second = await page.request.get("/root/check-in.json");
    const reSet = second.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
    expect(reSet.length, "a known solver should not be re-minted").toBe(0);
  });

  test("G2: the JWT kid derives the served introspection artifact", async ({ page }) => {
    const jwt = (await (await page.request.get("/root/check-in.json")).json())._token;
    const kid = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).cnf.kid;
    const derived = `/root/.well-known/${await pathHash("introspect:" + kid)}.json`;
    expect(derived).toBe(pathFor("g2"));
    const intro = await page.request.get(derived);
    expect(intro.ok()).toBeTruthy();
    expect((await intro.text())).toContain(pathFor("g3"));
  });

  test("G3: the compliance png hides the real fragment in a tEXt chunk", async ({ page }) => {
    const png = Buffer.from(await (await page.request.get(pathFor("g3"))).body());
    const t = readTextChunk(png);
    expect(t.keyword).toBe("Comment");
    expect(t.text).toContain(pathFor("g4seal")); // the sealed artifact path
  });

  test("end-to-end: the whole chain resolves to the fixed _rabbit terminal", async ({ page }) => {
    test.skip(!FR, "fragments unavailable — cannot assemble the G4 key");
    const key = await deriveKeyHex(FR, FR.order, FR.sep);
    const blob = (await (await page.request.get(pathFor("g4seal"))).text()).trim();
    const finalPath = await open(key, blob);
    expect(finalPath).toBe(pathFor("g4open"));
    const instruction = await (await page.request.get(finalPath)).text();
    expect(instruction).toContain("_rabbit.comeandget.us");
    expect(instruction).toContain("please@comeandget.us");
  });

  test("the unseal verb opens the seal in-terminal (and fails closed on a bad key)", async ({ page }) => {
    test.skip(!FR, "fragments unavailable — cannot assemble the G4 key");
    const key = await deriveKeyHex(FR, FR.order, FR.sep);
    await page.goto("/root/");
    const type = async (c) => { await page.fill("#cmd", c); await page.press("#cmd", "Enter"); };

    await type(`unseal ${key} ${pathFor("g4seal")}`);
    await expect(page.locator("#term")).toContainText("the seal gives:", { timeout: 5000 });
    await expect(page.locator("#term")).toContainText(pathFor("g4open"));

    // a wrong key must fail closed — no plaintext, just the sealed message
    await type(`unseal ${"f".repeat(64)} ${pathFor("g4seal")}`);
    await expect(page.locator("#term")).toContainText("the seal holds");
  });

  test("no gauntlet artifact leaks the fixed answer path in the clear before G4", async ({ page }) => {
    // the DNS terminal must only surface after decryption — never in G1–G3 artifacts
    for (const g of ["g1", "g2", "g3"]) {
      const body = g === "g3"
        ? Buffer.from(await (await page.request.get(pathFor(g)))?.body?.() ?? Buffer.alloc(0)).toString("latin1")
        : await (await page.request.get(pathFor(g))).text();
      expect(body, `${g} must not name _rabbit`).not.toContain("_rabbit");
    }
  });
});
