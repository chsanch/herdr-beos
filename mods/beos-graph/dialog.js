// Git Graph action dialogs, with upstream validation and execution preserved
// inside a square, beveled BeOS R5 dialog that remains readable in dark mode.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { dialogFor, initialValues, validate } from "./git.js";
import { perform } from "./act.js";
import { icon } from "./menu.js";

export class Dialog {
  init(cx) {
    const { action, ctx } = props();
    this.spec = dialogFor(action, ctx);
    this.values = initialValues(action, ctx);
    this.focusedInput = 0;
    this.inputs = (this.spec.inputs ?? []).map((field, i) => {
      const state = InputState.new({ value: field.value ?? "" });
      state.on("change", (_e, cx) => { this.values[field.id] = state.value(); this.error = null; cx.notify(); });
      state.on("submit", (_e, cx) => this.confirm(cx));
      state.on("focus", (_e, cx) => { this.focusedInput = i; cx.notify(); });
      state.on("blur", (_e, cx) => { if (this.focusedInput === i) this.focusedInput = -1; cx.notify(); });
      return { field, state };
    });
    this.handle = cx.focus_handle();
    const first = this.inputs[0]?.state;
    if (first) {
      if (this.inputs[0].field.value) first.set_selected_range({ start: 0, end: this.inputs[0].field.value.length });
      first.focus();
      cx.timer.after(600, () => first.focus());
    } else this.handle.focus();
  }

  confirm(cx) {
    if (this.busy) return;
    const { action, ctx, overlay } = props();
    const problem = validate(action, this.values, ctx);
    if (problem) { this.error = problem; cx.notify(); return; }
    this.busy = true; this.error = null;
    cx.spawn(async (cx) => {
      const result = await perform(action, this.values, ctx, { toast: false });
      this.busy = false;
      if (result.ok) closeOverlay(overlay);
      else { this.error = result.message; cx.notify(); }
    });
    cx.notify();
  }

  danger() {
    const choice = this.spec.choice;
    return Boolean(this.spec.danger || choice?.options.find((o) => o.value === this.values[choice.id])?.danger);
  }

  render() {
    const s = this.spec, danger = this.danger();
    const label = (text) => div().pt(10).pb(4).text_size(11).text_color("#606060").child(text);
    const sunken = (content) => div().bg("#989898").pt(1).pl(1).child(div().size_full().bg("#ffffff").pb(1).pr(1).child(content.size_full().bg("#ffffff")));
    const button = (id, text, primary, action) => {
      const face = div().h(24).min_w(76).bg("#606060").p(1).child(div().size_full().bg("#989898").pb(1).pr(1)
        .child(div().size_full().bg("#ffffff").pt(1).pl(1).child(h_flex().size_full().px(10).items_center().justify_center().bg("#d8d8d8").child(text))));
      return div().id(id).h(28).min_w(80).p(2).when(primary, (e) => e.bg(danger ? "#a00000" : "#000000")).cursor_pointer().hover((e) => e.opacity(0.82)).on_click(action).child(face);
    };
    const body = v_flex().id("git-graph-dialog").track_focus(this.handle).size_full().min_h(0).p(14).bg("#d8d8d8").font_family("Arimo").text_color("#000000").text_size(12)
      .on_key_down((e, cx) => {
        if (e.key === "escape") closeOverlay(props().overlay);
        else if (e.key === "enter" && this.focusedInput < 0) this.confirm(cx);
        else return;
        cx.stop_propagation();
      })
      .child(h_flex().items_center().child(div().flex_1().font_weight(700).child(s.title)).child(div().text_size(10).text_color("#606060").child("Esc")))
      .when(Boolean(s.detail), (el) => el.child(div().pt(6).text_color("#606060").child(s.detail)))
      .children(this.inputs.map(({ field, state }, i) => v_flex().child(label(field.label))
        .child(sunken(Input.new(state).h(24).px(5).text_size(12).text_color("#000000")).h(26))))
      .when(Boolean(s.choice), (el) => el.child(label(s.choice.label)).children(s.choice.options.map((o) => {
        const on = this.values[s.choice.id] === o.value;
        return h_flex().id(`gd-choice-${o.value}`).h(30).mb(2).px(5).gap(7).items_center().cursor_pointer().when(on, (e) => e.bg("#999999")).hover((e) => e.bg("#999999"))
          .on_click((_e, cx) => { this.values[s.choice.id] = o.value; this.error = null; cx.notify(); })
          .child(div().size(13).flex_none().border_1().border_color("#606060").bg("#ffffff").flex().items_center().justify_center()
            .when(on, (e) => e.child(div().size(7).bg(o.danger ? "#a00000" : "#1c50c8"))))
          .child(div().font_weight(700).child(o.label))
          .when(Boolean(o.detail), (e) => e.child(div().text_size(11).text_color(o.danger ? "#a00000" : "#606060").child(o.detail)));
      })))
      .children((s.checks ?? []).map((c) => {
        const on = Boolean(this.values[c.id]);
        return h_flex().id(`gd-check-${c.id}`).pt(9).gap(7).items_center().cursor_pointer().on_click((_e, cx) => { this.values[c.id] = !on; cx.notify(); })
          .child(div().size(13).flex_none().border_1().border_color("#606060").bg(on ? "#1c50c8" : "#ffffff").flex().items_center().justify_center()
            .when(on, (e) => e.child(svg(icon("check")).size(10).text_color("#ffffff"))))
          .child(div().child(c.label));
      }))
      .when(Boolean(this.error), (el) => el.child(div().pt(9).text_size(11).text_color("#a00000").child(this.error)))
      .child(div().flex_1())
      .child(h_flex().pt(12).gap(6).justify_end().child(button("gd-cancel", "Cancel", false, () => closeOverlay(props().overlay)))
        .child(button("gd-ok", this.busy ? "Working…" : s.confirm, true, (_e, cx) => this.confirm(cx))));
    return div().size_full().bg("#606060").p(1).child(div().size_full().bg("#989898").pb(1).pr(1).child(div().size_full().bg("#ffffff").pt(1).pl(1).child(body)));
  }
}
