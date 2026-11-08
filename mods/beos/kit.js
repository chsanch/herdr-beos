// Herdr BeOS's drawing kit: BeOS R5 colors, bevels and the window tab bits,
// shared by every role of the beos mod. Colors are the mod's own constants so
// switching the terminal theme (beos / beos-dark) never changes the chrome.

import { div, image, svg, PathBuilder, Background } from "gpui-kit";
import { h_flex } from "gpui-base";
import { openOverlay, closeOverlay, run, notify, shared, setShared, readTextFile, writeTextFile, appHome, layout } from "herdr";

export const C = {
  panel: "#d8d8d8",
  light: "#ffffff",
  shadow: "#989898",
  dark: "#606060",
  text: "#000000",
  desktop: "#336698",
  sunken: "#c8c8c8",
  select: "#999999",
  disabled: "#8c8c8c",
};

export const ASSETS = "mods/beos";

// Agent status colors: blocked > done > working > idle.
export const STATUS = { blocked: "#d01010", done: "#1c50c8", working: "#d29e00" };

// A darker tone of each status color for the tab lamp's non-pulsing bezel.
const STATUS_RING = { blocked: "#7c0909", done: "#102e73", working: "#7c5d00" };

// Window tab colors (BeOS R5 decorator values), by focus.
export const TAB = {
  on: { face: "#ffcb00", light: "#ffee00", glint: "#ffff1a", shadow: "#ebb700", close: "#b78300", zoom: "#d29e00", text: "#000000" },
  off: { face: "#e8e8e8", light: "#ffffff", glint: "#ffffff", shadow: "#d3d3d3", close: "#a0a0a0", zoom: "#bbbbbb", text: "#505050" },
};

// Swis721 BT, BeOS's UI font, is a Helvetica clone; Arimo (bundled, OFL) matches its metrics.
export const FONT = "Arimo";

/** The root of every role: UI font, size and text color. */
export function root(el) {
  return el.font_family(FONT).text_size(12).text_color(C.text);
}

// ---- paint

const RECT = () =>
  PathBuilder.fill().move_to("0%", "0%").line_to("100%", "0%").line_to("100%", "100%").line_to("0%", "100%").close().build();

/** A layer filling its (relative) parent with a gradient; 180 = top to bottom. */
export function gradient(from, to, angle = 180) {
  return window.paint_path(RECT(), Background.linear_gradient(angle, from, to)).absolute().top(0).left(0).size_full();
}

/** A raised square of `size` px: a dark outline in `edge`, inside it a light
 *  top/left bevel and a shadow bottom/right, then a gradient face. `sunk`
 *  swaps the bevel (pressed). */
export function raised(size, t, edge, sunk = false) {
  const lo = sunk ? t.shadow : t.glint;
  const hi = sunk ? t.glint : t.shadow;
  return div()
    .relative()
    .flex_none()
    .w(size)
    .h(size)
    .bg(edge)
    .child(div().absolute().left(1).top(1).w(size - 2).h(size - 2).bg(hi))
    .child(div().absolute().left(1).top(1).w(size - 3).h(size - 3).bg(lo))
    .child(
      div()
        .absolute()
        .left(2)
        .top(2)
        .w(size - 4)
        .h(size - 4)
        .overflow_hidden()
        .child(sunk ? gradient(t.face, t.light) : gradient(t.light, t.face)),
    );
}

/** A tab box: "close" (one raised square) or "zoom" (a small square over a
 *  larger one, offset toward the top-left). */
export function tabBox(id, kind, active, onClick) {
  const t = active ? TAB.on : TAB.off;
  let box = div()
    .id(id)
    .flex_none()
    .relative()
    .w(12)
    .h(12)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => {
      cx.stop_propagation();
      onClick?.();
    });
  if (kind === "close") {
    box = box.child(raised(12, t, t.close));
  } else {
    box = box
      .child(div().absolute().left(3).top(3).child(raised(9, t, t.zoom)))
      .child(div().absolute().left(0).top(0).child(raised(7, t, t.zoom)));
  }
  return box;
}

/** A path with the home folder as ~. */
export function shortPath(cwd, h) {
  if (!cwd) return "";
  return h && cwd.startsWith(h) ? "~" + cwd.slice(h.length) : cwd;
}

/** The tab's agent lamp in a small sunken BeOS well: `C.shadow` at the top
 *  and left, white at the bottom and right, a light gray face. The lamp sits
 *  in a 1 px bezel of a darker status tone that does not pulse, so the state
 *  stays readable while a working lamp fades; 13 px square, 7 px lamp. */
function statusWell(status) {
  return div()
    .flex_none()
    .bg(C.shadow)
    .pt(1)
    .pl(1)
    .child(
      div()
        .bg(C.light)
        .pb(1)
        .pr(1)
        .child(
          h_flex()
            .w(11)
            .h(11)
            .items_center()
            .justify_center()
            .bg(C.sunken)
            .child(div().flex_none().p(1).bg(STATUS_RING[status] ?? C.dark).child(lamp(status))),
        ),
    );
}

/** The next awake (unsettled) tab of `space` after `tabId`, else the previous
 *  one, else null: the tab to switch to before putting `tabId` away. */
export function nextAwakeTab(space, tabId) {
  if (!space) return null;
  const at = space.tabs.findIndex((t) => t.id === tabId);
  const open = space.tabs.filter((t) => !t.settled && t.id !== tabId);
  const after = open.find((t) => space.tabs.indexOf(t) > at);
  const before = [...open].reverse().find((t) => space.tabs.indexOf(t) < at);
  return after ?? before ?? null;
}

/** A BeOS window tab, only as wide as its title: close box, bold title,
 *  zoom box (when onZoom). Yellow when active, gray otherwise. `status` adds
 *  the agent's lamp in a small sunken well between the title and the zoom box
 *  (none for shells and idle agents). `onMenu` gets a right-click for the
 *  pane's menu. A double click runs onDouble. The tab doesn't stop presses:
 *  a window drags by it. */
export function windowTab({ id, title, active, onClick, onDouble, onClose, onZoom, onMenu, status }) {
  const t = active ? TAB.on : TAB.off;
  return div()
    .id(`tab-${id}`)
    .relative()
    .flex_none()
    .max_w_full()
    .h_full()
    .bg(t.face)
    .on_click((e, _cx) => {
      if (e?.click_count === 2) onDouble?.();
      else onClick?.();
    })
    .on_mouse_down("right", (e, cx) => {
      cx.stop_propagation();
      onMenu?.(e);
    })
    // Fill, then the bevel: light top and left edges, a dark right edge.
    .child(gradient(t.light, t.face))
    .child(div().absolute().top(0).left(0).w_full().h(1).bg(t.glint))
    .child(div().absolute().top(0).left(0).w(1).h_full().bg(t.glint))
    .child(div().absolute().top(0).right(0).w(1).h_full().bg(t.close))
    .child(
      h_flex()
        .relative()
        .h_full()
        .items_center()
        .gap(9)
        .pl(6)
        .pr(7)
        .child(tabBox(`close-${id}`, "close", active, onClose))
        .child(div().min_w(0).truncate().font_weight(700).text_color(t.text).child(title))
        .when(Boolean(status && STATUS[status]), (el) => el.child(statusWell(status)))
        .when(Boolean(onZoom), (el) => el.child(tabBox(`zoom-${id}`, "zoom", active, onZoom))),
    );
}

// ---- BeOS application windows

// Overlay ids live only for this layout instance. Distinct keys let Herdr
// remember each window's position and keep Files, Changes and Graph open.
const WINDOW = {
  files: { key: "beos-files", mod: "beos-files", width: 380, height: 460 },
  changes: { key: "beos-changes", mod: "beos-changes", width: 520, height: 480 },
  graph: { key: "beos-graph", mod: "beos-graph", width: 520, height: 480 },
};
const openWindows = {};

const windowSpec = (kind) => {
  const spec = WINDOW[kind] ?? WINDOW.files;
  return {
    kind: "window",
    key: spec.key,
    frame: "none",
    width: spec.width,
    height: spec.height,
    layout: {
      type: "column",
      children: [
        { type: "block", size: { px: 22 }, content: { mod: "beos", props: { role: "tracker", kind } } },
        { type: "block", border: { width: 5, color: C.panel }, background: C.panel, content: { mod: spec.mod } },
      ],
    },
  };
};

export function resetWindows() {
  for (const kind of Object.keys(WINDOW)) openWindows[kind] = null;
}

export function windowOpen(kind) {
  return openWindows[kind] != null;
}

export function closeWindow(kind) {
  closeOverlay(openWindows[kind] ?? openOverlay(windowSpec(kind)));
  openWindows[kind] = null;
}

export function openWindow(kind) {
  if (!windowOpen(kind)) openWindows[kind] = openOverlay(windowSpec(kind));
}

/** Opens one BeOS application window, or closes it when it is open. */
export function toggleWindow(kind) {
  if (windowOpen(kind)) return closeWindow(kind);
  openWindow(kind);
}

// Home and older callers still speak in Tracker terms: Tracker means Files.
export const trackerOpen = () => windowOpen("files");
export const closeTracker = () => closeWindow("files");
export const toggleTracker = () => toggleWindow("files");

// ---- boxes

/** A raised panel: a dark outline, white top/left bevel, gray bottom/right. */
export function raisedBox(content, face = C.panel) {
  return div()
    .bg(C.dark)
    .p(1)
    .child(div().bg(C.light).pt(1).pl(1).child(div().bg(C.shadow).pb(1).pr(1).child(content.bg(face))));
}

/** A sunken well: gray top/left bevel, white bottom/right. */
export function sunkenBox(content, face = C.sunken) {
  return div().bg(C.shadow).pt(1).pl(1).child(div().bg(C.light).pb(1).pr(1).child(content.bg(face)));
}

/** One of the mod's own full-color icons (icons/<name>.svg) at `size` px. */
export function icon(name, size = 16) {
  return image(`${ASSETS}/icons/${name}.svg`).w(size).h(size).flex_none();
}

/** A program's own icon at `size` px: a tinted SVG in its color, or the
 *  picture as it is. Null when the program has no icon. */
export function programGlyph(prog, size) {
  if (!prog?.icon) return null;
  const glyph = prog.tint ? svg(prog.icon).text_color(prog.color ?? "#ffffff") : image(prog.icon);
  return glyph.w(size).h(size);
}

/** A program's logo in a dark 14 px tile for the Deskbar rows, or the generic
 *  agent icon when the program has no logo. */
export function programTile(prog, size = 14) {
  const glyph = programGlyph(prog, size - 4);
  if (!glyph) return icon("agent", size);
  return div()
    .w(size)
    .h(size)
    .flex_none()
    .flex()
    .items_center()
    .justify_center()
    .rounded(3)
    .bg("#1a1a1a")
    .child(glyph);
}

/** A status lamp: a small colored square with a dark edge; working pulses. */
export function lamp(status, size = 7) {
  const color = STATUS[status];
  if (!color) return div().w(size).h(size).flex_none();
  let el = div().w(size).h(size).flex_none().bg(color).border(1).border_color("#00000080");
  if (status === "working") el = el.loop("opacity", { from: 0.35, to: 1, period: 1100 });
  return el;
}

// ---- menus

export const MENU = { row: 20, sep: 7, pad: 3 };

/** Opens a popup menu (the menu role). Items: { label, act, checked,
 *  disabled, header } or { sep: true }. `at` is window px; the menu keeps
 *  inside the window's right edge when `right` is given. */
export function openMenu(items, at, o = {}) {
  let h = MENU.pad * 2 + 4;
  let longest = 0;
  for (const it of items) {
    h += it.sep ? MENU.sep : MENU.row;
    longest = Math.max(longest, (it.label ?? "").length);
  }
  const w = o.width ?? Math.max(160, Math.min(320, longest * 7 + 48));
  let where = at;
  if (at && o.right != null) where = { x: Math.max(0, Math.min(at.x, o.right - w)), y: at.y };
  return openOverlay({
    mod: "beos",
    kind: "popup",
    frame: "none",
    width: w,
    height: h,
    ...(where ? { at: where } : {}),
    props: { role: "menu", items },
  });
}

/** Opens a BeOS alert for a destructive confirmation or a rename. */
export function openAlert(spec) {
  return openOverlay({
    mod: "beos",
    kind: "dialog",
    frame: "none",
    width: 360,
    height: spec.kind === "rename" ? 178 : 156,
    props: { role: "alert", ...spec },
  });
}

/** Does what a menu item says: { run: [name, args] } or a BeOS-local action. */
export function perform(act) {
  if (!act) return;
  if (act.runs) for (const [name, args] of act.runs) run(name, args ?? {});
  if (act.run) run(act.run[0], act.run[1] ?? {});
  if (act.alert) openAlert(act.alert);
  if (act.window) toggleWindow(act.window);
  if (typeof act.bootScreen === "boolean") setShared("beos.bootScreen", act.bootScreen);
  if (typeof act.startupSound === "boolean") setShared("beos.startupSound", act.startupSound);
  if (act.terminal) requestTerminalTheme(act.terminal);
  if (act.notify) notify(act.notify);
  if (act.tracker) toggleTracker();
}

// ---- terminal colors: auto (follow the system), light or dark

const THEMES = { auto: { light: "beos", dark: "beos-dark" }, light: "beos", dark: "beos-dark" };
export const TERMINAL_THEME_REQUEST = "beos.terminal";

/** Leaves the request in shared state for the persistent Deskbar to write. */
export function requestTerminalTheme(mode) {
  setShared(TERMINAL_THEME_REQUEST, { mode, at: Date.now() });
}

/** The terminal mode the shown layout's root asks for. */
export function terminalMode() {
  const t = layout()?.theme;
  if (t === THEMES.light) return "light";
  if (t === THEMES.dark) return "dark";
  return "auto";
}

/** Writes the shown layout's root theme: a deliberate file edit, so it wins
 *  over any theme picked in the app before. */
export async function setTerminalTheme(mode) {
  const name = shared("layout") ?? "beos";
  const path = `${appHome()}/layouts/${name}.json`;
  try {
    const text = await readTextFile(path);
    if (text == null) return;
    const d = JSON.parse(text);
    d.theme = THEMES[mode] ?? THEMES.auto;
    await writeTextFile(path, JSON.stringify(d, null, 2) + "\n", text);
  } catch (e) {
    notify({ title: "Terminal colors", body: String(e?.message ?? e), level: "error" });
  }
}
