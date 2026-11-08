// Git Graph's right-click menu, kept behavior-for-behavior but drawn as a
// compact BeOS R5 raised menu in every system appearance.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, notify } from "herdr";
import { menuFor } from "./git.js";
import { perform, openDialog, showChanges } from "./act.js";

// A glyph of this mod, or another mod's icon by its path (Herdr's own Changes icon).
export const icon = (name) => (name.includes("/") ? name : `mods/beos-graph/icons/${name}.svg`);

export class Menu {
  init(cx) {
    const { target, ctx } = props();
    this.items = menuFor(target, ctx);
    this.at = -1;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  choose(i, cx) {
    const it = this.items[i], { overlay, ctx } = props();
    if (!it || it.separator || this.busy) return;
    const a = it.action;
    if (a.type === "copy") {
      cx.write_to_clipboard(a.text);
      closeOverlay(overlay);
      notify({ title: "Copied", body: a.text, level: "success", timeout: 2000 });
    } else if (a.type === "showChanges") {
      closeOverlay(overlay);
      showChanges();
    } else if (openDialog(a, ctx)) {
      closeOverlay(overlay);
    } else {
      // Runs here, then closes: a closed popup's tasks would be cancelled.
      this.busy = i;
      cx.spawn(async (cx) => { await perform(a, {}, ctx); closeOverlay(overlay); cx.notify(); });
    }
    cx.notify();
  }

  move(step) {
    const n = this.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.at + step * k + n * 2) % n;
      if (!this.items[i].separator) { this.at = i; return; }
    }
  }

  render(cx) {
    const list = v_flex().id("git-graph-menu").track_focus(this.handle).size_full().p(3).bg("#d8d8d8").font_family("Arimo").text_size(12).text_color("#000000")
      .on_key_down((e, cx) => {
        if (e.key === "down") this.move(1);
        else if (e.key === "up") this.move(-1);
        else if (e.key === "enter") this.choose(this.at, cx);
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.stop_propagation(); cx.notify();
      })
      .children(this.items.map((it, i) => it.separator
        ? div().mx(4).h(7).flex_none().flex().flex_col().justify_center().child(div().h(1).bg("#989898")).child(div().h(1).bg("#ffffff"))
        : h_flex().id(`gm-${i}`).h(22).flex_none().px(6).gap(7).items_center().cursor_pointer()
          .text_color(it.action.type.startsWith("delete") ? "#a00000" : "#000000")
          .when(i === this.at || this.busy === i, (el) => el.bg("#999999")).hover((s) => s.bg("#999999"))
          .on_click((_e, cx) => this.choose(i, cx))
          .child(svg(icon(it.icon)).size(13).flex_none().text_color(it.action.type.startsWith("delete") ? "#a00000" : "#606060"))
          .child(div().flex_1().min_w(0).truncate().child(this.busy === i ? "Working…" : it.label))));
    return div().size_full().bg("#606060").p(1).child(div().size_full().bg("#989898").pb(1).pr(1).child(div().size_full().bg("#ffffff").pt(1).pl(1).child(list)));
  }
}
