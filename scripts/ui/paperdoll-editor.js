// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - GM Paperdoll Editor (ApplicationV2)
// ─────────────────────────────────────────────────────────

import { MODULE_ID, TEMPLATE_PRESETS } from "../constants.js";
import { isSupportedActor } from "../core/actor-scope.js";
import {
  deleteWorldCustomTemplate,
  getAllTemplates,
  getActorPaperdollTemplate,
  getTemplateById,
  importTemplateJSON,
  isReservedTemplateId,
  isWorldCustomTemplate,
  saveWorldCustomTemplate,
  setActorPaperdollTemplate
} from "../core/paperdoll-templates.js";
import { LOG } from "../foundry/logger.js";
import { escapeHTML, isImagePath } from "./html.js";
import { SlotConfigDialog } from "./slot-config-dialog.js";

/** Open editors, keyed by actor UUID. */
const OPEN_EDITORS = new Map();

const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);

/** DialogV2 that resolves to null when dismissed. */
function dialogPrompt(options) {
  return foundry.applications.api.DialogV2.prompt({ rejectClose: false, ...options });
}

function dialogConfirm(options) {
  return foundry.applications.api.DialogV2.confirm({ rejectClose: false, ...options });
}

const ApplicationBase = foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
);

export class PaperdollEditorApp extends ApplicationBase {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-editor`,
    classes: ["actor-inventory-manager-app", "aim-paperdoll-editor-app", "rpg-theme"],
    tag: "div",
    position: {
      width: 880,
      height: 690
    },
    window: {
      title: "AIM.editor.windowTitle",
      icon: "fa-solid fa-wand-magic-sparkles",
      resizable: true,
      minimizable: true
    },
    actions: {
      applyToActor: PaperdollEditorApp._onApplyToActor,
      saveAsNewTemplate: PaperdollEditorApp._onSaveAsNewTemplate,
      saveCurrentTemplate: PaperdollEditorApp._onSaveCurrentTemplate,
      deleteTemplate: PaperdollEditorApp._onDeleteTemplate,
      exportJSON: PaperdollEditorApp._onExportJSON,
      importJSON: PaperdollEditorApp._onImportJSON,
      addSlot: PaperdollEditorApp._onAddSlot,
      editSlot: PaperdollEditorApp._onEditSlot,
      deleteSlot: PaperdollEditorApp._onDeleteSlot,
      moveSlotUp: PaperdollEditorApp._onMoveSlotUp,
      moveSlotDown: PaperdollEditorApp._onMoveSlotDown
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/editor/paperdoll-editor.hbs`
    }
  };

  constructor(actor, options = {}) {
    if (!isSupportedActor(actor)) throw new Error("AIM: unsupported actor");
    const title = `${actor.name} - ${game.i18n.localize("AIM.editor.windowTitle")}`;
    super({
      ...options,
      id: `${MODULE_ID}-editor-${String(actor.uuid ?? actor.id).replace(/[^\w-]/g, "-")}`,
      window: { ...options.window, title }
    });

    this.actor = actor;
    this.actorKey = actor.uuid ?? actor.id;

    // Load initial actor template state
    const actorTemplateCtx = getActorPaperdollTemplate(actor);
    this.activeTemplateId = actorTemplateCtx.templateId;
    this.workingSlots = actorTemplateCtx.slots.map(s => ({ ...s, rules: { ...s.rules } }));
    this.attunementMax = actorTemplateCtx.attunementMax;
    // "Custom" means an actor-only layout; a world template stays linked by id.
    this.isCustomWorking = Boolean(actorTemplateCtx.isActorCustom);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const templates = getAllTemplates().map(template => ({
      ...template,
      selected: !this.isCustomWorking && template.id === this.activeTemplateId
    }));

    const enrichedSlots = this.workingSlots.map(s => ({ ...s, isImageIcon: isImagePath(s.icon) }));
    const canUpdateTemplate = isWorldCustomTemplate(this.activeTemplateId);

    return {
      ...context,
      actor: this.actor,
      templates,
      activeTemplateId: this.activeTemplateId,
      isCustomTemplate: this.isCustomWorking,
      canUpdateTemplate,
      attunementMax: this.attunementMax,
      slots: enrichedSlots,
      leftSlots: enrichedSlots.filter(s => s.column === "left"),
      centerSlots: enrichedSlots.filter(s => s.column === "center"),
      rightSlots: enrichedSlots.filter(s => s.column === "right")
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Template selector change listener (avoids click-re-render closing bug)
    const select = this.element.querySelector(".aim-template-select");
    if (select) {
      select.addEventListener("change", (e) => {
        this._handleTemplateChange(e.target.value);
      });
    }

    // Attunement input change listener
    const attunementInput = this.element.querySelector(".aim-attunement-input");
    if (attunementInput) {
      // A changed cap is detected on apply, so the template stays selected.
      const handleAttChange = (e) => {
        const val = parseInt(e.target.value, 10);
        this.attunementMax = isNaN(val) ? 3 : Math.max(0, Math.min(9, val));
      };
      attunementInput.addEventListener("input", handleAttChange);
      attunementInput.addEventListener("change", handleAttChange);
    }

    this._bindDragDrop();
  }

  _handleTemplateChange(templateId) {
    if (templateId === "custom") {
      this.isCustomWorking = true;
      this.render();
      return;
    }

    const template = getTemplateById(templateId);
    if (template) {
      this.activeTemplateId = template.id;
      this.workingSlots = (template.slots || []).map(s => ({
        ...s,
        rules: { ...(s.rules || {}) }
      }));
      this.attunementMax = template.attunementMax ?? 3;
      this.isCustomWorking = false;
      this._reindexSlots();
      this.render();
    }
  }

  _bindDragDrop() {
    this.element.querySelectorAll(".aim-editor-slot-card")
      .forEach(card => this._bindSlotCardDragDrop(card));
    this.element.querySelectorAll(".aim-editor-column")
      .forEach(column => this._bindColumnDropZone(column));
  }

  _readDraggedSlotId(dataTransfer) {
    const raw = dataTransfer.getData("text/plain");
    if (!raw) return null;
    try {
      return JSON.parse(raw).slotId || null;
    } catch (err) {
      LOG.error("Failed to parse drag data", err);
      return null;
    }
  }

  _clearDragIndicators() {
    this.element.querySelectorAll(".aim-drag-over-column, .aim-drag-over-card").forEach(element => {
      element.classList.remove("aim-drag-over-column", "aim-drag-over-card");
    });
  }

  _bindSlotCardDragDrop(card) {
    card.addEventListener("dragstart", event => {
      event.dataTransfer.setData("text/plain", JSON.stringify({
        slotId: card.dataset.slotId,
        sourceColumn: card.dataset.column
      }));
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("is-dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      this._clearDragIndicators();
    });
    card.addEventListener("dragover", event => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      card.classList.add("aim-drag-over-card");
    });
    card.addEventListener("dragleave", () => card.classList.remove("aim-drag-over-card"));
    card.addEventListener("drop", event => {
      event.preventDefault();
      event.stopPropagation();
      card.classList.remove("aim-drag-over-card");
      const slotId = this._readDraggedSlotId(event.dataTransfer);
      const targetSlotId = card.dataset.slotId;
      if (slotId && targetSlotId && slotId !== targetSlotId) {
        this._moveSlotBefore(slotId, targetSlotId, card.dataset.column);
      }
    });
  }

  _bindColumnDropZone(column) {
    column.addEventListener("dragover", event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      column.classList.add("aim-drag-over-column");
    });
    column.addEventListener("dragleave", event => {
      if (!column.contains(event.relatedTarget)) column.classList.remove("aim-drag-over-column");
    });
    column.addEventListener("drop", event => {
      event.preventDefault();
      column.classList.remove("aim-drag-over-column");
      const slotId = this._readDraggedSlotId(event.dataTransfer);
      if (slotId && column.dataset.column) this._moveSlotToColumn(slotId, column.dataset.column);
    });
  }

  _moveSlotToColumn(slotId, targetColumn) {
    const slot = this.workingSlots.find(s => s.id === slotId);
    if (!slot) return;

    if (slot.column !== targetColumn) {
      slot.column = targetColumn;
      this._reindexSlots();
      this.isCustomWorking = true;
      this.render();
    }
  }

  _moveSlotBefore(draggedSlotId, targetSlotId, targetColumn) {
    const draggedIndex = this.workingSlots.findIndex(s => s.id === draggedSlotId);
    if (draggedIndex === -1) return;

    const [draggedSlot] = this.workingSlots.splice(draggedIndex, 1);
    draggedSlot.column = targetColumn;

    const targetIndex = this.workingSlots.findIndex(s => s.id === targetSlotId);
    if (targetIndex !== -1) {
      this.workingSlots.splice(targetIndex, 0, draggedSlot);
    } else {
      this.workingSlots.push(draggedSlot);
    }

    this._reindexSlots();
    this.isCustomWorking = true;
    this.render();
  }

  _reindexSlots() {
    const nextOrder = { left: 10, center: 10, right: 10 };
    for (const slot of this.workingSlots) {
      const column = slot.column === "left" || slot.column === "right" ? slot.column : "center";
      slot.order = nextOrder[column];
      nextOrder[column] += 10;
    }
  }

  _moveSlotByOffset(slotId, offset) {
    const slot = this.workingSlots.find(candidate => candidate.id === slotId);
    if (!slot) return;
    const columnSlots = this.workingSlots.filter(candidate => candidate.column === slot.column);
    const currentIndex = columnSlots.findIndex(candidate => candidate.id === slotId);
    const swapWith = columnSlots[currentIndex + offset];
    if (!swapWith) return;

    [slot.order, swapWith.order] = [swapWith.order, slot.order];
    this.workingSlots.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    this.isCustomWorking = true;
    this.render();
  }

  /** Read the attunement input, which may not have fired a change event yet. */
  _readAttunementInput() {
    const parsed = parseInt(this.element.querySelector(".aim-attunement-input")?.value, 10);
    if (!isNaN(parsed)) this.attunementMax = Math.max(0, Math.min(9, parsed));
  }

  _workingTemplate(id, name) {
    return { id, name, attunementMax: this.attunementMax, slots: this.workingSlots };
  }

  // --- Static Actions ---

  static async _onApplyToActor() {
    if (!game.user.isGM) return;
    this._readAttunementInput();

    const baseTemplate = getTemplateById(this.activeTemplateId);
    const hasModifiedAttunement = (baseTemplate?.attunementMax ?? 3) !== this.attunementMax;

    if (this.isCustomWorking || hasModifiedAttunement) {
      await setActorPaperdollTemplate(this.actor, "custom", {
        id: "custom",
        name: format("AIM.editor.customPaperdollName", { actor: this.actor.name }),
        attunementMax: this.attunementMax,
        slots: this.workingSlots
      });
    } else {
      // Linked by id, so later edits of a world template reach this actor too.
      await setActorPaperdollTemplate(this.actor, this.activeTemplateId, null);
    }

    ui.notifications.info(format("AIM.editor.appliedSuccess", { actor: this.actor.name }));
    this.close();
  }

  static async _onSaveAsNewTemplate() {
    if (!game.user.isGM) return;
    this._readAttunementInput();

    const result = await dialogPrompt({
      window: { title: localize("AIM.editor.saveAsNew") },
      content: `
        <div class="aim-form-group" style="margin-bottom: 8px;">
          <label>${escapeHTML(localize("AIM.editor.templateName"))}</label>
          <input type="text" name="templateName" value="${escapeHTML(localize("AIM.editor.defaultTemplateName"))}" required />
        </div>
        <div class="aim-form-group">
          <label>${escapeHTML(localize("AIM.editor.templateId"))}</label>
          <input type="text" name="templateId" value="custom-${Date.now().toString(36)}" required />
        </div>
      `,
      ok: {
        label: localize("AIM.actions.save"),
        callback: (event, button) => {
          const form = button.form;
          return {
            name: form.elements.templateName.value.trim(),
            id: form.elements.templateId.value.trim().replace(/[^\p{L}\p{N}_-]/gu, "")
          };
        }
      }
    });

    if (!result?.id || !result?.name) return;
    if (isReservedTemplateId(result.id)) {
      ui.notifications.warn(format("AIM.editor.errors.reservedId", { id: result.id }));
      return;
    }
    if (isWorldCustomTemplate(result.id)) {
      const overwrite = await dialogConfirm({
        window: { title: localize("AIM.editor.saveAsNew") },
        content: `<p>${escapeHTML(format("AIM.editor.overwriteConfirm", { id: result.id }))}</p>`
      });
      if (!overwrite) return;
    }

    try {
      await saveWorldCustomTemplate({
        ...this._workingTemplate(result.id, result.name),
        description: format("AIM.editor.createdBy", { user: game.user.name })
      });
    } catch (err) {
      ui.notifications.error(err.message);
      return;
    }
    this.activeTemplateId = result.id;
    this.isCustomWorking = false;
    ui.notifications.info(format("AIM.editor.savedTemplateSuccess", { name: result.name }));
    this.render();
  }

  static async _onSaveCurrentTemplate() {
    if (!game.user.isGM) return;
    // Presets and the actor-only layout are not world templates.
    if (!isWorldCustomTemplate(this.activeTemplateId)) {
      ui.notifications.warn(localize("AIM.editor.presetReadOnly"));
      return;
    }
    this._readAttunementInput();

    const current = getTemplateById(this.activeTemplateId);
    try {
      await saveWorldCustomTemplate({ ...current, attunementMax: this.attunementMax, slots: this.workingSlots });
    } catch (err) {
      ui.notifications.error(err.message);
      return;
    }
    this.isCustomWorking = false;
    ui.notifications.info(format("AIM.editor.savedTemplateSuccess", { name: current.name || current.id }));
    this.render();
  }

  static async _onDeleteTemplate() {
    if (!game.user.isGM || !isWorldCustomTemplate(this.activeTemplateId)) return;

    const confirmed = await dialogConfirm({
      window: { title: localize("AIM.editor.deleteTemplate") },
      content: `<p>${escapeHTML(format("AIM.editor.deleteTemplateConfirm", { id: this.activeTemplateId }))}</p>`,
      yes: { label: localize("AIM.editor.delete") },
      no: { label: localize("AIM.actions.cancel") }
    });
    if (!confirmed) return;

    await deleteWorldCustomTemplate(this.activeTemplateId);
    this.activeTemplateId = TEMPLATE_PRESETS.DND_2024;
    const t = getTemplateById(this.activeTemplateId);
    this.workingSlots = t.slots.map(s => ({ ...s, rules: { ...s.rules } }));
    this.attunementMax = t.attunementMax;
    this.isCustomWorking = false;
    this.render();
  }

  static async _onExportJSON() {
    this._readAttunementInput();
    const base = getTemplateById(this.activeTemplateId);
    const id = this.isCustomWorking ? `${base.id}-custom` : this.activeTemplateId;
    const name = this.isCustomWorking
      ? format("AIM.editor.customPaperdollName", { actor: this.actor.name })
      : (base.name || (base.nameKey ? localize(base.nameKey) : id));
    const jsonStr = JSON.stringify(this._workingTemplate(id, name), null, 2);

    await dialogPrompt({
      window: { title: localize("AIM.editor.exportJSON") },
      content: `<textarea style="width: 100%; height: 260px; font-family: monospace; font-size: 0.75rem;" readonly>${escapeHTML(jsonStr)}</textarea>`,
      ok: { label: localize("AIM.actions.close") }
    });
  }

  static async _onImportJSON() {
    if (!game.user.isGM) return;

    const jsonStr = await dialogPrompt({
      window: { title: localize("AIM.editor.importJSON") },
      content: `
        <p>${escapeHTML(localize("AIM.editor.importJSONHint"))}:</p>
        <textarea name="jsonInput" style="width: 100%; height: 220px; font-family: monospace; font-size: 0.75rem;" placeholder="${escapeHTML(localize("AIM.editor.pastePlaceholder"))}"></textarea>
      `,
      ok: {
        label: localize("AIM.editor.importJSON"),
        callback: (event, button) => button.form.elements.jsonInput.value.trim()
      }
    });
    if (!jsonStr) return;

    try {
      const imported = await importTemplateJSON(jsonStr);
      this.activeTemplateId = imported.id;
      this.workingSlots = imported.slots.map(s => ({ ...s, rules: { ...s.rules } }));
      this.attunementMax = imported.attunementMax ?? 3;
      this.isCustomWorking = false;
      this.render();
      ui.notifications.info(format("AIM.editor.importSuccess", { name: imported.name || imported.id }));
    } catch (err) {
      LOG.warn("Template import failed", err);
      ui.notifications.error(format("AIM.editor.importFailed", { error: err.message }));
    }
  }

  /** A slot id not yet used by the working layout. */
  _nextSlotId() {
    let index = this.workingSlots.length + 1;
    while (this.workingSlots.some(s => s.id === `custom_slot_${index}`)) index++;
    return index;
  }

  static async _onAddSlot(event, target) {
    const column = target.dataset.column || "center";
    const index = this._nextSlotId();
    const configured = await SlotConfigDialog.configureSlot({
      id: `custom_slot_${index}`,
      label: format("AIM.editor.customSlotLabel", { index }),
      icon: "fa-solid fa-gem",
      column,
      category: "equipment",
      itemTypes: ["equipment"],
      accepts: [],
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    });
    if (!configured) return;

    if (this.workingSlots.some(s => s.id === configured.id)) {
      ui.notifications.warn(format("AIM.editor.slotExists", { id: configured.id }));
      return;
    }
    this.workingSlots.push(configured);
    this._reindexSlots();
    this.isCustomWorking = true;
    this.render();
  }

  static async _onEditSlot(event, target) {
    const slotIndex = this.workingSlots.findIndex(s => s.id === target.dataset.slotId);
    if (slotIndex === -1) return;

    const current = this.workingSlots[slotIndex];
    const configured = await SlotConfigDialog.configureSlot(current);
    if (!configured) return;

    // Keep the translation key so the preset label follows the user's language.
    const keepsLabel = current.labelKey && configured.label === current.label;
    this.workingSlots[slotIndex] = keepsLabel ? { ...configured, labelKey: current.labelKey } : configured;
    this._reindexSlots();
    this.isCustomWorking = true;
    this.render();
  }

  static async _onDeleteSlot(event, target) {
    const slotId = target.dataset.slotId;
    const slot = this.workingSlots.find(s => s.id === slotId);
    const confirmed = await dialogConfirm({
      window: { title: localize("AIM.editor.deleteSlot") },
      content: `<p>${escapeHTML(format("AIM.editor.deleteSlotConfirm", { slot: slot?.label ?? slotId }))}</p>`,
      yes: { label: localize("AIM.editor.delete") },
      no: { label: localize("AIM.actions.cancel") }
    });
    if (!confirmed) return;

    this.workingSlots = this.workingSlots.filter(s => s.id !== slotId);
    this._reindexSlots();
    this.isCustomWorking = true;
    this.render();
  }

  static _onMoveSlotUp(event, target) {
    this._moveSlotByOffset(target.dataset.slotId, -1);
  }

  static _onMoveSlotDown(event, target) {
    this._moveSlotByOffset(target.dataset.slotId, 1);
  }

  async close(options = {}) {
    if (OPEN_EDITORS.get(this.actorKey) === this) OPEN_EDITORS.delete(this.actorKey);
    return super.close(options);
  }
}

/**
 * Open the Paperdoll Editor for an actor (GM Only)
 * @param {Object} actor
 * @returns {PaperdollEditorApp|undefined}
 */
export function openPaperdollEditor(actor) {
  if (!isSupportedActor(actor)) return;
  if (!globalThis.game?.user?.isGM) {
    ui.notifications?.warn(localize("AIM.editor.gmOnly"));
    return;
  }
  const key = actor.uuid ?? actor.id;
  const existing = OPEN_EDITORS.get(key);
  if (existing?.rendered) {
    existing.bringToFront();
    return existing;
  }
  const app = new PaperdollEditorApp(actor);
  OPEN_EDITORS.set(key, app);
  app.render({ force: true });
  return app;
}
