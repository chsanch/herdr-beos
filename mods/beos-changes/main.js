// Derived from Herdr's "changes" mod (https://github.com/herdrdev/herdr-app,
// Apache-2.0, Copyright the Herdr authors) and modified for Herdr BeOS
// (restyled). See NOTICE and the LICENSE at the repository root.
// Herdr's Changes panel, cloned with a BeOS R5 document window: menu bar,
// sunken file and diff wells, square controls, and readable fixed colors.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, settings, shared, setShared, props, openOverlay, closeOverlay } from "herdr";

const UI = {
  document: "#ffffff", panel: "#d8d8d8", light: "#ffffff", shadow: "#989898", dark: "#606060",
  text: "#000000", muted: "#606060", select: "#999999", add: "#087a08", remove: "#a00000", changed: "#7a3e00",
};
const FONT = "Arimo";
const ACTION = "beos-changes.action";

const raised = (content) => div().bg(UI.dark).p(1).child(div().bg(UI.shadow).pb(1).pr(1).child(div().bg(UI.light).pt(1).pl(1).child(content.bg(UI.panel))));
const sunken = (content) => div().bg(UI.shadow).pt(1).pl(1).child(div().size_full().bg(UI.light).pb(1).pr(1).child(content.size_full().bg(UI.document)));

function openMenu(items, at, width = 174) {
  openOverlay({ mod: "beos-changes", kind: "popup", frame: "none", width, height: items.length * 22 + 6, at, props: { role: "menu", items } });
}

class ChangeMenu {
  init(cx) { this.at = -1; this.handle = cx.focus_handle(); this.handle.focus(); }
  choose(item) {
    if (!item || item.disabled) return;
    setShared(ACTION, { action: item.action, at: Date.now() });
    closeOverlay(props().overlay);
  }
  move(step) {
    const items = props().items ?? [];
    for (let n = 1; n <= items.length; n++) { const i = (this.at + step * n + items.length * 2) % items.length; if (!items[i].disabled) { this.at = i; return; } }
  }
  render() {
    const items = props().items ?? [];
    const list = v_flex().size_full().p(3).bg(UI.panel).font_family(FONT).text_size(12).text_color(UI.text).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.move(1); else if (e.key === "up") this.move(-1); else if (e.key === "enter") this.choose(items[this.at]); else if (e.key === "escape") closeOverlay(props().overlay); else return;
        cx.stop_propagation(); cx.notify();
      })
      .children(items.map((item, i) => h_flex().id(`changes-mi-${i}`).h(22).px(7).items_center().text_color(item.disabled ? UI.shadow : UI.text)
        .when(i === this.at && !item.disabled, (e) => e.bg(UI.select)).when(!item.disabled, (e) => e.cursor_pointer().hover((s) => s.bg(UI.select)).on_click(() => this.choose(item))).child(item.label)));
    return raised(list).size_full();
  }
}

function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie):
// the folder watch would see it, and every refresh would start the next one.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;

// Numbers each diff line once, so a frame only draws the rows on screen.
function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: line.slice(1) || " " };
    if (kind === "+") return { kind, number: next++, text: line.slice(1) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: line.slice(1) || " " }; }
    return { kind: "", text: line };
  });
}

class Changes extends View {
  init(_props, cx) {
    this.files = []; this.rows = []; this.diffWidth = 0; this.message = ""; this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Commit message" });
    this.input.on("change", (_e, cx) => {
      const hadMessage = Boolean(this.message.trim());
      this.message = this.input.value();
      if (hadMessage !== Boolean(this.message.trim())) cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  refresh(cx) {
    if (this.loading || this.busy) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null;
      this.setLines([]); this.message = ""; this.input.set_value(""); this.error = null; this.note = null; this.watched = null; this.closed = false; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
        if (status.code !== 0) throw new Error(status.stderr);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        const stats = {};
        const results = head.code === 0 ? [await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"])] : [await git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), await git(["diff", "--numstat", "-z", "--no-renames"])];
        for (const result of results) {
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
          }
        }
        const files = [];
        const entries = status.stdout.split("\0").filter(Boolean);
        for (const entry of entries.slice(0, 1000)) {
          const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
          const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
          const s = conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M";
          const stat = stats[path] ?? { add: 0, del: 0 };
          files.push({ path, status: s, fresh, ...stat });
        }
        if (key() !== context) return;
        this.root = root; this.on = on; this.hasHead = head.code === 0; this.files = files; this.limited = entries.length > 1000; this.error = null;
        this.watch(root, cx);
        if (this.open && !files.some((f) => f.path === this.open)) { this.open = null; this.setLines([]); }
        // The first file's diff shows until you pick another.
        if (!this.open && !this.closed && files.length) this.open = files[0].path;
        if (this.open) {
          try { await this.load(this.open, context); }
          catch { if (key() === context) this.setLines(["Cannot preview this diff (too large or unreadable)"]); }
        }
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, on = this.on;
    if (!file) return;
    let lines;
    if (file.fresh || (!this.hasHead && file.status === "A")) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
      else if (text.includes("\0")) lines = ["Binary file · no text diff"];
      else {
        file.add = countLines(text);
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 1500).map(l => `+${l}`)];
      }
    } else {
      const r = await exec("git", [...READ, "diff", ...(this.hasHead ? ["HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    }
    if (key() === context && this.open === path) this.setLines(lines.slice(0, 1500).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line));
  }

  setLines(lines) {
    this.rows = diffRows(lines);
    this.diffWidth = Math.max(300, ...lines.map(line => line.length * 7 + 50));
  }

  pick(path, cx) {
    this.open = this.open === path ? null : path; this.setLines([]); this.note = null;
    this.closed = !this.open;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(path, context); }
      catch (e) { if (key() === context && this.open === path) this.note = `Cannot preview this diff (too large or unreadable): ${e}`; }
      cx.notify();
    });
    cx.notify();
  }

  commit(cx) {
    if (!this.message.trim() || !this.root || this.busy || this.loading || this.context !== key()) return;
    const root = this.root, on = this.on, context = this.context, message = this.message.trim();
    this.busy = true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        for (const args of [["add", "-A"], ["commit", "-m", message]]) {
          const r = await exec("git", args, { cwd: root, on });
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        }
        if (key() === context) { this.message = ""; this.input.set_value(""); }
      } catch (e) { if (key() === context) this.note = `Commit failed: ${e}`; }
      finally { this.busy = false; this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  applyMenuAction(cx) {
    const request = shared(ACTION);
    if (!request?.action || request.at === this.menuAction) return;
    this.menuAction = request.at;
    setShared(ACTION, null);
    if (request.action === "refresh") this.refresh(cx);
    if (request.action === "close-diff") { this.open = null; this.closed = true; this.setLines([]); cx.notify(); }
    if (request.action === "first" && this.files[0]) this.pick(this.files[0].path, cx);
    if (request.action === "commit") this.input.focus();
  }

  menu(name, e) {
    const action = (label, value, disabled = false) => ({ label, disabled, action: value });
    const items = name === "File"
      ? [action("Refresh changes", "refresh"), action("Close diff", "close-diff", !this.open)]
      : name === "Git"
        ? [action("Commit all changes…", "commit", !this.root || !this.files.length)]
        : [action("Show first changed file", "first", !this.files.length), action("Hide diff", "close-diff", !this.open)];
    const b = e?.bounds;
    openMenu(items, b ? { x: b.x, y: b.y + b.height } : "pointer");
  }

  cancel(cx) {
    this.message = ""; this.input.set_value(""); this.typing = false; this.handle.focus(); cx.notify();
  }

  button(id, label, primary, enabled, action) {
    const face = div().h(24).min_w(72).bg(UI.dark).p(1)
      .child(div().size_full().bg(UI.shadow).pb(1).pr(1)
        .child(div().size_full().bg(UI.light).pt(1).pl(1)
          .child(h_flex().size_full().px(10).items_center().justify_center().bg(UI.panel).text_color(enabled ? UI.text : UI.shadow).child(label))));
    return div().id(id).h(28).min_w(76).p(2).when(primary, (el) => el.bg(UI.text)).when(enabled, (el) => el.cursor_pointer().hover((s) => s.opacity(0.82)).on_click(action)).child(face);
  }

  diffRow({ kind, number, text }) {
    if (kind === "@") return div().w_full().px(12).h(20).flex_none().truncate().bg(UI.panel).text_color(UI.muted).child(text);
    return h_flex().w_full().h(20).flex_none().gap(10).when(kind === "+", (e) => e.bg("#dff2df")).when(kind === "-", (e) => e.bg("#f5dddd"))
      .child(div().w(30).flex_none().text_right().text_color(UI.muted).child(number === undefined ? "" : String(number)))
      .child(div().flex_1().min_w(0).truncate().child(text));
  }

  render(cx) {
    if (key() !== this.context) this.refresh(cx);
    this.applyMenuAction(cx);
    const add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const enabled = Boolean(this.message.trim() && this.root && !this.busy && !this.loading);
    const listHeight = Math.min(148, Math.max(58, this.files.length * 22 + 8));
    const menuButton = (name) => div().id(`changes-menu-${name.toLowerCase()}`).h(18).px(8).flex().items_center().cursor_pointer().hover((s) => s.bg(UI.select))
      .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.menu(name, e); }).child(name);
    const list = v_flex().id("changes-list").absolute().inset_0().overflow_y_scroll().p(3).children(this.files.map((f) => {
      const parts = f.path.split("/"), name = parts.pop();
      const mark = f.status === "A" ? UI.add : f.status === "D" || f.status === "U" ? UI.remove : UI.changed;
      return h_flex().id(`change-${f.path}`).h(22).flex_none().px(5).gap(6).items_center().cursor_pointer().when(this.open === f.path, (e) => e.bg(UI.select)).hover((s) => s.bg(UI.select)).on_click((_e, cx) => this.pick(f.path, cx))
        .child(div().w(14).text_size(11).font_weight(700).text_color(mark).child(f.status))
        .child(h_flex().flex_1().min_w(0).child(div().text_color(UI.muted).truncate().child(parts.length ? parts.join("/") + "/" : "")).child(div().max_w(260).min_w(0).truncate().child(name)))
        .when(f.add > 0, (e) => e.child(div().text_size(11).text_color(UI.add).child(`+${f.add}`))).when(f.del > 0, (e) => e.child(div().text_size(11).text_color(UI.remove).child(`−${f.del}`)));
    })).when(!this.files.length, (e) => e.child(div().p(6).text_color(UI.muted).child(this.error || (this.loading ? "Loading changes…" : this.root ? "No uncommitted changes" : "No folder"))))
      .child(Scrollbar.vertical("changes-list").absolute().inset_0());
    const diff = div().relative().size_full().font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
      .child(div().id("changes-diff-x").size_full().overflow_x_scrollbar()
        .child(div().w_full().min_w(this.diffWidth).h_full().child(v_virtual_list("changes-diff", this.rows.length, 20, (i) => String(i),
          (range) => this.rows.slice(range.start, range.end).map((row) => this.diffRow(row))).size_full())))
      .child(Scrollbar.vertical("changes-diff").viewport_from_layout().absolute().inset_0())
      .when(!this.open && this.files.length > 0, (e) => e.child(div().absolute().top(6).px(10).text_color(UI.muted).child("Select a file to view its changes")));
    return v_flex().id("changes").size_full().min_h(0).overflow_hidden().bg(UI.panel).text_color(UI.text).font_family(FONT).text_size(12).track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape" && this.typing) { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); } })
      .child(h_flex().relative().h(20).flex_none().items_center().bg(UI.panel).border_t(1).border_b(1).border_color(UI.shadow)
        .child(div().absolute().top(0).left(0).w_full().h(1).bg(UI.light))
        .child(menuButton("File")).child(menuButton("Git")).child(menuButton("View")).child(div().flex_1())
        .child(div().pr(7).text_size(11).text_color(UI.muted).child(`${this.files.length} files`))
        .child(div().pr(6).text_size(11).text_color(UI.add).child(`+${add}`)).child(div().pr(8).text_size(11).text_color(UI.remove).child(`−${del}`)))
      .child(sunken(div().relative().child(list)).h(listHeight).flex_none().m(5).mb(3))
      .when(this.limited, (el) => el.child(div().px(8).pb(3).text_size(11).text_color(UI.muted).child("Showing the first 1,000 changed files")))
      .child(sunken(diff).flex_1().min_h(0).mx(5).mb(3))
      .when(Boolean(this.note), (e) => e.child(div().px(8).pb(3).text_size(11).text_color(UI.remove).child(this.note)))
      .child(h_flex().h(42).flex_none().px(7).gap(6).items_center().bg(UI.panel).border_t(1).border_color(UI.light)
        .child(sunken(div().id("commit-message").h(24).px(5).flex().items_center().cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(Input.new(this.input).h_full().text_size(12).text_color(UI.text))).flex_1().min_w(0).h(26))
        .child(this.button("commit-cancel", "Cancel", false, true, (_e, cx) => this.cancel(cx)))
        .child(this.button("commit", this.busy ? "Committing…" : "Commit", true, enabled, (_e, cx) => this.commit(cx))));
  }
}

export default class BeOSChanges extends View {
  init(_props, cx) {
    const menu = props()?.role === "menu";
    this.part = menu ? new ChangeMenu() : new Changes();
    if (menu) this.part.init(cx); else this.part.init(_props, cx);
  }
  render(cx) { return this.part.render(cx); }
}
