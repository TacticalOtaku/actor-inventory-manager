import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { filterAndSortInventoryItems } from "../scripts/ui/inventory-context.js";

const item = (name, system) => ({ name, type: "loot", system });

describe("inventory sorting", () => {
  it("ranks rarity from rarest down, not alphabetically", () => {
    const items = [item("A", { rarity: "common" }), item("B", { rarity: "legendary" }), item("C", { rarity: "veryRare" }), item("D", { rarity: "" })];
    assert.deepEqual(filterAndSortInventoryItems(items, { sortBy: "rarity" }).map(i => i.name), ["B", "C", "A", "D"]);
  });

  it("compares prices in gold across denominations", () => {
    const items = [item("Five gold", { price: { value: 5, denomination: "gp" } }), item("One platinum", { price: { value: 1, denomination: "pp" } })];
    assert.deepEqual(filterAndSortInventoryItems(items, { sortBy: "value" }).map(i => i.name), ["One platinum", "Five gold"]);
  });

  it("compares weight including quantity", () => {
    const items = [item("Heavy", { quantity: 1, weight: { value: 5 } }), item("Many", { quantity: 10, weight: { value: 1 } })];
    assert.deepEqual(filterAndSortInventoryItems(items, { sortBy: "weight" }).map(i => i.name), ["Many", "Heavy"]);
  });
});
