// Which of Obsidian's own panes to switch, and in which direction. Pure, and apart from the
// switching itself, because what went wrong here was a decision and not a switch.
//
// The rule this module exists to hold: a pane goes back on only by a deliberate act — the setting
// switched off, or this plugin disabled or removed — and never as a side effect of a rebuild. A
// rebuild runs once with nothing known about the vault yet, where `standIn` is false because the
// instance has not been read rather than because there is none, and restoring there switched all
// four panes on again at every reload.

export interface Decision {
  disable: string[];
  enable: string[];
  // The list to remember afterwards, replacing the one passed in.
  remembered: string[];
}

// A rebuild. It switches off every pane this plugin stands in for that is on, and remembers it,
// and switches nothing on. A pane already off is left alone and not remembered: it was the
// owner's doing, and what this plugin never switched off it never gives back.
export function onRebuild(panes: readonly string[], standIn: boolean, isOn: (id: string) => boolean, remembered: string[]): Decision {
  if (!standIn) return { disable: [], enable: [], remembered };
  const next = [...remembered];
  const disable: string[] = [];
  for (const id of panes) {
    // The list is not consulted first: a save that did not finish on the last unload leaves a
    // stale entry, and a pane named there but switched on again must still go off.
    if (!isOn(id)) continue;
    disable.push(id);
    if (!next.includes(id)) next.push(id);
  }
  return { disable, enable: [], remembered: next };
}

// A deliberate restore: exactly the panes this plugin switched off, and nothing else. The list is
// emptied, because what has been given back is no longer this plugin's to give.
export function onRestore(remembered: readonly string[]): Decision {
  return { disable: [], enable: [...remembered], remembered: [] };
}

// The one-time repair for a vault upgraded from a release that switched these panes off without
// remembering it. Such a vault holds them off in Obsidian's own settings and nothing says who did
// it, so what is off now while this plugin means to stand in for it is taken as this plugin's own.
// Being wrong costs a pane coming back once, which the owner can switch off again; doing nothing
// costs four panes that nothing ever restores.
export function onRepair(panes: readonly string[], isOn: (id: string) => boolean, remembered: string[]): Decision {
  const next = [...remembered];
  for (const id of panes) if (!isOn(id) && !next.includes(id)) next.push(id);
  return { disable: [], enable: [], remembered: next };
}
