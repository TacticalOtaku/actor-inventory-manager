import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { TRADE_HOOK, registerTradeService, requestTrade } from "../scripts/trade/service.js";
import { LOG } from "../scripts/foundry/logger.js";
LOG.setLevel("none");

const handlers = {};
globalThis.Hooks = { on: (name, fn) => { (handlers[name] ??= []).push(fn); } };
globalThis.ui = { notifications: { warn() {} } };
const actor = { id: "a", type: "character", isToken: false };
const session = { id: "s", status: "executing", actors: ["a", "b"], gmId: "gm" };
const gm = { id: "gm", isGM: true, active: true };
const player = { id: "p1", isGM: false, active: true };
globalThis.game = {
  user: player, users: new Map([["gm", gm], ["p1", player]]), i18n: { localize: (key) => key },
  settings: { get: () => ({ sessions: [session], receipts: {} }) }
};
registerTradeService();
const allowed = (hook) => handlers[hook].map((fn) => fn({ parent: actor }, {}));

test("while a trade is being committed, only its coordinator may change the actor's items", () => {
  for (const hook of ["preCreateItem", "preUpdateItem", "preDeleteItem"]) assert.deepEqual(allowed(hook), [false]);
  game.user = gm;
  for (const hook of ["preCreateItem", "preUpdateItem", "preDeleteItem"]) assert.deepEqual(allowed(hook), [true]);
});

test("a trade request counts only when the user changed their own flag", () => {
  game.user = gm;
  let read = 0;
  const changes = { get "flags.actor-inventory-manager.tradeRequest"() { read++; return "{}"; } };
  handlers.updateUser[0](player, changes, {}, "gm");
  assert.equal(read, 0);
});

test("a locked trade blocks the actor's coins and items, never the rest of the actor", () => {
  game.user = player;
  session.status = "recovery";
  const update = (changes) => handlers.preUpdateActor[0](actor, changes);
  assert.equal(update({ "system.currency.gp": 3 }), false);
  assert.equal(update({ system: { currency: { gp: 3 } } }), false);
  assert.equal(update({ "system.attributes.hp.value": 4 }), true);
  assert.equal(update({ system: { attributes: { death: { failure: 1 } }, spells: { spell1: { value: 0 } } } }), true);
  assert.equal(update({ "system.details.xp.value": 300 }), true);
  session.status = "executing";
});

test("a request waits while the coordinator carries out its trade and times out only on silence", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    game.user = Object.assign(player, { setFlag: async () => {} });
    globalThis.Hooks.off = () => {};
    globalThis.foundry = { utils: { randomID: () => "confirmRequest01" } };
    const owned = { ...actor, hasPlayerOwner: true, testUserPermission: () => true };
    const fire = (status, receipts = {}) => handlers[TRADE_HOOK].at(-1)({ sessions: [{ ...session, status }], receipts });
    const result = requestTrade(owned, "confirm", { sessionId: "s" });
    await Promise.resolve();
    fire("executing");
    mock.timers.tick(60000);
    fire("complete");
    mock.timers.tick(19000);
    fire("complete", { p1: { id: "confirmRequest01", error: null } });
    assert.deepEqual(await result, { id: "confirmRequest01", error: null });
    // A coordinator that never answers still times out.
    const silent = requestTrade(owned, "cancel", { sessionId: "s" });
    await Promise.resolve();
    mock.timers.tick(20000);
    await assert.rejects(silent, /timeout/);
  } finally {
    mock.timers.reset();
  }
});
