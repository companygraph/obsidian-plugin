// Inside a page function `app` is Obsidian's own global, reached the way the developer console
// reaches it. It is untyped on purpose: what a test reads there is read from the running
// application, which is the thing under test, not from a declaration that could drift from it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const app: any;
