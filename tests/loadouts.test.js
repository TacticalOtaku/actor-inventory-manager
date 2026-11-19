import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { AIM_EQUIP_OPTION, ENFORCEMENT_MODES, FLAGS, MODULE_ID } from "../scripts/constants.js";
import { LOG } from "../scripts/foundry/logger.js";
LOG.setLevel("none");

import { equipmentRuleEngine } from "../scripts/core/equipment-rules.js";
import {
  DEFAULT_LOADOUT_ICON,
  MAX_LOADOUTS,
  captureLoadout,
  detectActiveLoadoutId,
  normalizeLoadouts,
  planLoadoutApply,
  removeLoadout,
  summarizeLoadout,
  upsertLoadout
} from "../scripts/core/loadouts.js";
import { EquipService } from "../scripts/foundry/equipment.js";
import {
  applyActorLoadout,
  deleteActorLoadout,
  getActorLoadouts,
  renameActorLoadout,
  saveActorLoadout
} from "../scripts/foundry/loadouts.js";

function makeActor(items = [], { canEdit = true } = {}) {
  const actor = {
    id: "hero",
    uuid: "Actor.hero",
    documentName: "Actor",
    type: "character",
    name: "Hero",
    hasPlayerOwner: true,
    flags: {},
    items: new Map(),
    calls: [],
    veto: new Set(),
    refuse: false,
    testUserPermission: () => canEdit,
    getFlag(mod, key) {
      return this.flags?.[mod]?.[key];
    },
    async setFlag(mod, key, value) {
      this.flags[mod] ??= {};
      this.flags[mod][key] = structuredClone(value);
      return this;
    },
    async updateEmbeddedDocuments(_type, updates, options = {}) {
      actor.calls.push({ updates, options });
      if (actor.refuse) return [];
      return updates.filter((u) => !actor.veto.has(u._id)).map((update) => {
        const item = actor.items.get(update._id);
        if (!item) return null;
        for (const [key, value] of Object.entries(update)) {
          if (key === "_id") continue;
          const parts = key.split(".");
          const last = parts.pop();
          const obj = parts.reduce((o, k) => (o[k] ??= {}), item);
          if (last.startsWith("-=")) delete obj[last.slice(2)];
          else obj[last] = value;
        }
        return item;
      }).filter(Boolean);
    }
  };
  for (const item of items) {
    item.parent = actor;
    item.flags ??= {};
    actor.items.set(item.id, item);
  }
  return actor;
}

const weapon = (id, props = [], { equipped = false, slot = null, value = "martialM", container = null } = {}) => ({
  id,
  name: id,
  type: "weapon",
  flags: slot ? { [MODULE_ID]: { [FLAGS.SLOT]: slot } } : {},
  system: { equipped, properties: new Set(props), type: { value }, container }
});

const shield = (id, { equipped = false, slot = null } = {}) => ({
  id,
  name: id,
  type: "equipment",
  flags: slot ? { [MODULE_ID]: { [FLAGS.SLOT]: slot } } : {},
  system: { equipped, type: { value: "shield" }, container: null }
});

const armor = (id, { equipped = false, slot = null, value = "heavy" } = {}) => ({
  id,
  name: id,
  type: "equipment",
  flags: slot ? { [MODULE_ID]: { [FLAGS.SLOT]: slot } } : {},
  system: { equipped, type: { value }, container: null }
});

const clothes = (id, name = "Traveler's Clothes", { equipped = false, slot = null } = {}) => ({
  id,
  name,
  type: "equipment",
  flags: slot ? { [MODULE_ID]: { [FLAGS.SLOT]: slot } } : {},
  system: { equipped, type: { value: "clothing" }, container: null }
});

describe("pure loadouts", () => {
  it("captures, upserts, enforces limit and detects active loadout", () => {
    const actor = makeActor([
      weapon("sword", [], { equipped: true, slot: "mainHand" }),
      shield("shield", { equipped: true, slot: "offHand" }),
      armor("plate", { equipped: true, slot: "armor" }),
      clothes("robe", "Traveler's Clothes", { equipped: true }),
      weapon("claws", [], { equipped: true, value: "natural" }),
      { id: "arrows", name: "Arrows", type: "consumable", flags: {}, system: { equipped: true, type: { value: "ammo" } } },
      { id: "pack", name: "Backpack", type: "container", flags: {}, system: { equipped: true } }
    ]);

    const melee = captureLoadout(actor, { id: "melee", name: "  Sword & Shield  ", icon: "fa-shield-halved", now: 100 });
    assert.equal(melee.name, "Sword & Shield");
    assert.deepEqual(melee.slots, { mainHand: "sword", offHand: "shield", armor: "plate" });
    assert.deepEqual(melee.slotless, ["robe"]);

    assert.equal(detectActiveLoadoutId(actor, [melee]), "melee");

    // Blank name rejected
    assert.equal(upsertLoadout([], { id: "x", name: "   " }).code, "NAME");

    // Max limit enforced
    let list = [];
    for (let i = 0; i < MAX_LOADOUTS; i++) {
      const res = upsertLoadout(list, { id: `l${i}`, name: `Set ${i}`, icon: DEFAULT_LOADOUT_ICON });
      assert.equal(res.ok, true);
      list = res.loadouts;
    }
    assert.equal(upsertLoadout(list, { id: "extra", name: "Overflow" }).code, "LIMIT");
    // Updating existing still succeeds at limit
    assert.equal(upsertLoadout(list, { id: "l0", name: "Updated Set 0" }).ok, true);
    assert.equal(removeLoadout(list, "l0").length, MAX_LOADOUTS - 1);

    // Corrupt stored records are dropped safely
    assert.equal(normalizeLoadouts([null, { id: "", name: "x" }, { id: "a", name: "Valid", icon: "invalid-ico", slots: { mainHand: "sword" } }])[0].icon, DEFAULT_LOADOUT_ICON);
  });

  it("switches Sword + Shield <-> 2H Longbow without touching unchanged armor or containers", () => {
    const actor = makeActor([
      weapon("sword", [], { equipped: true, slot: "mainHand" }),
      shield("shield", { equipped: true, slot: "offHand" }),
      armor("plate", { equipped: true, slot: "armor" }),
      weapon("bow", ["two"], { equipped: false, container: "pack" }),
      { id: "pack", name: "Backpack", type: "container", flags: {}, system: { equipped: true } },
      weapon("claws", [], { equipped: true, value: "natural" }),
      { id: "arrows", name: "Arrows", type: "consumable", flags: {}, system: { equipped: true, type: { value: "ammo" } } }
    ]);

    const bowSet = {
      id: "bow",
      name: "Longbow",
      icon: "fa-crosshairs",
      slots: { mainHand: "bow", armor: "plate" },
      slotless: []
    };

    const plan = planLoadoutApply(actor, bowSet, { now: 500 });
    assert.equal(plan.refusal, null);
    assert.deepEqual(plan.missing, []);
    // Unequips sword + shield first, then equips bow (clearing container); plate, pack, claws, arrows stay untouched!
    assert.deepEqual(plan.updates.map((u) => [u._id, u["system.equipped"], u[`flags.${MODULE_ID}.${FLAGS.SLOT}`]]), [
      ["sword", false, null],
      ["shield", false, null],
      ["bow", true, "mainHand"]
    ]);
    assert.equal(plan.updates[2]["system.container"], null);
  });

  it("switches to camp clothes (slotless) while taking off armor and skipping missing items", () => {
    const actor = makeActor([
      armor("plate", { equipped: true, slot: "armor" }),
      clothes("camp", "Traveler's Clothes", { equipped: false })
    ]);

    const campSet = {
      id: "camp",
      name: "Camp",
      icon: "fa-campfire",
      slots: { mainHand: "deleted-staff" },
      slotless: ["camp", "deleted-cloak"]
    };

    const summary = summarizeLoadout(actor, campSet);
    assert.equal(summary.count, 1);
    assert.equal(summary.missingCount, 2);

    const plan = planLoadoutApply(actor, campSet, { now: 500 });
    assert.equal(plan.refusal, null);
    assert.equal(plan.missing.length, 2);
    assert.deepEqual(plan.updates, [
      { _id: "plate", "system.equipped": false, [`flags.${MODULE_ID}.${FLAGS.SLOT}`]: null },
      { _id: "camp", "system.equipped": true, [`flags.${MODULE_ID}.${FLAGS.SLOT}`]: null }
    ]);
  });

  it("respects enforcement modes (block / auto_swap / warn) when a loadout contains conflicting gear", () => {
    const actor = makeActor([
      weapon("greatsword", ["two"], { equipped: false }),
      shield("shield", { equipped: false })
    ]);
    const invalidSet = {
      id: "bad",
      name: "Invalid",
      slots: { mainHand: "greatsword", offHand: "shield" },
      slotless: []
    };

    const blocked = planLoadoutApply(actor, invalidSet, { mode: ENFORCEMENT_MODES.BLOCK });
    assert.equal(blocked.refusal?.code, "OFFHAND_BLOCKED_BY_2H");
    assert.deepEqual(blocked.updates, []);

    const autoSwapped = planLoadoutApply(actor, invalidSet, { mode: ENFORCEMENT_MODES.AUTO_SWAP, now: 1 });
    assert.equal(autoSwapped.refusal, null);
    assert.deepEqual(autoSwapped.updates.map((u) => u._id), ["shield"]);

    const warned = planLoadoutApply(actor, invalidSet, { mode: ENFORCEMENT_MODES.WARN, now: 1 });
    assert.equal(warned.refusal, null);
    assert.equal(warned.warnings.length, 1);
    assert.deepEqual(warned.updates.map((u) => u._id), ["greatsword", "shield"]);
  });

  it("honors custom equipmentRuleEngine rules in planLoadoutApply", () => {
    equipmentRuleEngine.registerRule({
      id: "test-no-curse-with-holy",
      name: "Test Conflict",
      validate: (_actor, item, _slotId, slotMap) => {
        if (item.id === "cursed" && [...slotMap.values()].some((i) => i.id === "holy")) {
          return { valid: false, error: "Holy repels Cursed", code: "HOLY_CONFLICT", conflictItem: [...slotMap.values()].find((i) => i.id === "holy") };
        }
        return { valid: true };
      }
    });
    const actor = makeActor([weapon("holy"), weapon("cursed")]);
    const bad = { id: "c", name: "Clash", slots: { mainHand: "holy", offHand: "cursed" }, slotless: [] };
    const res = planLoadoutApply(actor, bad, { mode: ENFORCEMENT_MODES.BLOCK });
    assert.equal(res.refusal?.code, "HOLY_CONFLICT");
    equipmentRuleEngine.registerDefaultRules();
  });
});

describe("EquipService.applyLoadout & foundry/loadouts", () => {
  let warns;
  beforeEach(() => {
    warns = [];
    globalThis.game = {
      user: { id: "p", isGM: false },
      settings: { get: () => ENFORCEMENT_MODES.BLOCK },
      i18n: { localize: (k) => k, format: (k) => k }
    };
    globalThis.ui = { notifications: { warn: (m) => warns.push(m) } };
    globalThis.foundry = { utils: { randomID: () => "ld_test1" } };
  });
  afterEach(() => {
    delete globalThis.game;
    delete globalThis.ui;
    delete globalThis.foundry;
  });

  it("saves, renames, switches with AIM_EQUIP_OPTION, skips no-op switches, and deletes", async () => {
    const actor = makeActor([
      weapon("sword", [], { equipped: true, slot: "mainHand" }),
      shield("shield", { equipped: true, slot: "offHand" }),
      weapon("bow", ["two"], { equipped: false })
    ]);

    const savedMelee = await saveActorLoadout(actor, { name: "Melee" });
    assert.equal(savedMelee.id, "ld_test1");
    assert.equal(getActorLoadouts(actor).length, 1);

    // Switch manually to bow, save second loadout
    actor.items.get("sword").system.equipped = false;
    actor.items.get("sword").flags[MODULE_ID][FLAGS.SLOT] = null;
    actor.items.get("shield").system.equipped = false;
    actor.items.get("shield").flags[MODULE_ID][FLAGS.SLOT] = null;
    actor.items.get("bow").system.equipped = true;
    actor.items.get("bow").flags[MODULE_ID] = { [FLAGS.SLOT]: "mainHand" };

    globalThis.foundry.utils.randomID = () => "ld_test2";
    await saveActorLoadout(actor, { name: "Ranged", icon: "fa-crosshairs" });
    await renameActorLoadout(actor, "ld_test2", { name: "Bow" });
    assert.equal(getActorLoadouts(actor)[1].name, "Bow");

    // Apply Melee by name
    const ok = await applyActorLoadout(actor, "melee");
    assert.equal(ok, true);
    assert.equal(actor.calls.length, 1);
    assert.equal(actor.calls[0].options[AIM_EQUIP_OPTION], true);
    assert.equal(actor.items.get("sword").system.equipped, true);
    assert.equal(actor.items.get("shield").system.equipped, true);
    assert.equal(actor.items.get("bow").system.equipped, false);

    // Re-applying already active Melee writes nothing
    assert.equal(await applyActorLoadout(actor, "ld_test1"), true);
    assert.equal(actor.calls.length, 1);

    assert.equal(await deleteActorLoadout(actor, "ld_test2"), true);
    assert.equal(getActorLoadouts(actor).length, 1);
  });

  it("rolls back a partially vetoed loadout application", async () => {
    const actor = makeActor([
      weapon("sword", [], { equipped: true, slot: "mainHand" }),
      weapon("bow", ["two"], { equipped: false })
    ]);
    actor.veto.add("bow");

    const res = await EquipService.applyLoadout(actor, {
      id: "ranged",
      name: "Ranged",
      slots: { mainHand: "bow" },
      slotless: []
    });
    assert.equal(res.ok, false);
    assert.equal(res.partial, false);
    // Sword should be restored back to equipped + mainHand
    assert.equal(actor.items.get("sword").system.equipped, true);
    assert.equal(actor.items.get("sword").flags[MODULE_ID][FLAGS.SLOT], "mainHand");
    assert.equal(actor.items.get("bow").system.equipped, false);
  });
});
