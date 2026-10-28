import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { dropFromOutside } from "../scripts/ui/external-drop.js";

/** Foundry's embedded collections are Maps with array helpers. */
class Collection extends Map { map(fn) { return [...this.values()].map(fn); } }

/** A player moves an item from their second character (source) into this window's actor (target). */
function setup({ sourceSession = null, deleteRefused = false, stack = false } = {}) {
  const created = [];
  const source = { id: "a", uuid: "Actor.a", documentName: "Actor", isOwner: true, items: new Collection() };
  const item = {
    id: "torch", type: "loot", parent: source, system: { quantity: 1 },
    clone(changes) { return { ...this, ...changes, flags: {} }; },
    async delete() { if (!deleteRefused) source.items.delete("torch"); }
  };
  source.items.set("torch", item);
  const target = {
    id: "b", uuid: "Actor.b", items: new Collection(),
    sheet: {
      constructor: { unsupportedItemTypes: new Set() },
      async _onDropCreateItems(event, items) {
        // dnd5e grows the actor's own stack of an identical consumable and does not await it.
        if (stack) {
          setTimeout(() => { target.items.get("own").system.quantity += 1; hooks.updateItem?.(target.items.get("own")); }, 5);
          return [];
        }
        return items.map((data) => { const copy = { id: `copy-${data.id}`, system: { quantity: 1 } }; target.items.set(copy.id, copy); created.push(copy.id); return copy; });
      }
    },
    async deleteEmbeddedDocuments(type, ids) { for (const id of ids) target.items.delete(id); }
  };
  globalThis.foundry = { applications: { ux: { TextEditor: { implementation: { getDragEventData: () => ({ type: "Item", uuid: "Actor.a.Item.torch" }) } } } } };
  globalThis.Item = { implementation: { fromDropData: async () => item } };
  const hooks = {};
  globalThis.Hooks = { call: () => true, on: (name, fn) => { hooks[name] = fn; return 1; }, off: (name) => { delete hooks[name]; } };
  if (stack) target.items.set("own", { id: "own", parent: target, system: { quantity: 2 } });
  globalThis.CONFIG = { Item: { typeLabels: {} } };
  globalThis.game = {
    user: { id: "p1", isGM: false },
    i18n: { localize: (key) => key, format: (key) => key },
    settings: { get: () => ({ sessions: sourceSession ? [{ ...sourceSession, actors: ["a", "z"] }] : [], receipts: {} }) },
    modules: new Map()
  };
  const app = { actor: target, tab: "equipment", landItems() {} };
  return { app, source, target, created };
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
});
