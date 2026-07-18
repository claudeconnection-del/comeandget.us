import { test, expect } from "@playwright/test";

test.describe("the reflection — client probes", () => {
  test("collectProbes returns normalized shapes and never throws", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/root/");
    const result = await page.evaluate(async () => {
      const { collectProbes } = await import("/root/js/mirror/probes.js");
      return await collectProbes();
    });
    // core probes present in a headless-chromium/desktop context
    for (const k of ["libm", "webgl", "canvas", "screen", "hardware", "intl", "theme", "engine", "clock"]) {
      expect(result[k], `probe ${k} present`).toBeTruthy();
      expect(result[k]).toHaveProperty("value");
    }
    // every present probe has a defined value and, if osHint set, a valid enum
    const OS = new Set(["windows", "macos", "ios", "linux", "android"]);
    for (const [k, entry] of Object.entries(result)) {
      expect(entry.value, `${k}.value defined`).toBeDefined();
      if (entry.osHint !== undefined) expect(OS.has(entry.osHint), `${k}.osHint valid`).toBeTruthy();
    }
    expect(errors, `probe collection threw: ${errors.join(" | ")}`).toEqual([]);
  });
});
