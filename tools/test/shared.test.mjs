import { test } from "node:test";
import assert from "node:assert/strict";
import {
  secretEquals,
  timingSafeEqual,
  b64urlEncode,
  b64urlDecode,
  hmacB64url,
  readCookie,
  withSecurityHeaders,
} from "../../functions/_shared.js";

// secretEquals is the claim compare: a shared code against an env secret. It
// hashes both sides first so the compare is always over two 64-char digests —
// a wrong-length guess costs exactly what a right-length one does.
test("secretEquals accepts only the exact secret", async () => {
  assert.equal(await secretEquals("open-sesame", "open-sesame"), true);
  assert.equal(await secretEquals("open-sesame", "open-sesamE"), false);
  assert.equal(await secretEquals("open-sesame", "open-sesame "), false);
  assert.equal(await secretEquals("open", "open-sesame"), false);
});

test("secretEquals never matches an empty or non-string side", async () => {
  assert.equal(await secretEquals("", ""), false);
  assert.equal(await secretEquals("x", ""), false);
  assert.equal(await secretEquals("", "x"), false);
  assert.equal(await secretEquals(null, "x"), false);
  assert.equal(await secretEquals("x", undefined), false);
  assert.equal(await secretEquals(42, "42"), false);
});

test("timingSafeEqual compares strings only, equal length only", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "abcd"), false);
  assert.equal(timingSafeEqual("abc", 1), false);
});

test("base64url round-trips UTF-8 and never emits padding or +/", () => {
  const s = "ghost~línea ✦ {\"v\":1}";
  const enc = b64urlEncode(s);
  assert.doesNotMatch(enc, /[+/=]/);
  assert.equal(b64urlDecode(enc), s);
});

test("hmacB64url is deterministic per key and differs across keys", async () => {
  const a = await hmacB64url("k1", "msg");
  assert.equal(a, await hmacB64url("k1", "msg"));
  assert.notEqual(a, await hmacB64url("k2", "msg"));
  assert.doesNotMatch(a, /[+/=]/);
});

test("readCookie picks one cookie out of the jar, or null", () => {
  const req = { headers: { get: (k) => (k.toLowerCase() === "cookie" ? "a=1; rg=abc.def; fpc=zzz" : null) } };
  assert.equal(readCookie(req, "rg"), "abc.def");
  assert.equal(readCookie(req, "fpc"), "zzz");
  assert.equal(readCookie(req, "nope"), null);
  assert.equal(readCookie({ headers: { get: () => null } }, "rg"), null);
});

test("withSecurityHeaders lets a route override by any name case", () => {
  const h = withSecurityHeaders({ "Cache-Control": "no-cache" });
  assert.equal(h["cache-control"], "no-cache");
  assert.equal(Object.keys(h).filter((k) => k.toLowerCase() === "cache-control").length, 1);
  assert.equal(h["x-content-type-options"], "nosniff");
});
