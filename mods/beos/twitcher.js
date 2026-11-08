// The Twitcher: BeOS R5's Ctrl+Tab application switcher. A gray strip with a
// raised bevel, 32 px icons of the active space's pane tabs and of the agents
// the Deskbar lists, the chosen one in a sunken box, and its name below in
// Arimo. Tab / right advances, Shift+Tab / left goes back, Enter or a click
// chooses, Escape cancels and releasing Ctrl chooses. The Deskbar's
// nextCommand() opens it; every later ctrl-tab closes and reopens it one item
// along (the copy also moves itself if a command reaches it).

import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, panes, focused, props, run, closeOverlay, nextCommand, setShared } from "herdr";
import { C, root, raisedBox, sunkenBox, icon, lamp } from "./kit.js";
import { paneTitle } from "./tab.js";

const SLOT = 42;
const CELL = 38;
const PAD = 24;
const SEP = 12; // the engraved rule between the two groups
/** The overlay size the Deskbar opens for `count` items, `sep` when both
 *  groups are listed. */
export const TWITCHER = { height: 76, slot: SLOT, pad: PAD, sep: SEP, width: (count, sep = false) => Math.max(150, count * SLOT + PAD + (sep ? SEP : 0)) };

/** What the Twitcher lists, in the Deskbar's order: the active space's pane
 *  tabs (its split panels' yellow window tabs), then every agent the Deskbar
 *  lists. An agent that already runs in one of those panes is that pane, so
 *  it is not listed twice; agents elsewhere (another space, or a sub-agent
 *  without a pane) come after, pinned first. The two groups are separate so
 *  the strip can rule a line between them. */
export function twitcherItems() {
  const space = spaces().find((s) => s.active);
  const byId = new Map(spaces().map((s) => [s.id, s]));
  const tabs = [...(space?.tabs ?? []).filter((t) => !t.settled), ...(space?.tabs ?? []).filter((t) => t.settled)];
  const allPanes = panes();
  const allAgents = agents();
  const items = [];
  for (const t of tabs) {
    for (const p of allPanes.filter((x) => x.tab === t.id)) {
      items.push({
        key: `pane:${p.pane}`,
        kind: "pane",
        group: "home",
        pane: p.pane,
        tab: t.id,
        settled: Boolean(t.settled),
        label: paneTitle(p),
        icon: p.program?.agent || p.status ? "agent" : "terminal",
        program: p.program,
        status: p.status,
        act: () => {
          if (t.settled) run("tab.unsettle", { id: t.id });
          run("pane.focus", { pane: p.pane });
        },
      });
    }
  }
  const home = items.length;
  const listed = new Set(items.map((it) => it.pane));
  const ordered = [...allAgents.filter((a) => a.pinned), ...allAgents.filter((a) => !a.pinned)];
  for (const a of ordered) {
    if (listed.has(a.pane)) continue;
    const machine = byId.get(a.space)?.machine ?? null;
    const there = machine && machine !== space?.machine ? ` @ ${machine}` : "";
    items.push({
      key: `agent:${a.address}`,
      kind: "agent",
      group: "outside",
      terminal: a.address,
      label: `${a.program?.name ?? a.app ?? "Agent"} — ${a.space_name} / ${a.tab_name}${there}`,
      icon: "agent",
      program: a.program,
      status: a.status,
      act: () => run("agent.focus", { terminal: a.address }),
    });
  }
  return { items, split: home };
}

/** Index of the item the focused pane/agent is, or -1. */
export function currentIndex(items) {
  const f = focused();
  const pane = items.findIndex((it) => it.kind === "pane" && it.pane === f?.pane);
  if (pane >= 0) return pane;
  return items.findIndex((it) => it.kind === "agent" && it.terminal === f?.terminal);
}

export default class Twitcher {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    const { items, split } = twitcherItems();
    this.items = items;
    this.split = split;
    this.width = Number(pr.width) || 420;
    this.ctrl = true; // it opened from ctrl-tab
    this.armedAt = Date.now() + 250; // ignore a settle event right after opening
    this.done = false;
    const n = this.items.length;
    const dir = pr.dir === -1 ? -1 : 1;
    const cur = currentIndex(this.items);
    const pick = Number.isInteger(pr.at) && pr.at >= 0 ? Math.min(pr.at, n - 1) : null;
    this.at = n ? (pick ?? (cur < 0 ? (dir > 0 ? 0 : n - 1) : (cur + dir + n) % n)) : -1;
    this.focus = cx.focus_handle();
    this.focus.focus();
    // If a ctrl-tab ever reaches this copy (see the Deskbar), keep moving.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c !== "twitcher" && c !== "twitcherPrev") continue;
        this.move(c === "twitcherPrev" ? -1 : 1);
        cx.notify();
      }
    });
  }

  /** The overlay can also be closed by the app (Escape, a layout switch). */
  async close() {}

  current() {
    return this.items[this.at];
  }

  move(d) {
    const n = this.items.length;
    if (n) this.at = (this.at + d + n) % n;
  }

  /** Chooses the item (or just cancels when `act` is missing) and closes. */
  finish(act) {
    if (this.done) return;
    this.done = true;
    // The Deskbar starts the next ctrl-tab from the focused pane, not from
    // the item this strip was on.
    setShared("beos.twitcher", { closed: Date.now() });
    closeOverlay(props().overlay);
    try {
      act?.();
    } catch (e) {
      console.log(`beos twitcher: ${e}`);
    }
  }

  key(e, cx) {
    const k = e.key;
    if (k === "tab") this.move(e.modifiers?.shift ? -1 : 1);
    else if (k === "right") this.move(1);
    else if (k === "left") this.move(-1);
    else if (k === "enter" || k === "space") this.finish(this.current()?.act);
    else if (k === "escape") this.finish(null);
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  /** Ctrl up: jump. Any other modifier change only tracks the Ctrl state. */
  modifiers(e, cx) {
    const ctrl = Boolean(e.modifiers?.control);
    if (this.ctrl && !ctrl) {
      if (Date.now() < this.armedAt) return;
      this.finish(this.current()?.act);
      return;
    }
    this.ctrl = ctrl;
    cx.notify();
  }

  keyUp(e) {
    if (e.key === "control" && this.ctrl) {
      this.ctrl = false;
      if (Date.now() >= this.armedAt) this.finish(this.current()?.act);
    }
  }

  /** A program's own icon as a small tile badge (as the desktop launchers). */
  badge(prog) {
    if (!prog?.icon) return null;
    const glyph = prog.tint ? svg(prog.icon).text_color(prog.color ?? "#ffffff") : image(prog.icon);
    return div()
      .absolute()
      .right(-4)
      .bottom(-2)
      .w(16)
      .h(16)
      .flex()
      .items_center()
      .justify_center()
      .rounded(3)
      .bg(prog.tile ?? "#ffffff")
      .border(1)
      .border_color("#1a1a1a")
      .child(glyph.w(12).h(12));
  }

  cell(item, i, on) {
    const pic = div()
      .relative()
      .w(32)
      .h(32)
      .when(Boolean(item.settled), (el) => el.opacity(0.5))
      .child(icon(item.icon, 32))
      .when(Boolean(this.badge(item.program)), (el) => el.child(this.badge(item.program)))
      .when(Boolean(item.status && item.status !== "idle"), (el) =>
        el.child(div().absolute().right(-3).top(-3).bg(C.light).p(1).child(lamp(item.status))),
      );
    const body = div().w(36).h(36).flex().items_center().justify_center().child(pic);
    const cell = on ? sunkenBox(body, C.select) : div().w(CELL).h(CELL).flex().items_center().justify_center().child(body);
    return cell
      .id(`tw-${item.key}`)
      .on_mouse_move((_e, cx) => {
        if (this.at === i) return;
        this.at = i;
        cx.notify();
      })
      .on_click(() => this.finish(item.act));
  }

  /** The engraved vertical rule between the pane tabs and the outside agents. */
  separator() {
    return h_flex()
      .flex_none()
      .h_full()
      .items_center()
      .mx(5)
      .child(div().w(1).h(30).bg(C.shadow))
      .child(div().w(1).h(30).bg(C.light));
  }

  /** The slice of items that fits, kept around the chosen one. */
  visible() {
    const n = this.items.length;
    const both = this.split > 0 && this.split < n;
    const room = Math.max(1, Math.floor((this.width - PAD - 20 - (both ? SEP : 0)) / SLOT));
    if (n <= room) return { shown: this.items.map((it, i) => [it, i]), before: 0, after: 0 };
    const start = Math.max(0, Math.min(this.at - Math.floor(room / 2), n - room));
    return {
      shown: this.items.slice(start, start + room).map((it, i) => [it, start + i]),
      before: start,
      after: n - (start + room),
    };
  }

  render(cx) {
    const { shown, before, after } = this.visible();
    const sep = "…";
    const dots = (on) =>
      on ? div().w(10).flex_none().text_size(10).text_color(C.dark).child(sep) : div().w(10).flex_none();
    const cells = [];
    for (const [it, i] of shown) {
      if (i === this.split) cells.push(this.separator());
      cells.push(this.cell(it, i, i === this.at));
    }
    const row = h_flex()
      .items_center()
      .justify_center()
      .gap(0)
      .child(dots(before > 0))
      .children(cells)
      .child(dots(after > 0));
    const name = this.current()?.label ?? "";
    const body = v_flex()
      .size_full()
      .items_center()
      .justify_center()
      .gap(5)
      .px(6)
      .child(row)
      .child(
        div()
          .max_w(this.width - PAD)
          .truncate()
          .text_size(12)
          .when(Boolean(this.current()?.settled), (el) => el.text_color(C.dark))
          .child(name),
      );
    return root(
      div()
        .id("twitcher")
        .size_full()
        .track_focus(this.focus)
        .on_key_down((e, cx) => this.key(e, cx))
        .on_key_up((e) => this.keyUp(e))
        .on_modifiers_changed((e, cx) => this.modifiers(e, cx))
        .child(raisedBox(body).size_full()),
    );
  }
}
