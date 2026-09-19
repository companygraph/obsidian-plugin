// A stand-in for the agent's program in the runner's tests, so no test starts a model or pays
// for one. Its first argument says what to do: answer, fail without or with stderr, hang past a
// timeout, or answer with a multi-byte character split across two writes.
const mode = process.argv[2];
if (mode === "answer") {
  process.stdout.write(JSON.stringify({ is_error: false, structured_output: { judgments: [], gaps: [], notJudged: [] }, args: process.argv.slice(3) }));
} else if (mode === "fail") {
  process.stderr.write("not logged in\n");
  process.exit(3);
} else if (mode === "fail-quiet") {
  process.exit(2);
} else if (mode === "hang") {
  setTimeout(() => {}, 60_000);
} else if (mode === "split") {
  // An em dash is three UTF-8 bytes; the cut falls after the first of them, so the second write
  // opens with two continuation bytes that are not valid UTF-8 on their own.
  const text = JSON.stringify({ is_error: false, structured_output: { judgments: [{ path: "a.md", line: 1, type: "role", rule: "R", judgment: "An em dash — kept whole" }], gaps: [], notJudged: [] } });
  const buf = Buffer.from(text, "utf8");
  const cut = buf.indexOf(Buffer.from("—", "utf8")) + 1;
  process.stdout.write(buf.subarray(0, cut));
  setTimeout(() => process.stdout.write(buf.subarray(cut)), 20);
}
