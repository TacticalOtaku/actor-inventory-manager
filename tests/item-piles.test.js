import test from "node:test";
import assert from "node:assert/strict";

import { computeActorCurrency, isItemPilesActive } from "../scripts/integrations/item-piles.js";

test("Item Piles: Default fallback calculation when Item Piles is inactive", () => {
  // Ensure item-piles module is inactive
  globalThis.game = {
    modules: new Map()
  };

  const actor = {
    id: "actor1",
    name: "Adventurer",
    system: {
      currency: {
        pp: 2,  // 20 gp
        gp: 50, // 50 gp
        ep: 4,  // 2 gp
        sp: 30, // 3 gp
        cp: 50  // 0.5 gp
      }
    }
  };

  assert.equal(isItemPilesActive(), false);
  const result = computeActorCurrency(actor);
  assert.equal(result.total, 75.5);
  assert.equal(result.totalGold, "75.50");
  assert.equal(result.primaryName, "GP");
  assert.equal(result.formatted, "75.50 GP");
});

test("Item Piles: Calculation with Item Piles getActorCurrencies API", () => {
  // Mock Item Piles active
  globalThis.game = {
    modules: new Map([["item-piles", { active: true }]]),
    itempiles: {
      API: {
        getActorCurrencies(actor) {
          return [
            { name: "Silver Piece", abbreviation: "{#}sp", quantity: 200, exchangeRate: 1, primary: true },
            { name: "Copper Piece", abbreviation: "{#}cp", quantity: 50, exchangeRate: 0.1, primary: false },
            { name: "Gold Piece", abbreviation: "{#}gp", quantity: 10, exchangeRate: 10, primary: false }
          ];
        }
      }
    }
  };

  const actor = {
    id: "actor2",
    name: "Silver Standard Hero",
    system: {
      currency: { sp: 200, cp: 50, gp: 10 }
    }
  };

  assert.equal(isItemPilesActive(), true);
  const result = computeActorCurrency(actor);
  // Total in SP: 200 * 1 + 50 * 0.1 + 10 * 10 = 200 + 5 + 100 = 305
  assert.equal(result.total, 305);
  assert.equal(result.totalGold, "305.00");
  assert.equal(result.primaryName, "sp");
  assert.equal(result.formatted, "305.00 sp");
});

test("Item Piles: Calculation with Item Piles game settings configuration", () => {
  // Mock Item Piles active without API but with settings
  globalThis.game = {
    modules: new Map([["item-piles", { active: true }]]),
    itempiles: null,
    settings: {
      get(module, key) {
        if (module === "item-piles" && key === "currencies") {
          return [
            { type: "attribute", name: "Gold", data: { path: "system.currency.gp" }, exchangeRate: 1, abbreviation: "{#} GP", primary: true },
            { type: "attribute", name: "Platinum", data: { path: "system.currency.pp" }, exchangeRate: 5, abbreviation: "{#} PP", primary: false }
          ];
        }
        return null;
      }
    }
  };

  const actor = {
    id: "actor3",
    name: "Custom Economy Hero",
    system: {
      currency: { pp: 10, gp: 100 }
    }
  };

  const result = computeActorCurrency(actor);
  // 100 * 1 + 10 * 5 = 150
  assert.equal(result.total, 150);
  assert.equal(result.totalGold, "150.00");
  assert.equal(result.primaryName, "GP");
  assert.equal(result.formatted, "150.00 GP");
});
