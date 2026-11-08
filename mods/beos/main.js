// Herdr BeOS: the whole BeOS-style layout is this one mod, in roles.
// The layout gives each copy props { role }:
//   tab      a pane's yellow window tab (the layout's pane header)
//   deskbar  the Deskbar: Be menu, status and clock, spaces and tabs
//   menu     a popup menu
//   alert    a BeOS-style confirmation or rename dialog
//   tracker  the application windows' tabs
//   boot     the modal R5-inspired startup screen
//   twitcher the Ctrl+Tab application strip
//   tabstrip the Stack & Tile row of window tabs above the panes

import { View, div } from "gpui-kit";
import { props } from "herdr";
import PaneTab from "./tab.js";
import Deskbar from "./deskbar.js";
import Menu from "./menu.js";
import Alert from "./alert.js";
import TrackerTitle from "./tracker.js";
import Boot from "./boot.js";
import Twitcher from "./twitcher.js";
import TabStrip from "./tabstrip.js";

/** An empty block for layout spacing. */
class Gap extends View {
  render() {
    return div();
  }
}

const ROLES = { tab: PaneTab, deskbar: Deskbar, menu: Menu, alert: Alert, tracker: TrackerTitle, boot: Boot, twitcher: Twitcher, tabstrip: TabStrip, gap: Gap };

export default class BeOS extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    const R = ROLES[pr.role];
    this.role = R ? new R() : null;
    this.role?.init?.(pr, cx);
  }

  render(cx) {
    if (!this.role) return div().child(`beos: no role "${props()?.role}"`);
    return this.role.render(cx);
  }

  async close(cx) {
    await this.role?.close?.(cx);
  }
}
