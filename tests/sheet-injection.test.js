import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { LOG } from "../scripts/foundry/logger.js";

LOG.setLevel("none");

class ActorSheetV2 {}

// The UI modules build their application classes when imported.
globalThis.foundry = {
  applications: {
    api: { ApplicationV2: class {}, HandlebarsApplicationMixin: Base => class extends Base {}, DialogV2: {} },
    sheets: { ActorSheetV2 }
  },
  utils: {}
};

const { addInventoryHeaderControl } = await import("../scripts/foundry/sheet-injection.js");

let showSheetButton;
beforeEach(() => {
  showSheetButton = true;
  globalThis.game = {
    user: { isGM: true },
    settings: { get: (module, key) => (key === "showSheetButton" ? showSheetButton : undefined) },
    i18n: { localize: key => `L:${key}` }
  };
});
afterEach(() => {
  delete globalThis.game;
});

function characterSheet() {
  const sheet = new ActorSheetV2();
  sheet.id = "CharacterActorSheet-Actor-abc";
  sheet.options = { classes: ["dnd5e2", "sheet", "actor", "character"] };
  sheet.document = { documentName: "Actor", type: "character", hasPlayerOwner: true };
  return sheet;
}

describe("addInventoryHeaderControl", () => {
  it("puts one inventory entry at the top of an actor sheet's menu", () => {
    const controls = [{ action: "configureSheet", icon: "fa-solid fa-gear", label: "Configure" }];
    const sheet = characterSheet();
    addInventoryHeaderControl(sheet, controls);
    addInventoryHeaderControl(sheet, controls);
    assert.equal(controls.length, 2);
    assert.equal(controls[0].action, "aim-inventory");
    assert.equal(controls[0].label, "L:AIM.sheetButton.label");
    assert.equal(typeof controls[0].onClick, "function");
  });

  it("leaves the menu alone when the sheet button is turned off", () => {
    showSheetButton = false;
    const controls = [];
    addInventoryHeaderControl(characterSheet(), controls);
    assert.deepEqual(controls, []);
  });

  it("ignores windows that are not a character's own sheet", () => {
    const config = characterSheet();
    config.constructor = class ActorSheetConfig {};
    const inventory = characterSheet();
    inventory.options.classes.push("actor-inventory-manager-app");
    for (const app of [config, inventory]) {
      const controls = [];
      addInventoryHeaderControl(app, controls);
      assert.deepEqual(controls, []);
    }
  });
});
