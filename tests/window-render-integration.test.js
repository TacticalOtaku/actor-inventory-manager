import assert from "node:assert/strict";
import { afterEach, beforeEach, it, mock } from "node:test";
import { setImmediate as turn } from "node:timers/promises";

// Foundry owns rendering; retain the real ActorWindow and its action/lifecycle wiring.
globalThis.foundry = { applications: { api: {
  ApplicationV2: class {
    constructor() { this.rendered = true; this.calls = []; }
    render({ parts }) { this.calls.push(parts); return Promise.resolve(this); }
    _onClose() { this.rendered = false; }
  },
  HandlebarsApplicationMixin: (Base) => Base
} } };
const { ActorWindow } = await import("../scripts/ui/actor-window.js");

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout"] });
  globalThis.game = { user: { id: "gm", isGM: true }, settings: { get: () => false } };
});
afterEach(() => { mock.timers.reset(); delete globalThis.game; });

function window() {
  const app = new ActorWindow({ id: "a", uuid: "Actor.a", name: "Actor", type: "character", hasPlayerOwner: true });
  app.element = { querySelector: () => null, ownerDocument: { activeElement: null }, contains: () => false };
  return app;
}

it("an explicit HP action renders immediately during a rail effect hold", () => {
  const app = window();
  app._redraws.holdRail(1100);
  ActorWindow.DEFAULT_OPTIONS.actions.editHp.call(app);
  assert.equal(app.hpEditing, true);
  assert.deepEqual(app.calls, [["rail"]]);
  app._onClose({});
});

it("closing the actor window cancels its pending biography catch-up", async () => {
  const app = window();
  let editing = true;
  app.element.querySelector = (selector) => selector === "[data-bio-editor][open]" && editing ? {} : null;
  app.renderTrade();
  await turn();
  assert.deepEqual(app.calls, [["trade"]]);
  editing = false;
  app._redraws.resume();
  app._onClose({});
  mock.timers.tick(2000);
  await turn();
  assert.deepEqual(app.calls, [["trade"]]);
});


it("retains trade changes during an explicit Foundry render", async () => {
  const app = window();
  app.rendered = false;
  app.renderTrade();
  await turn();
  assert.deepEqual(app.calls, []);
  app.rendered = true;
  app._redraws.resume();
  mock.timers.tick(0);
  await turn();
  assert.deepEqual(app.calls, [["main", "trade"]]);
  app._onClose({});
});
