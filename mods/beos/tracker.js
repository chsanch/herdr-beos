// The title tab for BeOS application windows: Files, Changes or Graph, each
// following the focused pane's folder on its machine. The close box closes
// only that window; dragging the yellow tab moves it independently.

import { h_flex } from "gpui-base";
import { spaces, panes, focused, home, props } from "herdr";
import { root, windowTab, shortPath, closeWindow } from "./kit.js";

/** The folder the window's panel follows: the focused pane's, else the space's. */
function folder() {
  const f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const space = spaces().find((s) => s.active);
  return pane?.cwd || f?.cwd || space?.folder || "";
}

export default class TrackerTitle {
  init() {}

  render(_cx) {
    const kind = props()?.kind ?? "files";
    const label = { files: "Files", changes: "Changes", graph: "Graph" }[kind] ?? "Files";
    const where = shortPath(folder(), home());
    const tab = windowTab({
      id: `window-${kind}`,
      title: where ? `${label} — ${where}` : label,
      active: true,
      onClose: () => closeWindow(kind),
    });
    return root(h_flex().size_full().items_end()).child(tab);
  }
}
