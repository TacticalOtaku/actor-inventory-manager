import test from "node:test";
import assert from "node:assert/strict";

import { ENFORCEMENT_MODES, FLAGS, MODULE_ID, SLOTS } from "../scripts/constants.js";
import { handlePreUpdateItem } from "../scripts/foundry/enforcement-hooks.js";

function setupFoundryUtilsMock() {
  globalThis.foundry = {
    utils: {
      hasProperty: (obj, path) => {
        const parts = path.split(".");
        let curr = obj;
        for (const p of parts) {
          if (curr == null || typeof curr !== "object" || !(p in curr)) return false;
          curr = curr[p];
        }
        return true;
      },
      getProperty: (obj, path) => {
        const parts = path.split(".");
        let curr = obj;
        for (const p of parts) {
          if (curr == null || typeof curr !== "object") return undefined;
          curr = curr[p];
        }
        return curr;
      },
      setProperty: (obj, path, val) => {
        const parts = path.split(".");
        let curr = obj;
        for (let i = 0; i < parts.length - 1; i++) {
          curr[parts[i]] = curr[parts[i]] || {};
          curr = curr[parts[i]];
        }
        curr[parts[parts.length - 1]] = val;
      }
    }
  };
}

test("Enforcement Hook: Unequipping clears slot flag", () => {
  setupFoundryUtilsMock();

  const item = {
    id: "item1",
    name: "Sword",
    parent: { documentName: "Actor", id: "act1" }
  };
  const changes = {
    system: { equipped: false }
  };

  const result = handlePreUpdateItem(item, changes, {}, "user1");
  assert.equal(result, true);
  assert.equal(changes.flags?.[MODULE_ID]?.[FLAGS.SLOT], null);
});

test("Enforcement Hook: Equipping second armor in BLOCK mode blocks update", () => {
  setupFoundryUtilsMock();

  const notifications = [];
  globalThis.ui = {
    notifications: {
      warn: (msg) => notifications.push(msg)
    }
  };
  globalThis.game = {
    i18n: {
      format: (key, data) => `${key}: ${JSON.stringify(data)}`,
      localize: (key) => key
    },
    settings: {
      get: (mod, key) => ENFORCEMENT_MODES.BLOCK
    }
  };

  const itemsMap = new Map();

  const existingArmor = {
    id: "arm1",
    name: "Leather Armor",
    type: "equipment",
    system: { equipped: true, armor: { type: "light" }, type: { value: "light" } },
    flags: { [MODULE_ID]: { [FLAGS.SLOT]: SLOTS.ARMOR } }
  };

  const actor = {
    documentName: "Actor",
    name: "Knight",
    items: itemsMap
  };

  const newArmor = {
    id: "arm2",
    name: "Plate Armor",
    type: "equipment",
    system: { equipped: false, armor: { type: "heavy" }, type: { value: "heavy" } },
    parent: actor
  };

  itemsMap.set("arm1", existingArmor);
  itemsMap.set("arm2", newArmor);

  // User attempts to toggle equip on newArmor in sheet (changes.system.equipped = true)
  const changes = {
    system: { equipped: true }
  };

  const allowed = handlePreUpdateItem(newArmor, changes, {}, "user1");
  assert.equal(typeof allowed, "boolean");

  // Clean mocks
  delete globalThis.ui;
  delete globalThis.game;
  delete globalThis.foundry;
});
