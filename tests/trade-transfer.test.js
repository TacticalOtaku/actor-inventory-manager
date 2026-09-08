import test from "node:test";
import assert from "node:assert/strict";
import { captureInventory, inventoryMatches, restoreInventory, transferItems } from "../scripts/trade/transfer.js";

function actor(id, itemData = []) {
  const a = { id, name: id, system: { currency: { gp: 5 } }, items: new Map(), async update(updates) {
    for (const [path, value] of Object.entries(updates)) {
      if (path.startsWith("system.currency.")) this.system.currency[path.split(".").at(-1)] = value;
    }
  }, async createEmbeddedDocuments(type, data) {
    return data.map(d => { const item = makeItem(d); this.items.set(item.id, item); return item; });
  }, async deleteEmbeddedDocuments(type, ids) { ids.forEach(id => this.items.delete(id)); },
  async updateEmbeddedDocuments(type, data) {
    return data.map(d => { const i = this.items.get(d._id); if (d["system.quantity"] !== undefined) i.system.quantity = d["system.quantity"]; else { Object.assign(i, structuredClone(d)); } return i; });
  } };
  function makeItem(data) {
    return { ...structuredClone(data), id: data._id, toObject() { const { toObject, id, ...raw } = this; return structuredClone(raw); } };
  }
  itemData.forEach(d => { const i = makeItem(d); a.items.set(i.id, i); });
  return a;
}
const potion = { _id: "potion", name: "Potion", type: "consumable", system: { quantity: 4, equipped: true, attuned: true, container: "bag" }, flags: { "actor-inventory-manager": { slot: "belt" } } };
function setup() {
  globalThis.game = { modules: new Map() };
  globalThis.foundry = { utils: { randomID: () => "received", getProperty: (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj) } };
}
test("partial item transfer conserves quantity and clears recipient equipment state", async () => {
  setup(); const a = actor("a", [potion]), b = actor("b");
  await transferItems(a, b, [{ id: "potion", quantity: 2 }]);
  assert.equal(a.items.get("potion").system.quantity, 2);
  const received = b.items.get("received");
  assert.equal(received.system.quantity, 2);
  assert.equal(received.system.equipped, false);
  assert.equal(received.system.attuned, false);
  assert.equal(received.system.container, null);
  assert.equal(received.flags["actor-inventory-manager"], undefined);
});
test("recovery restores inventory and currency after a partial exchange", async () => {
  setup(); const a = actor("a", [potion]);
  const before = captureInventory(a);
  a.items.clear(); a.system.currency.gp = 0;
  await restoreInventory(a, before);
  assert.equal(a.items.get("potion").system.quantity, 4);
  assert.equal(a.system.currency.gp, 5);
});
test("a silently rejected source debit never creates a duplicate on the target", async () => {
  setup(); const a = actor("a", [potion]), b = actor("b");
  a.updateEmbeddedDocuments = async () => [];
  await assert.rejects(transferItems(a, b, [{ id: "potion", quantity: 2 }]), /transfer/);
  assert.equal(a.items.get("potion").system.quantity, 4);
  assert.equal(b.items.size, 0);
});
test("snapshot comparison ignores object property order without ignoring asset changes", () => {
  setup(); const a = actor("a", [potion]);
  const snapshot = captureInventory(a);
  const original = a.items.get("potion").toObject;
  a.items.get("potion").toObject = function() {
    const data = original.call(this);
    return Object.fromEntries(Object.entries(data).reverse());
  };
  assert.equal(inventoryMatches(a, snapshot), true);
  a.items.get("potion").system.quantity = 3;
  assert.equal(inventoryMatches(a, snapshot), false);
});
test("legacy recovery journals with expanded currency paths can still restore balances", async () => {
  setup(); const a = actor("a");
  const before = captureInventory(a);
  before.attributes = { system: { currency: { gp: 5, pp: 0, ep: 0, sp: 0, cp: 0 } } };
  a.system.currency.gp = 0;
  await restoreInventory(a, before);
  assert.equal(a.system.currency.gp, 5);
  assert.equal(inventoryMatches(a, before), true);
});
