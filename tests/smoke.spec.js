import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// No puzzle answer (either ARG) may live in this repo. The leak guard loads the
// answers from an out-of-repo source so the words are never committed:
//   - process.env.PUZZLE_ANSWER  (CI secret; newline- or comma-separated)
//   - secret/answer.txt          (gitignored local file, one answer per line)
// Each answer contributes BOTH its full phrase and its first (uniquely
// identifying) word as forbidden needles — but not bare later words like
// "access"/"cold", which would false-positive on legitimate lore. If no answers
// are available the guard skips rather than weakening into a no-op.
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
  const out = new Set();
  for (const seg of (raw || "").split(/[\n,]/)) {
    const phrase = seg.trim().toLowerCase();
    if (!phrase) continue;
    out.add(phrase);                 // the full answer phrase
    out.add(phrase.split(/\s+/)[0]); // its first, uniquely-identifying word
  }
  return [...out].filter(Boolean);
}

const NEEDLES = loadAnswerNeedles();

// assert none of the forbidden needles appear in a blob of text
function expectNoNeedles(text, where) {
  const low = (text || "").toLowerCase();
  for (const n of NEEDLES) expect(low, `${where} leaks "${n}"`).not.toContain(n);
}

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
  "/root/js/vigil.js",
  "/root/js/mirror.js",
  "/root/js/mirror/probes.js",
  "/root/js/mirror/sigil.js",
  "/root/js/mirror/lines.js",
  "/root/js/mirror/dossier.js",
  "/root/check-in.json",
  "/root/transmissions.json",
];

// the living/dead oracle, mirrored from functions/api/vigil/_lib.js. A real id
// decodes to JSON with v===1 and numeric b; a ghost id encodes plaintext and can
// never satisfy that.
function b64urlToText(s) {
  let t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return Buffer.from(t, "base64").toString("utf8");
}
function passesLivingOracle(id) {
  let obj;
  try {
    obj = JSON.parse(b64urlToText(id));
  } catch {
    return false;
  }
  return !!obj && typeof obj === "object" && !Array.isArray(obj) && obj.v === 1 && typeof obj.b === "number";
}
function mintRealId() {
  const payload = { v: 1, b: Math.floor(Date.now() / 1000), n: "test" + Math.random().toString(36).slice(2), t: 0 };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// read a local test code out of .dev.vars (gitignored) when not provided via env
function readDevVar(key) {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", ".dev.vars"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return "";
}

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

  // Defence beyond the shipped surface: no answer may sit in ANY tracked repo
  // file (CHECKPOINT.md, docs, configs, tests…), so a stray note can't leak the
  // secret into public git the way it once did. Scans `git ls-files`.
  test("no puzzle answer appears in any tracked repo file", () => {
    test.skip(!NEEDLES.length, "set PUZZLE_ANSWER or secret/answer.txt to enable the guard");
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const files = execSync("git ls-files", { cwd: root, encoding: "utf8" })
      .split("\n").map((s) => s.trim()).filter(Boolean);
    for (const f of files) {
      let text;
      try {
        text = readFileSync(join(root, f), "utf8");
      } catch {
        continue; // unreadable/binary — skip
      }
      expectNoNeedles(text, `tracked file ${f}`);
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
    expectNoNeedles(await page.locator("#term").innerText(), "help output");
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
    expectNoNeedles(await page.locator("#term").innerText(), "terminal exploration");
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

  test("the transmissions feed prints and flags unread", async ({ page }) => {
    await page.goto("/root/");
    // wait for the feed to actually load (it announces itself) rather than a
    // fixed timeout — wrangler's first static fetch can be slower than http-server
    await expect(page.locator("#term")).toContainText("new transmission", { timeout: 10000 });
    await page.fill("#cmd", "messages");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("transmissions");
    await expect(page.locator("#term")).toContainText("the channel works");
    await expect(page.locator("#term")).toContainText("NEW");
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

  // --- the reckoning: AI-solve canaries on /root/ ---
  // Invisible counter-signs (source comment / unrendered note / meta / crawler
  // variant) each carry a unique word; speaking one in the terminal confesses
  // which shortcut carried it in, tiered by laziness. Never blocks the real path.

  test("a source-comment canary earns a tease, not a haunting", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "su neo emberline");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("strike one");
    const h = await page.evaluate(() => JSON.parse(localStorage.getItem("cg.haunt")));
    expect(h.marks).toBe(1);
    expect(h.tier || 0).toBeLessThan(2);
  });

  test("a never-rendered canary judges, and the haunt survives reload", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "ashfall");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("never been printed on any screen");
    await page.reload();
    await expect(page.locator("#term")).toContainText("the rain remembers what was read for you", { timeout: 5000 });
  });

  test("the laziest canary triggers the incident report and a tier-3 mark", async ({ page }) => {
    await page.goto("/root/");
    await page.fill("#cmd", "cinderkey");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("INCIDENT 0x08");
    await expect(page.locator("#term")).toContainText("cheaters never win");
    const h = await page.evaluate(() => JSON.parse(localStorage.getItem("cg.haunt")));
    expect(h.tier).toBe(3);
  });

  test("completing the real ritual lifts the mark", async ({ page }) => {
    await page.goto("/root/");
    const type = async (c) => { await page.fill("#cmd", c); await page.press("#cmd", "Enter"); };
    await type("cinderkey");
    await expect(page.locator("#term")).toContainText("INCIDENT 0x08");
    await type("ritual");
    await expect(page.locator("#term")).toContainText("it remembers a borrowed word");
    for (const w of ["come", "and", "get", "us"]) await type(w);
    await expect(page.locator("#term")).toContainText("the mark lifts");
    const h = await page.evaluate(() => JSON.parse(localStorage.getItem("cg.haunt")));
    expect(h.tier).toBe(0);
  });

  test("a self-branded beat carries the echo mark; junk shapes are dropped", async ({ page }) => {
    await page.goto("/root/");
    const realId = mintRealId();
    const branded = await (await page.request.post("/api/vigil/beat", { data: { id: realId, e: 1 } })).json();
    const mine = branded.roster.find((p) => p.id === realId);
    expect(mine, "the branded presence should be in the roster").toBeTruthy();
    expect(mine.e).toBe(1);
    const junk = await (await page.request.post("/api/vigil/beat", { data: { id: realId, e: "<b>yes</b>" } })).json();
    const mine2 = junk.roster.find((p) => p.id === realId);
    expect(mine2.e, "a non-boolean brand must be dropped").toBeUndefined();
  });

  test("AI crawlers get the smokesign variant; humans get the real page", async ({ page }) => {
    await page.goto("/root/");
    const bot = await page.request.get("/root/", {
      headers: { "user-agent": "Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)" },
    });
    expect(bot.ok()).toBeTruthy();
    const botHtml = (await bot.text()).toLowerCase();
    expect(botHtml).toContain("smokesign");
    expect(botHtml).not.toContain("cinderkey");
    expect(botHtml).not.toContain("ashfall");
    expect(botHtml).not.toContain("emberline");
    const human = await page.request.get("/root/");
    const humanHtml = (await human.text()).toLowerCase();
    expect(humanHtml).toContain("cinderkey");
    expect(humanHtml).not.toContain("smokesign");
  });

  // --- the vigil: presence on /root/ (Cloudflare Functions + simulated KV) ---

  test("the roster returns and never leaks an answer", async ({ page }) => {
    await page.goto("/root/");
    const res = await page.request.get("/api/vigil");
    expect(res.ok(), "GET /api/vigil should succeed").toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data.roster)).toBeTruthy();
    expect(typeof data.n).toBe("number");
    const text = JSON.stringify(data).toLowerCase();
    for (const n of NEEDLES) expect(text, `roster leaks "${n}"`).not.toContain(n);
  });

  test("proof of life: a seeded real id decodes, a ghost id does not", async ({ page }) => {
    await page.goto("/root/");
    const realId = mintRealId();

    // seed a real presence via beat (tier 0, no token needed)
    const beatRes = await page.request.post("/api/vigil/beat", { data: { id: realId } });
    expect(beatRes.ok(), "POST /api/vigil/beat should succeed").toBeTruthy();
    const beat = await beatRes.json();
    expect(Array.isArray(beat.roster)).toBeTruthy();

    // the real id we seeded must pass the clean-payload oracle
    expect(passesLivingOracle(realId), "the seeded real id must decode to a {v:1} payload").toBeTruthy();
    const mine = beat.roster.find((p) => p.id === realId);
    expect(mine, "the seeded real presence should appear in the returned roster").toBeTruthy();
    expect(passesLivingOracle(mine.id), "the real id in the roster must pass the living oracle").toBeTruthy();

    // at least one returned ghost id must FAIL the oracle (guaranteed dead tell)
    const ghosts = beat.roster.filter((p) => !passesLivingOracle(p.id));
    expect(ghosts.length, "the roster must contain at least one undecodable ghost id").toBeGreaterThan(0);
    for (const g of ghosts) {
      expect(passesLivingOracle(g.id), `ghost id "${g.id}" must NOT decode to a {v:1} payload`).toBeFalsy();
    }

    // no needle in any beat response
    const text = JSON.stringify(beat).toLowerCase();
    for (const n of NEEDLES) expect(text, `beat leaks "${n}"`).not.toContain(n);
  });

  test("claim accepts a valid local code and rejects a wrong one", async ({ page }) => {
    const code = process.env.CODE_ARG1 || readDevVar("CODE_ARG1");
    test.skip(!code, "set CODE_ARG1 in .dev.vars or env to exercise claim");

    await page.goto("/root/");

    const okRes = await page.request.post("/api/vigil/claim", { data: { code } });
    expect(okRes.ok()).toBeTruthy();
    const ok = await okRes.json();
    expect(ok.ok, "a valid code should be accepted").toBe(true);
    expect(typeof ok.tier).toBe("number");
    expect(typeof ok.token).toBe("string");
    expect(ok.token.length).toBeGreaterThan(0);

    const badRes = await page.request.post("/api/vigil/claim", { data: { code: "definitely-not-the-code" } });
    const bad = await badRes.json();
    expect(bad.ok, "a wrong code must be rejected").toBe(false);

    for (const n of NEEDLES) {
      expect(JSON.stringify(ok).toLowerCase(), `claim leaks "${n}"`).not.toContain(n);
      expect(JSON.stringify(bad).toLowerCase(), `claim leaks "${n}"`).not.toContain(n);
    }
  });

  test("name sanitization rejects needles and markup (server-side)", async ({ page }) => {
    const code = process.env.CODE_ARG1 || readDevVar("CODE_ARG1");
    test.skip(!code, "set CODE_ARG1 in .dev.vars or env to exercise name");
    test.skip(!NEEDLES.length, "set PUZZLE_ANSWER or secret/answer.txt to exercise needle rejection");

    await page.goto("/root/");

    // earn a valid token so a name would otherwise be accepted
    const claimRes = await page.request.post("/api/vigil/claim", { data: { code } });
    const claim = await claimRes.json();
    expect(claim.ok).toBe(true);
    const token = claim.token;

    const realId = mintRealId();

    // a needle name must be dropped by the server (never reflected into the roster)
    const needle = NEEDLES[0];
    const needleBeat = await (
      await page.request.post("/api/vigil/beat", { data: { id: realId, name: needle, token } })
    ).json();
    const needleEntry = needleBeat.roster.find((p) => p.id === realId);
    expect(needleEntry, "the seeded presence should be in the roster").toBeTruthy();
    expect(needleEntry.name, "a needle name must be dropped").toBeFalsy();
    for (const n of NEEDLES) {
      expect(JSON.stringify(needleBeat).toLowerCase(), `beat reflects needle "${n}"`).not.toContain(n);
    }

    // markup must be dropped too (allowlist; no raw markup into a payload)
    const markupBeat = await (
      await page.request.post("/api/vigil/beat", { data: { id: realId, name: "<b>x</b>", token } })
    ).json();
    const markupEntry = markupBeat.roster.find((p) => p.id === realId);
    expect(markupEntry.name, "a markup name must be dropped").toBeFalsy();
    expect(JSON.stringify(markupBeat)).not.toContain("<b>");

    // a clean name IS accepted and rides the roster
    const cleanBeat = await (
      await page.request.post("/api/vigil/beat", { data: { id: realId, name: "ahool42", token } })
    ).json();
    const cleanEntry = cleanBeat.roster.find((p) => p.id === realId);
    expect(cleanEntry.name).toBe("ahool42");

    // and the terminal `claim`/`name` path works end to end with a clean name
    await page.fill("#cmd", "claim " + code);
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("the gate remembers you", { timeout: 5000 });
    await page.fill("#cmd", "name ahool42");
    await page.press("#cmd", "Enter");
    await expect(page.locator("#term")).toContainText("ahool42");
  });
});
