// A BeOS popup menu: props { items, overlay }. Gray panel with a raised
// bevel; the item under the pointer (or chosen with the arrows) is darkened.
// Enter or a click acts and closes; Escape closes (the app's).

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { C, MENU, root, raisedBox, perform } from "./kit.js";

export default class Menu {
  init(_p, cx) {
    this.at = -1;
    this.focus = cx.focus_handle();
    this.focus.focus();
  }

  items() {
    return props()?.items ?? [];
  }

  pickable(it) {
    return it && !it.sep && !it.header && !it.disabled;
  }

  choose(it) {
    if (!this.pickable(it)) return;
    // Queue terminal writes while this popup is certainly still alive. The
    // persistent Deskbar performs them after the popup closes.
    if (it.act?.terminal) perform(it.act);
    closeOverlay(props().overlay);
    if (!it.act?.terminal) perform(it.act);
  }

  move(d) {
    const items = this.items();
    let i = this.at;
    for (let n = 0; n < items.length; n++) {
      i = (i + d + items.length) % items.length;
      if (this.pickable(items[i])) break;
    }
    this.at = i;
  }

  key(e, cx) {
    if (e.key === "down") this.move(1);
    else if (e.key === "up") this.move(-1);
    else if (e.key === "enter" || e.key === "space") this.choose(this.items()[this.at]);
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  row(it, i) {
    if (it.sep)
      return div()
        .h(MENU.sep)
        .flex()
        .flex_col()
        .justify_center()
        .px(4)
        .child(div().h(1).w_full().bg(C.shadow))
        .child(div().h(1).w_full().bg(C.light));
    if (it.header)
      return h_flex().h(MENU.row).items_center().px(10).text_size(11).text_color(C.dark).child(it.label);
    const on = i === this.at && !it.disabled;
    return h_flex()
      .id(`mi-${i}`)
      .h(MENU.row)
      .w_full()
      .items_center()
      .text_color(it.disabled ? C.disabled : C.text)
      .when(on, (el) => el.bg(C.select))
      .on_mouse_move((_e, cx) => {
        if (this.at === i) return;
        this.at = i;
        cx.notify();
      })
      .on_click(() => this.choose(it))
      .child(
        div()
          .w(20)
          .flex_none()
          .flex()
          .justify_center()
          .when(Boolean(it.checked), (el) => el.child(div().w(6).h(6).bg(C.text))),
      )
      .child(div().flex_1().min_w(0).truncate().when(Boolean(it.bold), (el) => el.font_weight(700)).child(it.label))
      .child(div().w(10).flex_none());
  }

  render(_cx) {
    const list = v_flex()
      .size_full()
      .py(MENU.pad)
      .children(this.items().map((it, i) => this.row(it, i)));
    return root(
      div()
        .id("menu")
        .size_full()
        .track_focus(this.focus)
        .on_key_down((e, cx) => this.key(e, cx))
        .child(raisedBox(list).size_full()),
    );
  }
}
