import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { dropFromOutside } from "../scripts/ui/external-drop.js";

/** Foundry's embedded collections are Maps with array helpers. */
class Collection extends Map { map(fn) { return [...this.values()].map(fn); } }

/** A player moves an item from their second character (source) into this window's actor (target). */
function setup({ sourceSession = null, deleteRefused = false, stack = false, deleteThrows = false, rollbackRefused = false } = {}) {
  const created = [];
  const source = { id: "a", name: "Source", uuid: "Actor.a", documentName: "Actor", isOwner: true, items: new Collection() };
  const item = {
    id: "torch", name: "Torch", type: "consumable", parent: source, _stats: { compendiumSource: "Compendium.gear.torch" }, system: { quantity: 1 },
    clone(changes) { return { ...this, ...changes, flags: {} }; },
    async delete() { if (deleteThrows) throw new Error("source deletion failed"); if (!deleteRefused) source.items.delete("torch"); }
  };
  source.items.set("torch", item);
  const target = {
    id: "b", name: "Target", uuid: "Actor.b", isOwner: true, items: new Collection(),
    sheet: {
      constructor: { unsupportedItemTypes: new Set() },
      async _onDropCreateItems(event, items) {
        // dnd5e grows the actor's own stack of an identical consumable and does not await it.
        if (stack) {
          const own = target.items.get("own");
          const changes = { "system.quantity": own.system.quantity + 1 };
          const options = {};
          hooks.preUpdateItem?.(own, changes, options, "p1");
          setTimeout(() => { own.system.quantity = changes["system.quantity"]; hooks.updateItem?.(own, changes, options, "p1"); }, 5);
          return [];
        }
        return items.map((data) => { const copy = { id: `copy-${data.id}`, system: { quantity: 1 } }; target.items.set(copy.id, copy); created.push(copy.id); return copy; });
      }
    },
    async deleteEmbeddedDocuments(type, ids) { if (!rollbackRefused) for (const id of ids) target.items.delete(id); },
    async updateEmbeddedDocuments(type, changes) {
      if (rollbackRefused) return [];
      return changes.map((change) => { const own = target.items.get(change._id); own.system.quantity = change["system.quantity"]; return own; });
    }
  };
  globalThis.foundry = { applications: { ux: { TextEditor: { implementation: { getDragEventData: () => ({ type: "Item", uuid: "Actor.a.Item.torch" }) } } } } };
  globalThis.Item = class { static implementation = { fromDropData: async () => item }; };
  const hooks = {};
  globalThis.Hooks = { call: () => true, on: (name, fn) => { hooks[name] = fn; return 1; }, off: (name) => { delete hooks[name]; } };
  if (stack) target.items.set("own", { id: "own", name: "Torch", type: "consumable", parent: target, _stats: { compendiumSource: "Compendium.gear.torch" }, system: { quantity: 2, container: null } });
  globalThis.ui = { notifications: { error() {} } };
  globalThis.CONFIG = { Item: { typeLabels: {} } };
  globalThis.game = {
    user: { id: "p1", isGM: false },
    i18n: { localize: (key) => key, format: (key) => key },
    settings: { get: () => ({ sessions: sourceSession ? [{ ...sourceSession, actors: ["a", "z"] }] : [], receipts: {} }) },
    modules: new Map()
  };
  const app = { actor: target, canEdit: true, tab: "equipment", landItems() {} };
  return { app, source, target, created, hooks, item };
}

describe("an item dropped in from another owned actor (ADR 0004)", () => {
  beforeEach(() => { delete globalThis.game; });

  it("moves: the copy arrives and the source loses the item", async () => {
    const { app, source, target } = setup();
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, null);
    assert.equal(source.items.has("torch"), false);
    assert.deepEqual([...target.items.keys()], ["copy-torch"]);
  });

  it("moves onto a stack that dnd5e grows later: the source goes, nothing doubles", async () => {
    const { app, source, target } = setup({ stack: true });
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, null);
    assert.equal(source.items.has("torch"), false);
    assert.equal(target.items.get("own").system.quantity, 3);
  });

  it("is refused while the source actor's exchange runs, and nothing is copied", async () => {
    const { app, source, target } = setup({ sourceSession: { status: "executing" } });
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, "AIM.window.drop.trade");
    assert.equal(source.items.has("torch"), true);
    assert.equal(target.items.size, 0);
  });

  it("takes the copy back when the source keeps the item, so it never exists twice", async () => {
    const { app, source, target } = setup({ deleteRefused: true });
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, "AIM.window.drop.moveFailed");
    assert.equal(source.items.has("torch"), true);
    assert.equal(target.items.size, 0);
  });
  it("restores the existing stack when the source deletion is vetoed", async () => {
    const { app, source, target, hooks } = setup({ stack: true, deleteRefused: true });
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, "AIM.window.drop.moveFailed");
    assert.equal(source.items.has("torch"), true);
    assert.equal(target.items.get("own").system.quantity, 2);
    assert.deepEqual(Object.keys(hooks), []);
  });

  it("also compensates when deleting the source throws", async () => {
    const { app, source, target } = setup({ deleteThrows: true });
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, "AIM.window.drop.moveFailed");
    assert.equal(source.items.has("torch"), true);
    assert.equal(target.items.size, 0);
  });

  it("reports recovery when the stack rollback is vetoed, without more writes", async () => {
    const { app, source, target } = setup({ stack: true, deleteRefused: true, rollbackRefused: true });
    const errors = [];
    game.i18n.format = (key, data) => `${key}: ${data.item}; ${data.source}; ${data.target}`;
    ui.notifications.error = (message, options) => errors.push({ message, options });
    const result = await dropFromOutside(app, {});
    assert.match(result.refusal, /AIM.window.drop.recovery/);
    assert.equal(source.items.has("torch"), true);
    assert.equal(target.items.get("own").system.quantity, 3);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Torch.*Source.*Target/);
    assert.equal(errors[0].options.permanent, true);
  });

  it("keeps an earlier moved item when a later item cannot leave the source", async () => {
    const { app, source, target, item } = setup();
    const second = { ...item, id: "rope", name: "Rope", async delete() {} };
    source.items.set("rope", second);
    foundry.applications.ux.TextEditor.implementation.getDragEventData = () => ({ type: "Folder" });
    globalThis.Folder = { implementation: { fromDropData: async () => ({ type: "Item", contents: [{ uuid: "torch" }, { uuid: "rope" }] }) } };
    globalThis.fromUuid = async (id) => source.items.get(id);
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, "AIM.window.drop.partial");
    assert.equal(source.items.has("torch"), false);
    assert.equal(source.items.has("rope"), true);
    assert.deepEqual([...target.items.keys()], ["copy-torch"]);
  });

  it("never treats an unrelated stack increase as receipt of the dropped item", async () => {
    const { app, source, target, hooks } = setup({ stack: true });
    target.items.get("own")._stats.compendiumSource = "Compendium.gear.unrelated";
    const result = await dropFromOutside(app, {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.match(result.refusal, /AIM.window.drop.unconfirmed/);
    assert.equal(source.items.has("torch"), true);
    assert.equal(target.items.get("own").system.quantity, 3);
    assert.deepEqual(Object.keys(hooks), []);
  });

  it("leaves the source untouched when target ownership is lost before dropping", async () => {
    const { app, source, target } = setup();
    app.canEdit = false;
    target.isOwner = false;
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, "AIM.notifications.noPermission");
    assert.equal(source.items.has("torch"), true);
    assert.equal(target.items.size, 0);
  });

  it("does not erase a copy that changed while source deletion was refused", async () => {
    const { app, source, target, item } = setup();
    item.delete = async () => { target.items.get("copy-torch").system.quantity = 2; };
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, "AIM.window.drop.recovery");
    assert.equal(source.items.has("torch"), true);
    assert.equal(target.items.get("copy-torch").system.quantity, 2);
  });

  it("does not remove two source copies when two drops overlap", async () => {
    const { app, source, target } = setup();
    await Promise.all([dropFromOutside(app, {}), dropFromOutside(app, {})]);
    assert.equal(source.items.size, 0);
    assert.deepEqual([...target.items.keys()], ["copy-torch"]);
  });

  it("moves a container together with its descendants", async () => {
    const { app, source, target, item } = setup();
    Object.assign(item, { type: "container", name: "Bag" });
    const child = { id: "child", name: "Rope", type: "loot", parent: source, system: { quantity: 2, container: item.id } };
    source.items.set(child.id, child);
    target.sheet._onDropCreateItems = async () => [item, child].map((entry) => {
      const copy = { id: `copy-${entry.id}`, name: entry.name, type: entry.type, system: { quantity: entry.system.quantity } };
      target.items.set(copy.id, copy);
      return copy;
    });
    item.delete = async () => { source.items.delete(item.id); source.items.delete(child.id); };
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, null);
    assert.equal(source.items.size, 0);
    assert.deepEqual([...target.items.keys()], ["copy-torch", "copy-child"]);
  });

  it("keeps a container source when one of its contents did not arrive", async () => {
    const { app, source, target, item } = setup();
    item.type = "container";
    source.items.set("child", { id: "child", name: "Rope", type: "loot", parent: source, system: { quantity: 2, container: item.id } });
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, "AIM.window.drop.unconfirmed");
    assert.equal(source.items.size, 2);
    assert.equal(target.items.size, 0);
  });

  it("stops after a refused copy rollback instead of deleting later source items", async () => {
    const { app, source, target, item } = setup({ deleteRefused: true, rollbackRefused: true });
    const second = { ...item, id: "rope", async delete() { source.items.delete(this.id); } };
    source.items.set(second.id, second);
    foundry.applications.ux.TextEditor.implementation.getDragEventData = () => ({ type: "Folder" });
    globalThis.Folder = { implementation: { fromDropData: async () => ({ type: "Item", contents: [{ uuid: "torch" }, { uuid: "rope" }] }) } };
    globalThis.fromUuid = async (id) => source.items.get(id);
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, "AIM.window.drop.recovery");
    assert.equal(source.items.size, 2);
    assert.deepEqual([...target.items.keys()], ["copy-torch"]);
  });

  it("does not claim a matching manual stack edit after the sheet refused creation", async () => {
    const { app, source, target, hooks } = setup({ stack: true });
    target.sheet._onDropCreateItems = async () => {
      setTimeout(() => {
        const own = target.items.get("own");
        const changes = { "system.quantity": 3 };
        const options = {};
        hooks.preUpdateItem?.(own, changes, options, "p1");
        own.system.quantity = 3;
        hooks.updateItem?.(own, changes, options, "p1");
      }, 5);
      return [];
    };
    const result = await dropFromOutside(app, {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(source.items.has("torch"), true);
    assert.equal(target.items.get("own").system.quantity, 3);
    assert.equal(result.refusal, "AIM.window.drop.unconfirmed");
    assert.deepEqual(Object.keys(hooks), []);
  });

  it("confirms the root stack when a sheet cannot create in the requested tray", async () => {
    const { app, source, target } = setup({ stack: true });
    target.items.set("bag", { id: "bag", type: "container", flags: {} });
    const result = await dropFromOutside(app, {}, { tray: "bag" });
    assert.equal(result.refusal, null);
    assert.equal(result.note, "AIM.window.drop.root");
    assert.equal(source.items.has("torch"), false);
    assert.equal(target.items.get("own").system.quantity, 3);
  });

  it("also waits for a copied stack before presenting a tray fallback", async () => {
    const { app, source, target } = setup({ stack: true });
    game.user.isGM = true;
    target.items.set("bag", { id: "bag", type: "container", flags: {} });
    const result = await dropFromOutside(app, {}, { tray: "bag" });
    assert.equal(result.refusal, null);
    assert.equal(result.note, "AIM.window.drop.root");
    assert.equal(source.items.has("torch"), true);
    assert.equal(target.items.get("own").system.quantity, 3);
  });

  it("does not move a container descendant a second time in a batch", async () => {
    const { app, source, target, item } = setup();
    Object.assign(item, { type: "container", name: "Bag" });
    const child = { id: "child", name: "Rope", type: "loot", parent: source, system: { quantity: 2, container: item.id } };
    source.items.set(child.id, child);
    foundry.applications.ux.TextEditor.implementation.getDragEventData = () => ({ type: "Folder" });
    globalThis.Folder = { implementation: { fromDropData: async () => ({ type: "Item", contents: [{ uuid: "torch" }, { uuid: "child" }] }) } };
    globalThis.fromUuid = async (id) => source.items.get(id);
    target.sheet._onDropCreateItems = async (event, items) => items[0].id === item.id ? [item, child].map((entry) => {
      const copy = { id: `copy-${entry.id}`, name: entry.name, type: entry.type, system: { quantity: entry.system.quantity } };
      target.items.set(copy.id, copy);
      return copy;
    }) : [];
    item.delete = async () => { source.items.delete(item.id); source.items.delete(child.id); };
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, null);
    assert.equal(source.items.size, 0);
    assert.deepEqual([...target.items.keys()], ["copy-torch", "copy-child"]);
  });

  it("confirms the generated scroll stack before deleting the original spell", async () => {
    const { app, source, target, item } = setup({ stack: true });
    item.type = "spell";
    Item.implementation.createScrollFromSpell = async () => ({ ...item, type: "consumable", name: "Scroll", _stats: { compendiumSource: "Compendium.gear.scroll" } });
    Object.assign(target.items.get("own"), { name: "Scroll", _stats: { compendiumSource: "Compendium.gear.scroll" } });
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, null);
    assert.equal(source.items.has("torch"), false);
    assert.equal(target.items.get("own").system.quantity, 3);
  });

  it("cancels a scroll dialog without copying or removing the spell", async () => {
    const { app, source, target, item } = setup();
    item.type = "spell";
    Item.implementation.createScrollFromSpell = async () => null;
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, null);
    assert.equal(source.items.has("torch"), true);
    assert.equal(target.items.size, 0);
  });

  it("does not delete a source container that gained a new child during copying", async () => {
    const { app, source, target, item } = setup();
    item.type = "container";
    const create = target.sheet._onDropCreateItems;
    target.sheet._onDropCreateItems = async (...args) => {
      const created = await create(...args);
      source.items.set("new-child", { id: "new-child", type: "loot", parent: source, system: { quantity: 1, container: item.id } });
      return created;
    };
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, "AIM.window.drop.recovery");
    assert.equal(source.items.has(item.id), true);
    assert.equal(source.items.has("new-child"), true);
  });

  it("does not roll back a destination container that gained an unrelated child", async () => {
    const { app, source, target, item } = setup();
    item.type = "container";
    item.delete = async () => { target.items.set("new-child", { id: "new-child", parent: target, system: { quantity: 1, container: "copy-torch" } }); };
    const result = await dropFromOutside(app, {});
    assert.equal(result.refusal, "AIM.window.drop.recovery");
    assert.equal(source.items.has(item.id), true);
    assert.equal(target.items.has("copy-torch"), true);
    assert.equal(target.items.has("new-child"), true);
  });

});
