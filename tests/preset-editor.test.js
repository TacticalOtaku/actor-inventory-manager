import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { resetPaperdollRuntime } from "../scripts/core/paperdoll-runtime.js";
import { DND_2024_TEMPLATE, getActorPaperdollTemplate, normalizeTemplateData } from "../scripts/core/paperdoll-templates.js";
import { addSlot, moveSlot, presetIdFor, removeSlot, sameAsPreset, workingFrom } from "../scripts/core/preset-editor.js";

afterEach(() => resetPaperdollRuntime());

const slots = (...ids) => ids.map((id, i) => ({ id, label: id, order: (i + 1) * 10, itemTypes: ["equipment"], accepts: [], rules: {} }));

describe("preset editor slots", () => {
  it("adds a slot with a free id at the end, ready for equipment and loot", () => {
    const next = addSlot(slots("slot1", "head"), "Новый слот");
    assert.equal(next.length, 3);
    assert.deepEqual([next[2].id, next[2].label, next[2].order], ["slot2", "Новый слот", 30]);
    assert.deepEqual(next[2].itemTypes, ["equipment", "loot"]);
  });

  it("moves a slot up or down and renumbers the order, never past the ends", () => {
    assert.deepEqual(moveSlot(slots("a", "b", "c"), "c", -1).map((s) => [s.id, s.order]), [["a", 10], ["c", 20], ["b", 30]]);
    assert.deepEqual(moveSlot(slots("a", "b"), "a", -1).map((s) => s.id), ["a", "b"]);
    assert.deepEqual(moveSlot(slots("a", "b"), "b", 1).map((s) => s.id), ["a", "b"]);
  });

  it("removes a slot and renumbers the rest", () => {
    assert.deepEqual(removeSlot(slots("a", "b", "c"), "b").map((s) => [s.id, s.order]), [["a", 10], ["c", 20]]);
  });
});

describe("preset editor working copy", () => {
  it("starts from a preset with its figure, cap and slots, copied so edits do not touch the preset", () => {
    const working = workingFrom(DND_2024_TEMPLATE);
    assert.equal(working.figure, "human");
    assert.equal(working.attunementMax, 3);
    assert.equal(working.slots.length, 11);
    working.slots[0].rules.isArmor = true;
    assert.equal(DND_2024_TEMPLATE.slots[0].rules.isArmor, false);
  });

  it("knows when it still matches its preset", () => {
    const working = workingFrom(DND_2024_TEMPLATE);
    assert.equal(sameAsPreset(working, DND_2024_TEMPLATE), true);
    assert.equal(sameAsPreset({ ...working, figure: "beast" }, DND_2024_TEMPLATE), false);
    assert.equal(sameAsPreset({ ...working, slots: moveSlot(working.slots, "neck", -1) }, DND_2024_TEMPLATE), false);
    assert.equal(sameAsPreset({ ...working, attunementMax: 5 }, DND_2024_TEMPLATE), true, "the cap is written to the actor, not the layout");
    const placed = { ...working, slots: working.slots.map((slot) => (slot.id === "ring1" ? { ...slot, zone: "right" } : slot)) };
    assert.equal(sameAsPreset(placed, DND_2024_TEMPLATE), false, "a zone is part of the layout");
  });

  it("makes an id from the name that is free and not a built-in one", () => {
    assert.equal(presetIdFor("Боевой маг", []), "боевой-маг");
    assert.equal(presetIdFor("Боевой маг", ["боевой-маг"]), "боевой-маг-2");
    assert.equal(presetIdFor("Beast", []), "beast-2");
    assert.equal(presetIdFor("  ", []), "preset");
  });
});

describe("presets without slots", () => {
  it("are valid custom presets (a vehicle figure) and stay the actor's own", () => {
    const template = normalizeTemplateData({ id: "barge", name: "Баржа", figure: "ship", attunementMax: 0, slots: [] });
    assert.deepEqual([template.figure, template.slots.length], ["ship", 0]);
    const actor = { type: "vehicle", flags: { "actor-inventory-manager": { paperdollCustomTemplate: { ...template, id: "custom" }, paperdollTemplateId: "custom" } } };
    const resolved = getActorPaperdollTemplate(actor);
    assert.equal(resolved.isActorCustom, true);
    assert.equal(resolved.figure, "ship");
    assert.equal(resolved.slots.length, 0);
  });
});
