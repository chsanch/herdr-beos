// BeOS R5-style alerts for actions launched by this mod's menus: destructive
// confirmation and renaming, with native keyboard focus and text editing.

import { div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { C, root, raisedBox, sunkenBox, icon, perform } from "./kit.js";

export default class Alert {
  init(p, cx) {
    this.data = props() ?? p ?? {};
    this.handle = cx.focus_handle();
    if (this.data.kind === "rename") {
      const value = this.data.value ?? "";
      this.input = InputState.new({ value });
      this.input.set_selected_range({ start: 0, end: value.length });
      this.input.on("submit", () => this.accept());
      this.input.focus();
      cx.timer.after(300, () => this.input.focus());
    } else {
      this.handle.focus();
    }
  }

  cancel() {
    closeOverlay(props().overlay);
  }

  accept() {
    const p = props() ?? this.data;
    closeOverlay(p.overlay);
    if (p.kind === "rename" && p.act?.run) {
      const [name, args = {}] = p.act.run;
      perform({ run: [name, { ...args, name: this.input?.value() ?? "" }] });
      return;
    }
    perform(p.act);
  }

  key(e, cx) {
    const p = props() ?? this.data;
    if (e.key === "escape") this.cancel();
    else if (e.key === "enter" && p.kind !== "rename") this.accept();
    else return;
    cx.stop_propagation();
  }

  button(id, label, primary, action) {
    const face = div()
      .h(24)
      .min_w(72)
      .bg(C.dark)
      .p(1)
      .child(
        div()
          .size_full()
          .bg(C.shadow)
          .pb(1)
          .pr(1)
          .child(
            div()
              .size_full()
              .bg(C.light)
              .pt(1)
              .pl(1)
              .child(h_flex().size_full().px(10).items_center().justify_center().bg(C.panel).child(label)),
          ),
      );
    return div()
      .id(id)
      .h(28)
      .min_w(76)
      .p(2)
      .when(primary, (el) => el.bg(C.text))
      .cursor_pointer()
      .hover((el) => el.opacity(0.82))
      .on_click(action)
      .child(face);
  }

  render() {
    const p = props() ?? this.data;
    const rename = p.kind === "rename";
    const content = v_flex()
      .relative()
      .flex_1()
      .h(rename ? 174 : 152)
      .min_w(0)
      .pt(12)
      .pr(12)
      .pb(10)
      .pl(30)
      .child(div().absolute().left(-16).top(10).child(icon(rename ? "alert-info" : "alert-warning", 32)))
      .child(div().w_full().font_weight(700).child(p.title ?? (rename ? "Rename" : "Are you sure?")))
      .when(Boolean(p.body), (el) => el.child(div().w_full().pt(7).pr(4).text_color(C.dark).child(p.body)))
      .when(rename, (el) => el.child(div().pt(12).pr(4).child(sunkenBox(Input.new(this.input).h(24).px(5).bg(C.light).text_color(C.text)).w_full())))
      .child(div().flex_1())
      .child(
        h_flex()
          .justify_end()
          .gap(6)
          .child(this.button("alert-cancel", "Cancel", false, () => this.cancel()))
          .child(this.button("alert-ok", p.ok ?? (rename ? "Rename" : "OK"), true, () => this.accept())),
      );
    return root(
      div()
        .id("alert")
        .size_full()
        .track_focus(this.handle)
        .on_key_down((e, cx) => this.key(e, cx))
        .child(
          raisedBox(
            h_flex()
              .w_full()
              .h(rename ? 174 : 152)
              .child(div().w(30).h_full().flex_none().bg("#bfbfbf"))
              .child(content),
          ).size_full(),
        ),
    );
  }
}
