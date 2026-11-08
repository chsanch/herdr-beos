import { View } from "gpui-kit";
import { props } from "herdr";
import { Graph } from "./graph.js";
import { Menu } from "./menu.js";
import { Dialog } from "./dialog.js";

// The BeOS-restyled Git Graph clone has three roles: graph, action menu and
// dialog. The upstream daily GitHub update check is intentionally omitted:
// this bundled clone is updated only with Herdr BeOS and performs no HTTP.
export default class GitGraph extends View {
  init(_props, cx) {
    const role = props()?.role;
    this.part = role === "menu" ? new Menu() : role === "dialog" ? new Dialog() : new Graph();
    this.part.init(cx);
  }

  render(cx) { return this.part.render(cx); }
}
