// ─────────────────────────────────────────────────────────
// AIM: Actor Window - the paperdoll: figure, slots, attunement sockets, slotless strip
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";
import { getActorAttunementMax, isItemAttuned } from "../core/attunement.js";
import { getActorEquippedMap, getTwoHandLayout, isOffHandLockedBy2H } from "../core/equipment-rules.js";
import { PHYSICAL_ITEM_TYPES, getValidSlotsForItem, isItemCompatibleWithSlot, isTwoHandedWeapon } from "../core/item-classifier.js";
import { dollLayout } from "../core/paperdoll-layout.js";
import { getActorPaperdollTemplate, getAllTemplates } from "../core/paperdoll-templates.js";
import { readVehicleHold } from "../integrations/dnd5e.js";

const FIGURES = `modules/${MODULE_ID}/assets/figures.svg`;
const FIGURE_VIEW = { human: "0 0 120 260", beast: "0 0 240 160", wagon: "0 0 240 160", ship: "0 0 240 160", airship: "0 0 240 160" };

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const tile = (item) => item && { id: item.id, name: item.name, img: item.img, rarity: item.system?.rarity ?? "" };

/**
 * Everything the doll draws for an actor.
 * @param {Actor} actor
 * @param {{canEdit: boolean, selected: string|null, hidden: boolean}} state
 */
export function buildDollContext(actor, { canEdit, selected, hidden }) {
  const template = getActorPaperdollTemplate(actor);
  const map = getActorEquippedMap(actor);
  const attuned = actor.items.filter((item) => PHYSICAL_ITEM_TYPES.has(item.type) && isItemAttuned(item));
  const max = getActorAttunementMax(actor);
  const layout = dollLayout(template.slots, { max, attuned: attuned.length });
  const hands = getTwoHandLayout(actor);
  const offSlots = new Set(hands.offSlotIds);
  // While a two-handed weapon is held the off hand shows a lock and a faded copy of it.
  const twoHanded = isOffHandLockedBy2H(map, actor)
    ? hands.mainSlotIds.map((id) => map.get(id)).find((item) => item && isTwoHandedWeapon(item)) ?? null
    : null;

  const slot = (def, style = "") => {
    const item = map.get(def.id) ?? null;
    const locked = !item && twoHanded && offSlots.has(def.id) ? tile(twoHanded) : null;
    return {
      id: def.id,
      label: def.label,
      icon: def.icon || "fa-light fa-circle",
      style,
      item: tile(item),
      locked,
      selected: Boolean(item && item.id === selected),
      tip: item ? item.name : locked ? t("AIM.window.doll.lockedBy", { item: locked.name }) : def.label,
      unequipLabel: item ? t("AIM.window.doll.unequip", { item: item.name }) : ""
    };
  };

  const worn = new Set([...map.values()].map((item) => item.id));
  const slotless = actor.items
    .filter((item) => PHYSICAL_ITEM_TYPES.has(item.type) && item.system?.equipped && !item.system?.container && !worn.has(item.id))
    .map((item) => ({ ...tile(item), selected: item.id === selected, unequipLabel: t("AIM.window.doll.unequip", { item: item.name }) }));

  const sockets = Array.from({ length: layout.sockets }, (_, i) => {
    const item = attuned[i] ?? null;
    return {
      item: tile(item),
      over: i >= max,
      selected: Boolean(item && item.id === selected),
      tip: item ? t("AIM.window.doll.attunedSocket", { item: item.name }) : t("AIM.window.doll.freeSocket"),
      endLabel: item ? t("AIM.window.doll.attuneEnd", { item: item.name }) : ""
    };
  });

  const hold = actor.type === "vehicle" ? readVehicleHold(actor) : null;
  return {
    hidden,
    banner: layout.banner,
    title: t(layout.banner ? "AIM.window.doll.figureTitle" : "AIM.window.doll.title"),
    presetName: template.templateName,
    presets: game.user.isGM
      ? getAllTemplates().map((preset) => ({ id: preset.id, name: preset.name, selected: preset.id === template.templateId }))
      : null,
    actorPreset: template.isActorCustom ? template.templateName : null,
    figureHref: `${FIGURES}#fig-${template.figure}`,
    figureView: FIGURE_VIEW[template.figure] ?? FIGURE_VIEW.human,
    figure: template.figure,
    backdrop: game.settings.get(MODULE_ID, "showActorPortraitBackdrop") ? actor.img : null,
    rows: layout.rows,
    figureEnd: layout.figureRows + 1,
    slots: layout.placed.map(({ slot: def, column, row }) => slot(def, `grid-column: ${column}; grid-row: ${row}`)),
    extra: layout.extra.map((def) => slot(def)),
    slotless,
    sockets,
    socketsInGrid: layout.socketsInGrid,
    socketGridStyle: `grid-column: 2; grid-row: ${layout.rows}`,
    socketStrip: layout.strip,
    socketColumns: layout.socketColumns,
    attune: { count: attuned.length, max, over: layout.over },
    hold: hold && {
      size: hold.size,
      cargo: hold.cargo === null ? t("AIM.window.doll.noCargo") : t("AIM.window.doll.cargo", { value: hold.cargo, unit: hold.unit })
    },
    canEdit
  };
}

/**
 * The first unequipped item an empty slot is a natural place for (amulets for the neck, not an orb that could go
 * anywhere), or null. Items without a place of their own still go into any slot by dragging.
 */
export function firstItemFor(actor, slotId) {
  return actor.items.find((item) => PHYSICAL_ITEM_TYPES.has(item.type) && "equipped" in (item.system ?? {})
    && !item.system.equipped && !item.system.container && getValidSlotsForItem(item, actor).includes(slotId)
    && isItemCompatibleWithSlot(item, slotId, actor)) ?? null;
}
