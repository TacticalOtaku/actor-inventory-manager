import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { ENFORCEMENT_MODES } from "../scripts/constants.js";
import { getActorEquippedMap, resolveEquipValidation } from "../scripts/core/equipment-rules.js";
import { getValidSlotsForItem } from "../scripts/core/item-classifier.js";
import { dollLayout } from "../scripts/core/paperdoll-layout.js";
import { configurePaperdollRuntime, resetPaperdollRuntime } from "../scripts/core/paperdoll-runtime.js";
import { DND_2024_TEMPLATE, defaultPresetFor, getActorPaperdollTemplate } from "../scripts/core/paperdoll-templates.js";

afterEach(() => resetPaperdollRuntime());

const ids = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}` }));

describe("doll layout", () => {
  it("puts the first half left top-down and the rest right bottom-aligned, the hands on the bottom row", () => {
    const slots = getActorPaperdollTemplate({ type: "character", flags: {} }).slots;
    const layout = dollLayout(slots, { max: 3, attuned: 1 });
    const at = (id) => layout.placed.find((p) => p.slot.id === id);
    assert.equal(layout.rows, 6);
    assert.deepEqual([at("head").column, at("head").row], [1, 1]);
    assert.deepEqual([at("mainHand").column, at("mainHand").row], [1, 6]);
    assert.deepEqual([at("offHand").column, at("offHand").row], [3, 6]);
    assert.deepEqual([at("hands").column, at("hands").row], [3, 2]);
    assert.equal(layout.socketsInGrid, true);
    assert.equal(layout.figureRows, 5);
  });

  it("puts a slot with a zone where the GM put it, and the rest by order around it", () => {
    const slots = [{ id: "a", zone: "right" }, { id: "b" }, { id: "c" }, { id: "d", zone: "under" }, { id: "e", zone: "left" }, { id: "f" }];
    const layout = dollLayout(slots, { max: 0, attuned: 0 });
    const side = (column) => layout.placed.filter((p) => p.column === column).map((p) => p.slot.id);
    assert.deepEqual(side(1), ["b", "c", "e"]);
    assert.deepEqual(side(3), ["a", "f"]);
    assert.deepEqual(layout.extra.map((s) => s.id), ["d"]);
    // The right column stays bottom-aligned.
    assert.deepEqual(layout.placed.filter((p) => p.column === 3).map((p) => p.row), [2, 3]);
  });

  it("sends a slot whose column is full under the doll, in order", () => {
    const lefts = Array.from({ length: 7 }, (_, i) => ({ id: `l${i + 1}`, zone: "left" }));
    const layout = dollLayout(lefts, { max: 0, attuned: 0 });
    assert.equal(layout.placed.length, 6);
    assert.deepEqual(layout.extra.map((s) => s.id), ["l7"]);
    assert.equal(layout.rows, 6);
  });

  it("overflows past twelve slots into the extra grid", () => {
    const layout = dollLayout(ids(19), { max: 3, attuned: 0 });
    assert.equal(layout.placed.length, 12);
    assert.deepEqual(layout.extra.map((s) => s.id), ["s13", "s14", "s15", "s16", "s17", "s18", "s19"]);
  });

  it("moves more than three sockets to a strip of rows of five, and marks attunement over the limit", () => {
    const wide = dollLayout(ids(4), { max: 8, attuned: 2 });
    assert.equal(wide.strip, true);
    assert.equal(wide.socketsInGrid, false);
    assert.equal(wide.sockets, 8);
    assert.equal(wide.socketColumns, 5);
    const over = dollLayout(ids(4), { max: 3, attuned: 4 });
    assert.equal(over.over, true);
    assert.equal(over.sockets, 4);
    assert.equal(over.strip, true);
    assert.equal(dollLayout(ids(4), { max: 0, attuned: 0 }).sockets, 0);
  });

  it("shows a preset without slots or attunement as a banner", () => {
    assert.equal(dollLayout([], { max: 0, attuned: 0 }).banner, true);
    assert.equal(dollLayout([], { max: 2, attuned: 0 }).banner, false);
  });
});

describe("doll presets", () => {
  it("start from the actor type, a vehicle by its dnd5e type", () => {
    assert.equal(defaultPresetFor("character", null), "dnd2024");
    assert.equal(defaultPresetFor("npc", null), "dnd2024");
    assert.equal(defaultPresetFor("vehicle", "land"), "wagon");
    assert.equal(defaultPresetFor("vehicle", "water"), "ship");
    assert.equal(defaultPresetFor("vehicle", "air"), "airship");
    assert.equal(defaultPresetFor("vehicle", "space"), "ship");
  });

  it("give a vehicle the figure of its type and no slots, so nothing is placed on a wagon", () => {
    configurePaperdollRuntime({ vehicleType: () => "air" });
    const airship = { type: "vehicle", flags: {}, items: new Map() };
    const template = getActorPaperdollTemplate(airship);
    assert.equal(template.figure, "airship");
    assert.equal(template.slots.length, 0);
    const lantern = { type: "equipment", name: "Lantern", system: { type: { value: "trinket" } }, parent: airship };
    assert.deepEqual(getValidSlotsForItem(lantern, airship), []);
    assert.equal(DND_2024_TEMPLATE.figure, "human");
  });
});

describe("enforcement mode in the window", () => {
  it("refuses a shield beside a two-handed weapon in block and warn modes, and swaps the weapon out in auto-swap mode", () => {
    const greataxe = { id: "axe", name: "Greataxe", type: "weapon", system: { equipped: true, properties: new Set(["two"]), type: { value: "martialM" } }, flags: { "actor-inventory-manager": { slot: "mainHand" } } };
    const shield = { id: "shield", name: "Shield", type: "equipment", system: { equipped: false, type: { value: "shield" }, armor: { value: 2 } }, flags: {} };
    const actor = { type: "character", flags: {}, hasPlayerOwner: true, items: new Map([["axe", greataxe], ["shield", shield]]), system: { attributes: {} } };
    const map = getActorEquippedMap(actor);
    const block = resolveEquipValidation(actor, shield, "offHand", map, ENFORCEMENT_MODES.BLOCK);
    assert.equal(block.valid, false);
    assert.equal(block.conflictItem.id, "axe");
    assert.equal(resolveEquipValidation(actor, shield, "offHand", map, ENFORCEMENT_MODES.WARN).valid, false);
    const swap = resolveEquipValidation(actor, shield, "offHand", map, ENFORCEMENT_MODES.AUTO_SWAP);
    assert.equal(swap.valid, true);
    assert.deepEqual(swap.autoSwapItems.map((i) => i.id), ["axe"]);
  });
});

describe("slot reconciliation", () => {
  it("leaves a two-handed weapon without a slot while a shield holds the off hand", () => {
    const longbow = { id: "bow", name: "Longbow", type: "weapon", system: { equipped: true, properties: new Set(["two"]), type: { value: "martialR" } }, flags: {} };
    const shield = { id: "shield", name: "Shield", type: "equipment", system: { equipped: true, type: { value: "shield" }, armor: { value: 2 } }, flags: { "actor-inventory-manager": { slot: "offHand" } } };
    const actor = { type: "character", flags: {}, hasPlayerOwner: true, items: new Map([["bow", longbow], ["shield", shield]]), system: { attributes: {} } };
    const map = getActorEquippedMap(actor);
    assert.equal(map.get("offHand")?.id, "shield");
    assert.equal(map.get("mainHand"), undefined);
  });
});
