// The custom rule the family's Markdown form needs, vendored from robertblust/conventions as
// CommonJS without types. It is a list of markdownlint rules; see conventions/markdown-rules.cjs.
declare module "*/markdown-rules.cjs" {
  const rules: import("markdownlint").Rule[];
  export default rules;
}
