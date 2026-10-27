import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { itemMenuEntries } from "../scripts/ui/equipment.js";

beforeEach(() => {
  globalThis.dnd5e = { applications: { item: { ItemSheet5e: { MODES: { PLAY: 1, EDIT: 2 } } } } };
});

afterEach(() => {
  delete globalThis.dnd5e;
});

const shown = (item) => itemMenuEntries(item).filter((e) => e.condition?.() ?? true).map((e) => e.name);

describe("item row menu", () => {
  it("gives an owner dnd5e's entries, with Identify only for an unidentified item", () => {
    const item = { type: "equipment", isOwner: true, system: { identified: true } };
    assert.deepEqual(shown(item), ["DND5E.ItemView", "DND5E.ContextMenuActionEdit", "DND5E.ContextMenuActionDuplicate",
      "DND5E.ContextMenuActionDelete", "DND5E.DisplayCard"]);
    item.system.identified = false;
    assert.ok(shown(item).includes("DND5E.Identify"));
  });

  it("leaves an observer only viewing and showing in chat", () => {
    assert.deepEqual(shown({ type: "equipment", isOwner: false, system: { identified: false } }), ["DND5E.ItemView", "DND5E.DisplayCard"]);
  });

  it("keeps dnd5e's delete id and adds the scroll entry for an owned spell", () => {
    const entries = itemMenuEntries({ type: "spell", isOwner: true, system: {} });
    assert.equal(entries.find((e) => e.name === "DND5E.ContextMenuActionDelete").id, "delete");
    assert.ok(entries.some((e) => e.name === "DND5E.Scroll.CreateScroll"));
  });
});
