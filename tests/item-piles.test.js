import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { computeActorCurrency } from "../scripts/integrations/item-piles.js";

/** Currencies as Item Piles 3.3.4 returns them for dnd5e (systems/dnd5e-4.0.0.js), quantities filled in. */
const coin = (key, rate, quantity, primary = false) => ({
  type: "attribute", name: `DND5E.Currency${key.toUpperCase()}`, abbreviation: `{#}${key.toUpperCase()}`,
  data: { path: `system.currency.${key}` }, path: `system.currency.${key}`, primary, exchangeRate: rate, quantity
});

function stubItemPiles(currencies) {
  globalThis.game = {
    modules: new Map([["item-piles", { active: true }]]),
    itempiles: { API: { getActorCurrencies: () => currencies } }
  };
}

afterEach(() => {
  delete globalThis.game;
});

describe("Item Piles purse total", () => {
  it("adds coins at their exchange rate and names the primary currency", () => {
    stubItemPiles([coin("pp", 10, 2), coin("gp", 1, 147, true), coin("ep", 0.5, 5), coin("sp", 0.1, 23), coin("cp", 0.01, 41)]);
    const purse = computeActorCurrency({ system: { currency: {} } });
    assert.equal(purse.totalGold, "172.21");
    assert.equal(purse.primaryName, "GP");
  });

  it("leaves secondary currencies, which have no exchange rate, out of the gold total", () => {
    const bars = { type: "attribute", name: "Trade bars", abbreviation: "{#} bars", data: { path: "flags.world.bars" }, path: "flags.world.bars", secondary: true, quantity: 30 };
    stubItemPiles([coin("gp", 1, 10, true), bars]);
    const purse = computeActorCurrency({ system: { currency: {} } });
    assert.equal(purse.totalGold, "10.00");
    assert.equal(purse.customCurrencies.length, 2);
  });
});
