// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Slot Configuration Dialog
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";
import { isImagePath } from "./html.js";

/**
 * Slot category: held-item slots are "hand", ring slots "ring"; otherwise the
 * category the slot already had is kept.
 */
function resolveCategory(previous, rules, accepts) {
  if (rules.isShield || rules.locksOffHandOn2H) return "hand";
  if (accepts.includes("ring")) return "ring";
  return previous || "equipment";
}

const ApplicationBase = foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
);

export class SlotConfigDialog extends ApplicationBase {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-slot-config`,
    classes: ["actor-inventory-manager-app", "aim-slot-config-dialog", "rpg-theme"],
    tag: "div",
    position: {
      width: 480,
      height: "auto"
    },
    window: {
      title: "AIM.editor.slotConfigTitle",
      icon: "fa-solid fa-gear",
      modal: true,
      resizable: false
    },
    actions: {
      cancel: SlotConfigDialog._onCancel
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/editor/slot-config-dialog.hbs`
    }
  };

  constructor(slotData = {}, options = {}) {
    super(options);
    this.slot = {
      id: slotData.id || "",
      label: slotData.label || slotData.labelKey || "",
      icon: slotData.icon || "fa-solid fa-gem",
      column: slotData.column || "center",
      category: slotData.category || "equipment",
      itemTypes: Array.isArray(slotData.itemTypes) ? [...slotData.itemTypes] : ["equipment"],
      accepts: Array.isArray(slotData.accepts) ? [...slotData.accepts] : [],
      order: slotData.order ?? 50,
      rules: {
        isArmor: Boolean(slotData.rules?.isArmor),
        isShield: Boolean(slotData.rules?.isShield),
        locksOffHandOn2H: Boolean(slotData.rules?.locksOffHandOn2H),
        singlePerActor: Boolean(slotData.rules?.singlePerActor)
      }
    };
    this.isEditing = Boolean(slotData.id);
    this._resolve = null;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const itemTypes = this.slot.itemTypes || [];
    const isImageIcon = isImagePath(this.slot.icon);

    return {
      ...context,
      slot: this.slot,
      isEditing: this.isEditing,
      isImageIcon,
      acceptsString: (this.slot.accepts || []).join(", "),
      hasTypeEquipment: itemTypes.includes("equipment"),
      hasTypeWeapon: itemTypes.includes("weapon"),
      hasTypeConsumable: itemTypes.includes("consumable"),
      hasTypeTool: itemTypes.includes("tool"),
      hasTypeLoot: itemTypes.includes("loot")
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const form = this.element.querySelector("form");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        this._onSubmit(form);
      });

      const iconInput = form.querySelector('input[name="icon"]');
      const iconPreview = form.querySelector(".aim-icon-preview");
      const iconImgPreview = form.querySelector(".aim-icon-img-preview");
      const filePickerBtn = form.querySelector(".aim-filepicker-btn");

      const updatePreview = (val) => {
        const trimmed = (val || "").trim();
        if (isImagePath(trimmed)) {
          if (iconImgPreview) {
            iconImgPreview.src = trimmed;
            iconImgPreview.style.display = "block";
          }
          if (iconPreview) iconPreview.style.display = "none";
        } else {
          if (iconPreview) {
            iconPreview.className = `${trimmed} aim-icon-preview`;
            iconPreview.style.display = "flex";
          }
          if (iconImgPreview) iconImgPreview.style.display = "none";
        }
      };

      if (iconInput) {
        iconInput.addEventListener("input", (e) => updatePreview(e.target.value));
      }

      if (filePickerBtn && iconInput) {
        filePickerBtn.addEventListener("click", () => {
          const FilePicker = foundry.applications.apps.FilePicker.implementation;
          new FilePicker({
            type: "image",
            current: iconInput.value,
            callback: (path) => {
              iconInput.value = path;
              updatePreview(path);
            }
          }).render({ force: true });
        });
      }
    }
  }

  _onSubmit(form) {
    const formData = new FormData(form);
    const id = String(formData.get("id") || this.slot.id || "").trim().replace(/[^\p{L}\p{N}_-]/gu, "");
    if (!id) {
      ui.notifications?.warn(game.i18n.localize("AIM.editor.errors.slotInvalidId"));
      form.querySelector('input[name="id"]')?.focus();
      return;
    }
    const label = String(formData.get("label") || id).trim();
    const icon = (formData.get("icon") || "fa-solid fa-gem").trim();
    const column = formData.get("column") || "center";

    const itemTypes = [];
    if (formData.get("type_equipment")) itemTypes.push("equipment");
    if (formData.get("type_weapon")) itemTypes.push("weapon");
    if (formData.get("type_consumable")) itemTypes.push("consumable");
    if (formData.get("type_tool")) itemTypes.push("tool");
    if (formData.get("type_loot")) itemTypes.push("loot");

    const acceptsRaw = formData.get("accepts") || "";
    const accepts = acceptsRaw
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    const rules = {
      isArmor: Boolean(formData.get("rule_isArmor")),
      isShield: Boolean(formData.get("rule_isShield")),
      locksOffHandOn2H: Boolean(formData.get("rule_locksOffHandOn2H")),
      singlePerActor: Boolean(formData.get("rule_singlePerActor"))
    };

    const result = {
      id,
      label,
      icon,
      column,
      category: resolveCategory(this.slot.category, rules, accepts),
      itemTypes: itemTypes.length > 0 ? itemTypes : ["equipment"],
      accepts,
      order: this.slot.order ?? 50,
      rules
    };

    this._settle(result);
    this.close();
  }

  static _onCancel(event, target) {
    this._settle(null);
    this.close();
  }

  /**
   * Resolve the pending configureSlot() promise exactly once.
   * @param {Object|null} result
   */
  _settle(result) {
    const resolve = this._resolve;
    this._resolve = null;
    resolve?.(result);
  }

  /** @inheritDoc */
  async close(options = {}) {
    // Dismissing the window (X, Escape) must not leave the caller awaiting forever.
    this._settle(null);
    return super.close(options);
  }

  /**
   * Static helper to prompt GM for slot configuration
   * @param {Object} slotData
   * @returns {Promise<Object|null>}
   */
  static async configureSlot(slotData = {}) {
    return new Promise((resolve) => {
      const dialog = new SlotConfigDialog(slotData);
      dialog._resolve = resolve;
      dialog.render({ force: true });
    });
  }
}
