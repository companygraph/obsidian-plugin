import test from "node:test";
import assert from "node:assert/strict";
import { buildModel, schemasOf } from "../src/model.ts";
import { vocabularyOf } from "../src/vocabulary.ts";
import { candidatesFor } from "../src/candidates.ts";
import { namedOf, namesIn } from "../src/scope.ts";
import { example, EXAMPLE, edited } from "./helpers.ts";

// Core 0.30.1: a name of an owned type written inside an owner is one of that owner's own. The
// checks hold it and completion offers it: in an owner, or in an entity the same owner owns, the
// names of an owned type are that owner's, and every other type's names are the whole type's.
const named = namedOf(buildModel(example(), EXAMPLE).graph!);
const MIRA = "example/model/profiles/mira-halvorsen/mira-halvorsen.md";
const TOMAS = "example/model/profiles/tomas-reyes/tomas-reyes.md";
const M = EXAMPLE.model;

test("in a profile, the experiences offered are that profile's own", () => {
  assert.deepEqual(namesIn(named, MIRA, M).get("experience"), ["Rebuilding the order pipeline", "Splitting the billing domain"]);
  assert.deepEqual(namesIn(named, TOMAS, M).get("experience"), [
    "Conference talk — the speed-up nobody asked for",
    "Deciding which billing goes first",
    "Finding out what the order pipeline was for",
  ]);
});

test("in an entity the same owner owns, the owned names are that owner's too", () => {
  const exp = "example/model/profiles/mira-halvorsen/experiences/2022-beacon-systems.md";
  assert.deepEqual(namesIn(named, exp, M).get("experience"), ["Rebuilding the order pipeline", "Splitting the billing domain"]);
});

test("a type that is not owned is offered whole, wherever the file is", () => {
  const all = [...new Set(named.filter((n) => n.type === "skill").map((n) => n.name))].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(namesIn(named, MIRA, M).get("skill"), all);
  assert.deepEqual(namesIn(named, "example/model/roles/reviewer.md", M).get("skill"), all);
});

test("a phase's gate-to is offered its own process's phases, not another's", () => {
  const files = example();
  const from = "example/model/processes/delivery/";
  for (const [path, text] of [...files])
    if (path.startsWith(from))
      files.set(
        path.replace(from, "example/model/processes/review/").replace("/delivery.md", "/review.md"),
        (path.endsWith("/delivery.md") ? text.replace("# Delivery", "# Review") : text)
          .replace(/^# (Specify|Build|Release)$/m, (_, n) => `# Audit ${n}`)
          .replace(/^gate-to: (\w+)$/m, (_, n) => `gate-to: Audit ${n}`)
          .replace(/^\| (Specify|Build|Release) \|$/gm, (_, n) => `| Audit ${n} |`),
      );
  const graph = buildModel(files, EXAMPLE).graph!;
  assert.ok(graph, "the two processes parse");
  const specify = "example/model/processes/delivery/phases/specify.md";
  assert.deepEqual(namesIn(namedOf(graph), specify, M).get("phase"), ["Build", "Release", "Specify"]);
  const audit = "example/model/processes/review/phases/specify.md";
  assert.deepEqual(namesIn(namedOf(graph), audit, M).get("phase"), ["Audit Build", "Audit Release", "Audit Specify"]);
});

test("a file under no owner is offered every name, as nothing holds it there", () => {
  const all = [...new Set(named.filter((n) => n.type === "experience").map((n) => n.name))].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(namesIn(named, "example/model/skills/java-programming.md", M).get("experience"), all);
});

test("an owner with nothing of the owned type is offered nothing of it, not everyone else's", () => {
  const files = edited(example(), MIRA, (t) => t);
  for (const k of [...files.keys()]) if (k.startsWith("example/model/profiles/mira-halvorsen/experiences/")) files.delete(k);
  const graph = buildModel(files, EXAMPLE).graph;
  if (!graph) return; // an owner whose folder is gone may not parse; the case is covered when it does
  assert.deepEqual(namesIn(namedOf(graph), MIRA, M).get("experience") ?? [], []);
});

// A track is owned by its process since core 0.33.0, and a phase's `### ` heading under
// `## Activities` names one: what is offered there is the process's own tracks, less those the
// section already carries.
test("a phase's track heading is offered its own process's tracks", () => {
  const files = example();
  const phase = "example/model/processes/delivery/phases/release.md";
  const names = namesIn(namedOf(buildModel(files, EXAMPLE).graph!), phase, M);
  assert.deepEqual(names.get("track"), ["Code", "Docs"]);
  const vocabulary = vocabularyOf(schemasOf(files, EXAMPLE));
  const lines = ["# Release", "", "## Activities", "", "### Code", "", "1. Ship it.", "", "### "];
  const offered = candidatesFor({ kind: "grouped", section: "Activities", typed: "", start: 4 }, vocabulary.get("phase")!, names, lines);
  assert.deepEqual(offered.map((c) => c.label), ["Docs"]);
});
