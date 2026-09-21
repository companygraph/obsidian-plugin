# The plugin is run in Obsidian — design

> A second suite beside the unit tests: it starts Obsidian on a copy of a pinned instance, works
> the plugin with real clicks and keys, and holds what is on the screen and in the files. It
> exists because the defects that reach the owner live in the one layer the unit suite cannot
> run.

Status: design agreed on 2026-09-20, nothing built. Reads against `2026-09-18-obsidian-plugin-design.md`, whose §6 says the vault-facing layer is proven by hand; this spec replaces that sentence and nothing else in it.

---

## 1. Why

The plugin is split so that what decides anything is pure and tested, and what touches Obsidian is thin and is not. That split holds, and it has a cost the design did not foresee: every defect the owner found in use on September 20, 2026 was in the thin layer, and none could have been caught by a test of a pure function, because each was a fact about Obsidian rather than about the plugin's own reasoning.

Four were found that day, and they are the evidence this spec rests on. A note opened from the references pane did not open the cell its mention names, because handing Obsidian the line puts the note's own cursor inside a drawn table and outside every cell, and Obsidian answers that, at the next transaction from anyone, by moving the focus to the table's last row and writing the table out again in its own padding. The cell was also asked for after a fixed wait, while a long table's widget was measured being drawn anywhere between a quarter of a second and two and a half after the note opened. A name in a cell being edited was drawn as unresolved, because a cell being edited holds its drawn text and its own editor, and its text is the name twice. And Cmd+S in a cell of a long table left the table padded and the file saved that way, by the first defect's trap reached through another door: the form replaces a run of lines whole and carries the note's cursor to the start of a line.

Each was found, traced and proven fixed by running a second Obsidian on a copy of the reference instance and driving it over the DevTools protocol. That was done by hand, as throwaway scripts in a session's scratch folder. **What was learned there is that the thin layer can be run, and a thing that can be run and guards against defects already met belongs in the repository.**

Two rules came out of those four defects and are what the first tests hold. In Live Preview the note's own cursor is never left inside a drawn table and outside a cell; whoever dispatches into a note that holds a table says where the cursor goes. And nothing waits a fixed time for Obsidian to draw something; it asks until the thing is there.

## 2. What it is, and what it is not

It is a suite under `e2e/`, run by `npm run e2e`, that builds the plugin from the working tree, starts Obsidian on a fresh copy of a pinned instance, and runs tests that click, type and read the screen. It uses Node's own test runner and Node's own WebSocket, as the unit suite uses Node's own runner, and adds no dependency.

It is not part of `npm test`. The unit suite answers in seconds and runs in CI on every pull request; this one opens a window, takes the keyboard focus while it runs and answers in minutes. Putting them behind one command would make the fast one slow, and a slow suite is one that stops being run.

It is not yet a check in CI, and §7 says what would have to be known before it is. It needs an installed Obsidian, which a runner does not have, and where there is none the suite says it was skipped and why, and does not fail: a suite that fails for want of an application teaches its readers to ignore a red run.

It does not replace the owner's trial. A test holds what someone thought to assert; whether a ring is strong enough or a list reads well is still a person's judgment at a screen. What it replaces is the owner being the one to find that a click does nothing.

## 3. The driver, and why it is a seam

The target is `wdio-obsidian-service`, an existing WebdriverIO service for testing Obsidian plugins: it downloads Obsidian itself, runs a vault in a sandbox, runs on Linux in GitHub Actions, and runs one suite against several Obsidian releases. That last part is the reason it is the target and not merely an alternative. This plugin leans on names Obsidian does not document, the table widget's `receiveCellFocus`, the tile CodeMirror keeps on a widget's element, the cell being edited under `editMode`, and a run against Obsidian's newest and its beta says that one of them moved before the owner's application updates. It is known here from its documentation only, not from use.

It is not where this starts, because what these tests need from a driver is not known until a few of them exist, and a migration decided before that is decided blind. So the first driver is the one already proven: the DevTools protocol, spoken directly.

**A test never touches the transport.** It is handed one object and asks it for what a person at the screen could do or see: evaluate a function in the page, click an element, press a key with its modifiers, type text, wait for a condition, take a screenshot. Clicks and keys are real input events and not calls to `click()`, because a real click moves the focus and the mousedown comes before the mouseup, and two of the four defects turned on exactly that. The first driver answers that object over the DevTools protocol; a later one answers the same object through WebdriverIO's `browser`. A test that never imported the transport moves without being rewritten, and that is how the target is present in the code from the first commit.

## 4. The vault, and what is kept apart

The tests run on the reference instance at the commit `scripts/fixtures.mjs` already pins and fetches into `test/fixtures/mental-model` for the unit suite. It is an instance in the layout every real one has, it holds the long tables the defects needed, and it does not move when the owner edits the live one: a test that read the live vault would fail on a Tuesday because of an edit made on a Monday.

Each run copies that fixture into a temporary folder, writes a plugin folder into the copy from the working tree's `main.js`, `manifest.json` and `styles.css`, and writes a user-data folder of its own whose `obsidian.json` names the copy as its one open vault. Obsidian is started as a child process with that user-data folder and a debugging port the run found free. The separate user-data folder is what gets past Obsidian's single-instance lock, so the owner's own window and vault are never touched, and the process is ended by its handle when the run ends, never by name.

The notes are restored between tests. Obsidian rewrites a table it finds unpadded the moment a cell in it is edited, so a note one test touched is not the note the next one expects, and a padded copy no longer reproduces the defect a test was written for.

Where Obsidian is installed is read from `OBSIDIAN_BIN`, and defaults to where macOS puts it.

## 5. Waiting

Every test waits on Obsidian drawing something, and the first version of this, done by hand, got it wrong in both directions: a probe read the screen after a fixed second and eight tenths and reported a failure that was only a table still being drawn, and the plugin itself had asked for a cell after fixed waits and missed it.

**A test never sleeps a fixed time to let something happen.** It waits for a condition with a deadline, and a wait that runs out says what it was waiting for, so a red run names the thing that did not appear rather than an assertion three lines later.

One case cannot be a condition: that something does not happen. There a test watches for a stated window and says how long and why, as in “Obsidian writes no table out in the second and a half after the repaint”, where the window is longer than the rebuild's own delay.

A test that fails leaves a screenshot and the page's console errors beside its name, since a failure on a screen nobody was watching is otherwise only a sentence.

## 6. What the first tests hold

The four defects of §1 come first, each as the test that would have caught it: a mention opened from the references pane lands in its own row and its own column, in sight, with the note's text unchanged; a name in a cell being edited keeps its mark and its path, one typed that names nothing reads as unresolved, and one that names another entity resolves to it; the cell that holds the focus carries the ring, and a cell of a selected range does not; and Cmd+S in a cell of a long table leaves the editor and the file in the form, the same cell open, and the file differing from before by the typed line alone. Each of the four was seen to fail on the build it guards against when it was written by hand, and the repository's version of each is held to the same proof once, on the release that had the defect, before it is trusted.

A lesson from the first of them is part of how they assert: a test that compares the text of the focused cell with the name it expects cannot see a wrong row where a column repeats one name. It compares the whole row with the line that was clicked.

Then one test for every command the plugin registers, read from the plugin at run time rather than listed here, so a command added without a test is a failing run and not a gap nobody sees: the entity commands on an entity made for the test, the section and field pickers, the form, the checks, and each pane opened and showing what it should.

Then what is on the screen and in no pure function: a click into an empty cell offers the names its column declares; a failing row carries its tint and says why under the pointer; a declared heading refuses an edit; Cmd+click on a name opens the entity it names; and Obsidian's own panes go off in an instance and come back when the setting is turned off, across a reload.

## 7. What ends the first step, and what the second has to answer

The first step is done when the tests of §6 pass on the owner's machine ten runs in a row. Ten, because a suite that waits on a screen is flaky until shown otherwise, and one green run shows nothing about that.

The second step is a spike, labeled as one: the same driver object answered by `wdio-obsidian-service`, on Linux in GitHub Actions, against Obsidian's newest release and its beta. It has three questions to answer, and its output is those answers, not code that is kept by default. Whether real input events and the table widget behave under a virtual display as they do on a Mac. How long a run takes. And how often a run that should pass does not.

Only with those answers does the owner decide whether the suite becomes a required check. Until then nothing about merging changes, and `test` and `conventions` stay the jobs the ruleset asks for.

## 7a. The second step as it was taken

Measured on 2026-09-21, and it changed the plan of §7. `wdio-obsidian-service` is built on a
package of its own by the same author, `obsidian-launcher`, and that package holds the part this
suite lacked: it downloads any Obsidian release, starts it sandboxed on Windows, Linux and macOS,
and passes arguments through to it, `--remote-debugging-port` among them. What the service adds
beyond that is WebdriverIO, its test runner, Mocha, and Appium for Android.

So the launcher is taken and the framework is not. `E2E_OBSIDIAN_VERSION` names a release, and
the session starts that one through the launcher instead of the application the owner has
installed; without it nothing changes. The driver, the tests, the runner and the coverage report
are untouched, and one dev dependency is added where a framework would have brought a second test
runner and a few dozen packages. A test says `mod` where it meant the command key, so that a
chord is Cmd on a Mac and Ctrl on Linux, as Obsidian's own `Mod` is.

The version matrix is what this was for, and it paid for itself on the day it was built: against
Obsidian 1.5.3, the oldest release the manifest promises, **no note could be opened at all**. The
plugin reads `editorInfoField.editor` to tell a table cell's own small editor from the note's,
and on that release the getter throws while the view is still being built. It is a getter of
Obsidian's, so the optional chaining that reads it does not help; the read is now inside a `try`,
and where it cannot answer the file alone decides, as it did before the field was read.

Obsidian 1.5.0 itself cannot be tested: it was an Insiders build, and downloading one needs an
Obsidian account, the credentials in the environment and two-factor authentication switched off.
The same holds for `latest-beta`, which is why the matrix watches the newest public release and
not the one before it reaches everyone. That is the one benefit of the framework this does not
buy, and it is not the framework's to give either.

A workflow runs the suite on a runner under a virtual screen, by hand and once a week, against
the newest release and the oldest the manifest promises. It is required by no ruleset and named
by no branch rule: what it watches is Obsidian moving, not this repository changing, and a
weekly warning is worth more than a gate. The `test` and `conventions` jobs stay the ones a merge
waits for.

What is still not bought: a phone. The service emulates Android through Appium, this does not,
and the manifest says the plugin is not desktop-only. If that day comes, the driver is the seam
it was built to be, and the framework is what it is for.

## 8. What changes in the repository's own rules

`AGENTS.md` says of the modules that import `obsidian` or `@codemirror/` that nothing here can run them and that they are proven by hand on the reference instance. With this suite that is no longer so, and the sentence becomes the rule that replaces it: a change to one of those modules runs `npm run e2e` before its pull request, and the `Verified:` line says that it ran.

A defect found in Obsidian gets its test here first, seen to fail, as a defect in a pure module gets its unit test first. The by-hand trial stays for what only a person can judge, and the trial checklists under `docs/superpowers/plans/` stay as the record of what was tried by hand and when.

`test/layout.test.ts` is not touched: its rules are about `src/`, and `e2e/` imports from `node:` by necessity, since starting a process and finding a port are not things a phone does.

## 9. Open questions

Whether the suite should also run on the meta-model's worked example, which is small and quick, beside the reference instance, which is what has the long tables. It is left until the first tests exist and their running time is known.

Whether a test may depend on an Obsidian theme. The ring and the name marks are read from computed styles, which a theme decides; the first tests run on Obsidian's default theme in dark and in light and assert that a style is present and drawn from Obsidian's own variables, not what color it is.

What a reload costs. A test of what survives a reload pays for one, and how many of them the suite can afford is a number to measure, not to guess.
