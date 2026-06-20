import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// No puzzle answer (either ARG) may live in this repo. The leak guard loads the
// answers from an out-of-repo source so the words are never committed:
//   - process.env.PUZZLE_ANSWER  (CI secret; newline- or comma-separated)
//   - secret/answer.txt          (gitignored local file, one answer per line)
// Each answer contributes its first word as a forbidden needle. If none are
// available the guard skips rather than weakening into a no-op.
function loadAnswerNeedles() {
  let raw = process.env.PUZZLE_ANSWER;
  if (!raw) {
    try {
      const here = dirname(fileURLToPath(import.meta.url));
      raw = readFileSync(join(here, "..", "secret", "answer.txt"), "utf8");
    } catch {
      raw = "";
    }
  }
  return (raw || "")
    .split(/[\n,]/)
    .map((line) => line.trim().split(/\s+/)[0].toLowerCase())
    .filter(Boolean);
}

const NEEDLES = loadAnswerNeedles();

const SHIPPED = [
  "/index.html",
  "/styles.css",
  "/js/main.js",
  "/js/crypto.js",
  "/js/registry.js",
  "/js/secrets/gate.js",
  "/js/secrets/hotspots.js",
  "/js/secrets/idle-watcher.js",
  "/js/secrets/motion-glitch.js",
  "/js/secrets/ambient-glitch.js",
  "/js/secrets/memory.js",
  "/js/secrets/konami.js",
  "/root/index.html",
  "/root/styles.css",
  "/root/js/main.js",
  "/root/js/matrix.js",
  "/root/check-in.json",
];

test.describe("comeandget.us", () => {
  test("the door loads without errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.goto("/?wake=0");
    await expect(page).toHaveTitle("comeandget.us");
    await expect(page.locator("#sigil")).toHaveAttribute("data-sigil", "IFBAQTBBZXHEENZRGHYEGTSZYUNAUBZTMN");

    expect(errors, `unexpected console/page errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("the feign: the page stays inert until it wakes", async ({ page }) => {
    await page.goto("/"); // default 60s feign — do not wait it out
    await expect(page.locator("body")).toHaveClass(/dormant/);
    await page.keyboard.type("MOTHMAN"); // must not respond while dormant
    await expect(page.locator("#sigil")).not.toHaveClass(/opened/);
    await expect(page.locator("#door")).toHaveCount(0);
  });

  test("a hidden being reveals on contact", async ({ page }) => {
    await page.goto("/?wake=0");
    await page.locator(".hot1").dispatchEvent("pointerenter");
    await expect(page.locator("#reveal")).toContainText("Manananggal");
    await expect(page.locator("#reveal")).toContainText("1 / 7");
  });

  test("the true key unseals the sigil and opens the mailbox", async ({ page }) => {
    await page.goto("/?wake=0");

    // a wrong word must NOT open it
    await page.keyboard.type("WENDIGO");
    await expect(page.locator("#sigil")).not.toHaveClass(/opened/);

    // the real key, derived from the seven beings' acrostic
    await page.keyboard.type("MOTHMAN");

    const door = page.locator("#door");
    await expect(door).toBeVisible();
    await expect(door).toHaveAttribute("href", "mailto:please@comeandget.us");
    await expect(page.locator("#reveal")).toContainText("WRITETOPLEASEANDNAMETHEGRINNINGMAN");
    await expect(page.locator("#sigil")).toHaveClass(/opened/);
  });

  test("no puzzle answer appears in any shipped file or the DOM", async ({ page }) => {
    test.skip(!NEEDLES.length, "set PUZZLE_ANSWER or secret/answer.txt to enable the leak guard");

    await page.goto("/?wake=0");
    await page.keyboard.type("MOTHMAN"); // fully solved state — still must not contain any answer
    await expect(page.locator("#door")).toBeVisible();
    const dom = (await page.content()).toLowerCase();
    for (const n of NEEDLES) expect(dom, `DOM leaks "${n}"`).not.toContain(n);

    for (const f of SHIPPED) {
      const res = await page.request.get(f);
      expect(res.ok(), `${f} should be served`).toBeTruthy();
      const text = (await res.text()).toLowerCase();
      for (const n of NEEDLES) expect(text, `${f} leaks "${n}"`).not.toContain(n);
    }
  });

  // --- ARG 2: the tech rabbit hole ---

  test("the white rabbit leads to /root", async ({ page }) => {
    await page.goto("/?wake=0");
    const rabbit = page.locator("#rabbit");
    await expect(rabbit).toHaveAttribute("href", "root/");
    await expect(rabbit).toBeVisible();
  });

  test("the rabbit hole boots and the agent checks in with a decodable token", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/root/");
    await expect(page).toHaveTitle(/root@comeandget/);
    await expect(page.locator("#rain")).toBeVisible();
    await expect(page.locator("#out")).toContainText("checked in", { timeout: 5000 });

    // the JWT in the agent payload must decode (alg:none) to the krbtgt riddle
    const res = await page.request.get("/root/check-in.json");
    expect(res.ok()).toBeTruthy();
    const token = (await res.json())._token;
    const seg = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(seg, "base64").toString("utf8"));
    expect(payload.riddle.toLowerCase()).toContain("krbtgt");

    expect(errors, `unexpected errors: ${errors.join(" | ")}`).toEqual([]);
  });
});
