// Herdr BeOS startup screen: a black R5-inspired field with the custom He
// mark and seven local system icons illuminating once from left to right.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { FONT, icon } from "./kit.js";

const ICONS = ["disk", "folder", "terminal", "agent", "alert-info", "alert-warning", "trash"];

export default class Boot {
  init(_p, cx) {
    this.stage = 0;
    this.focus = cx.focus_handle();
    this.focus.focus();
    ICONS.forEach((_name, i) => {
      cx.timer.after(320 + i * 290, (cx) => {
        if (this.closed) return;
        this.stage = i + 1;
        cx.notify();
      });
    });
    cx.timer.after(2700, () => this.dismiss());
  }

  dismiss() {
    if (this.closed) return;
    this.closed = true;
    closeOverlay(props().overlay);
  }

  render() {
    const width = this.size?.width ?? 1000;
    const scale = Math.max(0.65, Math.min(1, width / 620));
    const disc = Math.round(56 * scale), glyph = Math.round(36 * scale), gap = Math.round(18 * scale), logoSize = Math.round(110 * scale);
    const logo = h_flex()
      .items_end()
      .text_size(logoSize)
      .font_weight(700)
      .italic()
      .line_height(`${logoSize}px`)
      .child(div().text_color("#1c3fbf").child("H"))
      .child(div().text_color("#d01010").child("e"));
    const stages = h_flex()
      .gap(gap)
      .items_center()
      .children(ICONS.map((name, i) => {
        const on = i < this.stage;
        return div()
          .size(disc)
          .rounded(Math.round(disc / 2))
          .border(2)
          .border_color(on ? "#7137a8" : "#2e1740")
          .bg(on ? "#351052" : "#13091c")
          .flex()
          .items_center()
          .justify_center()
          .opacity(on ? 1 : 0.22)
          .child(icon(name, glyph));
      }));
    return v_flex()
      .id("beos-boot")
      .size_full()
      .items_center()
      .justify_center()
      .gap(22)
      .bg("#000000")
      .font_family(FONT)
      .track_focus(this.focus)
      .on_size_change((size, cx) => {
        if (this.size?.width === size.width && this.size?.height === size.height) return;
        this.size = size; cx.notify();
      })
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        this.dismiss();
        cx.stop_propagation();
      })
      .on_click(() => this.dismiss())
      .child(logo)
      .child(stages);
  }
}
