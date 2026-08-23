import { test, expect } from "@playwright/test";

test.describe("the door counts arrivals", () => {
  test("a browser loading /root is minted a solver cookie", async ({ page }) => {
    const res = await page.request.get("/root/", {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    const setCookie = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
    expect(setCookie.length, "the door should mint the rg cookie").toBeGreaterThan(0);
    expect(setCookie[0].value).toMatch(/rg=[^;]+/);
    expect(setCookie[0].value).toContain("Path=/root");

    // a known solver is not re-minted
    const second = await page.request.get("/root/");
    expect(second.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").length).toBe(0);
  });

  test("a self-declared crawler is not counted at the door", async ({ page }) => {
    const res = await page.request.get("/root/", {
      headers: { "user-agent": "GPTBot/1.0 (+https://openai.com/gptbot)" },
    });
    expect(res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").length).toBe(0);
  });

  test("the door still carries the gauntlet's own breadcrumb header", async ({ page }) => {
    // regression: the arrival branch must not disturb G1
    const res = await page.request.get("/root/");
    expect(res.headers()["x-intune-checkin"]).toBeTruthy();
  });
});
