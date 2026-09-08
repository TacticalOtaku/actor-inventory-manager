import test from "node:test";
import assert from "node:assert/strict";
import { buildTradeContext } from "../scripts/ui/trade-panel.js";

function setup() {
  const a = { id: "a", type: "character", hasPlayerOwner: true, system: { currency: { gp: 10 } }, items: new Map(), testUserPermission: u => u?.id === "p1" || u?.isGM };
  const b = { ...a, id: "b", name: "Partner", testUserPermission: u => u?.id === "p2" || u?.isGM };
  const user = { id: "p1", active: true };
  const session = { id: "deal", actors: ["a", "b"], users: ["p1", "p2"], names: ["You", "Partner"], status: "open", revision: 1,
    confirmed: [false, false], currencies: [{ key: "gp", label: "GP" }], offers: [{ items: [], money: { gp: 2 } }, { items: [], money: {} }] };
  globalThis.game = { user, users: new Map([[user.id, user], ["p2", { id: "p2", active: true }], ["gm", { id: "gm", active: true, isGM: true }]]),
    actors: new Map([["a", a], ["b", b]]), modules: new Map(), i18n: { localize: key => key },
    settings: { get: () => ({ sessions: [session] }) }
  };
  return { app: { actor: a }, session };
}
test("drafts survive unrelated renders but reset to a new offer revision", () => {
  const { app, session } = setup();
  assert.equal(buildTradeContext(app).canConfirm, true);
  app.tradeDraft.money.gp = 3; app.tradeDraft.dirty = true;
  assert.equal(buildTradeContext(app).canConfirm, false);
  assert.equal(buildTradeContext(app).canSave, true);
  assert.equal(app.tradeDraft.money.gp, 3);
  session.revision++;
  assert.equal(buildTradeContext(app).canConfirm, true);
  assert.equal(app.tradeDraft.money.gp, 2);
});
test("GM observers do not get player confirmation controls", () => {
  const { app } = setup();
  game.user = game.users.get("gm");
  const context = buildTradeContext(app);
  assert.equal(context.participant, false);
  assert.equal(context.canConfirm, false);
});
test("NPCs have no trade context and absent GM disables confirmation", () => {
  const { app } = setup();
  assert.deepEqual(buildTradeContext({ actor: { type: "npc", hasPlayerOwner: false } }), { available: false });
  game.users.get("gm").active = false;
  assert.equal(buildTradeContext(app).hasGM, false);
  assert.equal(buildTradeContext(app).canConfirm, false);
});
