import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { coinWeight } from "../scripts/core/weight-calculator.js";
import { loadAfterTrade, offerWithQuantity, offeredWeight, offersEmpty, partnerChoices, pilesTotals, recoveryAction, sameOffer, tradeStatus } from "../scripts/core/trade-panel.js";

const offer = (items = [], money = {}) => ({ items, money });
const session = (extra = {}) => ({ status: "open", confirmed: [false, false], offers: [offer(), offer()], ...extra });

describe("trade status", () => {
  it("says what the trade waits for, from the viewer's side", () => {
    const filled = [offer([{ id: "a", quantity: 1 }]), offer()];
    assert.equal(tradeStatus(session(), 0, {}), "waitOffer");
    assert.equal(tradeStatus(session({ offers: filled }), 0, { sending: true }), "sending");
    assert.equal(tradeStatus(session({ offers: filled }), 0, {}), "review");
    assert.equal(tradeStatus(session({ offers: filled, confirmed: [false, true] }), 0, {}), "partnerConfirmed");
    assert.equal(tradeStatus(session({ offers: filled, confirmed: [true, false] }), 0, {}), "waitPartner");
    assert.equal(tradeStatus(session({ offers: filled, confirmed: [true, true] }), 0, {}), "both");
    assert.equal(tradeStatus(session({ status: "executing" }), 0, { sending: true }), "executing");
    assert.equal(tradeStatus(session({ status: "recovery" }), 1, {}), "recovery");
  });

  it("count a gift of coins as an offer", () => {
    assert.equal(offersEmpty(session()), true);
    assert.equal(offersEmpty(session({ offers: [offer(), offer([], { gp: 5 })] })), false);
  });
});

describe("offer edits", () => {
  it("set a quantity between 0 and the stack; 0 removes the item, a new one goes last", () => {
    const draft = offer([{ id: "a", quantity: 2 }], { gp: 1 });
    assert.deepEqual(offerWithQuantity(draft, "a", 9, 4).items, [{ id: "a", quantity: 4 }]);
    assert.deepEqual(offerWithQuantity(draft, "a", 0, 4).items, []);
    assert.deepEqual(offerWithQuantity(draft, "b", 1, 3).items, [{ id: "a", quantity: 2 }, { id: "b", quantity: 1 }]);
    assert.deepEqual(offerWithQuantity(draft, "a", -1, 4).items, []);
    assert.deepEqual(offerWithQuantity(draft, "a", 2.7, 4).items, [{ id: "a", quantity: 2 }]);
    assert.deepEqual(draft.items, [{ id: "a", quantity: 2 }], "the draft itself is left alone");
  });
});

describe("unchanged offers", () => {
  it("compare items, quantities and coins regardless of order; a zero coin is no coin", () => {
    const stored = offer([{ id: "a", quantity: 2, name: "Факел" }, { id: "b", quantity: 1 }], { gp: 3 });
    assert.equal(sameOffer(offer([{ id: "b", quantity: 1 }, { id: "a", quantity: 2 }], { gp: 3, sp: 0 }), stored), true);
    assert.equal(sameOffer(offer([{ id: "a", quantity: 1 }, { id: "b", quantity: 1 }], { gp: 3 }), stored), false);
    assert.equal(sameOffer(offer(stored.items, { gp: 4 }), stored), false);
  });
});

describe("recovery", () => {
  it("offers restoring, or only unlocking after a preparation that never debited", () => {
    assert.equal(recoveryAction(session()), null);
    assert.equal(recoveryAction(session({ status: "recovery", phase: "transferring", recoveryId: "j" })), "restore");
    assert.equal(recoveryAction(session({ status: "executing", phase: "transferring", recoveryId: "j" })), "restore");
    assert.equal(recoveryAction(session({ status: "executing", phase: "preparing" })), "unlock");
  });
});

describe("trade partners", () => {
  const users = [
    { id: "me", name: "Ирэн", active: true, isGM: false },
    { id: "u2", name: "Миша", active: true, isGM: false },
    { id: "u3", name: "Аня", active: false, isGM: false },
    { id: "gm", name: "Мастер", active: true, isGM: true }
  ];
  const actors = [
    { id: "mine", name: "Ирэн", owners: ["me"] },
    { id: "torvin", name: "Торвин", owners: ["u2"] },
    { id: "kira", name: "Кира", owners: ["u2"] },
    { id: "sera", name: "Сэра", owners: ["u3"] },
    { id: "npc", name: "Страж", owners: ["gm"] }
  ];

  it("list other players' characters whose owner is online, never the GM; one in a trade is busy", () => {
    const choices = partnerChoices({ actors, users, actorId: "mine", userId: "me", busy: new Set(["kira"]) });
    assert.deepEqual(choices, [
      { actorId: "kira", userId: "u2", name: "Кира", owner: "Миша", busy: true },
      { actorId: "torvin", userId: "u2", name: "Торвин", owner: "Миша", busy: false }
    ]);
  });
});

describe("Item Piles totals", () => {
  it("sum the offer and the purse by exchange rate", () => {
    const rows = [{ key: "0", rate: 1, quantity: 12 }, { key: "1", rate: 0.1, quantity: 30 }];
    assert.deepEqual(pilesTotals(rows, { 0: 5, 1: 20 }), { offered: 7, purse: 15 });
  });
});

describe("weight after the trade", () => {
  const carrier = { system: { attributes: { encumbrance: { value: 50, max: 150, thresholds: { encumbered: 50, heavilyEncumbered: 100 } } } } };

  it("weighs the offered count, a container once", () => {
    const rope = { type: "loot", system: { weight: { value: 2, units: "lb" }, quantity: 10 } };
    assert.equal(offeredWeight(rope, 3), 6);
    assert.equal(offeredWeight({ ...rope, type: "container" }, 3), 2);
    assert.equal(offeredWeight(null, 3), 0);
  });

  const sack = (weight) => ({ item: { type: "loot", system: { weight: { value: weight, units: "lb" }, quantity: 1 } }, quantity: 1 });

  it("adds what arrives to dnd5e's load and says when the tier changes", () => {
    assert.deepEqual(loadAfterTrade(carrier, { arriving: [sack(20)] }), { value: 70, max: 150, tier: "encumbered", tierChanged: true });
    assert.deepEqual(loadAfterTrade(carrier, { leaving: [sack(10)] }), { value: 40, max: 150, tier: "normal", tierChanged: false });
    assert.equal(loadAfterTrade(carrier, { leaving: [sack(80)] }).value, 0);
  });

  it("takes off only the share the actor carries of what leaves, and counts what arrives in full", () => {
    const share = (actor, item) => item.share;
    const inBag = (weight, part) => { const entry = sack(weight); entry.item.share = part; return entry; };
    assert.equal(loadAfterTrade(carrier, { leaving: [inBag(30, 0)] }, share).value, 50);
    assert.equal(loadAfterTrade(carrier, { leaving: [inBag(30, 0.5)] }, share).value, 35);
    assert.equal(loadAfterTrade(carrier, { arriving: [inBag(30, 0)] }, share).value, 80);
  });

  it("weighs the coins under dnd5e's currency rule, in pounds or kilograms", () => {
    const world = (metric, weighed = true) => {
      globalThis.game = { settings: { settings: new Map(), get: (scope, key) => (key === "currencyWeight" ? weighed : key === "metricWeightUnits" ? metric : undefined) } };
      globalThis.CONFIG = { DND5E: { encumbrance: { currencyPerWeight: { imperial: 50, metric: 110 } } } };
    };
    try {
      world(false);
      assert.equal(loadAfterTrade(carrier, { coins: 500 }).value, 60);
      assert.equal(loadAfterTrade(carrier, { coins: -500 }).value, 40);
      world(true);
      assert.equal(coinWeight(220), 2);
      world(false, false);
      assert.equal(coinWeight(500), 0);
    } finally {
      delete globalThis.game;
      delete globalThis.CONFIG;
    }
  });

  it("is absent without dnd5e's encumbrance or under the «none» rule", () => {
    assert.equal(loadAfterTrade({ system: {} }, {}), null);
    globalThis.game = { settings: { settings: new Map([["dnd5e.encumbrance", {}]]), get: (scope, key) => (key === "encumbrance" ? "none" : false) } };
    try {
      assert.equal(loadAfterTrade(carrier, { arriving: [sack(5)] }), null);
    } finally {
      delete globalThis.game;
    }
  });
});
