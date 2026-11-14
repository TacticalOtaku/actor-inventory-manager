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

const {
  addInventoryHeaderControl,
  registerSheetInjectionHooks,
  renderVanillaActorSheet,
  shouldRedirectActorSheetOpen
} = await import("../scripts/foundry/sheet-injection.js");

let showSheetButton;
let replaceActorSheet;
const originalFoundry = globalThis.foundry;

beforeEach(() => {
  showSheetButton = true;
  replaceActorSheet = true;
  globalThis.Hooks = { on: () => {} };
  globalThis.game = {
    user: { isGM: true },
    modules: new Map(),
    settings: {
      get: (_module, key) => ({ showSheetButton, replaceActorSheet })[key]
    },
    i18n: { localize: key => `L:${key}` }
  };
});
afterEach(() => {
  delete globalThis.game;
  delete globalThis.Hooks;
  delete globalThis.libWrapper;
  globalThis.foundry = originalFoundry;
});

function characterSheet({
  SheetClass = ActorSheetV2,
  type = "character",
  hasPlayerOwner = true,
  canObserve = true,
  isOwner = true,
  classes = ["dnd5e2", "sheet", "actor", type]
} = {}) {
  const sheet = new SheetClass();
  sheet.id = `${type === "npc" ? "NPCActorSheet" : type === "vehicle" ? "VehicleActorSheet" : "CharacterActorSheet"}-Actor-abc`;
  sheet.options = { classes: [...classes] };
  sheet.document = {
    documentName: "Actor",
    type,
    hasPlayerOwner,
    isOwner,
    testUserPermission: (_user, level) => (level === "OBSERVER" ? canObserve : isOwner)
  };
  sheet.actor = sheet.document;
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
    inventory.options.classes.push("aim-window");
    for (const app of [config, inventory]) {
      const controls = [];
      addInventoryHeaderControl(app, controls);
      assert.deepEqual(controls, []);
    }
  });
});

function setupSheetClasses() {
  const vanillaCalls = [];
  class TestActorSheetV2 {
    async render(options) {
      vanillaCalls.push({ sheet: this, options });
      return this;
    }
  }
  class TestActorSheetV1 {
    render(force, options) {
      vanillaCalls.push({ sheet: this, force, options, v1: true });
      return this;
    }
  }
  globalThis.foundry = {
    ...originalFoundry,
    applications: {
      ...originalFoundry.applications,
      sheets: { ActorSheetV2: TestActorSheetV2 }
    },
    appv1: {
      sheets: { ActorSheet: TestActorSheetV1 }
    }
  };
  return { TestActorSheetV2, TestActorSheetV1, vanillaCalls };
}

describe("non-GM actor sheet redirect", () => {
  it("redirects forced player sheet opens (object and boolean) to AIM instead of vanilla render", async () => {
    const { TestActorSheetV2, vanillaCalls } = setupSheetClasses();
    const openedActors = [];
    game.user = { isGM: false };
    registerSheetInjectionHooks({ openWindow: actor => { openedActors.push(actor); return { actor }; } });

    const charSheet = characterSheet({ SheetClass: TestActorSheetV2 });
    const npcSheet = characterSheet({ SheetClass: TestActorSheetV2, type: "npc", hasPlayerOwner: true });
    const vehicleSheet = characterSheet({ SheetClass: TestActorSheetV2, type: "vehicle" });

    assert.equal(await charSheet.render({ force: true }), charSheet);
    assert.equal(await npcSheet.render(true), npcSheet);
    assert.equal(await vehicleSheet.render({ force: true }), vehicleSheet);

    assert.deepEqual(openedActors, [charSheet.document, npcSheet.document, vehicleSheet.document]);
    assert.deepEqual(vanillaCalls, []);
  });

  it("never redirects GM actions even when the setting is enabled", async () => {
    const { TestActorSheetV2, TestActorSheetV1, vanillaCalls } = setupSheetClasses();
    const openedActors = [];
    game.user = { isGM: true };
    registerSheetInjectionHooks({ openWindow: actor => { openedActors.push(actor); return { actor }; } });

    const v2Sheet = characterSheet({ SheetClass: TestActorSheetV2 });
    const v1Sheet = characterSheet({ SheetClass: TestActorSheetV1 });
    await v2Sheet.render({ force: true });
    v1Sheet.render(true);

    assert.deepEqual(openedActors, []);
    assert.equal(vanillaCalls.length, 2);
  });

  it("respects the replaceActorSheet client setting when turned off", async () => {
    const { TestActorSheetV2, vanillaCalls } = setupSheetClasses();
    const openedActors = [];
    game.user = { isGM: false };
    replaceActorSheet = false;
    registerSheetInjectionHooks({ openWindow: actor => { openedActors.push(actor); return { actor }; } });

    const sheet = characterSheet({ SheetClass: TestActorSheetV2 });
    await sheet.render({ force: true });

    assert.deepEqual(openedActors, []);
    assert.equal(vanillaCalls.length, 1);
  });

  it("allows explicit renderVanillaActorSheet calls (including async subclass renders) and restores redirect afterward", async () => {
    const { TestActorSheetV2, vanillaCalls } = setupSheetClasses();
    class AsyncCustomSheet extends TestActorSheetV2 {
      async render(options) {
        await Promise.resolve();
        return super.render(options);
      }
    }
    const openedActors = [];
    game.user = { isGM: false };
    registerSheetInjectionHooks({ openWindow: actor => { openedActors.push(actor); return { actor }; } });

    const sheet = characterSheet({ SheetClass: AsyncCustomSheet });
    await renderVanillaActorSheet(sheet, { force: true });

    assert.equal(vanillaCalls.length, 1);
    assert.deepEqual(openedActors, []);

    await sheet.render({ force: true });
    assert.equal(openedActors.length, 1);
    assert.equal(vanillaCalls.length, 1);
  });

  it("leaves non-forced re-renders and already-rendered vanilla sheets untouched", async () => {
    const { TestActorSheetV2, vanillaCalls } = setupSheetClasses();
    const openedActors = [];
    game.user = { isGM: false };
    registerSheetInjectionHooks({ openWindow: actor => { openedActors.push(actor); return { actor }; } });

    const closedSheet = characterSheet({ SheetClass: TestActorSheetV2 });
    await closedSheet.render();
    await closedSheet.render(false);
    await closedSheet.render({ parts: ["inventory"] });

    const openByFlag = characterSheet({ SheetClass: TestActorSheetV2 });
    openByFlag.rendered = true;
    await openByFlag.render({ force: true });

    const openByState = characterSheet({ SheetClass: TestActorSheetV2 });
    openByState.state = 2;
    await openByState.render({ force: true });

    assert.deepEqual(openedActors, []);
    assert.equal(vanillaCalls.length, 5);
  });

  it("never redirects unsupported actors, insufficient permissions, or auxiliary dialogs/configs", async () => {
    const { TestActorSheetV2, vanillaCalls } = setupSheetClasses();
    const openedActors = [];
    game.user = { isGM: false };
    registerSheetInjectionHooks({ openWindow: actor => { openedActors.push(actor); return { actor }; } });

    const gmNpc = characterSheet({ SheetClass: TestActorSheetV2, type: "npc", hasPlayerOwner: false });
    const group = characterSheet({ SheetClass: TestActorSheetV2, type: "group" });
    const limited = characterSheet({ SheetClass: TestActorSheetV2, canObserve: false, isOwner: false });
    const config = characterSheet({ SheetClass: TestActorSheetV2 });
    config.constructor = class ActorSheetConfig extends TestActorSheetV2 {};
    const aimWindow = characterSheet({ SheetClass: TestActorSheetV2 });
    aimWindow.options.classes.push("aim-window");

    for (const app of [gmNpc, group, limited, config, aimWindow]) {
      await app.render({ force: true });
    }

    assert.deepEqual(openedActors, []);
    assert.equal(vanillaCalls.length, 5);
  });

  it("falls back to original render when openWindow returns null", async () => {
    const { TestActorSheetV2, vanillaCalls } = setupSheetClasses();
    game.user = { isGM: false };
    registerSheetInjectionHooks({ openWindow: () => null });

    const sheet = characterSheet({ SheetClass: TestActorSheetV2 });
    await sheet.render({ force: true });

    assert.equal(vanillaCalls.length, 1);
  });

  it("integrates with libWrapper MIXED mode when active and handles AppV1 synchronously", async () => {
    const { TestActorSheetV2, TestActorSheetV1, vanillaCalls } = setupSheetClasses();
    const registrations = [];
    const openedActors = [];
    game.user = { isGM: false };
    game.modules.set("lib-wrapper", { active: true });
    globalThis.libWrapper = {
      register: (moduleId, target, fn, type) => {
        registrations.push({ moduleId, target, type });
        const parts = target.split(".");
        const method = parts.pop();
        let owner = globalThis;
        for (const key of parts) owner = owner[key];
        const wrapped = owner[method];
        owner[method] = function (...args) {
          return fn.call(this, (...inner) => wrapped.apply(this, inner), ...args);
        };
      }
    };

    registerSheetInjectionHooks({ openWindow: actor => { openedActors.push(actor); return { actor }; } });
    registerSheetInjectionHooks({ openWindow: actor => { openedActors.push(actor); return { actor }; } });

    assert.equal(registrations.length, 2);
    assert.deepEqual(registrations.map(entry => entry.target), [
      "foundry.applications.sheets.ActorSheetV2.prototype.render",
      "foundry.appv1.sheets.ActorSheet.prototype.render"
    ]);
    assert.ok(registrations.every(entry => entry.moduleId === "actor-inventory-manager" && entry.type === "MIXED"));

    const v2Sheet = characterSheet({ SheetClass: TestActorSheetV2 });
    const v1Sheet = characterSheet({ SheetClass: TestActorSheetV1 });
    assert.equal(await v2Sheet.render({ force: true }), v2Sheet);
    assert.equal(v1Sheet.render(true), v1Sheet);
    assert.equal(openedActors.length, 2);
    assert.equal(vanillaCalls.length, 0);

    game.user = { isGM: true };
    assert.equal(await v2Sheet.render({ force: true }), v2Sheet);
    assert.equal(v1Sheet.render(true), v1Sheet);
    assert.equal(vanillaCalls.length, 2);
  });

  it("falls back to direct prototype wrap when libWrapper registration throws", async () => {
    const { TestActorSheetV2, vanillaCalls } = setupSheetClasses();
    const openedActors = [];
    game.user = { isGM: false };
    game.modules.set("lib-wrapper", { active: true });
    globalThis.libWrapper = {
      register: () => {
        throw new Error("boom");
      }
    };

    registerSheetInjectionHooks({ openWindow: actor => { openedActors.push(actor); return { actor }; } });

    const sheet = characterSheet({ SheetClass: TestActorSheetV2 });
    await sheet.render({ force: true });
    assert.equal(openedActors.length, 1);
    assert.equal(vanillaCalls.length, 0);
  });

  it("exposes shouldRedirectActorSheetOpen predicate for direct checks", () => {
    const { TestActorSheetV2 } = setupSheetClasses();
    game.user = { isGM: false };
    const sheet = characterSheet({ SheetClass: TestActorSheetV2 });
    assert.equal(shouldRedirectActorSheetOpen(sheet, { force: true }), true);
    assert.equal(shouldRedirectActorSheetOpen(sheet, false), false);
    game.user = { isGM: true };
    assert.equal(shouldRedirectActorSheetOpen(sheet, { force: true }), false);
  });
});
