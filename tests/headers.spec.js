import { test, expect } from "@playwright/test";

// Pages applies site/_headers to static assets only — never to a Function's
// response — so the API routes have to carry their own header set. These tests
// pin both halves: the static routes keep (and gain HSTS on) theirs, and every
// Function route ships a set of its own.

const STATIC = ["/", "/root/", "/root/js/shell.js"];
const FUNCTION_GETS = ["/api/vigil", "/api/mirror/echo", "/root/progress/data"];

const hsts = (h) => expect(h["strict-transport-security"], "HSTS").toMatch(/max-age=\d{6,}/);

function expectFunctionSet(h, where) {
  expect(h["x-content-type-options"], `${where} nosniff`).toBe("nosniff");
  expect(h["content-security-policy"], `${where} csp`).toContain("default-src 'none'");
  expect(h["content-security-policy"], `${where} csp`).toContain("frame-ancestors 'none'");
  expect(h["referrer-policy"], `${where} referrer`).toBe("no-referrer");
  expect(h["cache-control"], `${where} must say how it may be cached`).toBeTruthy();
  hsts(h);
}

test.describe("security headers", () => {
  for (const p of STATIC) {
    test(`${p} pins HTTPS with HSTS`, async ({ request }) => {
      hsts((await request.get(p)).headers());
    });
  }

  for (const p of FUNCTION_GETS) {
    test(`${p} carries the function-route header set`, async ({ request }) => {
      expectFunctionSet((await request.get(p)).headers(), p);
    });
  }

  test("the POST routes carry the set too, on success and on rejection", async ({ request }) => {
    const rejected = await request.post("/api/vigil/beat", { data: { id: "not-a-real-id" } });
    expect(rejected.status()).toBe(400);
    expectFunctionSet(rejected.headers(), "beat 400");
    const claim = await request.post("/api/vigil/claim", { data: { code: "definitely-not-the-code" } });
    expectFunctionSet(claim.headers(), "claim");
    const mirror = await request.post("/api/mirror", { data: {} });
    expectFunctionSet(mirror.headers(), "mirror");
  });

  test("the roster is never cached; the ledger keeps its private policy", async ({ request }) => {
    expect((await request.get("/api/vigil")).headers()["cache-control"]).toContain("no-store");
    expect((await request.get("/root/progress/data")).headers()["cache-control"]).toContain("private");
    // the echo leg's whole trick is no-cache (store, always revalidate) — it must survive
    expect((await request.get("/api/mirror/echo")).headers()["cache-control"]).toBe("no-cache");
  });
});
