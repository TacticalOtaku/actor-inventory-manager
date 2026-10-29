// ─────────────────────────────────────────────────────────
// AIM: Preset Editor - the GM builds doll presets: figure, slots, attunement limit (ApplicationV2)
// ─────────────────────────────────────────────────────────

import { FIGURES, MODULE_ID, REFRESH_HOOK } from "../constants.js";
import { isSupportedActor } from "../core/actor-scope.js";
import { getActorSourceAttunementMax } from "../core/attunement.js";
import { PHYSICAL_ITEM_TYPES } from "../core/item-classifier.js";
import { SLOT_ZONES, dollLayout } from "../core/paperdoll-layout.js";
import {
  deleteWorldCustomTemplate,
  getActorPaperdollTemplate,
  getAllTemplates,
  getTemplateById,
  importTemplateJSON,
  isWorldCustomTemplate,
  planTemplateApply,
  saveWorldCustomTemplate,
  setActorPaperdollTemplate
} from "../core/paperdoll-templates.js";
import { addSlot, moveSlot, presetIdFor, removeSlot, sameAsPreset, workingFrom } from "../core/preset-editor.js";
import { escapeHTML, t } from "./html.js";
import { stampTheme } from "./theme-root.js";
import { FIGURE_VIEW } from "./doll.js";
import { LOG } from "../foundry/logger.js";

const TEMPLATES = `modules/${MODULE_ID}/templates/window`;
const FIGURE_HREF = `modules/${MODULE_ID}/assets/figures.svg`;
const RULES = ["isArmor", "isShield", "locksOffHandOn2H", "singlePerActor"];

/** Open editors, keyed by actor UUID. */
const OPEN_EDITORS = new Map();

const slotLabel = (slot) => (slot.labelKey ? t(slot.labelKey) : slot.label || slot.id);

const EditorBase = foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2);

export class PresetEditor extends EditorBase {
  static DEFAULT_OPTIONS = {
    classes: ["aim-root", "aim-editor"],
    tag: "section",
    position: { width: 940, height: 680 },
    window: { icon: "fa-light fa-pen-ruler", resizable: true, minimizable: true },
    actions: {
      addSlot: PresetEditor.#onAddSlot,
      moveSlot: PresetEditor.#onMoveSlot,
      removeSlot: PresetEditor.#onRemoveSlot,
      apply: PresetEditor.#onApply,
      saveNew: PresetEditor.#onSaveNew,
      save: PresetEditor.#onSave,
      deletePreset: PresetEditor.#onDelete,
      exportJSON: PresetEditor.#onExport,
      importJSON: PresetEditor.#onImport
    }
  };

  static PARTS = {
    preview: { template: `${TEMPLATES}/preset-preview.hbs`, templates: [`${TEMPLATES}/doll.hbs`] },
    form: { template: `${TEMPLATES}/preset-editor.hbs`, scrollable: [".aim-editor-slots"] }
  };

  constructor(actor, options = {}) {
    if (!isSupportedActor(actor)) throw new Error("AIM: unsupported actor");
    super({
      ...options,
      id: `${MODULE_ID}-editor-${String(actor.uuid ?? actor.id).replace(/[^\w-]/g, "-")}`,
      window: { ...options.window, title: t("AIM.window.editor.title", { actor: actor.name }) }
    });
    this.actor = actor;
    this.actorKey = actor.uuid ?? actor.id;
    const current = getActorPaperdollTemplate(actor);
    // The actor's own layout is edited as is; a linked preset is the starting point.
    this.sourceId = current.isActorCustom ? "custom" : current.templateId;
    this.working = workingFrom({ ...current, name: current.templateName });
    this.initialCap = getActorSourceAttunementMax(actor) ?? current.attunementMax;
    this.working.attunementMax = this.initialCap;
  }

  /** The preset the working copy started from; the actor's own layout for "custom". */
  get source() {
    return this.sourceId === "custom" ? getActorPaperdollTemplate(this.actor) : getTemplateById(this.sourceId);
  }

  async _prepareContext(options) {
    const working = this.working;
    const presets = getAllTemplates();
    const builtIn = presets.filter((preset) => preset.isPreset);
    const world = presets.filter((preset) => !preset.isPreset);
    const option = (preset) => ({ id: preset.id, name: preset.name, selected: preset.id === this.sourceId });
    return {
      ...(await super._prepareContext(options)),
      working,
      own: this.sourceId === "custom" ? t("AIM.window.editor.own", { actor: this.actor.name }) : null,
      builtIn: builtIn.map(option),
      world: world.map(option),
      worldPreset: isWorldCustomTemplate(this.sourceId),
      changed: !sameAsPreset(working, this.source),
      figures: FIGURES.map((id) => ({ id, label: t(`AIM.window.editor.figures.${id}`), selected: id === working.figure })),
      caps: Array.from({ length: 10 }, (_, n) => ({ n, selected: n === working.attunementMax })),
      types: [...PHYSICAL_ITEM_TYPES],
      slots: working.slots.map((slot, i) => ({
        ...slot,
        shownLabel: slotLabel(slot),
        first: i === 0,
        last: i === working.slots.length - 1,
        types: [...PHYSICAL_ITEM_TYPES].map((type) => ({ type, label: t(CONFIG.Item.typeLabels?.[type] ?? type), on: slot.itemTypes.includes(type) })),
        acceptsText: slot.accepts.join(", "),
        zones: ["", ...SLOT_ZONES].map((zone) => ({ zone, label: t(`AIM.window.editor.zones.${zone || "order"}`), selected: (slot.zone ?? "") === zone })),
        rules: RULES.map((rule) => ({ rule, label: t(`AIM.editor.rules.${rule}`), on: Boolean(slot.rules[rule]) }))
      })),
      doll: this.#preview(),
      canEdit: false
    };
  }

  /** The doll as the working copy would draw it, slots empty. */
  #preview() {
    const working = this.working;
    const layout = dollLayout(working.slots, { max: working.attunementMax, attuned: 0 });
    const slot = (def, style = "") => ({ id: def.id, label: slotLabel(def), icon: def.icon || "fa-light fa-gem", style, item: null, tip: slotLabel(def) });
    return {
      banner: layout.banner,
      title: t(layout.banner ? "AIM.window.doll.figureTitle" : "AIM.window.doll.title"),
      presetName: working.name,
      presets: null,
      figure: working.figure,
      figureHref: `${FIGURE_HREF}#fig-${working.figure}`,
      figureView: FIGURE_VIEW[working.figure] ?? FIGURE_VIEW.human,
      rows: layout.rows,
      figureEnd: layout.figureRows + 1,
      slots: layout.placed.map(({ slot: def, column, row }) => slot(def, `grid-column: ${column}; grid-row: ${row}`)),
      extra: layout.extra.map((def) => slot(def)),
      slotless: [],
      sockets: Array.from({ length: layout.sockets }, () => ({ item: null, tip: t("AIM.window.doll.freeSocket") })),
      socketsInGrid: layout.socketsInGrid,
      socketGridStyle: `grid-column: 2; grid-row: ${layout.rows}`,
      socketStrip: layout.strip,
      socketColumns: layout.socketColumns,
      attune: { count: 0, max: working.attunementMax, over: false }
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    OPEN_EDITORS.set(this.actorKey, this);
    stampTheme(this.element);
    this.element.addEventListener("change", (event) => this.#onChange(event));
    this._refreshHook = Hooks.on(REFRESH_HOOK, () => stampTheme(this.element));
  }

  _onClose(options) {
    if (OPEN_EDITORS.get(this.actorKey) === this) OPEN_EDITORS.delete(this.actorKey);
    Hooks.off(REFRESH_HOOK, this._refreshHook);
    super._onClose(options);
  }

  /** Field edits change the working copy and redraw the preview; the form keeps its focus. */
  #onChange(event) {
    const input = event.target;
    const working = this.working;
    if (input.name === "source") return this.#load(input.value);
    if (input.name === "presetName") working.name = input.value.trim();
    else if (input.name === "figure") working.figure = input.value;
    else if (input.name === "attunementMax") working.attunementMax = Number(input.value);
    else {
      const slot = working.slots.find((s) => s.id === input.closest("[data-slot-id]")?.dataset.slotId);
      if (!slot) return;
      const field = input.dataset.field;
      if (field === "label") { slot.label = input.value.trim() || slot.id; delete slot.labelKey; }
      else if (field === "icon") slot.icon = input.value.trim() || "fa-light fa-gem";
      else if (field === "accepts") slot.accepts = input.value.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
      else if (field === "type") {
        slot.itemTypes = input.checked ? [...new Set([...slot.itemTypes, input.value])] : slot.itemTypes.filter((v) => v !== input.value);
        input.closest(".aim-chip")?.classList.toggle("is-on", input.checked);
      }
      else if (field === "rule") slot.rules[input.value] = input.checked;
      else if (field === "zone") { if (SLOT_ZONES.includes(input.value)) slot.zone = input.value; else delete slot.zone; }
      else return;
    }
    this.render({ parts: ["preview"] });
    this.element.querySelector("[data-changed]")?.toggleAttribute("hidden", sameAsPreset(working, this.source));
  }

  #load(id) {
    this.sourceId = id;
    const template = id === "custom" ? getActorPaperdollTemplate(this.actor) : getTemplateById(id);
    const cap = this.working.attunementMax;
    this.working = workingFrom({ ...template, name: template.name ?? template.templateName });
    // A built-in or world preset brings its own limit; the actor's own layout keeps the actor's.
    this.working.attunementMax = id === "custom" ? cap : template.attunementMax ?? 3;
    this.render();
  }

  #template(id, name) {
    const { figure, attunementMax, slots } = this.working;
    return { id, name: name || this.working.name || id, figure, attunementMax, slots };
  }

  /* ─── Actions ─── */

  static #onAddSlot() {
    this.working.slots = addSlot(this.working.slots, t("AIM.window.editor.newSlot"));
    this.render();
  }

  static #onMoveSlot(event, target) {
    this.working.slots = moveSlot(this.working.slots, target.closest("[data-slot-id]").dataset.slotId, Number(target.dataset.delta));
    this.render();
  }

  static #onRemoveSlot(event, target) {
    this.working.slots = removeSlot(this.working.slots, target.closest("[data-slot-id]").dataset.slotId);
    this.render();
  }

  /** An unchanged preset is linked by id, so its later edits reach the actor; a changed one becomes the actor's own. */
  static async #onApply() {
    if (!game.user.isGM) return;
    const source = this.source;
    const plan = planTemplateApply({
      isCustomWorking: this.sourceId === "custom" || !sameAsPreset(this.working, source),
      templateCap: source?.attunementMax ?? 3,
      initialCap: this.initialCap,
      cap: this.working.attunementMax
    });
    try {
      if (plan.custom) {
        await setActorPaperdollTemplate(this.actor, "custom", this.#template("custom", t("AIM.editor.customPaperdollName", { actor: this.actor.name })), { applyAttunement: true });
      } else {
        // A changed limit that differs from the preset's makes the layout the actor's own, so here it is the preset's.
        await setActorPaperdollTemplate(this.actor, this.sourceId, null, { applyAttunement: plan.writeCap });
      }
    } catch (error) {
      return ui.notifications.error(error.message);
    }
    ui.notifications.info(t("AIM.editor.appliedSuccess", { actor: this.actor.name }));
    this.close();
  }

  static async #onSaveNew() {
    if (!game.user.isGM) return;
    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("AIM.editor.saveAsNew") },
      content: `<label class="aim-editor-prompt">${escapeHTML(t("AIM.editor.templateName"))}<input type="text" name="presetName" value="${escapeHTML(this.working.name || t("AIM.editor.defaultTemplateName"))}" required autofocus></label>`,
      ok: { label: t("AIM.window.save"), callback: (event, button) => button.form.elements.presetName.value.trim() },
      rejectClose: false
    });
    if (!name) return;
    const id = presetIdFor(name, getAllTemplates().map((preset) => preset.id));
    try {
      await saveWorldCustomTemplate(this.#template(id, name));
    } catch (error) {
      return ui.notifications.error(error.message);
    }
    this.sourceId = id;
    this.working.name = name;
    ui.notifications.info(t("AIM.editor.savedTemplateSuccess", { name }));
    this.render();
  }

  static async #onSave() {
    if (!game.user.isGM || !isWorldCustomTemplate(this.sourceId)) return;
    try {
      await saveWorldCustomTemplate(this.#template(this.sourceId));
    } catch (error) {
      return ui.notifications.error(error.message);
    }
    ui.notifications.info(t("AIM.editor.savedTemplateSuccess", { name: this.working.name }));
    this.render();
  }

  static async #onDelete() {
    if (!game.user.isGM || !isWorldCustomTemplate(this.sourceId)) return;
    const name = this.working.name || this.sourceId;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("AIM.editor.deleteTemplate") },
      content: `<p>${escapeHTML(t("AIM.editor.deleteTemplateConfirm", { id: name }))}</p>`,
      rejectClose: false
    });
    if (!ok) return;
    await deleteWorldCustomTemplate(this.sourceId);
    this.#load(getActorPaperdollTemplate(this.actor).templateId);
  }

  static #onExport() {
    const id = this.sourceId === "custom" || !this.sourceId ? presetIdFor(this.working.name, []) : this.sourceId;
    const data = JSON.stringify(this.#template(id), null, 2);
    foundry.utils.saveDataToFile(data, "application/json", `${id}.json`);
  }

  /** A JSON file becomes a world preset and opens in the editor. */
  static async #onImport() {
    if (!game.user.isGM) return;
    const file = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("AIM.editor.importJSON") },
      content: `<p class="aim-hint">${escapeHTML(t("AIM.window.editor.importHint"))}</p><input type="file" name="presetFile" accept=".json,application/json">`,
      ok: { label: t("AIM.editor.importJSON"), callback: (event, button) => button.form.elements.presetFile.files[0] ?? null },
      rejectClose: false
    });
    if (!file) return;
    try {
      const template = await importTemplateJSON(await file.text());
      ui.notifications.info(t("AIM.editor.savedTemplateSuccess", { name: template.name }));
      this.#load(template.id);
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
}

/** Opens the preset editor for an actor, GM only; one editor per actor. */
export function openPresetEditor(actor) {
  if (!game.user.isGM) return ui.notifications.warn(t("AIM.editor.gmOnly"));
  if (!isSupportedActor(actor)) return null;
  const open = OPEN_EDITORS.get(actor.uuid ?? actor.id);
  if (open) {
    if (open.rendered) open.bringToFront?.();
    return open;
  }
  const editor = new PresetEditor(actor);
  // Registered before the first render, so a second click finds it; a failed first render gives the place back.
  const key = actor.uuid ?? actor.id;
  OPEN_EDITORS.set(key, editor);
  editor.render({ force: true }).catch((error) => {
    if (OPEN_EDITORS.get(key) === editor) OPEN_EDITORS.delete(key);
    LOG.error(`The preset editor of ${actor.name} could not open`, error);
  });
  return editor;
}
