// A stand-in for the agent's program in the runner's tests, so no test starts a model or pays
// for one. Its first argument says what to do: answer, fail, or hang past a timeout.
const mode = process.argv[2];
if (mode === "answer") {
  process.stdout.write(JSON.stringify({ is_error: false, structured_output: { judgments: [], gaps: [], notJudged: [] }, args: process.argv.slice(3) }));
} else if (mode === "fail") {
  process.stderr.write("not logged in\n");
  process.exit(3);
} else if (mode === "hang") {
  setTimeout(() => {}, 60_000);
}
