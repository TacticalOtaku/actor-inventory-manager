import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  WEIGHTY_CONTAINERS_MODULE_ID,
  getContainerLoad,
  getContainerRulesConfig,
  getContainerWeightReductionPct,
  getWeightyContainersApi,
  isWeightyContainersActive,
  parseTokenList,
  validateContainerDrop,
  watchContainerRules
} from "../scripts/integrations/weighty-containers.js";

/**
 * Stand in for a Foundry runtime with Weighty Containers active.
 * `api` is what the module publishes on its entry; `global` is the legacy
 * console handle older builds published instead.
 */
function stubRuntime({ active = true, api = null, global = null } = {}) {
  globalThis.game = {
    modules: { get: id => (id === WEIGHTY_CONTAINERS_MODULE_ID ? { active, api } : undefined) },
    i18n: { format: (key, data) => `${key}:${JSON.stringify(data)}`, localize: key => key }
  };
  if (global) globalThis.weightyCont = global;
}

afterEach(() => {
  delete globalThis.game;
  delete globalThis.weightyCont;
  delete globalThis.Hooks;
});

describe("module detection", () => {
  it("reports inactive when the module is missing", () => {
    globalThis.game = { modules: { get: () => undefined } };
    assert.equal(isWeightyContainersActive(), false);
    assert.equal(getWeightyContainersApi(), null);
  });

  it("prefers the module entry over the console handle", () => {
    const api = { apiVersion: 1, tag: "module-entry" };
    stubRuntime({ api, global: { apiVersion: 1, tag: "console" } });
    assert.equal(getWeightyContainersApi().tag, "module-entry");
  });

  it("falls back to the console handle for builds without a module api", () => {
    stubRuntime({ api: null, global: { apiVersion: 1, tag: "console" } });
    assert.equal(getWeightyContainersApi().tag, "console");
  });
});

describe("weight reduction", () => {
  it("asks the module first", () => {
    stubRuntime({ api: { getReductionPct: () => 40 } });
    assert.equal(getContainerWeightReductionPct({ flags: {} }), 40);
  });

  it("reads the flag when the module offers no helper", () => {
    stubRuntime({ api: {} });
    const container = { flags: { [WEIGHTY_CONTAINERS_MODULE_ID]: { reductionPct: 25 } } };
    assert.equal(getContainerWeightReductionPct(container), 25);
  });

  it("clamps nonsense to a sane range", () => {
    stubRuntime({ api: {} });
    const mk = pct => ({ flags: { [WEIGHTY_CONTAINERS_MODULE_ID]: { reductionPct: pct } } });
    assert.equal(getContainerWeightReductionPct(mk(-10)), 0);
    assert.equal(getContainerWeightReductionPct(mk(500)), 100);
    assert.equal(getContainerWeightReductionPct(mk("nope")), 0);
  });

  it("survives a module helper that throws", () => {
    stubRuntime({ api: { getReductionPct: () => { throw new Error("boom"); } } });
    const container = { flags: { [WEIGHTY_CONTAINERS_MODULE_ID]: { reductionPct: 15 } } };
    assert.equal(getContainerWeightReductionPct(container), 15);
  });
});

describe("container load", () => {
  it("passes the module's numbers straight through", () => {
    const expected = { load: 10, capacity: 20, unit: "kg", pct: 50, isOver: false, hasCapacity: true };
    stubRuntime({ api: { getContainerLoad: () => expected } });
    assert.deepEqual(getContainerLoad({}, "bag"), expected);
  });

  it("returns null when the module is too old to provide it", () => {
    stubRuntime({ api: {} });
    assert.equal(getContainerLoad({}, "bag"), null);
  });

  it("returns null instead of propagating a module failure", () => {
    stubRuntime({ api: { getContainerLoad: () => { throw new Error("boom"); } } });
    assert.equal(getContainerLoad({}, "bag"), null);
  });
});

describe("parseTokenList", () => {
  it("accepts arrays and delimited strings alike", () => {
    // Weighty Containers stores restrictions in either shape.
    assert.deepEqual(parseTokenList(["Weapon", " Armor "]), ["weapon", "armor"]);
    assert.deepEqual(parseTokenList("weapon, armor;tool\nloot"), ["weapon", "armor", "tool", "loot"]);
    assert.deepEqual(parseTokenList(""), []);
    assert.deepEqual(parseTokenList(null), []);
  });
});

describe("drop validation", () => {
  it("allows everything when the module is inactive", () => {
    stubRuntime({ active: false });
    assert.deepEqual(validateContainerDrop({ name: "Bag" }, { name: "Sword" }), { ok: true });
  });

  it("delegates to the module's own validator", () => {
    stubRuntime({ api: { validateContainerRestrictions: () => ({ ok: false, reason: "type" }) } });
    const result = validateContainerDrop({ name: "Quiver" }, { name: "Sword", type: "weapon" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "type");
    // The module returns a code; the player sees a sentence, not "type".
    assert.ok(result.reason.startsWith("AIM.containers.typeNotAllowed:"));
    assert.ok(result.reason.includes("Quiver"));
  });

  it("matches subtypes against base item and identifier like the module does", () => {
    stubRuntime({ api: {} });
    const quiver = {
      name: "Quiver",
      flags: { [WEIGHTY_CONTAINERS_MODULE_ID]: { allowedSubtypes: "arrow" } }
    };
    const arrows = { name: "Arrows", type: "consumable", system: { type: { value: "ammo", subtype: "arrow" } } };
    const bolts = { name: "Bolts", type: "consumable", system: { type: { value: "ammo", subtype: "crossbowBolt" } } };
    assert.equal(validateContainerDrop(quiver, arrows).ok, true);
    assert.equal(validateContainerDrop(quiver, bolts).code, "subtype");
  });

  it("honours string-shaped restriction flags in the local fallback", () => {
    // The old adapter only accepted arrays, so string flags silently disabled
    // every restriction.
    stubRuntime({ api: {} });
    const container = {
      name: "Quiver",
      flags: { [WEIGHTY_CONTAINERS_MODULE_ID]: { allowedTypes: "consumable, loot" } }
    };
    assert.equal(validateContainerDrop(container, { name: "Sword", type: "weapon" }).ok, false);
    assert.equal(validateContainerDrop(container, { name: "Arrow", type: "consumable" }).ok, true);
  });

  it("applies required-property match modes", () => {
    stubRuntime({ api: {} });
    const mk = mode => ({
      name: "Reliquary",
      flags: {
        [WEIGHTY_CONTAINERS_MODULE_ID]: { requiredProperties: "mgc, foc", propertyMatchMode: mode }
      }
    });
    const partial = { name: "Wand", type: "equipment", system: { properties: new Set(["mgc"]) } };

    assert.equal(validateContainerDrop(mk("all"), partial).ok, false);
    assert.equal(validateContainerDrop(mk("any"), partial).ok, true);
  });

  it("rejects forbidden properties", () => {
    stubRuntime({ api: {} });
    const container = {
      name: "Bag",
      flags: { [WEIGHTY_CONTAINERS_MODULE_ID]: { forbiddenProperties: ["mgc"] } }
    };
    const magic = { name: "Wand", type: "equipment", system: { properties: new Set(["mgc"]) } };
    assert.equal(validateContainerDrop(container, magic).ok, false);
  });

  it("allows anything through a container with no rules", () => {
    stubRuntime({ api: {} });
    const container = { name: "Sack", flags: { [WEIGHTY_CONTAINERS_MODULE_ID]: {} } };
    assert.equal(validateContainerDrop(container, { name: "Sword", type: "weapon" }).ok, true);
  });
});

describe("rules config", () => {
  it("normalizes flags into token lists", () => {
    stubRuntime({ api: {} });
    const container = {
      flags: {
        [WEIGHTY_CONTAINERS_MODULE_ID]: {
          reductionPct: 30,
          allowedTypes: "weapon,loot",
          propertyMatchMode: "any"
        }
      }
    };
    const config = getContainerRulesConfig(container);
    assert.deepEqual(config.allowedTypes, ["weapon", "loot"]);
    assert.equal(config.propertyMatchMode, "any");
    assert.equal(config.reductionPct, 30);
  });

  it("returns null for a container the module never touched", () => {
    stubRuntime({ api: {} });
    assert.equal(getContainerRulesConfig({ flags: {} }), null);
  });
});

describe("watchContainerRules", () => {
  it("subscribes to the module's own hook", () => {
    const registered = [];
    globalThis.Hooks = { on: (name, fn) => { registered.push([name, fn]); return 7; } };
    const fn = () => {};
    assert.equal(watchContainerRules(fn), 7);
    assert.deepEqual(registered, [[`${WEIGHTY_CONTAINERS_MODULE_ID}.updateContainerRules`, fn]]);
  });

  it("is a no-op outside Foundry", () => {
    assert.equal(watchContainerRules(() => {}), null);
  });
});
