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

test.describe("the board", () => {
  test("renders the ladder, and the reply is never a number", async ({ page }) => {
    await page.goto("/root/progress");
    await expect(page.locator("main")).toHaveAttribute("data-state", /ok|empty/);

    const reply = page.locator('[data-rung="terminal"] .count');
    await expect(reply).toHaveText("?");

    const counts = await page.locator('.rung:not([data-rung="terminal"]) .count').allTextContents();
    expect(counts.length).toBe(5);
    const nums = counts.map((t) => Number(t.replace(/\D/g, "")));
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i], "the ladder must never climb").toBeLessThanOrEqual(nums[i - 1]);
    }
  });

  test("an unreachable ledger shows no numbers at all", async ({ page }) => {
    await page.route("**/root/progress/data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "unavailable" }),
      })
    );
    await page.goto("/root/progress");
    await expect(page.locator("main")).toHaveAttribute("data-state", "unreachable");
    await expect(page.locator(".rung")).toHaveCount(0);
    await expect(page.locator("main")).toContainText("the ledger is unreachable");
    await expect(page.locator("main")).not.toContainText("0");
  });

  test("an empty ledger shows real zeroes and says so", async ({ page }) => {
    await page.route("**/root/progress/data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true, asOf: 1756000000, since: null, arrived: 0, empty: true, truncated: false,
          climbing: 0, pace: null, you: null,
          rungs: [
            { key: "g1", label: "the wire", count: 0 }, { key: "g2", label: "the token", count: 0 },
            { key: "g3", label: "the shape", count: 0 }, { key: "g4seal", label: "the seal", count: 0 },
            { key: "g4open", label: "the opening", count: 0 },
          ],
          terminal: { label: "the reply", count: null },
        }),
      })
    );
    await page.goto("/root/progress");
    await expect(page.locator("main")).toHaveAttribute("data-state", "empty");
    await expect(page.locator("#state")).toContainText("no one");
  });

  test("the board leaks nothing about the chain", async ({ page }) => {
    const { GATE_PATHS, HEADER_HEX } = await import("../functions/root/_gates.js");
    const sources = await Promise.all(
      ["/root/progress", "/root/progress/progress.css", "/root/js/progress.js", "/root/progress/data"]
        .map(async (p) => (await page.request.get(p)).text())
    );
    const haystack = sources.join("\n").toLowerCase();
    for (const p of Object.keys(GATE_PATHS)) {
      if (p === "/root/check-in.json") continue; // already public in the HTML comment
      expect(haystack, `${p} must not appear on the board`).not.toContain(p.toLowerCase());
    }
    expect(haystack).not.toContain(HEADER_HEX.toLowerCase());
    expect(haystack).not.toContain("_rabbit");
    expect(haystack).not.toContain("_shard");
    expect(haystack).not.toContain("please@");
  });

  test("the page is noindex, like the rest of /root", async ({ page }) => {
    const html = await (await page.request.get("/root/progress")).text();
    expect(html).toContain('name="robots"');
    expect(html).toContain("noindex");
  });
});
