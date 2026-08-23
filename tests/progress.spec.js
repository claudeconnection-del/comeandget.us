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

test.describe("the ledger endpoint", () => {
  test("serves an exact, private, cookie-varying summary", async ({ page }) => {
    const res = await page.request.get("/root/progress/data");
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["cache-control"]).toContain("private");
    expect((res.headers()["vary"] || "").toLowerCase()).toContain("cookie");

    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(d.rungs.map((r) => r.key)).toEqual(["g1", "g2", "g3", "g4seal", "g4open"]);
    expect(d.rungs.map((r) => r.label)).toEqual([
      "the wire", "the token", "the shape", "the seal", "the opening",
    ]);
    expect(d.terminal).toEqual({ label: "the reply", count: null });
    expect(typeof d.arrived).toBe("number");
    expect(typeof d.asOf).toBe("number");
  });

  test("a real walk moves the real numbers", async ({ page }) => {
    const before = await (await page.request.get("/root/progress/data")).json();
    await page.request.get("/root/", {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    await page.request.get("/root/check-in.json");
    const after = await (await page.request.get("/root/progress/data")).json();

    expect(after.arrived).toBeGreaterThanOrEqual(before.arrived + 1);
    const wire = (d) => d.rungs.find((r) => r.key === "g1").count;
    expect(wire(after)).toBeGreaterThanOrEqual(wire(before) + 1);
    expect(after.you, "the viewer's own rung comes from their cookie").toBeTruthy();
    expect(after.you.rung).toBe("g1");
  });

  test("counts never go backwards once recorded", async ({ page }) => {
    const a = await (await page.request.get("/root/progress/data")).json();
    const b = await (await page.request.get("/root/progress/data")).json();
    expect(b.arrived).toBeGreaterThanOrEqual(a.arrived);
  });
});
