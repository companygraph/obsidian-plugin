// Asking again until something is ready. What a note opened from a list waits for is drawn by
// Obsidian when it gets to it: a table's widget is there a moment after the note on a quiet
// window and seconds after it where the table is long, and a wait of a fixed length is right on
// one machine and wrong on the next. So the step is asked at once and then every `every`
// milliseconds, `tries` times in all, and whoever asked is told when that was not enough. Pure:
// the clock is handed in.
export interface Patience {
  every: number;
  tries: number;
  later: (run: () => void, ms: number) => void;
  giveUp?: () => void;
}

export function until(ready: () => boolean, patience: Patience) {
  const ask = (left: number) => {
    if (ready()) return;
    if (left <= 1) return patience.giveUp?.();
    patience.later(() => ask(left - 1), patience.every);
  };
  ask(patience.tries);
}
