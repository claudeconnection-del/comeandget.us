import { test } from "node:test";
import assert from "node:assert/strict";
import { hauntTier } from "../../functions/api/vigil/_lib.js";

test("accepts the three real reckoning tiers", () => {
  assert.equal(hauntTier(1), 1);
  assert.equal(hauntTier(2), 2);
  assert.equal(hauntTier(3), 3);
});

test("drops junk, out-of-range, and hostile shapes to 0", () => {
  for (const v of [0, 4, -1, 1.5, "3", "<b>3</b>", null, undefined, {}, [3], NaN, Infinity]) {
    assert.equal(hauntTier(v), 0, `hauntTier(${JSON.stringify(v)}) should be 0`);
  }
});
