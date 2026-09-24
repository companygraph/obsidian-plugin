import test from "node:test";
import assert from "node:assert/strict";
import { cliCommand, cliProfile } from "../src/cli.ts";
import type { Profile } from "../src/cli.ts";

// Terminal's own defaults, as its settings hold them, cut to what is read here.
const PROFILES: Record<string, Profile> = {
  darwinExternalDefault: { type: "external", executable: "/System/Applications/Utilities/Terminal.app/Contents/macOS/Terminal", args: ["\"$PWD\""], platforms: { darwin: true } },
  darwinIntegratedDefault: { type: "integrated", executable: "/bin/zsh", args: ["--login"], platforms: { darwin: true }, pythonExecutable: "python3" },
  developerConsole: { type: "developerConsole" },
  linuxIntegratedDefault: { type: "integrated", executable: "/bin/sh", args: [], platforms: { linux: true } },
  win32IntegratedDefault: { type: "integrated", executable: "C:\\Windows\\System32\\cmd.exe", args: [], platforms: { win32: true } },
};

test("the command line is the release the plugin bundles, fetched without a question", () => {
  assert.equal(cliCommand("0.46.1"), "npx --yes github:companygraph/meta-model#v0.46.1");
});

test("on macOS the default integrated shell runs the command line and is a login shell after it", () => {
  const profile = cliProfile(PROFILES, "darwinExternalDefault", "darwin", "0.46.1");
  assert.equal(profile?.executable, "/bin/zsh");
  assert.deepEqual(profile?.args, ["-l", "-i", "-c", "npx --yes github:companygraph/meta-model#v0.46.1; exec '/bin/zsh' -l"]);
  // Everything else is the owner's profile as it stands.
  assert.equal(profile?.pythonExecutable, "python3");
  assert.equal(PROFILES.darwinIntegratedDefault.args?.[0], "--login", "the settings' own profile is not changed");
});

test("the owner's default is taken where it is an integrated shell of this platform", () => {
  const own: Profile = { type: "integrated", executable: "/opt/homebrew/bin/fish", args: [], platforms: { darwin: true } };
  const profile = cliProfile({ ...PROFILES, own }, "own", "darwin", "1.0.0");
  assert.equal(profile?.executable, "/opt/homebrew/bin/fish");
  assert.equal(profile?.args?.at(-1), "npx --yes github:companygraph/meta-model#v1.0.0; exec '/opt/homebrew/bin/fish' -l");
});

test("a shell whose path holds a quote is quoted where it is started again", () => {
  const own: Profile = { type: "integrated", executable: "/Users/o'neil/bin/zsh", platforms: { darwin: true } };
  const profile = cliProfile({ own }, "own", "darwin", "1.0.0");
  assert.equal(profile?.args?.at(-1), "npx --yes github:companygraph/meta-model#v1.0.0; exec '/Users/o'\\''neil/bin/zsh' -l");
});

test("on Windows cmd.exe keeps its window after the command line with /k", () => {
  const profile = cliProfile(PROFILES, null, "win32", "0.46.1");
  assert.deepEqual(profile?.args, ["/k", "npx --yes github:companygraph/meta-model#v0.46.1"]);
});

test("on Windows PowerShell keeps its window after the command line with -NoExit", () => {
  const own: Profile = { type: "integrated", executable: "C:\\Program Files\\PowerShell\\7\\pwsh.exe", platforms: { win32: true } };
  const profile = cliProfile({ own }, "own", "win32", "0.46.1");
  assert.deepEqual(profile?.args, ["-NoExit", "-Command", "npx --yes github:companygraph/meta-model#v0.46.1"]);
});

test("on Linux the integrated default is found by its platform", () => {
  const profile = cliProfile(PROFILES, "developerConsole", "linux", "0.46.1");
  assert.equal(profile?.executable, "/bin/sh");
});

test("with no integrated shell for this platform there is nothing to open", () => {
  assert.equal(cliProfile({ developerConsole: PROFILES.developerConsole }, null, "darwin", "0.46.1"), null);
  assert.equal(cliProfile(PROFILES, null, "freebsd", "0.46.1"), null);
});
