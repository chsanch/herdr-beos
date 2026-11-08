// Desktop icons, down the right edge under the Deskbar like BeOS's disks:
//   Files      the Tracker window: Herdr's Files panel for the focused
//              pane's folder (double-click again to close it)
//   Terminal   a new tab with a shell
//   agents     one icon per installed agent (programs.json `run`): a new tab
//              running it
// and the Trash fixed at the bottom-right. Launchers fill the right column
// top-to-bottom, then a second column to its left; cramped desktops use
// smaller icons, and launchers that still do not fit move into Trash's menu.
// One click selects (the label inverts), a double-click opens; right-click
// opens the icon's menu. Drawn inside the deskbar role's column.

import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { knownAgents, spaces, focused, home, run } from "herdr";
import { root, icon, programGlyph, openMenu, toggleTracker, trackerOpen } from "./kit.js";

const COLUMN = 84;
const RIGHT = 6;
const TOP = 10;
const BOTTOM = 10;
const NORMAL = { height: 76, icon: 32, text: 11, badge: 16, glyph: 12 };
const COMPACT = { height: 58, icon: 24, text: 10, badge: 14, glyph: 10 };

export default class Desktop {
  init(_p, cx) {
    this.sel = null;
    this.agents = [];
    this.size = null;
    this.omitted = [];
    cx.spawn(async (cx) => {
      try {
        this.agents = (await knownAgents()).filter((a) => a.installed);
      } catch {
        this.agents = [];
      }
      cx.notify();
    });
  }

  /** A program's own icon (Herdr's table) as a small tile badge. */
  badge(prog, mode) {
    const glyph = programGlyph(prog, mode.glyph);
    if (!glyph) return null;
    return div()
      .absolute()
      .right(mode.icon === 32 ? -4 : -3)
      .bottom(-2)
      .w(mode.badge)
      .h(mode.badge)
      .flex()
      .items_center()
      .justify_center()
      .rounded(3)
      .bg(prog.tile ?? "#ffffff")
      .border(1)
      .border_color("#1a1a1a")
      .child(glyph);
  }

  item(spec, mode = NORMAL, fixed = true) {
    const on = this.sel === spec.key;
    return v_flex()
      .id(`dk-${spec.key}`)
      .flex_none()
      .w(COLUMN)
      .when(fixed, (el) => el.h(mode.height).justify_center())
      .when(!fixed, (el) => el.py(4))
      .items_center()
      .gap(3)
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        this.sel = spec.key;
        if (e.click_count === 2) spec.open?.();
        cx.notify();
      })
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        this.sel = spec.key;
        if (spec.menu) openMenu(spec.menu(), "pointer");
        cx.notify();
      })
      .child(
        div()
          .relative()
          .child(icon(spec.ico, mode.icon))
          .when(Boolean(this.badge(spec.prog, mode)), (el) => el.child(this.badge(spec.prog, mode)))
          .when(on, (el) => el.child(div().absolute().top(0).left(0).size_full().bg("#00000050"))),
      )
      .child(
        div()
          .max_w(COLUMN)
          .px(3)
          .truncate()
          .text_size(mode.text)
          .text_color("#ffffff")
          .when(on, (el) => el.bg("#000000"))
          .child(spec.text),
      );
  }

  launchers() {
    const newTab = (argv) => run("tab.new", argv ? { argv } : {});
    return [
      {
        key: "files",
        ico: "disk",
        text: "Files",
        open: () => toggleTracker(),
        menu: () => [
          { label: trackerOpen() ? "Close Files" : "Open Files", act: { tracker: true } },
          { label: "New Space Here", act: { run: ["space.new", { folder: home() }] } },
        ],
        overflow: { label: "Open Files", act: { tracker: true } },
      },
      {
        key: "terminal",
        ico: "terminal",
        text: "Terminal",
        open: () => newTab(),
        menu: () => [{ label: "New Terminal", act: { run: ["tab.new"] } }],
        overflow: { label: "New Terminal", act: { run: ["tab.new"] } },
      },
      ...this.agents.map((a) => ({
        key: `agent-${a.key}`,
        ico: "agent",
        text: a.name,
        prog: a,
        open: () => newTab(a.run),
        menu: () => [{ label: `Start ${a.name}`, act: { run: ["tab.new", { argv: a.run }] } }],
        overflow: { label: `Start ${a.name}`, act: { run: ["tab.new", { argv: a.run }] } },
      })),
    ];
  }

  trashMenu() {
    const f = focused();
    const space = spaces().find((s) => s.id === f?.space);
    const tab = space?.tabs.find((t) => t.id === f?.tab);
    const tabBody = space?.tabs.length === 1 ? `It's the last tab: the space “${space.name}” closes too.` : "Its terminals will be closed.";
    const menu = [
      {
        label: "Close Tab",
        disabled: !tab,
        act: { alert: { kind: "confirm", title: `Close tab “${tab?.name ?? ""}”?`, body: tabBody, ok: "Close", act: { run: ["tab.close", { id: tab?.id, confirmed: true }] } } },
      },
      {
        label: "Close Space",
        disabled: !space,
        act: { alert: { kind: "confirm", title: `Close space “${space?.name ?? ""}”?`, body: "Its terminals will be closed.", ok: "Close", act: { run: ["space.close", { id: space?.id, confirmed: true }] } } },
      },
    ];
    if (this.omitted.length) {
      menu.push({ sep: true }, { label: "More launchers", header: true }, ...this.omitted.map((item) => item.overflow));
    }
    return menu;
  }

  fit(count, height, mode) {
    const inner = Math.max(0, height - TOP - BOTTOM);
    const right = Math.max(0, Math.floor(inner / mode.height) - 1);
    const left = Math.max(0, Math.floor(inner / mode.height));
    return { mode, right, left, capacity: right + left, fits: count <= right + left };
  }

  render(_cx) {
    const launchers = this.launchers();
    const trash = {
      key: "trash",
      ico: "trash",
      text: "Trash",
      open: () => openMenu(this.trashMenu(), "pointer"),
      menu: () => this.trashMenu(),
    };
    const desktop = v_flex()
      .id("desktop")
      .relative()
      .flex_1()
      .w_full()
      .min_h(0)
      .on_size_change((size, cx) => {
        if (this.size?.width === size.width && this.size?.height === size.height) return;
        this.size = size;
        cx.notify();
      })
      .on_mouse_down("left", (_e, cx) => {
        this.sel = null;
        cx.notify();
      });

    // Preserve the original one-column flow until GPUI reports the height.
    if (!this.size) {
      this.omitted = [];
      return root(
        desktop
          .items_end()
          .pt(TOP)
          .pr(RIGHT)
          .child(v_flex().flex_1().min_h(0).gap(6).items_center().children(launchers.map((item) => this.item(item, NORMAL, false))))
          .child(div().pb(BOTTOM).child(this.item(trash, NORMAL, false))),
      );
    }

    let fit = this.fit(launchers.length, this.size.height, NORMAL);
    if (!fit.fits) fit = this.fit(launchers.length, this.size.height, COMPACT);
    const visible = launchers.slice(0, fit.capacity);
    this.omitted = launchers.slice(fit.capacity);
    const positioned = visible.map((item, i) => {
      const leftColumn = i >= fit.right;
      const row = leftColumn ? i - fit.right : i;
      return this.item(item, fit.mode).absolute().top(TOP + row * fit.mode.height).right(RIGHT + (leftColumn ? COLUMN : 0));
    });

    return root(
      desktop
        .children(positioned)
        .child(this.item(trash, fit.mode).absolute().right(RIGHT).bottom(BOTTOM)),
    );
  }
}
