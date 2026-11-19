// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - DnD5e Integration (Inventory & Drops)
// ─────────────────────────────────────────────────────────

import { getAttunementStatus } from "../../core/attunement.js";
import { PHYSICAL_ITEM_TYPES, canItemBeEquipped } from "../../core/item-classifier.js";
import { getItemWeightInUnit, getSystemWeightUnit, num } from "../../core/weight-calculator.js";
import { LOG } from "../../foundry/logger.js";
import { getItemRarityVisuals } from "../sc-rarity-colors.js";
import { concealsDetails, getDnd5eConfig, localizeOr, rarityLabel, unitAbbreviation } from "./common.js";

/**
 * The physical items the actor window lists. dnd5e 5.3.3 shapes: `price` is {value, denomination} per unit and
 * CONFIG.DND5E.currencies[denomination].conversion is coins per gold piece; charges are `uses.max` and `uses.spent`
 * (`uses.value` is derived); `container` is the id of the holding container; a container's own weight ignores quantity.
 * An unidentified item's price, rarity, properties and charges stay unknown to players (`concealsDetails`).
 * @param {Object} actor
 */
export function readInventory(actor) {
  const config = getDnd5eConfig();
  const unit = getSystemWeightUnit();
  const entries = [];
  for (const item of actor?.items ?? []) {
    if (!PHYSICAL_ITEM_TYPES.has(item.type)) continue;
    const system = item.system ?? {};
    const quantity = num(system.quantity, 1);
    const conversion = num(config.currencies?.[system.price?.denomination ?? "gp"]?.conversion, 1) || 1;
    const max = num(system.uses?.max, 0);
    const spent = num(system.uses?.spent, 0);
    const attunement = getAttunementStatus(item);
    const concealed = concealsDetails(item);
    entries.push({
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      img: item.img || "icons/svg/item-bag.svg",
      type: item.type,
      container: system.container ?? null,
      weight: getItemWeightInUnit(item, unit),
      price: concealed ? 0 : num(system.price?.value, 0) / conversion,
      rarity: concealed ? "" : system.rarity ?? "",
      quantity,
      sort: num(item.sort, 0),
      equipped: Boolean(system.equipped),
      canEquip: canItemBeEquipped(item),
      attunement,
      attuned: attunement === "attuned",
      charges: max > 0 && !concealed ? { value: Math.max(0, max - spent), max, spent, autoDestroy: Boolean(system.uses?.autoDestroy) } : null,
      identified: system.identified !== false,
      tags: concealed ? [] : [...(system.properties ?? [])].map((key) => config.itemProperties?.[key]?.label ?? key)
    });
  }
  return entries;
}

/**
 * A container's own capacity, used when Weighty Containers is absent. dnd5e 5.3.3: `system.computeCapacity()` resolves
 * {value, max, pct, units}, counting items when `capacity.count` is set, else weighing contents; max is Infinity
 * without a capacity. `capacity.weight.units` is the weight unit key ("lb", "kg").
 * @param {Object} container
 * @returns {Promise<{value: number, max: number, kind: "count"|"weight", unit: string}|null>}
 */
export async function readContainerCapacity(container) {
  if (typeof container?.system?.computeCapacity !== "function") return null;
  const { value = 0, max = Infinity } = await container.system.computeCapacity();
  const capacity = container.system.capacity ?? {};
  return { value: num(value, 0), max: Number(max), kind: capacity.count ? "count" : "weight", unit: capacity.weight?.units ?? "lb" };
}

/** The actor's dnd5e coins in CONFIG.DND5E.currencies order (pp, gp, ep, sp, cp in 5.3.3). */
export function readCoins(actor) {
  const currencies = getDnd5eConfig().currencies ?? {};
  return Object.entries(currencies).map(([key, cfg]) => ({
    key,
    label: localizeOr(cfg.label, cfg.label ?? key),
    abbr: localizeOr(cfg.abbreviation, cfg.abbreviation ?? key),
    value: num(actor?.system?.currency?.[key], 0)
  }));
}

/**
 * Format item details for rendering in inventory list and tooltips.
 * An unidentified item shows players its unidentified description and no price, rarity or properties (`concealsDetails`).
 * @param {Object} item
 * @returns {Object}
 */
export function formatItemForDisplay(item) {
  if (!item) return null;

  const system = item.system ?? {};
  const concealed = concealsDetails(item);
  const rarity = concealed ? "common" : (system.rarity ?? "common").toLowerCase();
  const rarityVisuals = getItemRarityVisuals(rarity);
  const rarityColor = rarityVisuals.color;
  const hasGlow = rarityVisuals.hasGlow;
  const isEquipped = Boolean(system.equipped);
  const qty = num(system.quantity, 1);
  // Totals and containers are shown in the world's unit, so rows are too.
  const weightUnit = getSystemWeightUnit();
  const weightUnits = unitAbbreviation("weightUnits", weightUnit);
  const priceVal = concealed ? 0 : num(system.price?.value, 0);
  const priceDenom = system.price?.denomination ?? "gp";

  // Attunement state
  const attunementStatus = getAttunementStatus(item);
  const isAttuned = attunementStatus === "attuned";
  const requiresAttunement = attunementStatus !== "none";

  // Properties array/list
  const properties = [];
  const config = getDnd5eConfig();
  const itemProps = config.itemProperties ?? {};
  for (const k of concealed ? [] : system.properties ?? []) {
    properties.push(itemProps[k]?.label ?? k);
  }

  return {
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    img: item.img || "icons/svg/item-bag.svg",
    type: item.type,
    rarity,
    rarityKey: rarityVisuals.rarityKey,
    rarityLabel: rarityLabel(rarityVisuals.rarityKey),
    rarityColor,
    rarityGlowColor: rarityVisuals.glowColor,
    hasGlow,
    cssVars: rarityVisuals.cssVars,
    isEquipped,
    canEquip: canItemBeEquipped(item),
    quantity: qty,
    hasMultiple: qty > 1,
    isAttuned,
    requiresAttunement,
    attunementStatus,
    weightDisplay: `${getItemWeightInUnit(item, weightUnit).toFixed(1)} ${weightUnits}`,
    priceDisplay: priceVal > 0 ? `${priceVal} ${priceDenom}` : "",
    properties,
    description: (concealed ? system.unidentified?.description : system.description?.value) ?? ""
  };
}

/** A sheet with only the root drop method cannot honor a tray; the document fallback can. */
export function droppedItemContainer(actor, container) {
  return container && typeof actor.sheet?._onDropItemContainer !== "function"
    && typeof actor.sheet?._onDropCreateItems === "function" ? null : container;
}

/** Receipt identity only: dnd5e itself still decides whether and how to stack a consumable. */
export function matchesDroppedStack(stack, dropped, container = null) {
  const sourceId = (item) => item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
  return dropped.type === "consumable" && Boolean(sourceId(dropped))
    && sourceId(stack) === sourceId(dropped) && stack.name === dropped.name
    && (stack.system?.container ?? null) === (container?.id ?? null);
}

/**
 * Creates items dropped from outside the actor through its sheet (ADR 0004), so dnd5e's sheet rules hold. dnd5e 5.3.3:
 * the protected `sheet._onDropCreateItems(event, items, behavior)`, always given `"copy"` so dnd5e never deletes the
 * source (a move is the window's to finish), or `sheet._onDropItemContainer(event, item, container)` for a drop on a
 * container. A sheet without them (another sheet module) falls back to `Item5e.createWithContents` and
 * `createDocuments({ keepId: true })`; document rules still run and the console names the sheet rules skipped.
 * @param {Object} actor
 * @param {DragEvent} event
 * @param {Object[]} items      Item documents
 * @param {{container?: Object|null}} [options]  the container item it was dropped on
 * @returns {Promise<Object[]>} what was created (stacked consumables create nothing)
 */
export async function createDroppedItems(actor, event, items, { container = null } = {}) {
  const sheet = actor.sheet;
  if (container && typeof sheet?._onDropItemContainer === "function") {
    const created = [];
    const behavior = Object.getOwnPropertyDescriptor(event, "_behavior");
    try {
      Object.defineProperty(event, "_behavior", { value: "copy", configurable: true });
      for (const item of items) created.push(...[await sheet._onDropItemContainer(event, item, container)].flat().filter(Boolean));
      return created;
    } finally {
      if (behavior) Object.defineProperty(event, "_behavior", behavior);
      else delete event._behavior;
    }
  }
  if (typeof sheet?._onDropCreateItems === "function") return [await sheet._onDropCreateItems(event, items, "copy")].flat().filter(Boolean);
  LOG.info(`${sheet?.constructor?.name ?? "The actor's sheet"} has no _onDropCreateItems: dnd5e's drop rules (data reset, consumable stacking, advancement, NPC gear) are skipped`);
  const Item5e = CONFIG.Item.documentClass;
  const toCreate = await Item5e.createWithContents(items, container ? { container } : {});
  return Item5e.createDocuments(toCreate, { parent: actor, keepId: true });
}

/**
 * A dropped spell that stays a spell, through public calls: dnd5e's sheet would turn it into a scroll by its own
 * active tab, not the window's (ADR 0004). The data reset dnd5e does on a drop, then the spell type's `onDropCreate`
 * (dnd5e 5.3.3 picks the default spellcasting method there).
 * @param {Object} actor
 * @param {DragEvent} event
 * @param {Object} spell  the Item document
 */
export async function createDroppedSpell(actor, event, spell) {
  const data = spell.toObject();
  for (const key of ["attuned", "equipped", "prepared"]) delete data.system?.[key];
  delete data._id;
  CONFIG.Item.dataModels.spell?.onDropCreate?.(event, actor, data);
  return [await CONFIG.Item.documentClass.create(data, { parent: actor })].filter(Boolean);
}

/** The item types the actor's sheet does not take (dnd5e 5.3.3: `unsupportedItemTypes` on the sheet class). */
export const sheetUnsupportedTypes = (actor) => actor?.sheet?.constructor?.unsupportedItemTypes ?? new Set();
