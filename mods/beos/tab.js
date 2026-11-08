// A pane's window tab (the layout's pane header): a yellow tab only as wide
// as its title, sitting at the top-left on the terminal; the rest of the
// header stays transparent (the desktop shows through). Close box on the
// left, zoom box on the right. Gray when not focused. When the pane runs an
// agent that works, is blocked or finished, a status lamp in a small sunken
// well sits between the title and the zoom box (amber pulsing, red, blue);
// shells and idle agents get no lamp. Click focuses, double-click zooms.

import { h_flex } from "gpui-base";
import { panes, props, run, home, window as appWindow } from "herdr";
import { root, windowTab, shortPath, openMenu, nextAwakeTab } from "./kit.js";

export function paneTitle(p) {
  if (!p) return "";
  if (p.mod) return p.title || p.mod;
  const prog = p.program;
  const where = shortPath(p.cwd, home());
  if (!prog || prog.shell) return `Terminal — ${where}`;
  const t = (p.title ?? "").trim();
  return t && t !== prog.name ? `${prog.name} — ${t}` : `${prog.name} — ${where}`;
}

export default class PaneTab {
  init() {}

  /** The tab's right-click menu; the anchor `e` is a mouse event with bounds. */
  paneMenu(e) {
    const id = props()?.pane;
    const p = panes().find((x) => x.pane === id);
    const b = e?.bounds;
    openMenu(
      [
        { label: "Split Right", act: { run: ["pane.split", { pane: id, direction: "right" }] } },
        { label: "Split Down", act: { run: ["pane.split", { pane: id, direction: "down" }] } },
        { sep: true },
        { label: "Zoom", checked: Boolean(p?.zoomed), act: { run: ["pane.zoom", { pane: id }] } },
        { sep: true },
        { label: "Close", act: { run: ["pane.close", { pane: id }] } },
      ],
      b ? { x: b.x, y: b.y + b.height } : "pointer",
      { right: appWindow()?.width ?? null },
    );
  }

  render(_cx) {
    const id = props()?.pane;
    const p = panes().find((x) => x.pane === id);
    const tab = windowTab({
      id,
      title: paneTitle(p),
      active: Boolean(p?.focused),
      status: p?.status,
      onClick: () => run("pane.focus", { pane: id }),
      onDouble: () => run("pane.zoom", { pane: id }),
      onClose: () => run("pane.close", { pane: id }),
      onZoom: () => run("pane.zoom", { pane: id }),
      onMenu: (e) => this.paneMenu(e),
    });
    return root(h_flex().size_full().items_end()).child(tab);
  }
}
