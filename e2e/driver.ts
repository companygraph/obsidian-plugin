// What a test may ask of Obsidian: what a person at the screen could do or see, and nothing of
// how it is carried there. The first transport is the DevTools protocol (cdp.ts); the target is
// WebdriverIO's `browser` behind the same interface (spec §3), and a test that imports only this
// file moves there unchanged.

// A function that runs in the page, not here: it closes over nothing and takes JSON arguments.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PageFn<T> = (...args: any[]) => T | Promise<T>;

export interface Modifiers { alt?: boolean; ctrl?: boolean; meta?: boolean; shift?: boolean }

export interface Driver {
  // The function's result, which has to survive JSON.
  evaluate<T>(fn: PageFn<T>, args?: unknown[]): Promise<T>;
  // A real press and release at the middle of an element, scrolled into sight first: a CSS
  // selector, or a function that finds the element. It waits for the element to be there.
  click(target: string | PageFn<Element | null | undefined>, args?: unknown[], modifiers?: Modifiers): Promise<void>;
  // A real key: a letter, or a name as KeyboardEvent.key spells it ("Tab", "End", "Enter").
  press(key: string, modifiers?: Modifiers): Promise<void>;
  // Text as typing puts it in, into whatever holds the focus.
  type(text: string): Promise<void>;
  // Asks until the condition answers something truthy and gives that back. A wait that runs out
  // says what it was waiting for (spec §5).
  waitFor<T>(what: string, condition: PageFn<T>, args?: unknown[], timeout?: number): Promise<NonNullable<T>>;
  // The one thing a condition cannot be: that something does not happen. Watches for `window`
  // milliseconds and fails the moment the condition answers something truthy.
  never(what: string, condition: PageFn<unknown>, args: unknown[], window: number): Promise<void>;
  screenshot(file: string): Promise<void>;
  // Errors and unhandled rejections the page has seen since the session began.
  errors(): Promise<string[]>;
  close(): Promise<void>;
}
