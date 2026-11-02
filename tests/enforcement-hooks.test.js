import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { handlePreUpdateItem } from "../scripts/foundry/enforcement-hooks.js";
import { setImmediate as turn } from "node:timers/promises";
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
  const actor = { documentName: "Actor", type: "character", hasPlayerOwner: true, flags: {}, items: new Map(), testUserPermission:()=>true,
    async updateEmbeddedDocuments(type,updates) {
      return updates.map(update=>{
        const item=actor.items.get(update._id);
        for(const [key,value] of Object.entries(update))if(key!=="_id")utils.setProperty(item,key,value);
        return item;
      });
    }
  };
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

  it("ignores a slot flag left on an unequipped copy from another actor", () => {
    const ring = id => ({ id, name: id, type: "equipment", flags: {}, system: { equipped: false, type: { value: "ring" } } });
    const worn = { ...ring("worn"), flags: { "actor-inventory-manager": { slot: "ring2" } }, system: { equipped: true, type: { value: "ring" } } };
    const copy = { ...ring("copy"), flags: { "actor-inventory-manager": { slot: "ring2" } } };
    makeActor([worn, copy]);
    const changes = { "system.equipped": true };
    assert.equal(handlePreUpdateItem(copy, changes, {}, "p1"), true);
    assert.equal(changes["flags.actor-inventory-manager.slot"] ?? changes.flags?.["actor-inventory-manager"]?.slot, "ring1");
    assert.equal(warnings.length, 0);
  });

  it("blocks a shield next to a two-handed weapon in block mode", () => {
    const item = shield();
    makeActor([greataxe(), item]);
    assert.equal(handlePreUpdateItem(item, { "system.equipped": true }, {}, "p1"), false);
    assert.equal(warnings.length, 1);
  });

  it("redirects an auto-swap to the verified writer after cancelling the native update", async () => {
    mode = "auto_swap";
    const item = shield();
    const actor = makeActor([greataxe(), item]);
    let unequipped = null;
    const write=actor.updateEmbeddedDocuments;
    actor.updateEmbeddedDocuments = async (type, updates, options) => { unequipped = updates.map(update => update._id); return write(type,updates,options); };
    const changes = { "system.equipped": true };
    assert.equal(handlePreUpdateItem(item, changes, {}, "p1"), false);
    await turn();
    assert.deepEqual(unequipped, ["greataxe","shield"]);
    assert.equal(actor.items.get("greataxe").system.equipped,false);
    assert.equal(item.system.equipped,true);
    assert.ok(["mainHand", "offHand"].includes(utils.getProperty(item, "flags.actor-inventory-manager.slot")));
  });

  it("redirects a warn-mode replacement and reports its warning after success", async () => {
    mode = "warn";
    const ring = (id, slot) => ({ id, name: id, type: "equipment", flags: slot ? { "actor-inventory-manager": { slot } } : {}, system: { equipped: Boolean(slot), type: { value: "ring" } } });
    const item = ring("new");
    const actor = makeActor([ring("a", "ring1"), ring("b", "ring2"), item]);
    let unequipped = null;
    const write=actor.updateEmbeddedDocuments;
    actor.updateEmbeddedDocuments = async (type, updates, options) => { unequipped = updates.map(update => update._id); return write(type,updates,options); };
    const changes = { "system.equipped": true };
    assert.equal(handlePreUpdateItem(item, changes, {}, "p1"), false);
    await turn();
    assert.deepEqual(unequipped, ["a","new"]);
    assert.equal(actor.items.get("a").system.equipped,false);
    assert.equal(item.system.equipped,true);
    assert.equal(utils.getProperty(item, "flags.actor-inventory-manager.slot"), "ring1");
    assert.equal(warnings.length, 1);
  });
});


it("redirected native equip preserves non-equipment fields from the original update",async()=>{
  mode="auto_swap";const item=shield();makeActor([greataxe(),item]);
  const changes={system:{equipped:true,quantity:5},name:"Renamed shield",flags:{custom:{note:"keep"}}};
  assert.equal(handlePreUpdateItem(item,changes,{},"p1"),false);
  await turn();
  assert.equal(item.system.equipped,true);
  assert.equal(item.system.quantity,5);
  assert.equal(item.name,"Renamed shield");
  assert.equal(item.flags.custom.note,"keep");
});

it("redirected equip clears a container introduced by the same native update",async()=>{
  mode="auto_swap";const item=shield();makeActor([greataxe(),item]);
  assert.equal(handlePreUpdateItem(item,{system:{equipped:true,container:"bag"}},{},"p1"),false);
  await turn();
  assert.equal(item.system.equipped,true);
  assert.equal(item.system.container,null);
});
