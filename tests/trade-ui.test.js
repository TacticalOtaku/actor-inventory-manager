import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { TradePanel, tradeRoles } from "../scripts/ui/trade.js";
import { emptyOffer } from "../scripts/trade/offers.js";

const giver = { id: "p1", isGM: false };
const receiver = { id: "p2", isGM: false };
const coOwner = { id: "p3", isGM: false };
const gm = { id: "gm", isGM: true };

function makeActor(id, owners) {
  const items = new Map([["rope", { id: "rope", system: { quantity: 5 } }]]);
  return { id, items, testUserPermission: (user) => owners.includes(user.id) };
}
const ana = makeActor("a", ["p1", "p3"]);
const bob = makeActor("b", ["p2"]);
let session;

function panelFor(actor) {
  const app = { actor, canEdit: true, renders: [], renderTrade() { this.renders.push("trade+main"); }, render({ parts }) { this.renders.push(parts.join("+")); } };
  return new TradePanel(app);
}

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout"] });
  session = { id: "s", status: "open", actors: ["a", "b"], users: ["p1", "p2"], names: ["Ana", "Bob"], revision: 1, confirmed: [false, false], offers: [emptyOffer(), emptyOffer()] };
  globalThis.game = {
    user: giver,
    settings: { get: () => ({ sessions: [session], receipts: {} }) },
    i18n: { localize: (key) => key, format: (key) => key }
  };
});
afterEach(() => {
  mock.timers.reset();
  delete globalThis.game;
});

describe("trade roles", () => {
  it("let only the player who joined with the actor act, and only the giver offer in a gift", () => {
    assert.deepEqual(tradeRoles(session, ana, giver), { side: 0, acts: true, offers: true });
    assert.deepEqual(tradeRoles(session, ana, coOwner), { side: 0, acts: false, offers: false });
    assert.deepEqual(tradeRoles(session, ana, gm), { side: 0, acts: false, offers: false });
    session.kind = "gift";
    assert.deepEqual(tradeRoles(session, bob, receiver), { side: 1, acts: true, offers: false });
    assert.equal(tradeRoles(session, ana, giver).offers, true);
    session.status = "executing";
    assert.equal(tradeRoles(session, ana, giver).acts, false);
  });
});

describe("trade panel edits", () => {
  it("adds to the offer for the player who offers, within the stack", () => {
    const panel = panelFor(ana);
    panel.offer(ana.items.get("rope"), 3);
    panel.offer(ana.items.get("rope"), 4);
    assert.deepEqual(panel.draft.offer.items, [{ id: "rope", quantity: 5 }]);
    assert.equal(panel.draft.pending, true);
  });

  it("leaves the offer alone for a gift's receiver, a co-owner who did not join, and the GM", () => {
    session.kind = "gift";
    game.user = receiver;
    const receiving = panelFor(bob);
    receiving.offer(bob.items.get("rope"), 1);
    receiving.input({ dataset: { tradeCoin: "gp" }, value: "5", max: "" });
    assert.deepEqual(receiving.draft.offer, emptyOffer());
    for (const user of [coOwner, gm]) {
      game.user = user;
      const panel = panelFor(ana);
      panel.offer(ana.items.get("rope"), 1);
      panel.remove("rope");
      assert.deepEqual(panel.draft.offer, emptyOffer());
      assert.deepEqual(panel.app.renders, []);
    }
  });

  it("keeps an item while its quantity field is cleared, and caps typed coins by the purse", () => {
    const panel = panelFor(ana);
    panel.offer(ana.items.get("rope"), 2);
    panel.input({ dataset: { offerQty: "rope" }, value: "" });
    assert.deepEqual(panel.draft.offer.items, [{ id: "rope", quantity: 2 }]);
    panel.input({ dataset: { offerQty: "rope" }, value: "4" });
    assert.deepEqual(panel.draft.offer.items, [{ id: "rope", quantity: 4 }]);
    const coin = { dataset: { tradeCoin: "gp" }, value: "12", max: "10" };
    panel.input(coin);
    assert.deepEqual(panel.draft.offer.money, { gp: 10 });
    assert.equal(coin.value, 10);
    assert.equal(panel.app.renders.at(-1), "trade");
  });

  it("takes an item used up since it was offered out of the offer", () => {
    const panel = panelFor(ana);
    panel.offer(ana.items.get("rope"), 1);
    ana.items.delete("rope");
    try {
      panel.step("rope", 1);
      assert.deepEqual(panel.draft.offer.items, []);
    } finally {
      ana.items.set("rope", { id: "rope", system: { quantity: 5 } });
    }
  });

  it("confirms only for the player who acts, and never while an edit is waiting to be sent", async () => {
    const requests = [];
    const panel = panelFor(ana);
    panel.request = async (action, data) => { requests.push([action, data.revision]); };
    await panel.confirm(1);
    assert.deepEqual(requests, [["confirm", 1]]);
    panel.offer(ana.items.get("rope"), 1);
    await panel.confirm(1);
    game.user = coOwner;
    await panelFor(ana).confirm(1);
    assert.equal(requests.length, 1);
  });
});
