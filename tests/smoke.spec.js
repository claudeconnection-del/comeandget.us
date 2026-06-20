import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The final puzzle answer must never live in this repo. The leak guard loads it
// from an out-of-repo source so the word itself is never committed:
//   - process.env.PUZZLE_ANSWER  (set a GitHub Actions secret to enforce in CI)
//   - secret/answer.txt          (gitignored local file)
// If neither exists the guard skips rather than weakening into a no-op.
function loadAnswerNeedle() {
  let raw = process.env.PUZZLE_ANSWER;
  if (!raw) {
    try {
      const here = dirname(fileURLToPath(import.meta.url));
      raw = readFileSync(join(here, "..", "secret", "answer.txt"), "utf8");
    } catch {
      raw = "";
    }
  }
  raw = (raw || "").trim();
  return raw ? raw.split(/\s+/)[0].toLowerCase() : null;
}

const NEEDLE = loadAnswerNeedle();

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
  "/js/secrets/memory.js",
  "/js/secrets/konami.js",
];

test.describe("comeandget.us", () => {
  test("the door loads without errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.goto("/");
    await expect(page).toHaveTitle("comeandget.us");
    await expect(page.locator("#line")).toContainText("you weren't supposed to find this.");
    await expect(page.locator("#sigil")).toHaveAttribute("data-sigil", "IFBAQTBBZXHEENZRGHYEGTSZYUNAUBZTMN");

    expect(errors, `unexpected console/page errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("a hidden being reveals on contact", async ({ page }) => {
    await page.goto("/");
    await page.locator(".hot1").dispatchEvent("pointerenter");
    await expect(page.locator("#reveal")).toContainText("Manananggal");
    await expect(page.locator("#reveal")).toContainText("1 / 7");
  });

  test("the true key unseals the sigil and opens the mailbox", async ({ page }) => {
    await page.goto("/");

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

  test("the final answer never appears in any shipped file or the DOM", async ({ page }) => {
    test.skip(!NEEDLE, "set PUZZLE_ANSWER or secret/answer.txt to enable the leak guard");

    await page.goto("/");
    await page.keyboard.type("MOTHMAN"); // fully solved state — still must not contain the answer
    await expect(page.locator("#door")).toBeVisible();
    expect((await page.content()).toLowerCase(), "DOM leaks the answer").not.toContain(NEEDLE);

    for (const f of SHIPPED) {
      const res = await page.request.get(f);
      expect(res.ok(), `${f} should be served`).toBeTruthy();
      expect((await res.text()).toLowerCase(), `${f} leaks the answer`).not.toContain(NEEDLE);
    }
  });
});
