// ─────────────────────────────────────────────────────────
// Preset editor - the working copy of a doll preset and its slot edits (pure)
// ─────────────────────────────────────────────────────────

import { isReservedTemplateId } from "./paperdoll-templates.js";

const renumber = (slots) => slots.map((slot, i) => ({ ...slot, order: (i + 1) * 10 }));

/** A deep copy of a preset the editor can change freely. */
export function workingFrom(template) {
  return {
    name: template.name ?? template.templateName ?? "",
    figure: template.figure ?? "human",
    attunementMax: template.attunementMax ?? 3,
    slots: renumber([...(template.slots ?? [])].sort((a, b) => (a.order ?? 50) - (b.order ?? 50)).map((slot) => ({
      ...slot,
      accepts: [...(slot.accepts ?? [])],
      itemTypes: [...(slot.itemTypes ?? [])],
      rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false, ...slot.rules }
    })))
  };
}

/** A new slot at the end with the first free "slotN" id. */
export function addSlot(slots, label) {
  const taken = new Set(slots.map((slot) => slot.id));
  let n = 1;
  while (taken.has(`slot${n}`)) n += 1;
  return renumber([...slots, {
    id: `slot${n}`, label, icon: "fa-light fa-gem", column: "center", category: "equipment",
    accepts: [], itemTypes: ["equipment", "loot"],
    rules: { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false }
  }]);
}

/** The slot moved one place up (−1) or down (+1); the doll fills the left column first, so order is placement. */
export function moveSlot(slots, id, delta) {
  const from = slots.findIndex((slot) => slot.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= slots.length) return renumber(slots);
  const next = [...slots];
  [next[from], next[to]] = [next[to], next[from]];
  return renumber(next);
}

export function removeSlot(slots, id) {
  return renumber(slots.filter((slot) => slot.id !== id));
}

const layoutOf = ({ figure, slots }) => JSON.stringify([figure ?? "human", workingFrom({ slots }).slots.map((slot) => [
  slot.id, slot.label, slot.icon, slot.order, [...slot.itemTypes].sort(), [...slot.accepts].sort(),
  Boolean(slot.rules.singlePerActor), Boolean(slot.rules.locksOffHandOn2H), Boolean(slot.rules.isArmor), Boolean(slot.rules.isShield)
])]);

/** Whether the working copy still has the preset's figure and slots; the cap is the actor's own, so it does not count. */
export function sameAsPreset(working, template) {
  return layoutOf(working) === layoutOf(template);
}

/** A free id for a new world preset, made from its name and never a built-in one. */
export function presetIdFor(name, taken) {
  const base = String(name ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "preset";
  const used = new Set(taken);
  let id = base;
  for (let n = 2; used.has(id) || isReservedTemplateId(id); n += 1) id = `${base}-${n}`;
  return id;
}
