// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - DnD5e Integration (Features & Favorites)
// ─────────────────────────────────────────────────────────

import { num } from "../../core/weight-calculator.js";
import { concealsDetails, getDnd5eConfig, localizeOr, resolveItemActivation } from "./common.js";
import { resolveSpellSlotMax } from "./spells.js";

/** The section a feature belongs to from the item its advancement came from. */
function featureOrigin(root) {
  switch (root?.type) {
    case "class": return { kind: "class", key: root.identifier ?? root.system?.identifier ?? root.id };
    case "subclass": return { kind: "class", key: root.system?.classIdentifier ?? root.class?.identifier ?? "other" };
    case "race": return { kind: "species", key: "species" };
    case "background": return { kind: "background", key: "background" };
    default: return { kind: "other", key: "other" };
  }
}

/**
 * The features tab's entries: feats, and for an NPC or vehicle also weapons as attacks. dnd5e 5.3.3 shapes: the origin
 * is `flags.dnd5e.advancementRoot` (else `advancementOrigin`) "itemId.advancementId" naming the class, subclass,
 * species (`race`) or background item; a feature is passive with the `trait` property or no activities; uses are
 * `uses.max`/`spent` with `uses.recovery` [{period, formula}], a recharge being period "recharge"; an attack
 * activity labels `toHit` and `damage` [{label}].
 * @param {Object} actor
 * @param {{attacks?: boolean}} [options]
 */
export function readFeatures(actor, { attacks = false } = {}) {
  const config = getDnd5eConfig();
  return [...(actor?.items ?? [])].filter((item) => item.type === "feat" || (attacks && item.type === "weapon")).map((item) => {
    const system = item.system ?? {};
    const flags = item.flags?.dnd5e ?? {};
    const root = actor.items.get(String(flags.advancementRoot ?? flags.advancementOrigin ?? "").split(".")[0]);
    const properties = system.properties ?? new Set();
    const activities = [...(system.activities ?? [])];
    const max = num(system.uses?.max, 0);
    const spent = num(system.uses?.spent, 0);
    const recovery = Array.isArray(system.uses?.recovery) ? system.uses.recovery : [];
    const recharge = recovery.find((r) => r?.period === "recharge");
    const attack = item.type === "weapon" ? activities.find((a) => a.type === "attack") : null;
    // An unidentified weapon's bonus, properties and charges stay unknown to players, as in the inventory.
    const concealed = concealsDetails(item);
    return {
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      img: item.img,
      type: item.type,
      origin: featureOrigin(root),
      originId: root?.id ?? null,
      activation: resolveItemActivation(item).type,
      passive: properties.has("trait") || activities.length === 0,
      uses: max > 0 && !concealed ? { value: Math.max(0, max - spent), max, spent } : null,
      recovery: concealed ? [] : recovery.filter((r) => r?.period && r.period !== "recharge")
        .map((r) => config.limitedUsePeriods?.[r.period]?.label ?? r.period).map((label) => localizeOr(label, label)),
      recharge: recharge && !concealed ? { formula: String(recharge.formula ?? "6") } : null,
      attack: attack && !concealed ? { toHit: attack.labels?.toHit ?? "", damage: (attack.labels?.damage ?? []).map((d) => d.label).filter(Boolean).join(" + ") } : null,
      tags: concealed ? [] : [...properties].filter((key) => key !== "trait").map((key) => config.itemProperties?.[key]?.label ?? key).map((label) => localizeOr(label, label)),
      sort: num(item.sort, 0)
    };
  });
}

/**
 * The actor's favorites as the rail shows them. dnd5e 5.3.3: `system.favorites` [{type, id, sort}] with a relative UUID
 * for items, activities and effects (resolved with `fromUuid(id, {relative: actor})`, whose own `getFavoriteData()`
 * describes them), a slot key ("spell3", "pact") for slots and a skill or tool key otherwise.
 * @param {Object} actor
 */
export async function readFavorites(actor) {
  const config = getDnd5eConfig();
  const entries = [];
  for (const { id, type, sort } of actor?.system?.favorites ?? []) {
    const base = { id, type, sort: num(sort, 0), itemType: null, itemId: null, effectId: null, activityId: null, activation: "", level: null };
    if (type === "item" || type === "effect" || type === "activity") {
      const doc = await globalThis.foundry?.utils?.fromUuid?.(id, { relative: actor });
      if (!doc || doc.dependentOrigin?.active === false) continue;
      const data = (type === "item" ? await doc.system?.getFavoriteData?.() : await doc.getFavoriteData?.()) ?? {};
      const item = type === "activity" ? doc.item : type === "item" ? doc : null;
      entries.push({
        ...base,
        ...data,
        itemType: item?.type ?? null,
        itemId: item?.id ?? null,
        effectId: type === "effect" ? doc.id : null,
        activityId: type === "activity" ? doc.id : null,
        activation: type === "activity" ? doc.activation?.type ?? "" : item ? resolveItemActivation(item).type : "",
        level: item?.type === "spell" ? num(item.system?.level, 0) : null,
        // dnd5e 5.3.3 gives the save DC as {value, formula, calculation}.
        saveDc: num(data.save?.dc?.value ?? data.save?.dc, 0) || null,
        title: data.title ?? doc.name,
        img: data.img ?? doc.img
      });
    } else if (type === "slots") {
      const slot = actor.system?.spells?.[id];
      if (!slot) continue;
      entries.push({ ...base, level: num(slot.level, 0), img: config.spellcasting?.[slot.type]?.img?.replace?.("{id}", id) ?? "",
        uses: { value: num(slot.value, 0), max: resolveSpellSlotMax(slot) } });
    } else if (type === "skill" || type === "tool") {
      const data = actor.system?.[`${type}s`]?.[id];
      if (!data) continue;
      const skill = type === "skill" ? config.skills?.[id] : null;
      const label = skill?.label ?? globalThis.dnd5e?.documents?.Trait?.keyLabel?.(`tool:${id}`) ?? id;
      entries.push({ ...base, title: localizeOr(label, label), img: skill?.icon ?? "icons/svg/d20.svg", modifier: num(data.total, 0) });
    }
  }
  return entries;
}
