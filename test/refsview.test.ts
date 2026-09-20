import test from "node:test";
import assert from "node:assert/strict";
import { readable, viewOf } from "../src/refsview.ts";
import type { References } from "../src/refs.ts";

const refs: References = {
  in: [
    {
      path: "model/roles/backend-engineer.md",
      mentions: [{ path: "model/roles/backend-engineer.md", line: 4, name: "Java Programming", declared: "requires", target: "model/skills/java-programming.md" }],
    },
    {
      path: "model/profiles/mira-halvorsen/mira-halvorsen.md",
      mentions: [
        { path: "model/profiles/mira-halvorsen/mira-halvorsen.md", line: 9, name: "Java Programming", declared: "## Skills · Skill", target: "model/skills/java-programming.md" },
        { path: "model/profiles/mira-halvorsen/mira-halvorsen.md", line: 2, name: "Java Programming", declared: "## Evidence · Skill", target: "model/skills/java-programming.md" },
      ],
    },
  ],
  out: [],
};

test("a direction's title carries the total across every group, not the group count", () => {
  const view = viewOf(refs);
  assert.equal(view.in.title, "Referred to by · 3");
  assert.equal(view.out.title, "Refers to · 0");
});

test("a group's file is its basename without .md, with the folder above it kept apart", () => {
  const view = viewOf(refs);
  assert.deepEqual(
    view.in.groups.map((g) => [g.name, g.folder]),
    [
      ["backend-engineer", "model/roles"],
      ["mira-halvorsen", "model/profiles/mira-halvorsen"],
    ],
  );
});

test("a top-level file carries no folder", () => {
  const view = viewOf({ in: [{ path: "README.md", mentions: [] }], out: [] });
  assert.deepEqual(view.in.groups[0], { path: "README.md", name: "README", folder: "", mentions: [] });
});

test("a mention's line is counted from one, and it keeps its name, what declares it and its own file", () => {
  const view = viewOf(refs);
  const role = view.in.groups.find((g) => g.path === "model/roles/backend-engineer.md")!;
  assert.deepEqual(role.mentions, [{ line: 5, name: "Java Programming", declared: "requires", path: "model/roles/backend-engineer.md", at: 4 }]);
});

test("a group's mentions are drawn in the order refs.ts already put them in, not re-sorted here", () => {
  const view = viewOf(refs);
  const mira = view.in.groups.find((g) => g.path.endsWith("mira-halvorsen.md"))!;
  // The schema spells a section with hashes; a list of references does not.
  assert.deepEqual(mira.mentions.map((m) => m.declared), ["Skills · Skill", "Evidence · Skill"]);
});

test("no group and no mention gives an empty direction, its count zero", () => {
  const view = viewOf({ in: [], out: [] });
  assert.deepEqual(view, { in: { title: "Referred to by · 0", groups: [] }, out: { title: "Refers to · 0", groups: [] } });
});

// The owner's trial: a row under "Refers to" opened the note it was already in. A name written
// here leads to the entity it names, whose file the group is, and carries no line of its own,
// since its line is in the note the reader is looking at.
test("a row that refers out opens the entity it names, from its first line, and shows no line", () => {
  const view = viewOf({
    in: [],
    out: [{
      path: "model/skills/java-programming.md",
      mentions: [{ path: "model/roles/backend-engineer.md", line: 4, name: "Java Programming", declared: "requires", target: "model/skills/java-programming.md" }],
    }],
  });
  assert.deepEqual(view.out.groups[0].mentions, [
    { line: null, name: "Java Programming", declared: "requires", path: "model/skills/java-programming.md", at: 0 },
  ]);
  assert.equal(view.out.title, "Refers to · 1");
});

test("what declares a name reads without the hashes a schema writes it with", () => {
  assert.equal(readable("## Evidence · Skill"), "Evidence · Skill");
  assert.equal(readable("### Achievements"), "Achievements");
  assert.equal(readable("requires"), "requires");
});
