// The Stack & Tile tab row: one BeOS window tab per awake tab of the active
// space, sitting in the 36 px band above the panes like Haiku's stacked
// windows. The active tab is yellow, the rest gray, each with its agent lamp.
// Click selects; right-click offers Rename, Hide and Close Tab. Put-away
// (settled) tabs stay in the Deskbar only. The row is clipped with … when the
// tabs do not fit.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, run, window as appWindow } from "herdr";
import { C, STATUS, root, windowTab, openMenu, openAlert, nextAwakeTab } from "./kit.js";

/** Rough width of one tab: close box, paddings, title and optional lamp. */
function tabWidth(t) {
  return 34 + String(t.name ?? "").length * 6.5 + (STATUS[t.status] ? 22 : 0);
}

export default class TabStrip {
  init() {
    this.width = null;
  }

  space() {
    return spaces().find((s) => s.active);
  }

  /** The awake tabs, left to right; put-away ones live in the Deskbar. */
  tabs() {
    return (this.space()?.tabs ?? []).filter((t) => !t.settled);
  }

  closeBody(t) {
    const s = this.space();
    return s?.tabs.length === 1 ? `It's the last tab: the space “${s.name}” closes too.` : "Its terminals will be closed.";
  }

  closeTab(t) {
    openAlert({
      kind: "confirm",
      title: `Close tab “${t.name}”?`,
      body: this.closeBody(t),
      ok: "Close",
      act: { run: ["tab.close", { id: t.id, confirmed: true }] },
    });
  }

  menu(t, e) {
    const hide = nextAwakeTab(this.space(), t.id);
    const b = e?.bounds;
    openMenu(
      [
        { label: "Rename…", act: { alert: { kind: "rename", title: "Rename tab", value: t.name, ok: "Rename", act: { run: ["tab.rename", { id: t.id }] } } } },
        { label: "Hide", disabled: !hide, act: hide && { runs: [["tab.select", { id: hide.id }], ["tab.settle", { id: t.id }]] } },
        { sep: true },
        {
          label: "Close Tab",
          act: { alert: { kind: "confirm", title: `Close tab “${t.name}”?`, body: this.closeBody(t), ok: "Close", act: { run: ["tab.close", { id: t.id, confirmed: true }] } } },
        },
      ],
      b ? { x: b.x, y: b.y + b.height } : "pointer",
      { right: appWindow()?.width ?? null },
    );
  }

  /** The tabs that fit, and whether some were cut. */
  visible() {
    const list = this.tabs();
    if (this.width == null) return { shown: list, cut: false };
    const room = Math.max(0, this.width - 20);
    const shown = [];
    let used = 0;
    for (const t of list) {
      const w = tabWidth(t);
      if (shown.length && used + w > room) return { shown, cut: true };
      shown.push(t);
      used += w;
      if (used > room) return { shown, cut: true };
    }
    return { shown, cut: shown.length < list.length };
  }

  render(cx) {
    const { shown, cut } = this.visible();
    const row = h_flex()
      .h(22)
      .items_end()
      .flex_none()
      .children(
        shown.map((t) =>
          windowTab({
            id: `strip-${t.id}`,
            title: t.name,
            active: Boolean(t.active),
            status: t.status,
            onClick: () => run("tab.select", { id: t.id }),
            onClose: () => this.closeTab(t),
            onMenu: (e) => this.menu(t, e),
          }),
        ),
      )
      .when(cut, (el) => el.child(div().h(22).px(5).flex().items_center().text_size(12).text_color(C.dark).child("…")));
    return root(
      div()
        .id("tabstrip")
        .size_full()
        .overflow_hidden()
        .on_size_change((size, cx) => {
          if (this.width === size.width) return;
          this.width = size.width;
          cx.notify();
        })
        .child(h_flex().size_full().items_end().pb(8).child(row)),
    );
  }
}
