// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - DnD5e Integration (Tooltips & Damage Types)
// ─────────────────────────────────────────────────────────

import { attunementRequirement, isItemAttuned } from "../../core/attunement.js";
import { convertWeight, getSystemWeightUnit, num } from "../../core/weight-calculator.js";
import { concealsDetails, getDnd5eConfig, localizeOr, unitAbbreviation } from "./common.js";

/**
 * What a tooltip card shows for a document. Items use their own `system.getCardData()` (dnd5e's visibility rules
 * for unidentified items and concealed descriptions hold), read into numbers (to-hit, damage, save, armor, charges,
 * weight, price, attunement), the description and property pills; effects and rule pages bring dnd5e's
 * `richTooltip()` HTML; anything else is its name and type.
 * @returns {Promise<object|null>}
 */
export async function readCardData(doc) {
  if (!doc) return null;
  const config = getDnd5eConfig();
  if (doc.documentName === "Item" && typeof doc.system?.getCardData === "function") {
    // Unrevealed secrets stay out of hover cards for everyone, as in dnd5e's own tooltips; the sheet shows them.
    const data = await doc.system.getCardData({ secrets: false });
    const labels = data.labels ?? {};
    const stat = (key, value) => (value !== undefined && value !== null && String(value).trim() !== "" ? { key, value: String(value) } : null);
    const damages = (labels.damages ?? []).map((d) => ({ label: d.label ?? d.formula ?? "", formula: d.formula ?? "", types: String(d.damageType ?? "").split("|").filter(Boolean) }));
    const attunement = attunementRequirement(doc);
    const currency = config.currencies?.[data.price?.denomination];
    // Price and charges dnd5e already concealed; the bonuses in to-hit, damage, save and armor would still tell.
    const concealed = concealsDetails(doc);
    const stats = [
      concealed ? null : stat("toHit", labels.toHit),
      concealed ? null : stat("damage", damages.map((d) => d.label).join(", ")),
      concealed ? null : stat("save", labels.save),
      // dnd5e adds the magic bonus into armor.value.
      doc.system?.armor?.value && !concealed ? stat("armor", doc.system.armor.value) : null,
      data.uses?.max ? stat("uses", `${num(data.uses.value, 0)} / ${num(data.uses.max, 0)}`) : null,
      // One item's weight, in the world's unit like the rows (dnd5e's card keeps the item's own unit).
      num(data.weight?.value, 0) ? stat("weight", `${Number(convertWeight(data.weight.value, data.weight.units || "lb", getSystemWeightUnit()).toFixed(2))} ${unitAbbreviation("weightUnits", getSystemWeightUnit())}`) : null,
      num(data.price?.value, 0) ? stat("price", `${data.price.value} ${localizeOr(currency?.abbreviation, currency?.abbreviation ?? data.price.denomination ?? "")}`) : null,
      attunement ? stat("attunement", attunement) : null
    ].filter(Boolean);
    return {
      kind: "item",
      name: data.name ?? doc.name,
      img: data.img ?? doc.img,
      subtitle: data.subtitle ?? "",
      description: data.description?.value ?? "",
      properties: [...(data.tags ?? []), ...(data.properties ?? [])].filter((p) => typeof p === "string" && p),
      stats,
      damages: concealed ? [] : damages,
      attuned: isItemAttuned(doc),
      school: doc.type === "spell" ? data.school ?? doc.system?.school ?? null : null,
      rarity: doc.type === "spell" ? null : (!concealed && doc.system?.rarity) || "common"
    };
  }
  const rich = doc.richTooltip ?? doc.system?.richTooltip;
  if (typeof rich === "function") {
    const tooltip = await rich.call(doc.richTooltip ? doc : doc.system);
    if (tooltip?.content) {
      const html = typeof tooltip.content === "string" ? tooltip.content : tooltip.content.outerHTML ?? "";
      return { kind: "rich", name: doc.name, img: doc.img ?? doc.src ?? null, subtitle: localizeOr(doc.constructor?.metadata?.label, ""), html };
    }
  }
  return { kind: "doc", name: doc.name, img: doc.img ?? null, subtitle: localizeOr(doc.constructor?.metadata?.label, "") };
}

/**
 * A damage type for its chip and card: label, colour (`color` is a Foundry Color in 5.3.3, shown as CSS) and the
 * rule page dnd5e links it to; a type the world or a module added may lack a colour.
 */
export function readDamageType(key) {
  const type = getDnd5eConfig().damageTypes?.[key];
  if (!type) return null;
  const color = type.color;
  const css = color === undefined || color === null ? null
    : typeof color === "string" ? color
      : typeof color.css === "string" ? color.css
        : Number.isFinite(Number(color)) ? `#${Number(color).toString(16).padStart(6, "0")}` : null;
  return { key, label: localizeOr(type.label, type.label ?? key), color: css, reference: type.reference ?? null };
}
