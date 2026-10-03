import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { equipItemToSlot, toggleAttunement, toggleItemEquipped, unequipItem } from "../scripts/ui/item-actions.js";

/** Records the writes an action makes; `refuse` mimics a preUpdate hook veto. */
function makeActor({ canEdit = true, attunementMax = 3 } = {}) {
  const actor = {
    type: "character",
    name: "Hero",
    hasPlayerOwner: true,
    items: new Map(),
    flags: {},
    getFlag: () => undefined,
    testUserPermission: () => canEdit,
    system: { attributes: { attunement: { max: attunementMax } } },
    writes: [],
    refuse: false,
    async updateEmbeddedDocuments(type, updates) {
      if (actor.refuse) return [];
      actor.writes.push(...updates);
      return updates.map(update => actor.items.get(update._id)).filter(Boolean);
    }
  };
  return actor;
}

function addItem(actor, { id, name = id, type = "equipment", system = {} }) {
  const item = {
    id,
    name,
    type,
    parent: actor,
    flags: {},
    getFlag: () => undefined,
    system: { equipped: false, ...system },
    async update(changes) {
      if (actor.refuse) return undefined;
      actor.writes.push({ _id: id, ...changes });
      return item;
    }
  };
  actor.items.set(id, item);
  return item;
}

beforeEach(() => {
  globalThis.game = { user: { id: "player", isGM: false }, i18n: { localize: key => key, format: key => key } };
  globalThis.ui = { notifications: { warn() {}, info() {} } };
});

afterEach(() => {
  delete globalThis.game;
  delete globalThis.ui;
});

describe("equipItemToSlot result", () => {
  it("is true when the item was written into the slot", async () => {
    const actor = makeActor();
    const sword = addItem(actor, { id: "sword", type: "weapon", system: { type: { value: "martialM" }, properties: new Set() } });
    assert.equal(await equipItemToSlot(actor, sword, "mainHand"), true);
    assert.equal(actor.writes.length, 1);
  });

  it("is false when the slot rules refuse the item", async () => {
    const actor = makeActor();
    const sword = addItem(actor, { id: "sword", type: "weapon", system: { type: { value: "martialM" }, properties: new Set() } });
    assert.equal(await equipItemToSlot(actor, sword, "ring1"), false);
    assert.equal(actor.writes.length, 0);
  });

  it("is false without permission, for an unequippable item or a missing argument", async () => {
    const readOnly = makeActor({ canEdit: false });
    const sword = addItem(readOnly, { id: "sword", type: "weapon", system: { type: { value: "martialM" }, properties: new Set() } });
    assert.equal(await equipItemToSlot(readOnly, sword, "mainHand"), false);

    const actor = makeActor();
    const note = addItem(actor, { id: "note", type: "loot" });
    delete note.system.equipped;
    assert.equal(await equipItemToSlot(actor, note, "mainHand"), false);
    assert.equal(await equipItemToSlot(actor, null, "mainHand"), false);
    assert.equal(await equipItemToSlot(actor, note, ""), false);
  });

  it("is false when a hook vetoes the write", async () => {
    const actor = makeActor();
    const sword = addItem(actor, { id: "sword", type: "weapon", system: { type: { value: "martialM" }, properties: new Set() } });
    actor.refuse = true;
    assert.equal(await equipItemToSlot(actor, sword, "mainHand"), false);
  });
});

describe("toggleItemEquipped result", () => {
  it("is true when it equips into a slot, unequips, or equips a slotless item", async () => {
    const actor = makeActor();
    const sword = addItem(actor, { id: "sword", type: "weapon", system: { type: { value: "martialM" }, properties: new Set() } });
    assert.equal(await toggleItemEquipped(actor, sword), true);

    const worn = addItem(actor, { id: "worn", system: { equipped: true, type: { value: "ring" } } });
    assert.equal(await toggleItemEquipped(actor, worn), true);

    const trinket = addItem(actor, { id: "trinket", system: { type: { value: "trinket" } } });
    assert.equal(await toggleItemEquipped(actor, trinket), true);
  });

  it("is false without permission on every branch", async () => {
    const actor = makeActor({ canEdit: false });
    const sword = addItem(actor, { id: "sword", type: "weapon", system: { type: { value: "martialM" }, properties: new Set() } });
    const worn = addItem(actor, { id: "worn", system: { equipped: true, type: { value: "ring" } } });
    const trinket = addItem(actor, { id: "trinket", system: { type: { value: "trinket" } } });
    assert.equal(await toggleItemEquipped(actor, sword), false);
    assert.equal(await toggleItemEquipped(actor, worn), false);
    assert.equal(await toggleItemEquipped(actor, trinket), false);
    assert.equal(actor.writes.length, 0);
  });

  it("is false for a shield while a two-handed weapon is held", async () => {
    const actor = makeActor();
    addItem(actor, { id: "greataxe", type: "weapon", system: { equipped: true, type: { value: "martialM" }, properties: new Set(["two"]) } });
    const buckler = addItem(actor, { id: "buckler", system: { type: { value: "shield" } } });
    assert.equal(await toggleItemEquipped(actor, buckler), false);
    assert.equal(actor.writes.length, 0);
  });

  it("is false for an unsupported actor or a missing item", async () => {
    const gmNpc = { type: "npc", hasPlayerOwner: false };
    assert.equal(await toggleItemEquipped(gmNpc, { system: { equipped: false } }), false);
    assert.equal(await toggleItemEquipped(makeActor(), null), false);
  });
});

describe("unequipItem result", () => {
  it("is true when written and false when refused", async () => {
    const actor = makeActor();
    const worn = addItem(actor, { id: "worn", system: { equipped: true } });
    assert.equal(await unequipItem(actor, worn), true);
    actor.refuse = true;
    assert.equal(await unequipItem(actor, worn), false);
    assert.equal(await unequipItem(makeActor({ canEdit: false }), worn), false);
  });
});

describe("toggleAttunement result", () => {
  it("is true when it attunes or ends attunement", async () => {
    const actor = makeActor();
    const ring = addItem(actor, { id: "ring", system: { attunement: "required", attuned: false } });
    assert.equal(await toggleAttunement(ring), true);
    const amulet = addItem(actor, { id: "amulet", system: { attunement: "required", attuned: true } });
    assert.equal(await toggleAttunement(amulet), true);
  });

  it("is false at the attunement limit", async () => {
    const actor = makeActor({ attunementMax: 1 });
    addItem(actor, { id: "amulet", system: { attunement: "required", attuned: true } });
    const ring = addItem(actor, { id: "ring", system: { attunement: "required", attuned: false } });
    assert.equal(await toggleAttunement(ring), false);
    assert.equal(actor.writes.length, 0);
  });

  it("is false when attunement is not needed, without permission, or without an item", async () => {
    const actor = makeActor();
    const rope = addItem(actor, { id: "rope", system: { attunement: "", attuned: false } });
    assert.equal(await toggleAttunement(rope), false);

    const readOnly = makeActor({ canEdit: false });
    const ring = addItem(readOnly, { id: "ring", system: { attunement: "required", attuned: false } });
    assert.equal(await toggleAttunement(ring), false);
    assert.equal(await toggleAttunement(null), false);
  });

  it("is false and announces nothing when a hook vetoes the write", async () => {
    const actor = makeActor();
    const ring = addItem(actor, { id: "ring", system: { attunement: "required", attuned: false } });
    const infos = [];
    globalThis.ui.notifications.info = message => infos.push(message);
    actor.refuse = true;
    assert.equal(await toggleAttunement(ring), false);
    assert.deepEqual(infos, []);
  });
});
