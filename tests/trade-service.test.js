import test from "node:test";
import assert from "node:assert/strict";
import { activeGM, processTradeRequest, tradeState } from "../scripts/trade/service.js";
import { LOG } from "../scripts/foundry/logger.js";
LOG.setLevel("none");

function setup() {
  let state = { sessions: [], receipts: {} };
  const users = new Map([ ["gm", { id: "gm", isGM: true, active: true }], ...["p1", "p2", "p3"].map(id => [id, { id, active: true, isGM: false }]) ]);
  const actors = new Map(["a", "b", "c", "npc"].map((id, index) => [id, {
    id, name: id, type: id === "npc" ? "npc" : "character", hasPlayerOwner: id !== "npc",
    system: { currency: { gp: 10 } }, items: new Map(),
    testUserPermission: u => u?.isGM || u?.id === `p${index + 1}`,
    async update(data) { for (const [path, value] of Object.entries(data)) this.system.currency[path.split(".").at(-1)] = value; },
    async createEmbeddedDocuments(type, documents) {
      return documents.map(data => {
        const item = { ...structuredClone(data), id: data._id,
          toObject() { const { id, toObject, ...source } = this; return structuredClone(source); } };
        this.items.set(item.id, item);
        return item;
      });
    },
    async deleteEmbeddedDocuments(type, ids) { for (const id of ids) this.items.delete(id); },
    async updateEmbeddedDocuments(type, documents) {
      return documents.map(data => {
        const item = this.items.get(data._id);
        for (const [path, value] of Object.entries(data)) {
          const keys = path.split(".");
          const key = keys.pop();
          const object = keys.reduce((current, part) => current[part] ??= {}, item);
          object[key] = structuredClone(value);
        }
        return item;
      });
    }
  }]));
  globalThis.game = { user: users.get("gm"), users, actors, modules: new Map(),
    settings: { get: (id, key) => key === "logLevel" ? "silent" : structuredClone(state), set: async (id, key, value) => { state = structuredClone(value); } },
    journal: new Map()
  };
  globalThis.foundry = { utils: { getProperty: (o, path) => path.split(".").reduce((v, k) => v?.[k], o), randomID: () => "aRandomJournalID" } };
  globalThis.JournalEntry = { create: async data => { const journal = { id: "journal", getFlag: (id, key) => data.flags[id][key], delete: async () => game.journal.delete("journal") }; game.journal.set("journal", journal); return journal; } };
  return { actors, users };
}
const start = () => processTradeRequest({ id: "startRequest0001", action: "start", actorId: "a", targetId: "b", targetUserId: "p2" }, "p1");
async function command(id, action, actorId, user, data = {}) {
  return processTradeRequest({ id, action, actorId, sessionId: "startRequest0001", ...data }, user);
}

test("GM NPC cannot enter a player exchange", async () => {
  setup();
  await processTradeRequest({ id: "startRequest0001", action: "start", actorId: "npc", targetId: "b", targetUserId: "p2" }, "gm");
  assert.equal(tradeState().sessions.length, 0);
});
test("unauthorized requests cannot confirm or clear another player's confirmation", async () => {
  setup(); await start();
  await command("offerRequest0001", "offer", "a", "p1", { revision: 0, offer: { items: [], money: { gp: 3 } } });
  await command("confirmRequest01", "confirm", "a", "p1", { revision: 1 });
  await command("spoofRequest0001", "confirm", "b", "p3", { revision: 1 });
  assert.deepEqual(tradeState().sessions[0].confirmed, [true, false]);
  assert.equal(tradeState().sessions[0].status, "open");
});
test("both confirmations transfer once and replay cannot spend again", async () => {
  const { actors } = setup(); await start();
  await command("offerRequest0001", "offer", "a", "p1", { revision: 0, offer: { items: [], money: { gp: 3 } } });
  await command("confirmRequest01", "confirm", "a", "p1", { revision: 1 });
  assert.equal(actors.get("a").system.currency.gp, 10);
  await command("confirmRequest02", "confirm", "b", "p2", { revision: 1 });
  assert.equal(tradeState().sessions[0].status, "complete");
  assert.equal(actors.get("a").system.currency.gp, 7);
  assert.equal(actors.get("b").system.currency.gp, 13);
  await command("confirmRequest03", "confirm", "b", "p2", { revision: 1 });
  assert.equal(actors.get("a").system.currency.gp, 7);
  assert.equal(actors.get("b").system.currency.gp, 13);
});
test("a failed credit restores the debit and closes the failed trade", async () => {
  const { actors } = setup(); await start();
  const target = actors.get("b");
  const update = target.update;
  let fail = true;
  target.update = async function(data) { if (fail) { fail = false; throw new Error("credit failed"); } return update.call(this, data); };
  await command("offerRequest0001", "offer", "a", "p1", { revision: 0, offer: { items: [], money: { gp: 3 } } });
  await command("confirmRequest01", "confirm", "a", "p1", { revision: 1 });
  await command("confirmRequest02", "confirm", "b", "p2", { revision: 1 });
  assert.equal(tradeState().sessions[0].status, "failed");
  assert.equal(actors.get("a").system.currency.gp, 10);
  assert.equal(actors.get("b").system.currency.gp, 10);
});
test("failed rollback keeps a private recovery record and GM can explicitly restore it", async () => {
  const { actors } = setup(); await start();
  const target = actors.get("b"), update = target.update;
  target.update = async () => { throw new Error("database unavailable"); };
  await command("offerRequest0001", "offer", "a", "p1", { revision: 0, offer: { items: [], money: { gp: 3 } } });
  await command("confirmRequest01", "confirm", "a", "p1", { revision: 1 });
  await command("confirmRequest02", "confirm", "b", "p2", { revision: 1 });
  assert.equal(tradeState().sessions[0].status, "recovery");
  assert.equal(game.journal.size, 1);
  assert(!JSON.stringify(tradeState()).includes('"snapshots"'));
  target.update = update;
  await command("recoverRequest01", "recover", "a", "gm");
  assert.equal(tradeState().sessions[0].status, "failed");
  assert.equal(actors.get("a").system.currency.gp, 10);
  assert.equal(actors.get("b").system.currency.gp, 10);
  assert.equal(game.journal.size, 0);
});
test("stale confirmations after an offer edit cannot settle the new offer", async () => {
  const { actors } = setup(); await start();
  await command("offerRequest0001", "offer", "a", "p1", { revision: 0, offer: { items: [], money: { gp: 3 } } });
  await command("confirmRequest01", "confirm", "a", "p1", { revision: 1 });
  await command("offerRequest0002", "offer", "b", "p2", { revision: 1, offer: { items: [], money: { gp: 2 } } });
  await command("confirmRequest02", "confirm", "b", "p2", { revision: 1 });
  assert.deepEqual(tradeState().sessions[0].confirmed, [false, false]);
  assert.equal(actors.get("a").system.currency.gp, 10);
});
test("changed funds between confirmations cannot complete a trade", async () => {
  const { actors } = setup(); await start();
  await command("offerRequest0001", "offer", "a", "p1", { revision: 0, offer: { items: [], money: { gp: 3 } } });
  await command("confirmRequest01", "confirm", "a", "p1", { revision: 1 });
  actors.get("a").system.currency.gp = 1;
  await command("confirmRequest02", "confirm", "b", "p2", { revision: 1 });
  assert.equal(tradeState().sessions[0].status, "open");
  assert.deepEqual(tradeState().sessions[0].confirmed, [false, false]);
  assert.equal(actors.get("b").system.currency.gp, 10);
});
test("the editing lock is persisted before snapshot journal creation", async () => {
  setup(); await start();
  const create = JournalEntry.create;
  let statusAtCapture;
  JournalEntry.create = async data => { statusAtCapture = tradeState().sessions[0].status; return create(data); };
  await command("offerRequest0001", "offer", "a", "p1", { revision: 0, offer: { items: [], money: { gp: 3 } } });
  await command("confirmRequest01", "confirm", "a", "p1", { revision: 1 });
  await command("confirmRequest02", "confirm", "b", "p2", { revision: 1 });
  assert.equal(statusAtCapture, "executing");
});
test("a newly connected lower-ID GM cannot steal an executing coordinator", async () => {
  const { users } = setup(); await start();
  const create = JournalEntry.create;
  let coordinatorAtCapture;
  JournalEntry.create = async data => {
    users.set("aa", { id: "aa", active: true, isGM: true });
    coordinatorAtCapture = activeGM().id;
    return create(data);
  };
  await command("offerRequest0001", "offer", "a", "p1", { revision: 0, offer: { items: [], money: { gp: 3 } } });
  await command("confirmRequest01", "confirm", "a", "p1", { revision: 1 });
  await command("confirmRequest02", "confirm", "b", "p2", { revision: 1 });
  assert.equal(coordinatorAtCapture, "gm");
  assert.equal(tradeState().sessions[0].status, "complete");
});
test("an in-flight pre-lock currency change is preserved when snapshot validation aborts", async () => {
  const { actors } = setup(); await start();
  const create = JournalEntry.create;
  JournalEntry.create = async data => { actors.get("a").system.currency.gp += 5; return create(data); };
  await command("offerRequest0001", "offer", "a", "p1", { revision: 0, offer: { items: [], money: { gp: 3 } } });
  await command("confirmRequest01", "confirm", "a", "p1", { revision: 1 });
  await command("confirmRequest02", "confirm", "b", "p2", { revision: 1 });
  assert.equal(actors.get("a").system.currency.gp, 15);
  assert.equal(actors.get("b").system.currency.gp, 10);
  assert.equal(tradeState().sessions[0].status, "cancelled");
  // The confirming player is told the trade was cancelled, not that it succeeded.
  assert.equal(tradeState().receipts.p2.error, "AIM.trade.errors.changed");
});
test("disconnected coordinator stops after debit and successor recovers from persisted state", async () => {
  const { actors, users } = setup(); await start();
  const source = actors.get("a"), update = source.update;
  source.update = async function(data) {
    await update.call(this, data);
    users.get("gm").active = false;
    users.set("gm2", { id: "gm2", isGM: true, active: true });
  };
  await command("offerRequest0001", "offer", "a", "p1", { revision: 0, offer: { items: [], money: { gp: 3 } } });
  await command("confirmRequest01", "confirm", "a", "p1", { revision: 1 });
  await command("confirmRequest02", "confirm", "b", "p2", { revision: 1 });
  assert.equal(tradeState().sessions[0].status, "executing");
  assert.equal(actors.get("b").system.currency.gp, 10);
  assert.equal(game.journal.size, 1);
  source.update = update;
  game.user = users.get("gm2");
  await command("recoverRequest01", "recover", "a", "gm2");
  assert.equal(tradeState().sessions[0].status, "failed");
  assert.equal(actors.get("a").system.currency.gp, 10);
  assert.equal(actors.get("b").system.currency.gp, 10);
});
test("fallback deal survives Foundry journal normalization of dotted flag keys", async () => {
  const { actors } = setup(); await start();
  const create = JournalEntry.create;
  JournalEntry.create = async data => {
    // Foundry document processing can expand dotted keys in supplied flag objects.
    const recovery = data.flags["actor-inventory-manager"].tradeRecovery;
    if (typeof recovery === "object") {
      for (const snapshot of recovery.snapshots) {
        snapshot.attributes = { system: { currency: Object.fromEntries(Object.entries(snapshot.attributes).map(([path, value]) => [path.split(".").at(-1), value])) } };
      }
    }
    return create(data);
  };
  await command("offerRequest0001", "offer", "a", "p1", { revision: 0, offer: { items: [], money: { gp: 3 } } });
  await command("confirmRequest01", "confirm", "a", "p1", { revision: 1 });
  await command("confirmRequest02", "confirm", "b", "p2", { revision: 1 });
  assert.equal(tradeState().sessions[0].status, "complete");
  assert.equal(actors.get("a").system.currency.gp, 7);
  assert.equal(actors.get("b").system.currency.gp, 13);
});
for (const installed of [false, true]) {
  test(`item-for-coins exchange completes with Item Piles ${installed ? "installed but disabled" : "absent"}`, async () => {
    const { actors } = setup();
    if (installed) game.modules.set("item-piles", { active: false });
    game.itempiles = { API: { getActorCurrencies() { assert.fail("Inactive Item Piles API was called"); } } };
    await actors.get("b").createEmbeddedDocuments("Item", [{
      _id: "potion", name: "Potion", type: "consumable", system: { quantity: 4, equipped: false }
    }]);
    await start();
    await command("offerRequest0001", "offer", "a", "p1", { revision: 0, offer: { items: [], money: { gp: 3 } } });
    await command("offerRequest0002", "offer", "b", "p2", { revision: 1, offer: { items: [{ id: "potion", quantity: 2 }], money: {} } });
    await command("confirmRequest01", "confirm", "a", "p1", { revision: 2 });
    await command("confirmRequest02", "confirm", "b", "p2", { revision: 2 });
    assert.equal(tradeState().sessions[0].mode, "dnd5e");
    assert.equal(tradeState().sessions[0].status, "complete");
    assert.equal(actors.get("a").system.currency.gp, 7);
    assert.equal(actors.get("b").system.currency.gp, 13);
    assert.equal(actors.get("b").items.get("potion").system.quantity, 2);
    assert.equal([...actors.get("a").items.values()][0].system.quantity, 2);
  });
}
