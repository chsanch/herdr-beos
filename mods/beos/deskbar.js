// The Deskbar, in the top-right corner like BeOS R5's, top to bottom:
//   the Be menu    the "He" logo button: terminals, applications, the boot
//                  preference, terminal colors, layouts and settings
//   the status     a sunken well: agents needing the person, and the clock
//                  (click it for the date)
//   the app list   every space as an app (folder icon, its status lamp); the
//                  shown space opens to its tabs as windows and, when split,
//                  their terminal or mod panels. Every agent follows below.
//                  Click selects or focuses; right-click opens its menu.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, panes, home, layouts, machines, run, setAgentOrder, shared, setShared, exec, openOverlay, closeOverlay, nextCommand, settings, playSound, appHome, window as appWindow } from "herdr";
import Desktop from "./desktop.js";
import { twitcherItems, currentIndex, TWITCHER } from "./twitcher.js";
import { C, root, raisedBox, sunkenBox, icon, programTile, lamp, openMenu, shortPath, terminalMode, TERMINAL_THEME_REQUEST, setTerminalTheme, resetWindows, windowOpen } from "./kit.js";

const WIDTH = 180;
const pad2 = (n) => String(n).padStart(2, "0");

/** The optional boot sound, relative to the Herdr home. Each person brings
 *  their own MP3; the repo ships none. */
const STARTUP_SOUND = "mods/beos/sounds/startup.mp3";

async function startupSoundFile() {
  // Herdr's fs/promises has neither access() nor stat(); ask the shell.
  try {
    const r = await exec("test", ["-f", `${appHome()}/${STARTUP_SOUND}`]);
    return r?.code === 0;
  } catch {
    return false;
  }
}

/** Seconds since Herdr started (the shell's parent), where ps can report it. */
async function appAge() {
  try {
    const r = await exec("sh", ["-c", 'ps -o etime= -p "$PPID"']);
    const m = r.stdout.trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
    if (!m) return null;
    const [, d, h, mi, s] = m.map((x) => Number(x) || 0);
    return ((d * 24 + h) * 60 + mi) * 60 + s;
  } catch {
    return null;
  }
}

export default class Deskbar {
  init(p, cx) {
    this.showDate = false;
    this.terminalThemeWriting = false;
    this.twitchId = null;
    this.twitchIdx = 0;
    this.twitchAt = 0;
    this.sound = false;
    resetWindows();
    this.desktop = new Desktop();
    this.desktop.init(p, cx);
    // A process-start estimate catches the first BeOS entry in this app; the
    // close mark catches every later leave-and-return without mistaking reloads.
    const left = Number(shared("beos.left")) || 0;
    if (left) setShared("beos.left", null);
    cx.spawn(async () => {
      const age = await appAge();
      const launch = age === null ? null : Date.now() - age * 1000;
      const known = Number(shared("beos.launch")) || 0;
      const newProcess = launch !== null && Math.abs(launch - known) > 3000;
      if (launch !== null) setShared("beos.launch", launch);
      this.boot(newProcess || left > 0);
    });
    // The Startup Sound menu item is enabled only when the file is there.
    cx.spawn(async (cx) => {
      this.sound = await startupSoundFile();
      cx.notify();
    });
    // Ctrl+Tab in BeOS: beos.twitcher opens the strip and beos.twitcherPrev
    // opens it backwards. Later presses close it and open it one item along;
    // the open copy also moves itself if a command reaches it.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        try {
          if (c === "twitcher" || c === "twitcherPrev") this.twitch(c === "twitcherPrev" ? -1 : 1);
        } catch (e) {
          console.log(`beos twitcher: ${c} failed: ${e}`);
        }
        cx.notify();
      }
    });
    // The clock shows minutes: check a few times a minute, redraw on change.
    this.now = this.stamp();
    cx.timer.every(5000, (cx) => {
      const s = this.stamp();
      if (s !== this.now) {
        this.now = s;
        cx.notify();
      }
    });
  }

  async close() {
    setShared("beos.left", Date.now());
  }

  stamp() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  boot(entering = false) {
    if (!entering || shared("beos.bootScreen") === false) return;
    openOverlay({ mod: "beos", kind: "dialog", frame: "none", modal: true, width: 1, height: 1, props: { role: "boot" } });
    this.startupSound();
  }

  /** The optional boot MP3: only on entering, never on a mod reload, and
   *  only when the file exists, Herdr's sounds are on and the item is checked. */
  async startupSound() {
    if (settings()?.sounds?.enabled === false) return;
    if (shared("beos.startupSound") === false) return;
    // Check the file here, not the flag from init: boot() can run before
    // that check finishes.
    this.sound = await startupSoundFile();
    if (!this.sound) return;
    try {
      playSound(STARTUP_SOUND);
    } catch {}
  }

  /** Opens the Twitcher (`dir` 1 forwards, -1 backwards). Every ctrl-tab
   *  closes the strip and opens the next one: the chosen index is the
   *  Deskbar's, so the strip never stacks, and a chosen/cancelled one clears
   *  the session (the copy also moves itself if a command reaches it). */
  twitch(dir) {
    const { items, split } = twitcherItems();
    const n = items.length;
    const both = split > 0 && split < n;
    // Closing the strip we opened last is how the index advances. If that id
    // is already gone (the app closed it on Escape), closing it fails: start
    // from the focused pane again instead of counting from a stale index.
    let gone = this.twitchId == null;
    if (this.twitchId) {
      try {
        closeOverlay(this.twitchId);
      } catch {
        gone = true;
      }
      this.twitchId = null;
    }
    const closed = Number(shared("beos.twitcher")?.closed) || 0;
    const fresh = gone || closed > this.twitchAt;
    if (fresh) {
      const cur = currentIndex(items);
      this.twitchIdx = n ? (cur < 0 ? (dir > 0 ? 0 : n - 1) : (cur + dir + n) % n) : 0;
    } else {
      this.twitchIdx = n ? (this.twitchIdx + dir + n) % n : 0;
    }
    this.twitchAt = Date.now();
    const maxW = Math.max(200, (appWindow()?.width ?? 900) - 48);
    const longest = items.reduce((w, it) => Math.max(w, String(it.label ?? "").length), 0);
    const width = Math.min(maxW, Math.max(TWITCHER.width(n, both), longest * 7 + TWITCHER.pad));
    this.twitchId = openOverlay({
      mod: "beos",
      kind: "dialog",
      modal: true,
      frame: "none",
      width,
      height: TWITCHER.height,
      props: { role: "twitcher", at: this.twitchIdx, width },
    });
  }

  applyTerminalTheme(cx) {
    const request = shared(TERMINAL_THEME_REQUEST);
    if (!request?.mode || this.terminalThemeWriting) return;
    this.terminalThemeWriting = true;
    // Claim synchronously: closing the popup cannot cancel this Deskbar task.
    setShared(TERMINAL_THEME_REQUEST, null);
    cx.spawn(async (cx) => {
      try {
        await setTerminalTheme(request.mode);
      } finally {
        this.terminalThemeWriting = false;
        cx.notify();
      }
    });
  }

  /** Where a menu opens: under the pressed element. */
  below(e) {
    const b = e?.bounds;
    return b ? { x: b.x, y: b.y + b.height } : undefined;
  }

  beMenu(e) {
    const mode = terminalMode();
    const bootScreen = shared("beos.bootScreen") !== false;
    const startupSound = shared("beos.startupSound") !== false;
    const others = layouts().filter((n) => n !== "beos");
    openMenu(
      [
        { label: "About Herdr BeOS…", act: { notify: { title: "Herdr BeOS", body: "A BeOS R5 look for Herdr. The terminals are herdr-core's.", level: "info" } } },
        { sep: true },
        { label: "New Terminal", act: { run: ["tab.new"] } },
        { label: "New Space", act: { run: ["space.new"] } },
        { sep: true },
        { header: true, label: "Applications" },
        { label: "Files", checked: windowOpen("files"), act: { window: "files" } },
        { label: "Changes", checked: windowOpen("changes"), act: { window: "changes" } },
        { label: "Graph", checked: windowOpen("graph"), act: { window: "graph" } },
        { sep: true },
        { label: "Boot Screen", checked: bootScreen, act: { bootScreen: !bootScreen } },
        {
          label: this.sound ? "Startup Sound" : "Startup Sound (none)",
          checked: startupSound,
          disabled: !this.sound,
          act: { startupSound: !startupSound },
        },
        { sep: true },
        { header: true, label: "Terminal colors" },
        { label: "Follow the system", checked: mode === "auto", act: { terminal: "auto" } },
        { label: "Light", checked: mode === "light", act: { terminal: "light" } },
        { label: "Dark", checked: mode === "dark", act: { terminal: "dark" } },
        { sep: true },
        { header: true, label: "Layouts" },
        ...others.map((n) => ({ label: n, act: { run: ["layout.switch", { name: n }] } })),
        { sep: true },
        { label: "Command Palette…", act: { run: ["app.palette"] } },
        { label: "Settings…", act: { run: ["app.settings"] } },
      ],
      this.below(e),
      { right: e?.bounds ? e.bounds.x + e.bounds.width : null, width: 200 },
    );
  }

  spaceMenu(s) {
    openMenu(
      [
        { label: s.name, header: true },
        { label: "New Tab", act: { run: ["tab.new", { space: s.id }] } },
        { label: "Rename…", act: { alert: { kind: "rename", title: "Rename space", value: s.name, ok: "Rename", act: { run: ["space.rename", { id: s.id }] } } } },
        { sep: true },
        { label: "Close Space", act: { alert: { kind: "confirm", title: `Close space “${s.name}”?`, body: "Its terminals will be closed.", ok: "Close", act: { run: ["space.close", { id: s.id, confirmed: true }] } } } },
      ],
      "pointer",
    );
  }

  /** A machine's menu: a new space there, or a new terminal in its shown
   *  (else first) space. `machine: ""` is this computer. */
  machineMenu(name, label, off) {
    const mine = spaces().filter((s) => s.machine === name);
    const target = mine.find((s) => s.active) ?? mine[0];
    openMenu(
      [
        { label, header: true },
        { label: "New Space", disabled: off, act: { run: ["space.new", { machine: name ?? "" }] } },
        {
          label: target ? `New Terminal in ${target.name}` : "New Terminal",
          disabled: off,
          act: target ? { run: ["tab.new", { space: target.id }] } : { run: ["space.new", { machine: name ?? "" }] },
        },
      ],
      "pointer",
    );
  }

  tabMenu(s, t) {
    const body = s.tabs.length === 1 ? `It's the last tab: the space “${s.name}” closes too.` : "Its terminals will be closed.";
    openMenu(
      [
        ...(t.settled ? [{ label: "Show", act: { runs: [["tab.unsettle", { id: t.id }], ["tab.select", { id: t.id }]] } }, { sep: true }] : []),
        { label: "Rename…", act: { alert: { kind: "rename", title: "Rename tab", value: t.name, ok: "Rename", act: { run: ["tab.rename", { id: t.id }] } } } },
        { sep: true },
        { label: "Close Tab", act: { alert: { kind: "confirm", title: `Close tab “${t.name}”?`, body, ok: "Close", act: { run: ["tab.close", { id: t.id, confirmed: true }] } } } },
      ],
      "pointer",
    );
  }

  agentMenu(a) {
    openMenu(
      [
        { label: "Focus", act: { run: ["agent.focus", { terminal: a.address }] } },
        { label: a.pinned ? "Unpin" : "Pin to Top", act: { run: ["terminal.pin", { terminal: a.address, pinned: !a.pinned }] } },
      ],
      "pointer",
    );
  }

  // ---- parts

  logo() {
    // Herdr's "He" set like Be's logo: a blue capital and a red lowercase.
    return h_flex()
      .items_end()
      .text_size(19)
      .font_weight(700)
      .italic()
      .child(div().text_color("#1c3fbf").child("H"))
      .child(div().text_color("#d01010").child("e"));
  }

  beButton() {
    return h_flex()
      .id("be-menu")
      .h(30)
      .w_full()
      .items_center()
      .justify_center()
      .hover((s) => s.bg("#e4e4e4"))
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        this.beMenu(e);
      })
      .child(this.logo());
  }

  status() {
    const all = agents();
    const blocked = all.filter((a) => a.status === "blocked").length;
    const done = all.filter((a) => a.status === "done").length;
    const working = all.filter((a) => a.status === "working").length;
    const count = (status, n) =>
      n ? h_flex().gap(3).items_center().child(lamp(status)).child(div().text_size(11).child(String(n))) : null;
    const d = new Date();
    const clock = this.showDate ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : this.now;
    return sunkenBox(
      h_flex()
        .h(22)
        .w_full()
        .px(6)
        .items_center()
        .justify_between()
        .child(h_flex().gap(7).items_center().children([count("blocked", blocked), count("done", done), count("working", working)].filter(Boolean)))
        .child(
          div()
            .id("clock")
            .text_size(11)
            .on_click((_e, cx) => {
              this.showDate = !this.showDate;
              cx.notify();
              if (this.showDate)
                cx.timer.after(3000, (cx) => {
                  this.showDate = false;
                  cx.notify();
                });
            })
            .child(clock),
        ),
    ).w_full();
  }

  tabRow(s, t, tabPanes) {
    const own = agents().filter((a) => a.tab === t.id);
    const agent = own[0];
    const name = tabPanes.length > 1 || t.named || !agent ? t.name : `${t.name} · ${agent.program?.name ?? "agent"}`;
    const dim = Boolean(t.settled);
    return h_flex()
      .id(`dt-${t.id}`)
      .h(20)
      .w_full()
      .pl(22)
      .pr(6)
      .gap(5)
      .items_center()
      .when(t.active && !dim, (el) => el.bg(C.sunken))
      .hover((st) => st.bg(C.select))
      .on_click(() => {
        if (!s.active) run("space.select", { id: s.id });
        if (t.settled) run("tab.unsettle", { id: t.id });
        run("tab.select", { id: t.id });
      })
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        this.tabMenu(s, t);
      })
      .child(div().when(dim, (el) => el.opacity(0.45)).child(icon(agent ? "agent" : "terminal", 14)))
      .child(
        div()
          .flex_1()
          .min_w(0)
          .truncate()
          .text_size(11)
          .when(dim, (el) => el.text_color(C.disabled))
          .when(t.active && !dim, (el) => el.font_weight(700))
          .child(name),
      )
      .child(lamp(t.status));
  }

  panelRow(s, t, p, userHome) {
    const name = p.mod
      ? p.title || p.mod
      : p.program?.shell
        ? `Terminal — ${shortPath(p.cwd, userHome)}`
        : p.program?.name || p.title || "Terminal";
    return h_flex()
      .id(`dp-${p.pane}`)
      .h(18)
      .w_full()
      .pl(36)
      .pr(6)
      .gap(5)
      .items_center()
      .hover((st) => st.bg(C.select))
      .on_click(() => {
        if (!s.active) run("space.select", { id: s.id });
        run("tab.select", { id: t.id });
        run("pane.focus", { pane: p.pane });
      })
      .child(p.program?.agent || p.status ? programTile(p.program, 12) : icon("terminal", 12))
      .child(div().flex_1().min_w(0).truncate().text_size(11).when(p.focused, (el) => el.font_weight(700)).child(name))
      .child(lamp(p.status));
  }

  spaceRow(s) {
    return h_flex()
      .id(`ds-${s.id}`)
      .h(24)
      .w_full()
      .px(5)
      .gap(6)
      .items_center()
      .hover((st) => st.bg(C.select))
      .on_click(() => run("space.select", { id: s.id }))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        this.spaceMenu(s);
      })
      .child(icon("folder", 18))
      .child(div().flex_1().min_w(0).truncate().when(s.active, (el) => el.font_weight(700)).child(s.name))
      .child(lamp(s.status));
  }

  /** A sunken heading shared by machine and agent sections. */
  sectionRow(id, label, iconName, off = false) {
    return h_flex()
      .id(id)
      .h(20)
      .w_full()
      .px(5)
      .gap(5)
      .items_center()
      .bg(C.sunken)
      .text_size(10)
      .font_weight(700)
      .text_color(off ? C.disabled : C.dark)
      .child(div().when(off, (el) => el.opacity(0.4)).child(icon(iconName, 16)))
      .child(div().flex_1().min_w(0).truncate().child(label.toUpperCase()));
  }

  /** A machine's heading in the app list: its disk, its name, and whether
   *  it answers. This computer is "This Mac" (or "This computer"). */
  machineRow(name, state) {
    const off = state === "unavailable";
    const label = name ?? (appWindow()?.platform === "macos" ? "This Mac" : "This computer");
    return this.sectionRow(`dm-${name ?? "local"}`, label, "disk", off)
      .on_mouse_down("left", (_e, cx) => {
        cx.stop_propagation();
        this.machineMenu(name, label, off);
      })
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        this.machineMenu(name, label, off);
      })
      .when(off, (el) => el.child(div().font_weight(400).child("offline")))
      .when(state === "loading", (el) => el.child(div().font_weight(400).frames(["·  ", "·· ", "···"], 300)));
  }

  agentRow(a) {
    const name = `${a.program?.name ?? a.app ?? "Agent"} · ${a.space_name} / ${a.tab_name}`;
    return h_flex()
      .id(`da-${a.address}`)
      .h(20)
      .w_full()
      .pl(22)
      .pr(6)
      .gap(5)
      .items_center()
      .hover((st) => st.bg(C.select))
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        this.agentMenu(a);
      })
      .child(programTile(a.program))
      .child(div().flex_1().min_w(0).truncate().text_size(11).when(a.focused, (el) => el.font_weight(700)).child(name))
      .child(lamp(a.status));
  }

  apps() {
    const rows = [];
    const all = spaces();
    const allPanes = panes();
    const userHome = home();
    // Spaces come local first, then by machine: a heading whenever it changes,
    // but none when every space is on this computer.
    const multi = all.some((s) => s.machine != null) || machines().some((m) => m.name != null);
    const state = new Map(machines().map((m) => [m.name, m.layout]));
    let last;
    for (const s of all) {
      if (multi && s.machine !== last) {
        rows.push(this.machineRow(s.machine, state.get(s.machine)));
        rows.push(div().h(1).w_full().bg(C.shadow));
        last = s.machine;
      }
      rows.push(this.spaceRow(s));
      if (s.active) {
        // Put-away tabs stay listed, dimmed at the end, so they can be shown again.
        const tabs = [...s.tabs.filter((t) => !t.settled), ...s.tabs.filter((t) => t.settled)];
        for (const t of tabs) {
          const tabPanes = allPanes.filter((p) => p.tab === t.id);
          rows.push(this.tabRow(s, t, tabPanes));
          if (tabPanes.length > 1) rows.push(...tabPanes.map((p) => this.panelRow(s, t, p, userHome)));
        }
      }
      rows.push(div().h(1).w_full().bg(C.shadow));
    }
    const listed = agents();
    const ordered = [...listed.filter((a) => a.pinned), ...listed.filter((a) => !a.pinned)];
    setAgentOrder(ordered.map((a) => a.address));
    if (ordered.length) {
      rows.push(this.sectionRow("dm-agents", "Agents", "agent"));
      rows.push(...ordered.map((a) => this.agentRow(a)));
    }
    return v_flex().w_full().children(rows);
  }

  render(cx) {
    this.applyTerminalTheme(cx);
    const bar = v_flex()
      .w_full()
      .child(this.beButton())
      .child(div().px(3).pb(3).child(this.status()))
      .child(div().h(1).w_full().bg(C.shadow))
      .child(this.apps());
    return root(
      v_flex()
        .id("deskbar-root")
        .size_full()
        .items_end()
        .child(raisedBox(bar).w(WIDTH))
        .child(this.desktop.render(cx)),
    );
  }
}
