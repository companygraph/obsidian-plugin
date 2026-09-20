import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// What AGENTS.md says about this repository's shape, asserted rather than described. It used to
// say it by naming every module, and that list was wrong within a week of being written: thirteen
// modules named against twenty-three that existed. A rule holds where a list drifts, and a rule a
// test holds cannot drift at all.
const src = path.join(import.meta.dirname, "..", "src");
const tests = path.join(import.meta.dirname);
const modules = fs.readdirSync(src).filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
const textOf = (f: string) => fs.readFileSync(path.join(src, f), "utf8");
// A module is Obsidian-facing when it imports the application or its editor; everything else is
// pure and can be run by a test.
const facesObsidian = (f: string) => /from "obsidian"|from "@codemirror\//.test(textOf(f));

test("no module under src/ imports from node:, because the plugin also runs on a phone", () => {
  const offenders = modules.filter((f) => /from "node:/.test(textOf(f)));
  assert.deepEqual(offenders, [], "a node: import cannot be bundled for a phone");
});

test("every pure module has a test beside it", () => {
  const untested = modules.filter((f) => !facesObsidian(f) && !fs.existsSync(path.join(tests, f.replace(/\.ts$/, ".test.ts"))));
  assert.deepEqual(untested, [], "a module nothing runs is a module nothing checks");
});

test("there are pure modules and Obsidian-facing ones, and the split is readable from the imports", () => {
  const pure = modules.filter((f) => !facesObsidian(f));
  const facing = modules.filter(facesObsidian);
  assert.ok(pure.length > 0 && facing.length > 0);
  // main.ts is the wiring and is Obsidian's; the decision modules it calls are not.
  assert.ok(facesObsidian("main.ts"));
  for (const decision of ["panes.ts", "stored.ts", "names.ts", "refs.ts", "form.ts", "headings.ts"])
    assert.ok(!facesObsidian(decision), `${decision} decides something and must stay runnable by a test`);
});

test("a source file uses only syntax Node's type stripping erases", () => {
  for (const f of modules) {
    const t = textOf(f);
    assert.ok(!/^\s*(export\s+)?enum\s/m.test(t), `${f} declares an enum`);
    assert.ok(!/^\s*(export\s+)?namespace\s/m.test(t), `${f} declares a namespace`);
    // A parameter property, `constructor(private x: T)`, is the other shape that does not erase.
    assert.ok(!/constructor\s*\([^)]*\b(private|public|protected|readonly)\s/s.test(t), `${f} has a parameter property`);
  }
});

test("a relative import names its file with .ts, and a type is imported as a type", () => {
  for (const f of modules) {
    const relative = [...textOf(f).matchAll(/from "(\.[^"]*)"/g)].map((m) => m[1]);
    for (const spec of relative)
      assert.ok(spec.endsWith(".ts") || spec.endsWith(".cjs"), `${f} imports ${spec} without its extension`);
  }
});
