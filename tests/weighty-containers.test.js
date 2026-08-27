import test from "node:test";
import assert from "node:assert/strict";

import {
  getContainerRulesConfig,
  getContainerWeightReductionPct,
  validateContainerDrop,
  WEIGHTY_CONTAINERS_MODULE_ID
} from "../scripts/integrations/weighty-containers.js";

test("Weighty Containers Integration: Reading container flags", () => {
  const container = {
    name: "Bag of Holding",
    flags: {
      [WEIGHTY_CONTAINERS_MODULE_ID]: {
        reductionPct: 100,
        allowedTypes: ["equipment", "weapon", "consumable"],
        forbiddenProperties: ["two"]
      }
    }
  };

  assert.equal(getContainerWeightReductionPct(container), 100);
  const config = getContainerRulesConfig(container);
  assert.equal(config.reductionPct, 100);
  assert.deepEqual(config.allowedTypes, ["equipment", "weapon", "consumable"]);
  assert.deepEqual(config.forbiddenProperties, ["two"]);
});

test("Weighty Containers Integration: Validating item drops against rules", () => {
  // Mock active game module
  globalThis.game = {
    modules: new Map([[WEIGHTY_CONTAINERS_MODULE_ID, { active: true }]])
  };

  const quiver = {
    name: "Quiver of Ehlonna",
    flags: {
      [WEIGHTY_CONTAINERS_MODULE_ID]: {
        allowedTypes: ["weapon"],
        forbiddenProperties: []
      }
    }
  };

  const bow = {
    name: "Longbow",
    type: "weapon",
    system: { properties: ["two"] }
  };

  const armor = {
    name: "Plate Armor",
    type: "equipment"
  };

  const validRes = validateContainerDrop(quiver, bow);
  assert.equal(validRes.ok, true);

  const invalidRes = validateContainerDrop(quiver, armor);
  assert.equal(invalidRes.ok, false);
  assert.match(invalidRes.reason, /does not allow item type/);

  // Clean mock
  delete globalThis.game;
});
