import test from "node:test";
import assert from "node:assert/strict";
import { registerTradeService } from "../scripts/trade/service.js";
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
