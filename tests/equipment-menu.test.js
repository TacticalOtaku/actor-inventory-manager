import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { activityMenuEntries, itemMenuEntries } from "../scripts/ui/equipment.js";

let hooked;

beforeEach(() => {
  hooked = [];
  globalThis.dnd5e = { applications: { item: { ItemSheet5e: { MODES: { PLAY: 1, EDIT: 2 } } } } };
  globalThis.CONFIG = {
    DND5E: { spellcasting: { spell: { prepares: true }, innate: {} }, spellPreparationStates: { always: { value: 2 } } },
    Item: { dataModels: { loot: { schema: { has: (key) => key === "quantity" } } } }
  };
  globalThis.Hooks = { callAll: (name, ...args) => hooked.push([name, ...args]) };
});

afterEach(() => {
  delete globalThis.dnd5e;
  delete globalThis.CONFIG;
  delete globalThis.Hooks;
});

const actions = { equip() {}, attune() {}, prepare() {}, favorite() {}, isFavorite: false };
const character = { isOwner: true, system: {}, concentration: { items: new Set() } };
const item = (data) => ({ actor: character, isOwner: true, getFlag: () => undefined, ...data, system: { properties: new Set(), ...data.system } });
const shown = (it, acts = actions) => itemMenuEntries(it, acts).filter((e) => e.condition?.() ?? true).map((e) => e.name);

describe("item row menu", () => {
  it("gives an owner dnd5e's entries, with Identify only for an unidentified item", () => {
    const it = item({ type: "loot", system: { identified: true } });
    assert.deepEqual(shown(it), ["DND5E.ItemView", "DND5E.ContextMenuActionEdit", "DND5E.ContextMenuActionDuplicate",
      "DND5E.ContextMenuActionDelete", "DND5E.DisplayCard", "DND5E.Favorite"]);
    it.system.identified = false;
    assert.ok(shown(it).includes("DND5E.Identify"));
  });

  it("leaves an observer only viewing and showing in chat", () => {
    assert.deepEqual(shown(item({ type: "loot", isOwner: false, system: { identified: false } })), ["DND5E.ItemView", "DND5E.DisplayCard"]);
  });

  it("keeps dnd5e's delete id and adds the scroll entry for an owned spell", () => {
    const entries = itemMenuEntries(item({ type: "spell", system: { method: "spell", prepared: 0 } }), actions);
    assert.equal(entries.find((e) => e.name === "DND5E.ContextMenuActionDelete").id, "delete");
    assert.ok(entries.some((e) => e.name === "DND5E.Scroll.CreateScroll" && e.group === "action"));
  });

  it("names the state entries by the item's state, as dnd5e does", () => {
    const sword = item({ type: "weapon", system: { equipped: true, attunement: "required", attuned: false } });
    assert.deepEqual(shown(sword, { ...actions, isFavorite: true }).slice(5), ["DND5E.ContextMenuActionAttune", "DND5E.ContextMenuActionUnequip", "DND5E.FavoriteRemove"]);
    const spell = item({ type: "spell", system: { method: "spell", level: 1, prepared: 1 } });
    assert.ok(shown(spell).includes("DND5E.ContextMenuActionUnprepare"));
    assert.ok(!shown(item({ type: "spell", system: { method: "spell", level: 1, prepared: 2 } })).some((n) => n.endsWith("prepare")), "an always-prepared spell has no toggle");
    assert.ok(!shown(item({ type: "spell", system: { method: "innate", level: 1, prepared: 0 } })).some((n) => n.endsWith("Prepare")));
  });

  it("offers preparation by the spells tab's rule: no toggle for a cantrip or a class that knows its spells", () => {
    const toggles = (it) => shown(it).some((n) => /Prepare$/i.test(n));
    assert.equal(toggles(item({ type: "spell", system: { method: "spell", level: 0, prepared: 0 } })), false, "a cantrip is always ready");
    const sorcerer = { ...character, spellcastingClasses: { sorcerer: { system: { spellcasting: { preparation: { max: 0 } } } } } };
    assert.equal(toggles(item({ type: "spell", actor: sorcerer, system: { method: "spell", level: 1, prepared: 0, classIdentifier: "sorcerer" } })), false);
    const wizard = { ...character, spellcastingClasses: { wizard: { system: { spellcasting: { preparation: { max: 8 } } } } } };
    assert.equal(toggles(item({ type: "spell", actor: wizard, system: { method: "spell", level: 1, prepared: 0, classIdentifier: "wizard" } })), true);
  });

  it("offers ending concentration, recharge and an NPC's gear where they apply", () => {
    const concentrating = { ...character, concentration: { items: new Set() } };
    const bless = item({ type: "spell", actor: concentrating, system: { method: "spell", prepared: 1 } });
    concentrating.concentration.items.add(bless);
    assert.ok(shown(bless).includes("DND5E.ConcentrationBreak"));
    const breath = item({ type: "feat", hasRecharge: true, isOnCooldown: true, system: { uses: { spent: 1 } } });
    assert.ok(shown(breath).includes("DND5E.ContextMenuActionCharge"));
    const npc = { isOwner: true, system: { isNPC: true }, concentration: { items: new Set() } };
    assert.ok(shown(item({ type: "loot", actor: npc }), { ...actions, favorite: null }).includes("DND5E.Gear.Action.Add"));
  });

  it("routes state entries through the window and lets other modules add entries", () => {
    const calls = [];
    const sword = item({ type: "weapon", system: { equipped: false } });
    const entries = itemMenuEntries(sword, { ...actions, equip: () => calls.push("equip") });
    entries.find((e) => e.name === "DND5E.ContextMenuActionEquip").callback();
    assert.deepEqual(calls, ["equip"]);
    assert.deepEqual(hooked.map(([name, it, list]) => [name, it, list]), [["dnd5e.getItemContextOptions", sword, entries]]);
  });
});

describe("activity menu", () => {
  it("is dnd5e's own, after dnd5e.getItemActivityContext", () => {
    const own = [{ name: "DND5E.ContextMenuActionEdit" }];
    const activity = { getContextMenuOptions: () => own };
    const target = { dataset: { activityId: "a" } };
    assert.equal(activityMenuEntries(activity, target), own);
    assert.deepEqual(hooked, [["dnd5e.getItemActivityContext", activity, target, own]]);
  });
});
