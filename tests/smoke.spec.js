import { test, expect } from "@playwright/test";

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
    await expect(page.locator("#sigil")).toHaveAttribute("data-sigil", "ISTUEWRDHHWXENES");

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
    await expect(page.locator("#reveal")).toContainText("WEANSWERTOPLEASE");
    await expect(page.locator("#sigil")).toHaveClass(/opened/);
  });
});
