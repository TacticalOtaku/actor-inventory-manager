// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Paperdoll Templates System
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID, SLOTS, TEMPLATE_PRESETS } from "../constants.js";
import { LOG } from "../foundry/logger.js";

/**
 * Built-in Preset: D&D 2024 Rules (Default)
 */
export const DND_2024_TEMPLATE = {
  id: TEMPLATE_PRESETS.DND_2024,
  nameKey: "AIM.templates.dnd2024.name",
  descKey: "AIM.templates.dnd2024.desc",
  isPreset: true,
  attunementMax: 3,
  slots: [
    {
      id: SLOTS.HEAD,
      labelKey: "AIM.slots.head",
      label: "Head",
      icon: "fa-solid fa-helmet-safety",
      column: "left",
      category: "equipment",
      accepts: ["head", "helmet", "hat", "circlet", "hood", "mask", "crown"],
      itemTypes: ["equipment"],
      order: 10,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.NECK,
      labelKey: "AIM.slots.neck",
      label: "Neck",
      icon: "fa-solid fa-gem",
      column: "left",
      category: "equipment",
      accepts: ["neck", "necklace", "amulet", "pendant", "medallion", "periapt", "collar", "torc"],
      itemTypes: ["equipment", "loot"],
      order: 20,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.CLOAK,
      labelKey: "AIM.slots.cloak",
      label: "Cloak",
      icon: "fa-solid fa-vest-patches",
      column: "left",
      category: "equipment",
      accepts: ["cloak", "cape", "mantle", "robe_outer", "shawl", "pauldron"],
      itemTypes: ["equipment"],
      order: 30,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.MAIN_HAND,
      labelKey: "AIM.slots.mainHand",
      label: "Main Hand",
      icon: "fa-solid fa-hand-fist",
      column: "left",
      category: "hand",
      accepts: ["weapon", "mainHand", "shield", "staff", "wand", "rod", "focus", "torch", "tool"],
      itemTypes: ["weapon", "equipment", "tool", "consumable"],
      order: 40,
      rules: { singlePerActor: false, locksOffHandOn2H: true, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.ARMOR,
      labelKey: "AIM.slots.armor",
      label: "Body Armor",
      icon: "fa-solid fa-shield-halved",
      column: "center",
      category: "equipment",
      accepts: ["armor", "light", "medium", "heavy", "clothing", "robe", "vestment", "bodyArmor"],
      itemTypes: ["equipment"],
      order: 10,
      rules: { singlePerActor: true, locksOffHandOn2H: false, isArmor: true, isShield: false }
    },
    {
      id: SLOTS.WAIST,
      labelKey: "AIM.slots.waist",
      label: "Waist",
      icon: "fa-solid fa-bacon",
      column: "center",
      category: "equipment",
      accepts: ["waist", "belt", "girdle", "sash", "cinch"],
      itemTypes: ["equipment"],
      order: 20,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.FEET,
      labelKey: "AIM.slots.feet",
      label: "Feet",
      icon: "fa-solid fa-shoe-prints",
      column: "center",
      category: "equipment",
      accepts: ["feet", "boots", "shoes", "greaves", "slippers", "sandals", "sabatons"],
      itemTypes: ["equipment"],
      order: 30,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.HANDS,
      labelKey: "AIM.slots.hands",
      label: "Hands",
      icon: "fa-solid fa-mitten",
      column: "right",
      category: "equipment",
      accepts: ["hands", "gloves", "gauntlets", "bracers", "handwraps"],
      itemTypes: ["equipment"],
      order: 10,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.RING_1,
      labelKey: "AIM.slots.ring1",
      label: "Ring 1",
      icon: "fa-solid fa-ring",
      column: "right",
      category: "ring",
      accepts: ["ring", "band", "signet"],
      itemTypes: ["equipment", "loot"],
      order: 20,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.RING_2,
      labelKey: "AIM.slots.ring2",
      label: "Ring 2",
      icon: "fa-solid fa-ring",
      column: "right",
      category: "ring",
      accepts: ["ring", "band", "signet"],
      itemTypes: ["equipment", "loot"],
      order: 30,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.OFF_HAND,
      labelKey: "AIM.slots.offHand",
      label: "Off Hand",
      icon: "fa-solid fa-hand",
      column: "right",
      category: "hand",
      accepts: ["shield", "offHand", "weapon", "focus", "torch", "lantern", "quiver", "instrument"],
      itemTypes: ["weapon", "equipment", "tool", "consumable"],
      order: 40,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: true }
    }
  ]
};

/**
 * Built-in Preset: D&D 2014 Rules
 */
export const DND_2014_TEMPLATE = {
  id: TEMPLATE_PRESETS.DND_2014,
  nameKey: "AIM.templates.dnd2014.name",
  descKey: "AIM.templates.dnd2014.desc",
  isPreset: true,
  attunementMax: 3,
  slots: [
    {
      id: SLOTS.HEAD,
      labelKey: "AIM.slots.head",
      label: "Head",
      icon: "fa-solid fa-helmet-safety",
      column: "left",
      category: "equipment",
      accepts: ["head", "helmet", "hat", "circlet", "hood"],
      itemTypes: ["equipment"],
      order: 10,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.NECK,
      labelKey: "AIM.slots.neck",
      label: "Neck",
      icon: "fa-solid fa-gem",
      column: "left",
      category: "equipment",
      accepts: ["neck", "necklace", "amulet", "pendant", "periapt"],
      itemTypes: ["equipment", "loot"],
      order: 20,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.CLOAK,
      labelKey: "AIM.slots.cloak",
      label: "Cloak",
      icon: "fa-solid fa-vest-patches",
      column: "left",
      category: "equipment",
      accepts: ["cloak", "cape", "mantle", "robe_outer"],
      itemTypes: ["equipment"],
      order: 30,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.MAIN_HAND,
      labelKey: "AIM.slots.mainHand",
      label: "Main Hand",
      icon: "fa-solid fa-hand-fist",
      column: "left",
      category: "hand",
      accepts: ["weapon", "mainHand", "shield", "staff", "wand", "rod", "focus"],
      itemTypes: ["weapon", "equipment", "tool", "consumable"],
      order: 40,
      rules: { singlePerActor: false, locksOffHandOn2H: true, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.ARMOR,
      labelKey: "AIM.slots.armor",
      label: "Body Armor",
      icon: "fa-solid fa-shield-halved",
      column: "center",
      category: "equipment",
      accepts: ["armor", "light", "medium", "heavy", "clothing"],
      itemTypes: ["equipment"],
      order: 10,
      rules: { singlePerActor: true, locksOffHandOn2H: false, isArmor: true, isShield: false }
    },
    {
      id: SLOTS.WAIST,
      labelKey: "AIM.slots.waist",
      label: "Waist",
      icon: "fa-solid fa-bacon",
      column: "center",
      category: "equipment",
      accepts: ["waist", "belt", "girdle"],
      itemTypes: ["equipment"],
      order: 20,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.FEET,
      labelKey: "AIM.slots.feet",
      label: "Feet",
      icon: "fa-solid fa-shoe-prints",
      column: "center",
      category: "equipment",
      accepts: ["feet", "boots", "shoes", "slippers"],
      itemTypes: ["equipment"],
      order: 30,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.HANDS,
      labelKey: "AIM.slots.hands",
      label: "Hands",
      icon: "fa-solid fa-mitten",
      column: "right",
      category: "equipment",
      accepts: ["hands", "gloves", "gauntlets", "bracers"],
      itemTypes: ["equipment"],
      order: 10,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.RING_1,
      labelKey: "AIM.slots.ring1",
      label: "Ring 1",
      icon: "fa-solid fa-ring",
      column: "right",
      category: "ring",
      accepts: ["ring", "band"],
      itemTypes: ["equipment", "loot"],
      order: 20,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.RING_2,
      labelKey: "AIM.slots.ring2",
      label: "Ring 2",
      icon: "fa-solid fa-ring",
      column: "right",
      category: "ring",
      accepts: ["ring", "band"],
      itemTypes: ["equipment", "loot"],
      order: 30,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
    },
    {
      id: SLOTS.OFF_HAND,
      labelKey: "AIM.slots.offHand",
      label: "Off Hand",
      icon: "fa-solid fa-hand",
      column: "right",
      category: "hand",
      accepts: ["shield", "offHand", "weapon", "focus", "torch"],
      itemTypes: ["weapon", "equipment", "tool", "consumable"],
      order: 40,
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: true }
    }
  ]
};

export const PRESET_TEMPLATES = {
  [TEMPLATE_PRESETS.DND_2024]: DND_2024_TEMPLATE,
  [TEMPLATE_PRESETS.DND_2014]: DND_2014_TEMPLATE
};

/**
 * Get all world custom templates saved in game settings
 * @returns {Record<string, Object>}
 */
export function getWorldCustomTemplates() {
  try {
    return globalThis.game?.settings?.get(MODULE_ID, "customTemplates") ?? {};
  } catch {
    return {};
  }
}

/**
 * Get all available templates (Presets + Custom World Templates)
 * @returns {Array<Object>}
 */
export function getAllTemplates() {
  const custom = getWorldCustomTemplates();
  const presets = Object.values(PRESET_TEMPLATES).map(p => ({
    ...p,
    name: globalThis.game?.i18n?.localize ? globalThis.game.i18n.localize(p.nameKey) : (p.name || p.id),
    description: globalThis.game?.i18n?.localize ? globalThis.game.i18n.localize(p.descKey) : (p.description || "")
  }));

  const customList = Object.values(custom).map(c => ({
    ...c,
    name: c.name || c.id,
    isPreset: false
  }));

  return [...presets, ...customList];
}

/**
 * Get template definition by ID
 * @param {string} templateId
 * @returns {Object}
 */
export function getTemplateById(templateId) {
  if (!templateId) return DND_2024_TEMPLATE;
  if (PRESET_TEMPLATES[templateId]) {
    return PRESET_TEMPLATES[templateId];
  }
  const custom = getWorldCustomTemplates();
  if (custom[templateId]) {
    return custom[templateId];
  }
  return DND_2024_TEMPLATE;
}

/**
 * Get an actor's active paperdoll template and grouped slot structure.
 * Default fallback is D&D 2024 Rules.
 * @param {Object} actor
 * @returns {Object} { template, slots, leftSlots, centerSlots, rightSlots, attunementMax }
 */
export function getActorPaperdollTemplate(actor) {
  if (!actor) {
    return formatTemplateContext(DND_2024_TEMPLATE);
  }

  // 1. Check if actor has custom template data stored directly on actor flags
  const customTemplateData = actor.getFlag ? actor.getFlag(MODULE_ID, FLAGS.CUSTOM_TEMPLATE) : actor.flags?.[MODULE_ID]?.[FLAGS.CUSTOM_TEMPLATE];
  if (customTemplateData && Array.isArray(customTemplateData.slots) && customTemplateData.slots.length > 0) {
    return formatTemplateContext(customTemplateData);
  }

  // 2. Check if actor has a templateId assigned
  const templateId = actor.getFlag ? actor.getFlag(MODULE_ID, FLAGS.TEMPLATE_ID) : actor.flags?.[MODULE_ID]?.[FLAGS.TEMPLATE_ID];
  const template = getTemplateById(templateId || TEMPLATE_PRESETS.DND_2024);

  return formatTemplateContext(template);
}

/**
 * Helper to sort and group template slots into 3 columns
 * @param {Object} template
 * @returns {Object}
 */
function formatTemplateContext(template) {
  const slots = (template.slots || []).map(s => {
    const localizedLabel = s.labelKey && globalThis.game?.i18n?.localize
      ? globalThis.game.i18n.localize(s.labelKey)
      : (s.label || s.id);

    return {
      ...s,
      label: localizedLabel,
      column: s.column || "center",
      order: s.order ?? 50,
      rules: s.rules || {}
    };
  }).sort((a, b) => (a.order ?? 50) - (b.order ?? 50));

  const leftSlots = slots.filter(s => s.column === "left");
  const centerSlots = slots.filter(s => s.column === "center");
  const rightSlots = slots.filter(s => s.column === "right");

  return {
    templateId: template.id || "custom",
    templateName: template.nameKey && globalThis.game?.i18n?.localize ? globalThis.game.i18n.localize(template.nameKey) : (template.name || template.id),
    isPreset: Boolean(template.isPreset),
    attunementMax: template.attunementMax ?? 3,
    slots,
    leftSlots,
    centerSlots,
    rightSlots
  };
}

/**
 * Get the list of all slot definitions for a specific actor
 * @param {Object} actor
 * @returns {Array<Object>}
 */
export function getActorSlots(actor) {
  return getActorPaperdollTemplate(actor).slots;
}

/**
 * Assign a template or custom configuration to an actor (GM Only)
 * @param {Object} actor
 * @param {string} templateId
 * @param {Object|null} customTemplateData
 */
export async function setActorPaperdollTemplate(actor, templateId, customTemplateData = null) {
  if (!actor) return;
  if (!globalThis.game?.user?.isGM) {
    ui.notifications?.warn(globalThis.game?.i18n?.localize("AIM.editor.gmOnly") || "Only GM can modify actor paperdoll templates");
    return;
  }

  if (customTemplateData) {
    await actor.setFlag(MODULE_ID, FLAGS.CUSTOM_TEMPLATE, customTemplateData);
    await actor.setFlag(MODULE_ID, FLAGS.TEMPLATE_ID, "custom");
    if (customTemplateData.attunementMax !== undefined && actor.update && actor.system?.attributes?.attunement) {
      try {
        await actor.update({ "system.attributes.attunement.max": customTemplateData.attunementMax });
      } catch {}
    }
  } else {
    await actor.unsetFlag(MODULE_ID, FLAGS.CUSTOM_TEMPLATE);
    await actor.setFlag(MODULE_ID, FLAGS.TEMPLATE_ID, templateId);
    const template = getTemplateById(templateId);
    if (template?.attunementMax !== undefined && actor.update && actor.system?.attributes?.attunement) {
      try {
        await actor.update({ "system.attributes.attunement.max": template.attunementMax });
      } catch {}
    }
  }

  LOG.info("Actor paperdoll template updated", { actorId: actor.id, templateId });
}

/**
 * Save a custom template to world settings (GM Only)
 * @param {Object} templateData
 */
export async function saveWorldCustomTemplate(templateData) {
  if (!globalThis.game?.user?.isGM) return;
  if (!templateData || !templateData.id) throw new Error("Template must have a unique ID");

  const custom = getWorldCustomTemplates();
  custom[templateData.id] = {
    ...templateData,
    isPreset: false,
    updatedAt: Date.now()
  };

  await globalThis.game.settings.set(MODULE_ID, "customTemplates", custom);
  LOG.info("Saved custom template to world", { templateId: templateData.id });
}

/**
 * Delete a custom template from world settings (GM Only)
 * @param {string} templateId
 */
export async function deleteWorldCustomTemplate(templateId) {
  if (!globalThis.game?.user?.isGM) return;
  if (PRESET_TEMPLATES[templateId]) {
    throw new Error("Cannot delete built-in preset templates");
  }

  const custom = getWorldCustomTemplates();
  delete custom[templateId];
  await globalThis.game.settings.set(MODULE_ID, "customTemplates", custom);
  LOG.info("Deleted custom template from world", { templateId });
}

/**
 * Export a template definition as a formatted JSON string
 * @param {string} templateId
 * @returns {string}
 */
export function exportTemplateJSON(templateId) {
  const template = getTemplateById(templateId);
  return JSON.stringify(template, null, 2);
}

/**
 * Import a template from JSON string and save to world
 * @param {string} jsonString
 * @returns {Promise<Object>}
 */
export async function importTemplateJSON(jsonString) {
  const data = JSON.parse(jsonString);
  if (!data.id || !Array.isArray(data.slots)) {
    throw new Error("Invalid template JSON structure: missing 'id' or 'slots'");
  }
  await saveWorldCustomTemplate(data);
  return data;
}
