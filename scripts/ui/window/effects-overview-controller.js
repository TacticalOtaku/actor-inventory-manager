// ─────────────────────────────────────────────────────────
// AIM: Actor Window - Effects, Overview & Biography Controller
// ─────────────────────────────────────────────────────────

import { buildEffectsContext, createActorEffect, effectMenuEntries } from "../effects.js";
import { openItemMenu } from "../equipment.js";
import { hasFavorites } from "../favorites.js";
import { glideFrom, measure } from "../motion.js";
import { buildBiographyContext, buildOverviewContext, cardDialogs, hasOverview } from "../overview.js";

export class EffectsOverviewController {
  constructor(app) {
    this.app = app;
    // «where:uuid» of the effect row whose details are open.
    this.effectOpen = null;
    this._effectGlide = null;
    this._effectFocus = null;
  }

  buildEffectsContext() {
    return buildEffectsContext(this.app.actor, {
      open: this.effectOpen,
      canFavorite: hasFavorites(this.app.actor) && this.app.canEdit
    });
  }

  buildOverviewContext() {
    return hasOverview(this.app.actor)
      ? buildOverviewContext(this.app.actor, { canFavorite: hasFavorites(this.app.actor) && this.app.canEdit })
      : null;
  }

  buildBiographyContext() {
    return buildBiographyContext(this.app.actor);
  }

  editingBio() {
    const el = this.app.element;
    const active = el?.ownerDocument.activeElement;
    return Boolean(el?.querySelector("[data-bio-editor][open]") || (active?.closest?.("[data-bio-field]") && el.contains(active)));
  }

  afterRender() {
    const el = this.app.element;
    if (this._effectGlide) {
      if (this.app.motionOn) glideFrom(el, ".aim-effwrap, .aim-eff-cat", this._effectGlide);
      this._effectGlide = null;
    }
    if (this._effectFocus) {
      const wrap = el.querySelector(`.aim-effwrap[data-key="${CSS.escape(this._effectFocus.key)}"]`);
      const action = this._effectFocus.action && wrap?.querySelector(`[data-action="${this._effectFocus.action}"]`);
      (action ?? wrap?.querySelector(".aim-effect-toggle, [data-effect-row]"))?.focus({ preventScroll: true });
      this._effectFocus = null;
    }
  }

  async effectFrom(node) {
    const uuid = node?.closest("[data-effect-uuid]")?.dataset.effectUuid;
    return uuid ? foundry.utils.fromUuid(uuid) : null;
  }

  measureEffects() {
    const el = this.app.element;
    this._effectGlide = measure(el, ".aim-effwrap, .aim-eff-cat");
    const focused = el.ownerDocument.activeElement;
    const wrap = el.contains(focused) ? focused.closest("[data-effect-uuid]") : null;
    this._effectFocus = wrap ? { key: wrap.dataset.key, action: focused.dataset.action ?? null } : null;
  }

  toggleEffectOpen(row) {
    const key = `${row.dataset.where}:${row.closest("[data-effect-uuid]").dataset.effectUuid}`;
    this.effectOpen = this.effectOpen === key ? null : key;
    this.measureEffects();
    return this.app.render({ parts: ["rail", "main"] });
  }

  async openEffectMenu(row, event) {
    const effect = await this.effectFrom(row);
    if (!effect) return;
    const wrap = row.closest("[data-effect-uuid]");
    const entries = effectMenuEntries(this.app.actor, effect, { concentration: row.classList.contains("is-concentration") });
    openItemMenu(this.app.element, { getBoundingClientRect: () => new DOMRect(event.clientX, event.clientY, 0, 0) }, entries, wrap);
  }

  revealFavorite({ type, id }) {
    const tab = type === "effect" ? "effects" : "overview";
    if (!this.app.switchTo(tab)) return;
    const panel = this.app.element.querySelector(`[data-panel="${tab}"]`);
    const row = type === "effect"
      ? [...panel.querySelectorAll("[data-effect-rel]")].find((el) => el.dataset.effectRel === id)?.querySelector("[data-effect-row]")
      : panel.querySelector(`.aim-check[data-action="${type === "skill" ? "rollSkill" : "rollTool"}"][data-key="${CSS.escape(id)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "nearest", behavior: this.app.motionOn ? "smooth" : "auto" });
    row.classList.remove("is-found");
    void row.offsetWidth;
    row.classList.add("is-found");
    row.addEventListener("animationend", () => row.classList.remove("is-found"), { once: true });
  }

  async handleChange(input) {
    if (input.matches?.("[data-bio-field], [data-bio-editor]")) {
      if (this.app.canEdit) await this.app.actor.update({ [input.name]: input.value });
      return true;
    }
    if (input.dataset.effectToggle) {
      const item = this.app.itemFrom(input);
      if (this.app.canEdit) await item?.effects.get(input.dataset.effectToggle)?.update({ disabled: !input.checked });
      return true;
    }
    return false;
  }

  handleKeydown(event) {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches?.("[data-effect-row]")) {
      event.preventDefault();
      this.toggleEffectOpen(event.target);
      return true;
    }
    return false;
  }

  async toggleEffect(target) {
    const effect = await this.effectFrom(target);
    if (!effect || !this.app.canEdit) return;
    if (effect.isSuppressed) return this.app.shake(target.closest("[data-effect-row]"));
    this.measureEffects();
    await effect.update({ disabled: !effect.disabled });
  }

  removeCondition(target) {
    if (!this.app.canEdit) return;
    this.measureEffects();
    return this.app.actor.toggleStatusEffect(target.dataset.status, { active: false });
  }

  toggleCondition(target) {
    if (!this.app.canEdit) return;
    this.measureEffects();
    return this.app.actor.toggleStatusEffect(target.dataset.status);
  }

  createEffect() {
    if (this.app.canEdit) return createActorEffect(this.app.actor);
  }

  rollSkill(event, target) {
    if (this.app.canEdit) return this.app.actor.rollSkill({ skill: target.dataset.key, event });
  }

  rollSave(event, target) {
    if (this.app.canEdit) return this.app.actor.rollSavingThrow({ ability: target.dataset.key, event });
  }

  rollTool(event, target) {
    if (this.app.canEdit) return this.app.actor.rollToolCheck({ tool: target.dataset.key, event });
  }

  cardConfig(target) {
    if (!this.app.canEdit) return;
    const dialogs = cardDialogs(this.app.actor, target.dataset.card);
    if (dialogs.length === 1) return dialogs[0].open();
    openItemMenu(
      this.app.element,
      target,
      dialogs.map((d) => ({ name: d.label, icon: '<i class="fa-light fa-gear"></i>', callback: d.open })),
      target
    );
  }
}

export const EFFECTS_OVERVIEW_ACTIONS = {
  toggleEffect(_event, target) { return this._effects.toggleEffect(target); },
  toggleEffectOpen(_event, target) { const row = target.closest("[data-effect-row]"); if (row) return this._effects.toggleEffectOpen(row); },
  removeCondition(_event, target) { return this._effects.removeCondition(target); },
  toggleCondition(_event, target) { return this._effects.toggleCondition(target); },
  createEffect() { return this._effects.createEffect(); },
  rollSkill(event, target) { return this._effects.rollSkill(event, target); },
  rollSave(event, target) { return this._effects.rollSave(event, target); },
  rollTool(event, target) { return this._effects.rollTool(event, target); },
  cardConfig(_event, target) { return this._effects.cardConfig(target); }
};
