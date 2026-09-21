// R9's image in the plugin's pure parts: the map the checks take, where a failure about a
// picture lands, and what the editor draws. The reader that fills the map from a vault and the
// drawing itself face Obsidian and are held in e2e/picture.e2e.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { EXAMPLE, example, whole } from "./helpers.ts";
import { buildModel, textOf } from "../src/model.ts";
import { locate } from "../src/locate.ts";

const AGENT = "example/model/profiles/ai-agent/ai-agent.md";
const PICTURE = "example/model/profiles/ai-agent/ai-agent.png";

test("the example passes with its picture as bytes, and fails by name with the picture as text", () => {
  assert.deepEqual(buildModel(whole(example()), EXAMPLE).failures, []);
  const asText = new Map<string, string | Uint8Array>(whole(example())).set(PICTURE, "");
  const failures = buildModel(asText, EXAMPLE).failures;
  assert.deepEqual(failures, [`${PICTURE}: was read as text, not bytes — a reader reads what IMAGE_FILE matches as bytes (R9)`]);
});

test("textOf keeps every note and drops the pictures", () => {
  const files = whole(example());
  const text = textOf(files);
  assert.ok(files.has(PICTURE) && !text.has(PICTURE));
  assert.equal(text.get(AGENT), example().get(AGENT));
  assert.equal(text.size, example().size);
});

test("a failure that leads with a picture lands on the picture, at no line, and does not throw", () => {
  const files = whole(example());
  const failure = `${PICTURE}: is 800×600; an image is square (R9)`;
  assert.deepEqual(locate(failure, files), { path: PICTURE, line: 0, message: "is 800×600; an image is square (R9)" });
});

test("a failure about the field lands on the field's line in the note", () => {
  const files = whole(example());
  const failure = `${AGENT}: \`image\` is "../x.png"; an image is a file in the page's own folder, named without a path (R9)`;
  const at = locate(failure, files);
  assert.equal(at.path, AGENT);
  assert.equal((files.get(AGENT) as string).split("\n")[at.line], "image: ai-agent.png");
});
