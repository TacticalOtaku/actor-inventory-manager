import assert from "node:assert/strict";
import { beforeEach, afterEach, it } from "node:test";
import { setImmediate as turn } from "node:timers/promises";
import { LOG } from "../scripts/foundry/logger.js";
LOG.setLevel("none");
// Only Foundry's renderer and document transport are replaced; real window actions and adapters execute.
globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {
        constructor() {
          this.rendered = true;
        }
        render() {
          return Promise.resolve(this);
        }
        _onClose() {
          this.rendered = false;
        }
      },
      HandlebarsApplicationMixin: (B) => B,
    },
  },
  utils: { getProperty: (o, p) => p.split(".").reduce((v, k) => v?.[k], o) },
};
const { ActorWindow } = await import("../scripts/ui/actor-window.js");
class Input extends EventTarget {
  constructor() {
    super();
    this.value = "";
    this.isConnected = true;
    this.classes = new Set();
    this.classList = { toggle: (key, on) => (on ? this.classes.add(key) : this.classes.delete(key)) };
  }
  focus() {}
  setSelectionRange() {}
  fire(type, key) {
    const e = new Event(type, { cancelable: true });
    if (key) Object.defineProperty(e, "key", { value: key });
    this.dispatchEvent(e);
  }
}
let warnings;
beforeEach(() => {
  warnings = [];
  globalThis.game = {
    user: { id: "p", isGM: false },
    settings: { get: () => false },
    i18n: { localize: (k) => k, format: (k) => k },
  };
  globalThis.ui = { notifications: { warn: (m) => warnings.push(m) } };
});
afterEach(() => {
  delete globalThis.game;
  delete globalThis.ui;
});
function fixture() {
  const writes = [];
  let allowed = true;
  const item = {
    id: "f",
    system: { uses: { max: 6, spent: 2 } },
    async update(data) {
      writes.push(["item", data]);
      return item;
    },
  };
  const actor = {
    id: "a",
    uuid: "Actor.a",
    name: "A",
    type: "character",
    hasPlayerOwner: true,
    items: new Map([["f", item]]),
    system: { currency: { gp: 10, sp: 2 }, attributes: { hp: { value: 8, max: 20, temp: 0 } } },
    testUserPermission: () => allowed,
    async update(data) {
      writes.push(["actor", data]);
      return actor;
    },
    async applyDamage(n) {
      writes.push(["damage", n]);
      return actor;
    },
    async applyTempHP(n) {
      writes.push(["temp", n]);
      return actor;
    },
  };
  const app = new ActorWindow(actor),
    nodes = {};
  app.element = {
    querySelector: (s) => nodes[s] ?? null,
    ownerDocument: { activeElement: null },
    contains: () => false,
  };
  app.render = async ({ parts }) => {
    writes.push(["render", parts]);
    for (const [name, selector] of [
      ["hp", "[data-hp-input]"],
      ["coin", "[data-coin-input]"],
      ["uses", "[data-uses-input]"],
    ]) {
      if (!app._edits) continue;
      const state = app._edits.state(name);
      if (nodes[selector]) nodes[selector].isConnected = false;
      nodes[selector] = state.target === null ? null : new Input();
    }
    app._edits?.mount(app.element);
    return app;
  };
  const start = (name, target) => {
    ActorWindow.DEFAULT_OPTIONS.actions[{ hp: "editHp", coin: "editCoin", uses: "editUses" }[name]].call(
      app,
      null,
      target,
    );
    return nodes[{ hp: "[data-hp-input]", coin: "[data-coin-input]", uses: "[data-uses-input]" }[name]];
  };
  return {
    actor,
    item,
    app,
    writes,
    start,
    nodes,
    deny: () => {
      allowed = false;
    },
  };
}
for (const [text, write] of [
  ["-7", ["damage", 7]],
  ["+5", ["damage", -5]],
  ["в8", ["temp", 8]],
  ["50", ["actor", { "system.attributes.hp.value": 20 }]],
])
  it(`HP ${text} uses the existing document action after closing the field`, async () => {
    const f = fixture(),
      input = f.start("hp");
    assert.ok(input, "HP input mounted");
    input.value = text;
    input.fire("keydown", "Enter");
    await turn();
    assert.deepEqual(f.writes, [["render", ["rail"]], ["render", ["rail"]], write]);
    f.app._onClose({});
  });
it("coins read the latest balance after close redraw and preserve the denomination", async () => {
  const f = fixture(),
    input = f.start("coin", { dataset: { coin: "gp" } });
  assert.ok(input);
  input.value = "+3";
  f.actor.system.currency.gp = 17;
  input.fire("keydown", "Enter");
  await turn();
  assert.deepEqual(f.writes.at(-1), ["actor", { "system.currency.gp": 20 }]);
  f.app._onClose({});
});
it("feature uses write spent and redraw only after the document action", async () => {
  const f = fixture(),
    input = f.start("uses", { closest: () => ({ dataset: { itemId: "f" } }) });
  assert.ok(input);
  input.value = "-2";
  input.fire("keydown", "Enter");
  await turn();
  assert.deepEqual(f.writes, [
    ["render", ["main"]],
    ["item", { "system.uses.spent": 4 }],
    ["render", ["main"]],
  ]);
  f.app._onClose({});
});
it("a vetoed coin update restores text instead of treating a Trade-lock refusal as a save", async () => {
  const f = fixture();
  f.actor.update = async () => undefined;
  const input = f.start("coin", { dataset: { coin: "gp" } });
  assert.ok(input);
  input.value = "+3";
  input.fire("keydown", "Enter");
  await turn();
  assert.equal(f.nodes["[data-coin-input]"].value, "+3");
  assert.equal(warnings.length, 1);
  f.app._onClose({});
});
it("a deleted feature and lost ownership cannot submit a stale edit", async () => {
  for (const reason of ["deleted", "permission"]) {
    const f = fixture(),
      input = f.start("uses", { closest: () => ({ dataset: { itemId: "f" } }) });
    assert.ok(input);
    input.value = "2";
    if (reason === "deleted") f.actor.items.delete("f");
    else f.deny();
    input.fire("keydown", "Enter");
    await turn();
    assert.equal(
      f.writes.some((w) => w[0] === "item"),
      false,
    );
    assert.equal(warnings.length > 0, true);
    f.app._onClose({});
  }
});

it("a blank HP submission stays marked invalid after a replacement field mounts", async () => {
  const f = fixture(),
    input = f.start("hp");
  input.value = "   ";
  input.fire("keydown", "Enter");
  await turn();
  assert.equal(input.classes.has("is-invalid"), true);
  await f.app.render({ parts: ["rail"] });
  assert.equal(f.nodes["[data-hp-input]"].classes.has("is-invalid"), true);
  f.app._onClose({});
});
