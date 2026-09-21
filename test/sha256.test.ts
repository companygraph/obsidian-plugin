import test from "node:test";
import assert from "node:assert/strict";
import { createHash as nodeHash } from "node:crypto";
import { createHash, sha256Hex } from "../src/sha256.ts";

// Lengths around the 55- and 64-byte block edges, where padding goes wrong, and text that is not
// ASCII, where a hash over characters rather than UTF-8 bytes would.
const TEXTS = ["", "abc", "# Zürich — über\n", "x".repeat(55), "x".repeat(56), "x".repeat(64), "x".repeat(1000)];

test("the hash written here is Node's sha256, byte for byte", () => {
  for (const text of TEXTS) assert.equal(sha256Hex(text), nodeHash("sha256").update(text).digest("hex"), JSON.stringify(text));
});

test("it answers the one call the planner makes, and refuses any other", () => {
  assert.equal(createHash("sha256").update("a").update("bc").digest("hex"), nodeHash("sha256").update("abc").digest("hex"));
  assert.throws(() => createHash("md5"), /sha256/);
  assert.throws(() => createHash("sha256").update("a").digest("base64"), /hex/);
});
