// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - GM Paperdoll Editor (ApplicationV2)
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID, TEMPLATE_PRESETS } from "../constants.js";
import {
  deleteWorldCustomTemplate,
  exportTemplateJSON,
  getAllTemplates,
  getActorPaperdollTemplate,
  getTemplateById,
  importTemplateJSON,
  PRESET_TEMPLATES,
  saveWorldCustomTemplate,
  setActorPaperdollTemplate
} from "../core/paperdoll-templates.js";
import { LOG } from "../foundry/logger.js";
import { SlotConfigDialog } from "./slot-config-dialog.js";

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
      changeAttunement: PaperdollEditorApp._onChangeAttunement,
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
    const title = `${actor.name} - ${game.i18n.localize("AIM.editor.windowTitle")}`;
    super({
      ...options,
      id: `${MODULE_ID}-editor-${actor.id}`,
      window: { ...options.window, title }
    });

    this.actor = actor;

    // Load initial actor template state
    const actorTemplateCtx = getActorPaperdollTemplate(actor);
    this.activeTemplateId = actorTemplateCtx.templateId;
    this.workingSlots = actorTemplateCtx.slots.map(s => ({ ...s, rules: { ...s.rules } }));
    this.attunementMax = actorTemplateCtx.attunementMax;
    this.isCustomWorking = this.activeTemplateId === "custom" || !actorTemplateCtx.isPreset;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const templates = getAllTemplates();

    const enrichedSlots = this.workingSlots.map(s => {
      const isImageIcon = Boolean(
        s.icon && (
          s.icon.includes("/") ||
          s.icon.endsWith(".png") ||
          s.icon.endsWith(".webp") ||
          s.icon.endsWith(".svg") ||
          s.icon.endsWith(".jpg")
        )
      );
      return { ...s, isImageIcon };
    });

    const leftSlots = enrichedSlots.filter(s => s.column === "left");
    const centerSlots = enrichedSlots.filter(s => s.column === "center");
    const rightSlots = enrichedSlots.filter(s => s.column === "right");

    const isPresetTemplate = Boolean(PRESET_TEMPLATES[this.activeTemplateId]);

    return {
      ...context,
      actor: this.actor,
      templates,
      activeTemplateId: this.activeTemplateId,
      isCustomTemplate: this.isCustomWorking,
      isPresetTemplate,
      attunementMax: this.attunementMax,
      slots: enrichedSlots,
      leftSlots,
      centerSlots,
      rightSlots
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
      const handleAttChange = (e) => {
        const val = parseInt(e.target.value, 10);
        this.attunementMax = isNaN(val) ? 3 : Math.max(0, Math.min(9, val));
        this.isCustomWorking = true;
      };
      attunementInput.addEventListener("input", handleAttChange);
      attunementInput.addEventListener("change", handleAttChange);
    }

    this._bindDragDrop();
  }

  _handleTemplateChange(templateId) {
    if (templateId === "custom") {
      this.isCustomWorking = true;
      this.render(false);
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
      this.isCustomWorking = !template.isPreset;
      this._reindexSlots();
      this.render(false);
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
      this.render(false);
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
    this.render(false);
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
    this.render(false);
  }

  // --- Static Actions ---

  static async _onApplyToActor(event, target) {
    if (!game.user.isGM) return;

    const attInput = this.element.querySelector(".aim-attunement-input");
    if (attInput) {
      const parsed = parseInt(attInput.value, 10);
      if (!isNaN(parsed)) this.attunementMax = Math.max(0, Math.min(9, parsed));
    }

    const currentPreset = getTemplateById(this.activeTemplateId);
    const hasModifiedAttunement = currentPreset && currentPreset.attunementMax !== this.attunementMax;

    if (this.isCustomWorking || this.activeTemplateId === "custom" || hasModifiedAttunement) {
      const customData = {
        id: "custom",
        name: `${this.actor.name} Custom Paperdoll`,
        attunementMax: this.attunementMax,
        slots: this.workingSlots
      };
      await setActorPaperdollTemplate(this.actor, "custom", customData);
    } else {
      await setActorPaperdollTemplate(this.actor, this.activeTemplateId, null);
    }

    ui.notifications.info(game.i18n.format("AIM.editor.appliedSuccess", { actor: this.actor.name }));
    this.close();
  }

  static async _onSaveAsNewTemplate(event, target) {
    if (!game.user.isGM) return;

    const attInput = this.element.querySelector(".aim-attunement-input");
    if (attInput) {
      const parsed = parseInt(attInput.value, 10);
      if (!isNaN(parsed)) this.attunementMax = Math.max(0, Math.min(9, parsed));
    }

    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("AIM.editor.saveAsNew") },
      content: `
        <div class="aim-form-group" style="margin-bottom: 8px;">
          <label>Template Name:</label>
          <input type="text" name="templateName" value="Custom Template" required />
        </div>
        <div class="aim-form-group">
          <label>Template ID:</label>
          <input type="text" name="templateId" value="custom-${Date.now().toString(36)}" required />
        </div>
      `,
      ok: {
        label: game.i18n.localize("AIM.actions.save"),
        callback: (event, button, dialog) => {
          const form = button.form;
          return {
            name: form.elements.templateName.value.trim(),
            id: form.elements.templateId.value.trim().replace(/[^a-zA-Z0-9_-]/g, "")
          };
        }
      }
    });

    if (result && result.id && result.name) {
      const templateData = {
        id: result.id,
        name: result.name,
        description: `Custom paperdoll template created by ${game.user.name}`,
        attunementMax: this.attunementMax,
        slots: this.workingSlots
      };

      await saveWorldCustomTemplate(templateData);
      this.activeTemplateId = result.id;
      this.isCustomWorking = false;
      ui.notifications.info(game.i18n.format("AIM.editor.savedTemplateSuccess", { name: result.name }));
      this.render(false);
    }
  }

  static async _onSaveCurrentTemplate(event, target) {
    if (!game.user.isGM) return;
    if (PRESET_TEMPLATES[this.activeTemplateId]) {
      ui.notifications.warn("Cannot overwrite built-in presets. Use 'Save As New' instead.");
      return;
    }

    const attInput = this.element.querySelector(".aim-attunement-input");
    if (attInput) {
      const parsed = parseInt(attInput.value, 10);
      if (!isNaN(parsed)) this.attunementMax = Math.max(0, Math.min(9, parsed));
    }

    const current = getTemplateById(this.activeTemplateId);
    const templateData = {
      ...current,
      attunementMax: this.attunementMax,
      slots: this.workingSlots
    };

    await saveWorldCustomTemplate(templateData);
    ui.notifications.info(game.i18n.format("AIM.editor.savedTemplateSuccess", { name: templateData.name || templateData.id }));
    this.render(false);
  }

  static async _onDeleteTemplate(event, target) {
    if (!game.user.isGM) return;
    if (PRESET_TEMPLATES[this.activeTemplateId]) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("AIM.editor.deleteTemplate") },
      content: `<p>${game.i18n.format("AIM.editor.deleteTemplateConfirm", { id: this.activeTemplateId })}</p>`,
      yes: { label: game.i18n.localize("AIM.actions.delete") },
      no: { label: game.i18n.localize("AIM.actions.cancel") }
    });

    if (confirmed) {
      await deleteWorldCustomTemplate(this.activeTemplateId);
      this.activeTemplateId = TEMPLATE_PRESETS.DND_2024;
      const t = getTemplateById(this.activeTemplateId);
      this.workingSlots = t.slots.map(s => ({ ...s, rules: { ...s.rules } }));
      this.attunementMax = t.attunementMax;
      this.render(false);
    }
  }

  static async _onExportJSON(event, target) {
    const templateData = {
      id: this.activeTemplateId,
      name: this.activeTemplateId,
      attunementMax: this.attunementMax,
      slots: this.workingSlots
    };
    const jsonStr = JSON.stringify(templateData, null, 2);

    await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("AIM.editor.exportJSON") },
      content: `<textarea style="width: 100%; height: 260px; font-family: monospace; font-size: 0.75rem;" readonly>${jsonStr}</textarea>`,
      ok: { label: "Close" }
    });
  }

  static async _onImportJSON(event, target) {
    if (!game.user.isGM) return;

    const jsonStr = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("AIM.editor.importJSON") },
      content: `
        <p>${game.i18n.localize("AIM.editor.importJSONHint")}:</p>
        <textarea name="jsonInput" style="width: 100%; height: 220px; font-family: monospace; font-size: 0.75rem;" placeholder="Paste JSON here..."></textarea>
      `,
      ok: {
        label: game.i18n.localize("AIM.editor.importJSON"),
        callback: (event, button) => button.form.elements.jsonInput.value.trim()
      }
    });

    if (jsonStr) {
      try {
        const imported = await importTemplateJSON(jsonStr);
        this.activeTemplateId = imported.id;
        this.workingSlots = imported.slots.map(s => ({ ...s, rules: { ...s.rules } }));
        this.attunementMax = imported.attunementMax ?? 3;
        this.render(false);
        ui.notifications.info(`Successfully imported template: ${imported.name || imported.id}`);
      } catch (err) {
        ui.notifications.error(`Import failed: ${err.message}`);
      }
    }
  }

  static _onChangeAttunement(event, target) {
    this.attunementMax = Math.max(0, Math.min(6, parseInt(target.value, 10) || 3));
    this.isCustomWorking = true;
  }

  static async _onAddSlot(event, target) {
    const column = target.dataset.column || "center";
    const slotCount = this.workingSlots.length + 1;
    const newSlotTemplate = {
      id: `custom_slot_${slotCount}`,
      label: `Custom Slot ${slotCount}`,
      icon: "fa-solid fa-gem",
      column,
      category: "equipment",
      itemTypes: ["equipment"],
      accepts: [],
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    };

    const configured = await SlotConfigDialog.configureSlot(newSlotTemplate);
    if (configured) {
      // Check for duplicate ID
      if (this.workingSlots.some(s => s.id === configured.id)) {
        ui.notifications.warn(`Slot ID '${configured.id}' already exists.`);
        return;
      }
      this.workingSlots.push(configured);
      this._reindexSlots();
      this.isCustomWorking = true;
      this.render(false);
    }
  }

  static async _onEditSlot(event, target) {
    const slotId = target.dataset.slotId;
    const slotIndex = this.workingSlots.findIndex(s => s.id === slotId);
    if (slotIndex === -1) return;

    const currentSlot = this.workingSlots[slotIndex];
    const configured = await SlotConfigDialog.configureSlot(currentSlot);
    if (configured) {
      this.workingSlots[slotIndex] = configured;
      this._reindexSlots();
      this.isCustomWorking = true;
      this.render(false);
    }
  }

  static async _onDeleteSlot(event, target) {
    const slotId = target.dataset.slotId;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Slot" },
      content: `<p>Are you sure you want to delete slot <strong>${slotId}</strong>?</p>`,
      yes: { label: game.i18n.localize("AIM.actions.delete") },
      no: { label: game.i18n.localize("AIM.actions.cancel") }
    });

    if (confirmed) {
      this.workingSlots = this.workingSlots.filter(s => s.id !== slotId);
      this._reindexSlots();
      this.isCustomWorking = true;
      this.render(false);
    }
  }

  static _onMoveSlotUp(event, target) {
    this._moveSlotByOffset(target.dataset.slotId, -1);
  }

  static _onMoveSlotDown(event, target) {
    this._moveSlotByOffset(target.dataset.slotId, 1);
  }
}

/**
 * Open the Paperdoll Editor for an actor (GM Only)
 * @param {Object} actor
 */
export function openPaperdollEditor(actor) {
  if (!globalThis.game?.user?.isGM) {
    ui.notifications?.warn("Only Game Master can access the Paperdoll Editor.");
    return;
  }
  const app = new PaperdollEditorApp(actor);
  app.render({ force: true });
  return app;
}
