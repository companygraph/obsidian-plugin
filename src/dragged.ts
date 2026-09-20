// Whether a press that ended inside `el` was a drag over its own text rather than a wish to leave.
// The window's selection is the whole window's: a selection left behind in the note the reader
// came from, or in the other pane, is not this entry's, and taking it for one swallowed the first
// click on every entry until the selection was cleared, which the owner's trial found as needing
// two clicks. Only a selection that is not collapsed and lies inside the entry counts.
export function draggedOver(el: Node, selection: { isCollapsed: boolean; anchorNode: Node | null; focusNode: Node | null } | null): boolean {
  if (!selection || selection.isCollapsed) return false;
  return (!!selection.anchorNode && el.contains(selection.anchorNode)) || (!!selection.focusNode && el.contains(selection.focusNode));
}
