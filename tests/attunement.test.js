import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countAttunedItems,
  getActorAttunementMax,
  getAttunementStatus,
  isItemAttuned,
  itemRequiresAttunement
} from "../scripts/core/attunement.js";
import { buildAttunementSlots } from "../scripts/ui/inventory-context.js";

describe("attunement (dnd5e 5.x shape)", () => {
  it("reads the boolean state, not the requirement string", () => {
    assert.equal(isItemAttuned({ system: { attunement: "required", attuned: true } }), true);
    assert.equal(isItemAttuned({ system: { attunement: "required", attuned: false } }), false);
    assert.equal(isItemAttuned({ system: { attunement: "optional", attuned: false } }), false);
  });

  it("treats both 'required' and 'optional' as needing attunement", () => {
    assert.equal(itemRequiresAttunement({ system: { attunement: "required", attuned: false } }), true);
    assert.equal(itemRequiresAttunement({ system: { attunement: "optional", attuned: false } }), true);
    assert.equal(itemRequiresAttunement({ system: { attunement: "", attuned: false } }), false);
  });

  it("reports a compact status", () => {
    assert.equal(getAttunementStatus({ system: { attunement: "required", attuned: true } }), "attuned");
    assert.equal(getAttunementStatus({ system: { attunement: "required", attuned: false } }), "required");
    assert.equal(getAttunementStatus({ system: { attunement: "", attuned: false } }), "none");
  });
});

describe("attunement (legacy dnd5e 3.x/4.x shape)", () => {
  it("maps the numeric encoding", () => {
    assert.equal(isItemAttuned({ system: { attunement: 2 } }), true);
    assert.equal(isItemAttuned({ system: { attunement: 1 } }), false);
    assert.equal(isItemAttuned({ system: { attunement: 0 } }), false);
    assert.equal(itemRequiresAttunement({ system: { attunement: 1 } }), true);
    assert.equal(itemRequiresAttunement({ system: { attunement: 0 } }), false);
  });
});

describe("countAttunedItems", () => {
  it("counts only attuned items on the actor", () => {
    const actor = {
      items: new Map([
        ["a", { system: { attunement: "required", attuned: true } }],
        ["b", { system: { attunement: "required", attuned: false } }],
        ["c", { system: { attunement: 2 } }],
        ["d", { system: {} }]
      ])
    };
    assert.equal(countAttunedItems(actor), 2);
  });

  it("tolerates an actor with no items", () => {
    assert.equal(countAttunedItems(null), 0);
    assert.equal(countAttunedItems({}), 0);
  });
});


describe("attunement cap", () => {
  it("prefers the system value, which includes effects such as Magic Item Adept", () => {
    assert.equal(getActorAttunementMax({ flags: {}, system: { attributes: { attunement: { max: 5 } } } }), 5);
  });

  it("falls back to the paperdoll template without a system value", () => {
    assert.equal(getActorAttunementMax({ flags: {}, system: {} }), 3);
  });

  it("shows every attuned item, even beyond the cap", () => {
    const attuned = Array.from({ length: 4 }, (_, i) => ({ id: `i${i}`, system: { attunement: "required", attuned: true } }));
    const slots = buildAttunementSlots(attuned, 3, item => item);
    assert.equal(slots.length, 4);
    assert.equal(slots[3].isOverLimit, true);
    assert.equal(slots[2].isOverLimit, false);
  });
});
