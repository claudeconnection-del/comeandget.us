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
  "/veil.css",
  "/js/wake.js",
  "/js/glyphs.js",
  "/js/stage.js",
  "/js/whispers/threshold.js",
  "/js/whispers/lures.js",
  "/js/whispers/stillness.js",
  "/js/whispers/tremor.js",
  "/js/whispers/flux.js",
  "/js/whispers/echoes.js",
  "/js/whispers/relic.js",
  "/root/index.html",
  "/root/ember.css",
  "/root/js/agent.js",
  "/root/js/rain.js",
  "/root/js/shell.js",
  "/root/js/arcade.js",
  "/root/js/descent.js",
  "/root/js/serpent.js",
  "/root/js/pong.js",
  "/root/js/breakout.js",
  "/root/js/tetris.js",
  "/root/js/ink.js",
  "/root/js/audio.js",
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
    await expect(page.locator("#term")).toContainText("checked in", { timeout: 5000 });

    // the JWT (alg:none) must decode and point the solver onward to the DNS step
    const res = await page.request.get("/root/check-in.json");
    expect(res.ok()).toBeTruthy();
    const token = (await res.json())._token;
    const seg = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(seg, "base64").toString("utf8"));
    expect(payload.next.toLowerCase()).toContain("_rabbit");

    expect(errors, `unexpected errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("the faux terminal accepts commands", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "cat flag.txt");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("the prize is a reply");
    // and it must not hand out the answer
    await page.fill("#cmd", "help");
    await page.press("#cmd", "Enter");
    expect((await page.locator("#term").innerText()).toLowerCase()).not.toContain("conditional");
  });

  test("the terminal honeypot is explorable and never leaks the answer", async ({ page }) => {
    await page.goto("/root/");
    const type = async (c) => { await page.fill("#cmd", c); await page.press("#cmd", "Enter"); };
    await type("ls -a");
    await type("cd .keys");
    await type("cat skeleton");
    await expect(page.locator("#term")).toContainText("fits every lock");
    for (const c of ["find key", "fortune", "rabbit", "ps", "cat /var/log/auth.log", "dsregcmd", "cowsay hi"]) {
      await type(c);
    }
    const txt = (await page.locator("#term").innerText()).toLowerCase();
    expect(txt).not.toContain("conditional");
    expect(txt).not.toContain("indrid");
  });

  test("theme command recolours the terminal palette", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "theme matrix");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("palette set: matrix");
    const ember = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ember").trim());
    expect(ember.toLowerCase()).toBe("#00ff66");
  });

  test("the unlock ritual completes through its four steps", async ({ page }) => {
    await page.goto("/root/");
    const type = async (c) => { await page.fill("#cmd", c); await page.press("#cmd", "Enter"); };
    await type("ritual");
    for (const w of ["come", "and", "get", "us"]) await type(w);
    await expect(page.locator("#term")).toContainText("you came. you got us");
  });

  test("the arcade starts and quits cleanly", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "galaga");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("SCORE");
    await page.keyboard.press("q");
    await expect(page.locator("#term")).toContainText("score");
    await expect(page.locator("#cmd")).toBeEnabled();
  });

  test("doom raycaster starts and quits cleanly", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "doom");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("E1M1");
    await page.keyboard.press("q");
    await expect(page.locator("#cmd")).toBeEnabled();
  });

  test("snake starts and quits cleanly", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "snake");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("SNAKE");
    await page.keyboard.press("q");
    await expect(page.locator("#cmd")).toBeEnabled();
  });

  test("up/down arrows recall command history", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "whoami");
    await page.press("#cmd", "Enter");
    await page.fill("#cmd", "fortune");
    await page.press("#cmd", "Enter");
    await page.press("#cmd", "ArrowUp");
    await expect(page.locator("#cmd")).toHaveValue("fortune");
    await page.press("#cmd", "ArrowUp");
    await expect(page.locator("#cmd")).toHaveValue("whoami");
    await page.press("#cmd", "ArrowDown");
    await expect(page.locator("#cmd")).toHaveValue("fortune");
    await page.press("#cmd", "ArrowDown");
    await expect(page.locator("#cmd")).toHaveValue("");
  });

  test("games render in colour", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "snake");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("SNAKE");
    expect(await page.locator("#term span[style*='color']").count()).toBeGreaterThan(0);
    await page.keyboard.press("q");
  });

  test("lite mode toggles and persists across reload", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "lite on");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("lite mode on");
    await page.reload();
    await page.waitForTimeout(150);
    await page.fill("#cmd", "lite");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("lite mode off");
  });

  test("games adopt the active theme's colours", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "theme matrix");
    await page.press("#cmd", "Enter");
    await page.fill("#cmd", "galaga");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("SCORE");
    expect(await page.locator('#term span[style*="00ff66"]').count()).toBeGreaterThan(0);
    await page.keyboard.press("q");
  });

  test("the tunnels are an explorable shifting maze", async ({ page }) => {
    await page.goto("/root/");
    const type = async (c) => { await page.fill("#cmd", c); await page.press("#cmd", "Enter"); };
    await type("cd tunnels");
    await type("pwd");
    await expect(page.locator("#term")).toContainText("/root/tunnels");
    await type("ls");
    expect((await page.locator("#term").innerText())).toContain("/");
    await type("cd nope-not-real");
    await expect(page.locator("#term")).toContainText("no such tunnel");
  });

  test("su authenticates a themed password", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "su neo theone");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("authenticated");
    await page.fill("#cmd", "su neo wrong");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("Authentication failure");
  });

  test("sound toggles and persists across reload", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "sound off");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("sound off");
    await page.reload();
    await page.waitForTimeout(150);
    await page.fill("#cmd", "sound");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("sound on");
  });

  test("high scores persist and the scores board lists games", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "snake");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("SNAKE");
    await page.keyboard.press("q");
    await page.fill("#cmd", "scores");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("arcade");
    await expect(page.locator("#term")).toContainText("snake");
    const best = await page.evaluate(() => localStorage.getItem("cg.hs.snake"));
    expect(best).not.toBeNull();
  });

  for (const g of ["pong", "breakout", "tetris"]) {
    test(`${g} starts and quits cleanly`, async ({ page }) => {
      await page.goto("/root/");
      await page.fill("#cmd", g);
      await page.press("#cmd", "Enter");
      await expect(page.locator("#term")).toContainText(g.toUpperCase());
      await page.keyboard.press("q");
      await expect(page.locator("#cmd")).toBeEnabled();
    });
  }

  test("man documents the fun parts and themes persist across reload", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "man doom");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("raycaster");
    await page.fill("#cmd", "theme matrix");
    await page.press("#cmd", "Enter");
    await page.reload();
    await page.waitForTimeout(200);
    const ember = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ember").trim());
    expect(ember.toLowerCase()).toBe("#00ff66");
  });
});
