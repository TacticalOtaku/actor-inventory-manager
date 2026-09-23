import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { handlePreUpdateItem } from "../scripts/foundry/enforcement-hooks.js";
import { LOG } from "../scripts/foundry/logger.js";

LOG.setLevel("none");

const path = key => key.split(".");
const utils = {
  getProperty: (object, key) => (key in object ? object[key] : path(key).reduce((value, part) => value?.[part], object)),
  hasProperty: (object, key) => utils.getProperty(object, key) !== undefined,
  setProperty: (object, key, value) => {
    const parts = path(key);
    const last = parts.pop();
    parts.reduce((current, part) => (current[part] ??= {}), object)[last] = value;
  }
};

let warnings;
let mode;
beforeEach(() => {
  warnings = [];
  mode = "block";
  globalThis.foundry = { utils };
  globalThis.ui = { notifications: { warn: message => warnings.push(message) } };
  globalThis.game = {
    user: { isGM: false },
    settings: { get: (module, key) => (key === "enforcementMode" ? mode : undefined) },
    i18n: { format: (key, data) => `${key}:${JSON.stringify(data)}`, localize: key => key }
  };
});
afterEach(() => {
  delete globalThis.foundry;
  delete globalThis.ui;
  delete globalThis.game;
});

function makeActor(items) {
  const actor = { documentName: "Actor", type: "character", hasPlayerOwner: true, flags: {}, items: new Map(), updateEmbeddedDocuments: async () => [] };
  for (const item of items) {
    item.parent = actor;
    actor.items.set(item.id, item);
  }
  return actor;
}
const greataxe = () => ({ id: "greataxe", name: "Greataxe", type: "weapon", flags: { "actor-inventory-manager": { slot: "mainHand" } }, system: { equipped: true, properties: new Set(["two"]), type: { value: "martialM" } } });
const shield = () => ({ id: "shield", name: "Shield", type: "equipment", flags: {}, system: { equipped: false, type: { value: "shield" } } });

describe("sheet equip enforcement", () => {
  it("lets the system equip items that have no paperdoll slot", () => {
    const ioun = { id: "ioun", name: "Ioun Stone", type: "equipment", flags: {}, system: { equipped: false, type: { value: "trinket" } } };
    makeActor([ioun]);
    const changes = { "system.equipped": true };
    assert.equal(handlePreUpdateItem(ioun, changes, {}, "p1"), true);
    assert.equal(warnings.length, 0);
  });

  it("trusts equips already validated by the inventory window", () => {
    const item = shield();
    makeActor([greataxe(), item]);
    assert.equal(handlePreUpdateItem(item, { "system.equipped": true }, { aimEquip: true }, "p1"), true);
  });

  it("blocks a shield next to a two-handed weapon in block mode", () => {
    const item = shield();
    makeActor([greataxe(), item]);
    assert.equal(handlePreUpdateItem(item, { "system.equipped": true }, {}, "p1"), false);
    assert.equal(warnings.length, 1);
  });

  it("swaps the two-handed weapon out in auto-swap mode instead of equipping an invalid loadout", () => {
    mode = "auto_swap";
    const item = shield();
    const actor = makeActor([greataxe(), item]);
    let unequipped = null;
    actor.updateEmbeddedDocuments = async (type, updates) => { unequipped = updates.map(update => update._id); return []; };
    const changes = { "system.equipped": true };
    assert.equal(handlePreUpdateItem(item, changes, {}, "p1"), true);
    assert.deepEqual(unequipped, ["greataxe"]);
    assert.ok(["mainHand", "offHand"].includes(utils.getProperty(changes, "flags.actor-inventory-manager.slot")));
  });
});
