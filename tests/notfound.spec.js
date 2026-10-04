import { test, expect } from "@playwright/test";

// With no 404.html, Pages falls back to serving index.html with a 200 for every
// missing path — typos, dead asset links, GET on the POST-only API routes, all
// invisible. site/404.html switches Pages to real 404s and gives the miss a door
// of its own, in the house style.

const MISSES = ["/definitely-not-here", "/nope.png", "/root/nope", "/api/vigil/beat", "/cafe/nope.txt"];
const HITS = ["/", "/root/", "/cafe/", "/root/progress/"];

test.describe("the custom 404", () => {
  for (const p of MISSES) {
    test(`${p} is a real 404 carrying the themed page`, async ({ request }) => {
      const res = await request.get(p);
      expect(res.status(), `${p} must be a 404, not the front door`).toBe(404);
      expect(res.headers()["content-type"]).toContain("text/html");
      const html = await res.text();
      expect(html).toContain("404");
      expect(html, "the miss points back at the front door").toMatch(/href="\/"/);
      expect(html, "stays out of the index").toContain('name="robots"');
      expect(html).toContain("noindex");
      expect(html, "no scripts needed, so none shipped").not.toContain("<script");
    });
  }

  for (const p of HITS) {
    test(`${p} still answers 200`, async ({ request }) => {
      expect((await request.get(p)).status()).toBe(200);
    });
  }

  test("the 404 page renders dark and legible in a browser", async ({ page }) => {
    const res = await page.goto("/no-such-door");
    expect(res.status()).toBe(404);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    expect(r + g + b, `body background ${bg} should be dark`).toBeLessThan(120);
    await expect(page.locator("main")).toContainText("404");
    await expect(page.locator('a[href="/"]')).toBeVisible();
  });

  test("the 404 page carries the same security headers as the rest of the site", async ({ request }) => {
    const h = (await request.get("/no-such-door")).headers();
    expect(h["content-security-policy"]).toContain("default-src 'self'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["strict-transport-security"]).toMatch(/max-age=\d{6,}/);
  });
});
