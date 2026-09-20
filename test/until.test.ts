import test from "node:test";
import assert from "node:assert/strict";
import { until } from "../src/until.ts";

// A clock of our own: what was asked to run later, run in order when the test says so.
function clock() {
  const waiting: { run: () => void; ms: number }[] = [];
  return {
    later: (run: () => void, ms: number) => { waiting.push({ run, ms }); },
    waits: () => waiting.map((w) => w.ms),
    tick: () => waiting.shift()?.run(),
    idle: () => waiting.length === 0,
  };
}

// Found in the owner's use: a cell was asked for twice, half a second in all, and a long table is
// drawn later than that on a busy window, so the second try missed too and nothing was opened.
test("a step that is not ready yet is asked again until it is, and not once more", () => {
  const c = clock();
  let asked = 0;
  until(() => ++asked === 4, { every: 100, tries: 10, later: c.later });
  assert.equal(asked, 1);          // asked at once
  while (!c.idle()) c.tick();
  assert.equal(asked, 4);          // and never again once it said yes
  assert.deepEqual(c.waits(), []);
});

test("a step that is never ready is given up on after its tries, and the caller is told", () => {
  const c = clock();
  let asked = 0;
  let gaveUp = 0;
  until(() => { asked++; return false; }, { every: 100, tries: 3, later: c.later, giveUp: () => gaveUp++ });
  while (!c.idle()) c.tick();
  assert.equal(asked, 3);
  assert.equal(gaveUp, 1);
});

test("a step ready at once waits for nothing and gives nothing up", () => {
  const c = clock();
  let gaveUp = 0;
  until(() => true, { every: 100, tries: 3, later: c.later, giveUp: () => gaveUp++ });
  assert.ok(c.idle());
  assert.equal(gaveUp, 0);
});
