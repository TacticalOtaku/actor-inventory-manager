// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Paperdoll Templates System
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID, SLOTS, TEMPLATE_PRESETS } from "../constants.js";
import { getPaperdollRuntime } from "./paperdoll-runtime.js";
import { isSupportedActor } from "./actor-scope.js";

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

const COLUMNS = ["left", "center", "right"];

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
    return getPaperdollRuntime().getCustomTemplates() ?? {};
  } catch {
    return {};
  }
}

/**
 * Get all available templates (Presets + Custom World Templates)
 * @returns {Array<Object>}
 */
export function getAllTemplates() {
  const runtime = getPaperdollRuntime();
  const custom = getWorldCustomTemplates();
  const presets = Object.values(PRESET_TEMPLATES).map(p => ({
    ...p,
    name: runtime.localize(p.nameKey, p.name || p.id),
    description: runtime.localize(p.descKey, p.description || "")
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
 * @returns {Object} { templateId, isActorCustom, slots, leftSlots, centerSlots, rightSlots, attunementMax }
 */
export function getActorPaperdollTemplate(actor) {
  if (!actor) {
    return formatTemplateContext(DND_2024_TEMPLATE);
  }

  const flags = actor.flags?.[MODULE_ID] ?? {};

  // 1. Per-actor template stored directly on the actor (current and legacy flag names)
  const customTemplateData = flags[FLAGS.CUSTOM_TEMPLATE] || flags.customTemplate;
  if (customTemplateData && Array.isArray(customTemplateData.slots) && customTemplateData.slots.length > 0) {
    return { ...formatTemplateContext({ ...customTemplateData, id: "custom" }), isActorCustom: true };
  }

  // 2. A preset or world template linked by id
  const templateId = flags[FLAGS.TEMPLATE_ID] || flags.templateId;
  return formatTemplateContext(getTemplateById(templateId || TEMPLATE_PRESETS.DND_2024));
}

/**
 * Helper to sort and group template slots into 3 columns
 * @param {Object} template
 * @returns {Object}
 */
function formatTemplateContext(template) {
  const runtime = getPaperdollRuntime();
  const slots = (template.slots || []).map(s => {
    const localizedLabel = s.labelKey
      ? runtime.localize(s.labelKey, s.label || s.id)
      : (s.label || s.id);

    return {
      ...s,
      label: localizedLabel,
      column: COLUMNS.includes(s.column) ? s.column : "center",
      order: s.order ?? 50,
      rules: s.rules || {}
    };
  }).sort((a, b) => (a.order ?? 50) - (b.order ?? 50));

  const leftSlots = slots.filter(s => s.column === "left");
  const centerSlots = slots.filter(s => s.column === "center");
  const rightSlots = slots.filter(s => s.column === "right");

  return {
    templateId: template.id || "custom",
    templateName: template.nameKey
      ? runtime.localize(template.nameKey, template.name || template.id)
      : (template.name || template.id),
    isPreset: Boolean(template.isPreset),
    isActorCustom: false,
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
 * Write the template's attunement cap to the actor, where the system has one.
 * @param {Object} actor
 * @param {number|undefined} attunementMax
 */
async function applyAttunementMax(actor, attunementMax) {
  if (typeof attunementMax !== "number" || typeof actor.update !== "function") return;
  if (!actor.system?.attributes?.attunement) return;
  try {
    await actor.update({ "system.attributes.attunement.max": attunementMax });
  } catch (error) {
    getPaperdollRuntime().logWarn("Could not update the actor's attunement maximum", error);
  }
}

/** Remove a per-actor template, including the legacy flag name. */
async function clearActorCustomTemplate(actor) {
  const flags = actor.flags?.[MODULE_ID] ?? {};
  for (const key of [FLAGS.CUSTOM_TEMPLATE, "customTemplate"]) {
    if (key in flags) await actor.unsetFlag(MODULE_ID, key);
  }
}

/**
 * Assign a template or custom configuration to an actor (GM Only)
 * @param {Object} actor
 * @param {string} templateId
 * @param {Object|null} customTemplateData
 */
export async function setActorPaperdollTemplate(actor, templateId, customTemplateData = null) {
  if (!isSupportedActor(actor)) return;
  const runtime = getPaperdollRuntime();
  if (!runtime.isGM()) {
    runtime.notifyWarning(runtime.localize("AIM.editor.gmOnly", "Only GM can modify actor paperdoll templates"));
    return;
  }

  if (customTemplateData) {
    // Drop the previous copy first: a merge would keep keys the new one no longer has.
    await clearActorCustomTemplate(actor);
    await actor.update({
      [`flags.${MODULE_ID}.${FLAGS.CUSTOM_TEMPLATE}`]: { ...customTemplateData, id: "custom" },
      [`flags.${MODULE_ID}.${FLAGS.TEMPLATE_ID}`]: "custom"
    });
    await applyAttunementMax(actor, customTemplateData.attunementMax);
  } else {
    await clearActorCustomTemplate(actor);
    await actor.setFlag(MODULE_ID, FLAGS.TEMPLATE_ID, templateId);
    await applyAttunementMax(actor, getTemplateById(templateId)?.attunementMax);
  }

  runtime.logInfo("Actor paperdoll template updated", { actorId: actor.id, templateId });
}

/**
 * Is this id reserved by a built-in preset (or the per-actor "custom" marker)?
 * @param {string} templateId
 * @returns {boolean}
 */
export function isReservedTemplateId(templateId) {
  return Boolean(PRESET_TEMPLATES[templateId]) || templateId === "custom";
}

/**
 * Validate and normalise template data coming from the editor or an import.
 * @param {Object} data
 * @returns {Object}
 */
export function normalizeTemplateData(data) {
  const runtime = getPaperdollRuntime();
  const fail = (key, fallback, info = {}) => {
    throw new Error(runtime.format(`AIM.editor.errors.${key}`, info, fallback));
  };

  if (!data || typeof data !== "object") fail("invalid", "Invalid template data.");
  const id = typeof data.id === "string" ? data.id.trim() : "";
  if (!id) fail("missingId", "The template needs an id.");
  if (isReservedTemplateId(id)) fail("reservedId", "The id '{id}' is reserved by a built-in template.", { id });
  if (!Array.isArray(data.slots) || data.slots.length === 0) fail("noSlots", "The template has no slots.");

  const seen = new Set();
  const slots = data.slots.map((slot, index) => {
    const slotId = typeof slot?.id === "string" ? slot.id.trim() : "";
    if (!slotId) fail("slotMissingId", "Slot #{index} has no id.", { index: index + 1 });
    if (seen.has(slotId)) fail("duplicateSlot", "Slot id '{id}' is used more than once.", { id: slotId });
    seen.add(slotId);
    const strings = value => (Array.isArray(value) ? value.filter(v => typeof v === "string" && v.trim()).map(v => v.trim()) : []);
    return {
      id: slotId,
      ...(typeof slot.labelKey === "string" ? { labelKey: slot.labelKey } : {}),
      label: typeof slot.label === "string" && slot.label.trim() ? slot.label.trim() : slotId,
      icon: typeof slot.icon === "string" && slot.icon.trim() ? slot.icon.trim() : "fa-solid fa-gem",
      column: COLUMNS.includes(slot.column) ? slot.column : "center",
      category: typeof slot.category === "string" ? slot.category : "equipment",
      accepts: strings(slot.accepts).map(v => v.toLowerCase()),
      itemTypes: strings(slot.itemTypes),
      order: Number.isFinite(Number(slot.order)) ? Number(slot.order) : 50,
      rules: {
        singlePerActor: Boolean(slot.rules?.singlePerActor),
        locksOffHandOn2H: Boolean(slot.rules?.locksOffHandOn2H),
        isArmor: Boolean(slot.rules?.isArmor),
        isShield: Boolean(slot.rules?.isShield)
      }
    };
  });

  const attunementMax = Number(data.attunementMax);
  return {
    id,
    name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : id,
    ...(typeof data.description === "string" ? { description: data.description } : {}),
    attunementMax: Number.isFinite(attunementMax) ? Math.max(0, Math.min(9, Math.round(attunementMax))) : 3,
    slots
  };
}

/**
 * Save a custom template to world settings (GM Only)
 * @param {Object} templateData
 */
export async function saveWorldCustomTemplate(templateData) {
  const runtime = getPaperdollRuntime();
  if (!runtime.isGM()) return;
  const template = normalizeTemplateData(templateData);

  const custom = { ...getWorldCustomTemplates() };
  custom[template.id] = {
    ...template,
    isPreset: false,
    updatedAt: Date.now()
  };

  await runtime.setCustomTemplates(custom);
  runtime.logInfo("Saved custom template to world", { templateId: template.id });
}

/**
 * Delete a custom template from world settings (GM Only)
 * @param {string} templateId
 */
export async function deleteWorldCustomTemplate(templateId) {
  const runtime = getPaperdollRuntime();
  if (!runtime.isGM()) return;
  if (PRESET_TEMPLATES[templateId]) {
    throw new Error("Cannot delete built-in preset templates");
  }

  const custom = { ...getWorldCustomTemplates() };
  if (!(templateId in custom)) return;
  delete custom[templateId];
  await runtime.setCustomTemplates(custom);
  runtime.logInfo("Deleted custom template from world", { templateId });
}

/**
 * Is this a template stored in the world settings?
 * @param {string} templateId
 * @returns {boolean}
 */
export function isWorldCustomTemplate(templateId) {
  return !isReservedTemplateId(templateId) && Boolean(getWorldCustomTemplates()[templateId]);
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
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch {
    const runtime = getPaperdollRuntime();
    throw new Error(runtime.localize("AIM.editor.errors.invalidJSON", "The text is not valid JSON."));
  }
  const template = normalizeTemplateData(data);
  await saveWorldCustomTemplate(template);
  return template;
}
