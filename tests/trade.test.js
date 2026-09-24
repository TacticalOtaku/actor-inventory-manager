import test from "node:test";
import assert from "node:assert/strict";
import { currencyProfile, validateMoney, transferMoney } from "../scripts/trade/currencies.js";
import { normalizeOffer, changeOffer, confirmOffer } from "../scripts/trade/offers.js";

function setup(api) {
  globalThis.game = { modules: new Map([["item-piles", { active: Boolean(api) }]]), itempiles: { API: api } };
}
const actor = () => ({ system: { currency: { gp: 10, sp: 5 } }, items: new Map(), async update(data) {
  for (const [path, value] of Object.entries(data)) this.system.currency[path.split(".").at(-1)] = value;
} });

test("fallback transfers exact denominations and conserves money", async () => {
  setup();
  const a = actor(), b = actor();
  const profile = currencyProfile(a);
  await transferMoney(a, b, { gp: 3, sp: 2 }, profile.signature, "deal");
  assert.deepEqual(a.system.currency, { gp: 7, sp: 3 });
  assert.deepEqual(b.system.currency, { gp: 13, sp: 7 });
});
test("fallback rejects negative, fractional, infinite, unknown and unaffordable amounts", () => {
  setup();
  for (const money of [{ gp: -1 }, { gp: 0.5 }, { gp: Infinity }, { gp: 11 }, { rub: 1 }]) {
    assert.throws(() => validateMoney(actor(), money));
  }
});
test("fallback never credits the target when a source hook blocks the debit", async () => {
  setup(); const a = actor(), b = actor();
  a.update = async () => undefined;
  await assert.rejects(transferMoney(a, b, { gp: 3 }, "dnd5e", "deal"), /transfer/);
  assert.equal(b.system.currency.gp, 10);
});
test("active Item Piles uses custom payment and transfer API without standard conversion", async () => {
  const calls = [];
  setup({
    getActorCurrencies: () => [{ name: "Crowns", abbreviation: "{#}cr", type: "attribute", data: { path: "system.currency.gp" }, quantity: 10, exchangeRate: 7 }],
    getPaymentData: price => ({ canBuy: price === "3cr" }),
    transferCurrencies: async (a, b, price, options) => { calls.push({ price, options }); return {}; }
  });
  const a = actor(), b = actor(), profile = currencyProfile(a);
  await transferMoney(a, b, { "0": 3 }, profile.signature, "deal");
  assert.equal(calls[0].price, "3cr");
  assert.equal(calls[0].options.interactionId, "deal");
  assert.equal(a.system.currency.gp, 10);
});
test("active but broken Item Piles never falls back", () => {
  setup({});
  assert.throws(() => currencyProfile(actor()), /provider/);
});
test("item currencies have the same definition across different actor item IDs", () => {
  setup({
    getActorCurrencies: a => [{ name: "Token", abbreviation: "{#}tok", type: "item", data: { item: { _id: a.id, name: "Token", type: "loot", system: { quantity: 1 } } }, item: { id: a.id }, quantity: 2, exchangeRate: 3 }],
    getPaymentData: () => ({ canBuy: true }), transferCurrencies: async () => ({})
  });
  assert.equal(currencyProfile({ id: "first" }).signature, currencyProfile({ id: "second" }).signature);
});
test("a changed currency provider invalidates the deal", async () => {
  setup();
  await assert.rejects(transferMoney(actor(), actor(), { gp: 1 }, "old", "deal"), /providerChanged/);
});
test("editing offers invalidates both confirmations and stale confirmations are rejected", () => {
  const session = { revision: 1, offers: [{ items: [], money: {} }, { items: [], money: {} }], confirmed: [true, true] };
  changeOffer(session, 0, { items: [], money: { gp: 1 } });
  assert.equal(session.revision, 2);
  assert.deepEqual(session.confirmed, [false, false]);
  assert.throws(() => confirmOffer(session, 0, 1), /stale/);
  assert.equal(confirmOffer(session, 0, 2), false);
  assert.equal(confirmOffer(session, 1, 2), true);
});
test("offers reject missing items, duplicate IDs and nonempty containers", () => {
  setup();
  const a = actor();
  a.items.set("bag", { id: "bag", name: "Bag", type: "container", system: { quantity: 1 }, toObject() { return { _id: this.id, type: this.type, system: this.system }; } });
  a.items.set("potion", { id: "potion", type: "consumable", system: { container: "bag", quantity: 2 } });
  for (const items of [[{ id: "missing", quantity: 1 }], [{ id: "bag", quantity: 1 }], [{ id: "potion", quantity: 1 }, { id: "potion", quantity: 1 }]]) {
    assert.throws(() => normalizeOffer(a, { items, money: {} }));
  }
});
