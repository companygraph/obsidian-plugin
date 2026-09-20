// What a person does with Obsidian's own furniture, for the tests that work the plugin's
// commands: run a command, read a notice, pick from a prompt, press a button of a modal.
import type { Driver } from "./driver.ts";

// A command of the plugin's, by the id it registers. e2e/commands.e2e.ts reads these calls to
// know which commands have a test, so a command is always run through here.
export const command = (ui: Driver, id: string) =>
  ui.evaluate((name: string) => app.commands.executeCommandById(`companygraph:${name}`) as boolean, [id]);

export const waitForNotice = (ui: Driver, pattern: string) =>
  ui.waitFor(`a notice matching ${pattern}`, (source: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(".notice")).map((n) => n.innerText.trim()).find((text) => new RegExp(source).test(text)) ?? null, [pattern]);

// Obsidian's notices fade on their own; a test that reads one after another clears them first.
export const clearNotices = (ui: Driver) => ui.evaluate(() => { document.querySelectorAll(".notice").forEach((n) => n.remove()); });

// The prompt a FuzzySuggestModal shows: its placeholder once it is up, and an item picked by a real click.
export const waitForPrompt = (ui: Driver) =>
  ui.waitFor("a prompt to be open", () => document.querySelector<HTMLInputElement>(".prompt input.prompt-input")?.placeholder || null);
export const promptItems = (ui: Driver) =>
  ui.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".prompt .suggestion-item")).map((el) => el.innerText.trim()));
export const pick = (ui: Driver, starts: string) =>
  ui.click((text: string) => Array.from(document.querySelectorAll<HTMLElement>(".prompt .suggestion-item")).find((el) => el.innerText.trim().startsWith(text)), [starts]);

export const waitForModal = (ui: Driver, title: string) =>
  ui.waitFor(`a modal titled ${title}`, (want: string) => (document.querySelector<HTMLElement>(".modal .modal-title")?.innerText.trim() === want ? want : null), [title]);
export const modalText = (ui: Driver) => ui.evaluate(() => document.querySelector<HTMLElement>(".modal .modal-content")?.innerText ?? "");
export const pressButton = (ui: Driver, label: string) =>
  ui.click((text: string) => Array.from(document.querySelectorAll<HTMLElement>(".modal button")).find((b) => b.innerText.trim() === text), [label]);
// The text field of a modal's setting, by the setting's name, clicked so that typing goes there.
export const intoField = (ui: Driver, name: string) =>
  ui.click((text: string) => Array.from(document.querySelectorAll<HTMLElement>(".modal .setting-item"))
    .find((s) => s.querySelector<HTMLElement>(".setting-item-name")?.innerText.trim() === text)?.querySelector("input"), [name]);
export const noModal = (ui: Driver) => ui.waitFor("the modal to have closed", () => !document.querySelector(".modal-container"));

export const frontPath = (ui: Driver) => ui.evaluate(() => (app.workspace.getActiveFile()?.path ?? null) as string | null);
export const onDisk = (ui: Driver, note: string) =>
  ui.evaluate(async (at: string) => ((await app.vault.adapter.exists(at)) ? ((await app.vault.adapter.read(at)) as string) : null), [note]);

// The checks have run over the vault as it now is, and found this many failures.
export const waitForChecks = (ui: Driver, what: string, failures: "none" | "some") =>
  ui.waitFor(what, (want: string) => {
    const state = app.plugins.plugins.companygraph.state;
    return state.status === "checked" && (want === "none" ? state.located.length === 0 : state.located.length > 0) ? { failures: state.located.length as number } : null;
  }, [failures]);

// An entity of a type, from the plugin's own list and in a stable order. Not "the first file
// under a folder": Obsidian lists files in no order a test can lean on, and a folder of entities
// may hold a README, which is no entity and has no references. Seen as one red run in ten.
export const entityOf = (ui: Driver, type: string, holding = "") =>
  ui.evaluate((want: string, text: string) => {
    const plugin = app.plugins.plugins.companygraph;
    // `holding`: a piece of text the entity's file has to hold, for a test that needs, say, an
    // experience that lists skills; the first experience of the fixture lists none.
    const found = (plugin.named as { type: string; path: string }[]).filter((n) => n.type === want && (plugin.files.get(n.path) as string).includes(text)).map((n) => n.path).sort()[0];
    if (!found) throw new Error(`the fixture has no ${want}${text ? ` holding ${JSON.stringify(text)}` : ""}`);
    return found;
  }, [type, holding]);
