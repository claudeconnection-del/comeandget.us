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

  test("deriveSigil is stable across repeated collection on the same machine", async ({ page }) => {
    await page.goto("/root/");
    const [a, b] = await page.evaluate(async () => {
      const { collectProbes } = await import("/root/js/mirror/probes.js");
      const { deriveSigil } = await import("/root/js/mirror/sigil.js");
      const s1 = await deriveSigil(await collectProbes());
      const s2 = await deriveSigil(await collectProbes());
      return [s1, s2];
    });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b); // recomputes to the same value — the resilience property
  });

  test("stableMaterial ignores volatile probes (theme/net/clock)", async ({ page }) => {
    await page.goto("/root/");
    const changed = await page.evaluate(async () => {
      const { deriveSigil } = await import("/root/js/mirror/sigil.js");
      const base = { webgl: { value: { renderer: "ANGLE (Direct3D11)" } }, intl: { value: { tz: "UTC" } },
        hardware: { value: { cores: 8 } }, screen: { value: { gamut: "srgb" } },
        emoji: { value: { w: 120 } }, canvas: { value: "abc" }, libm: { value: "def" } };
      const s1 = await deriveSigil(base);
      const s2 = await deriveSigil({ ...base, theme: { value: { scheme: "dark" } }, net: { value: { rtt: 50 } }, clock: { value: { minDeltaMs: 0.1 } } });
      return s1 === s2;
    });
    expect(changed, "volatile probes must not move the sigil").toBeTruthy();
  });

  test("changing a stable field moves the sigil (positive control)", async ({ page }) => {
    await page.goto("/root/");
    const moved = await page.evaluate(async () => {
      const { deriveSigil } = await import("/root/js/mirror/sigil.js");
      const base = { webgl: { value: { renderer: "ANGLE (Direct3D11)" } }, intl: { value: { tz: "UTC" } },
        hardware: { value: { cores: 8 } }, screen: { value: { gamut: "srgb" } },
        emoji: { value: { w: 120 } }, canvas: { value: "abc" }, libm: { value: "def" } };
      const s1 = await deriveSigil(base);
      const s2 = await deriveSigil({ ...base, webgl: { value: { renderer: "ANGLE (Apple M2, Metal)" } } });
      const s3 = await deriveSigil({ ...base, libm: { value: "XYZ" } });
      const s4 = await deriveSigil({ ...base, intl: { value: { tz: "America/New_York" } } });
      return s1 !== s2 && s1 !== s3 && s1 !== s4;
    });
    expect(moved, "a change to any stable field must change the sigil").toBeTruthy();
  });

  test("inferOS reads Windows from a Direct3D WebGL backend", async ({ page }) => {
    await page.goto("/root/");
    const os = await page.evaluate(async () => {
      const { inferOS } = await import("/root/js/mirror/lines.js");
      return inferOS({ webgl: { value: { renderer: "ANGLE (NVIDIA, Direct3D11)" }, osHint: "windows" } });
    });
    expect(os.os).toBe("windows");
    expect(["high", "medium", "low"]).toContain(os.confidence);
  });

  test("dossierLines assembles a non-empty posture block and stays answer-clean", async ({ page }) => {
    await page.goto("/root/");
    const lines = await page.evaluate(async () => {
      const { inferOS, dossierLines } = await import("/root/js/mirror/lines.js");
      const probes = { webgl: { value: { renderer: "ANGLE (Apple M2, Metal)" }, osHint: "macos" },
        intl: { value: { tz: "America/New_York", languages: ["en-US"] } },
        hardware: { value: { cores: 10 } }, screen: { value: { w: 1512, h: 982, dpr: 2 } } };
      return dossierLines({ probes, os: inferOS(probes) });
    });
    expect(Array.isArray(lines)).toBeTruthy();
    expect(lines.length).toBeGreaterThan(3);
    const blob = lines.join("\n").toLowerCase();
    expect(blob).toContain("posture");
    expect(blob).not.toContain("mothman"); // never carries puzzle content
  });
});
