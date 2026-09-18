import test from "node:test";
import assert from "node:assert/strict";
import { readManifest, guard } from "../src/manifest.ts";
import { referenceManifest } from "./helpers.ts";

test("the reference instance's manifest names its units folder and its two releases", () => {
  const m = readManifest(referenceManifest());
  assert.equal(m.units, "meta");
  assert.match(m.tooling!, /^\d+\.\d+\.\d+$/);
  assert.match(m.coreVersion!, /^\d+\.\d+\.\d+$/);
});

test("units defaults to meta, and a missing release is null rather than a guess", () => {
  assert.deepEqual(readManifest("{}"), { tooling: null, coreVersion: null, units: "meta" });
});

test("a core newer than the checker is refused, compared as releases and not as text", () => {
  const g = guard({ tooling: "0.9.0", coreVersion: "0.10.0", units: "meta" }, "0.9.0");
  assert.equal(g.kind, "refuse");
  assert.match((g as { message: string }).message, /0\.10\.0/);
});

test("a tooling pin naming another release is reported and does not refuse", () => {
  const g = guard({ tooling: "0.27.0", coreVersion: "0.27.0", units: "meta" }, "0.28.0");
  assert.equal(g.kind, "report");
});

test("a core behind the checker with a matching pin is fine", () => {
  assert.deepEqual(guard({ tooling: "0.28.0", coreVersion: "0.27.0", units: "meta" }, "0.28.0"), { kind: "ok" });
});
