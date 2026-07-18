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

  test("dossierLines never throws on null / empty / partial input", async ({ page }) => {
    await page.goto("/root/");
    const ok = await page.evaluate(async () => {
      const { dossierLines } = await import("/root/js/mirror/lines.js");
      for (const arg of [null, undefined, {}, { probes: null }, { probes: { screen: { value: {} } } }]) {
        const out = dossierLines(arg);
        if (!Array.isArray(out) || out.length < 1) return false;
        if (out.join("\n").includes("undefined")) return false; // no undefined leaking into copy
      }
      return true;
    });
    expect(ok, "dossierLines must degrade to a clean block on any input").toBeTruthy();
  });

  test("printDossier emits each posture line through println (text only)", async ({ page }) => {
    await page.goto("/root/");
    const emitted = await page.evaluate(async () => {
      const { inferOS } = await import("/root/js/mirror/lines.js");
      const { printDossier } = await import("/root/js/mirror/dossier.js");
      const captured = [];
      const probes = { webgl: { value: { renderer: "ANGLE (Direct3D11)" }, osHint: "windows" }, hardware: { value: { cores: 8 } } };
      printDossier((s) => captured.push(String(s)), { probes, os: inferOS(probes) });
      return captured;
    });
    expect(emitted.length).toBeGreaterThan(3);
    expect(emitted.join("\n")).toContain("DEVICE POSTURE");
  });

  test("?mirror=now surfaces the device-posture dossier in the terminal", async ({ page }) => {
    await page.goto("/root/?mirror=now");
    await expect(page.locator("#term")).toContainText("DEVICE POSTURE", { timeout: 8000 });
  });

  test("dsregcmd /status pulls the real posture; bare dsregcmd keeps the fake", async ({ page }) => {
    await page.goto("/root/?mirror=off"); // keep auto-reveal from racing the assertion
    await page.fill("#cmd", "dsregcmd");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("AzureAdJoined : YES");
    await expect(page.locator("#term")).not.toContainText("DEVICE POSTURE");
    await page.fill("#cmd", "dsregcmd /status");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("DEVICE POSTURE", { timeout: 8000 });
  });

  test("the mirror never touches the puzzle's haunt state", async ({ page }) => {
    await page.goto("/root/?mirror=now");
    await expect(page.locator("#term")).toContainText("DEVICE POSTURE", { timeout: 8000 });
    const haunt = await page.evaluate(() => localStorage.getItem("cg.haunt"));
    expect(haunt, "mirror must not create/modify cg.haunt").toBeNull();
    const seen = await page.evaluate(() => localStorage.getItem("cg.mirror.seen"));
    expect(seen, "mirror owns cg.mirror.seen").not.toBeNull();
  });

  test("the echo channel recognizes a returning browser cookielessly", async ({ page }) => {
    await page.goto("/root/");
    const first = await page.request.get("/api/mirror/echo");
    expect(first.ok()).toBeTruthy();
    expect(first.headers()["x-vigil-seen"]).toBe("0");
    const etag = first.headers()["etag"];
    expect(etag, "echo must issue an ETag").toBeTruthy();
    // hand the token back the way a browser cache would
    const second = await page.request.get("/api/mirror/echo", { headers: { "If-None-Match": etag } });
    expect(second.headers()["x-vigil-seen"]).toBe("1");
    // a forged token is not recognized
    const forged = await page.request.get("/api/mirror/echo", { headers: { "If-None-Match": '"deadbeef.deadbeef"' } });
    expect(forged.headers()["x-vigil-seen"]).toBe("0");
    // a weak ETag (W/"...") — as CDNs emit for compressed responses — is still recognized
    const weak = await page.request.get("/api/mirror/echo", { headers: { "If-None-Match": "W/" + etag } });
    expect(weak.headers()["x-vigil-seen"], "weak ETag must still be recognized").toBe("1");
  });

  test("POST /api/mirror returns a shape, degrades without cf, and remembers on return", async ({ page }) => {
    await page.goto("/root/");
    const sigil = "a".repeat(64);
    const r1 = await page.request.post("/api/mirror", { data: { sigil, os: "windows", tz: "UTC", langs: ["en-US"] } });
    expect(r1.ok(), "must not 500 even with thin cf").toBeTruthy();
    const d1 = await r1.json();
    expect(d1).toHaveProperty("edge");
    expect(d1).toHaveProperty("deltas");
    expect(Array.isArray(d1.deltas)).toBeTruthy();
    expect(d1).toHaveProperty("seen");
    // an fpc cookie is set, wearing its Microsoft costume
    const setCookie = r1.headers()["set-cookie"] || "";
    expect(setCookie.toLowerCase()).toContain("fpc=");
    // second POST with the same sigil is recognized as returning (KV memory)
    const r2 = await page.request.post("/api/mirror", { data: { sigil, os: "windows" } });
    const d2 = await r2.json();
    expect(d2.seen.returning, "same sigil on second call = returning").toBeTruthy();
    expect(d2.seen.count).toBeGreaterThanOrEqual(2);
    // never leaks a puzzle answer
    expect(JSON.stringify(d1).toLowerCase()).not.toContain("mothman");
  });

  test("POST /api/mirror rejects bad json without 500", async ({ page }) => {
    await page.goto("/root/");
    const res = await page.request.post("/api/mirror", { headers: { "content-type": "application/json" }, data: "not json at all" });
    expect(res.status()).toBe(400);
  });

  test("the dossier fuses edge truth and recognizes a return end-to-end", async ({ page }) => {
    // first visit primes server memory for this browser's sigil
    await page.goto("/root/?mirror=now");
    await expect(page.locator("#term")).toContainText("DEVICE POSTURE", { timeout: 8000 });
    // a real edge line only appears when cf/KV are live; locally we at least assert
    // the report renders and the return path is exercised without errors
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.reload();
    await page.goto("/root/?mirror=now");
    await expect(page.locator("#term")).toContainText("DEVICE POSTURE", { timeout: 8000 });
    // returning line surfaces because cg.mirror.seen.count >= 2 now
    await expect(page.locator("#term")).toContainText("again", { timeout: 8000 });
    expect(errors, `reveal path errored: ${errors.join(" | ")}`).toEqual([]);
  });
});
