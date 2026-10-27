import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { accentFromLegacy, themeFromLegacy } from "../scripts/core/actor-window.js";
import {
  MIGRATION_VERSION,
  isLegacyNonSlot,
  lookFromLegacy,
  needsMigration,
  ownDollPreset,
  ownDollPresetId,
  presetFromTemplate,
  quickSlotFavorites,
  tradesToCancel,
  worthReporting
} from "../scripts/core/migration.js";

describe("1.9 → 2.0 migration (ADR 0005)", () => {
  it("runs until it has finished without failures", () => {
    assert.equal(needsMigration(undefined), true);
    assert.equal(needsMigration("1.9.1"), true);
    assert.equal(needsMigration(MIGRATION_VERSION), false);
  });

  it("reads attunement and quick slots as no slot, ordinary slots as they were", () => {
    assert.deepEqual(["attunement1", "attunement3", "quick1", "quick4"].map(isLegacyNonSlot), [true, true, true, true]);
    assert.deepEqual(["mainHand", "ring1", "head", null, undefined].map(isLegacyNonSlot), [false, false, false, false, false]);
  });

  it("turns quick slots into item favorites in slot order, without doubling", () => {
    const items = [{ id: "c", slot: "quick3" }, { id: "a", slot: "quick1" }, { id: "r", slot: "ring1" }, { id: "b", slot: "quick2" }];
    assert.deepEqual(quickSlotFavorites(items), [{ type: "item", id: ".Item.a" }, { type: "item", id: ".Item.b" }, { type: "item", id: ".Item.c" }]);
    assert.deepEqual(quickSlotFavorites(items, [{ type: "item", id: ".Item.b" }]).map((f) => f.id), [".Item.a", ".Item.c"]);
    assert.deepEqual(quickSlotFavorites([{ id: "x", slot: "head" }]), []);
  });

  it("gives a 1.9 world template the humanoid figure once", () => {
    const old = { id: "t1", name: "Плащ и кинжал", slots: [{ id: "head" }] };
    assert.deepEqual(presetFromTemplate(old), { ...old, figure: "human" });
    assert.equal(presetFromTemplate({ ...old, figure: "beast" }), null);
    assert.equal(presetFromTemplate(null), null);
  });

  it("makes an actor's own doll a named world preset with a stable id", () => {
    const doll = { templateName: "Своя", slots: [{ id: "neck" }], attunementMax: 2 };
    const made = ownDollPreset("abc", doll, "Своя кукла: Аот");
    assert.deepEqual(made, { ...doll, id: "own-abc", name: "Своя кукла: Аот", figure: "human", isPreset: false });
    assert.equal(ownDollPresetId("abc"), made.id);
    assert.equal(ownDollPreset("abc", { ...doll, figure: "beast" }, "x").figure, "beast");
  });

  it("cancels open trades and leaves executing, recovery and finished ones", () => {
    const sessions = ["open", "executing", "recovery", "complete", "cancelled", "open"].map((status, i) => ({ id: `s${i}`, status }));
    assert.deepEqual(tradesToCancel(sessions).map((s) => s.id), ["s0", "s5"]);
    assert.deepEqual(tradesToCancel(undefined), []);
  });

  it("moves a device's 1.9 theme and accent to the user only where the user has none", () => {
    const map = { theme: themeFromLegacy, accent: accentFromLegacy };
    assert.deepEqual(lookFromLegacy({ theme: "light", accent: "azure" }, { theme: false, accent: false }, map), { windowTheme: "parchment", windowAccent: "frost" });
    assert.deepEqual(lookFromLegacy({ theme: "light", accent: "azure" }, { theme: true, accent: false }, map), { windowAccent: "frost" });
    assert.deepEqual(lookFromLegacy({}, { theme: false, accent: false }, map), {});
  });

  it("reports only a migration that did something or failed", () => {
    const none = { actors: 0, items: 0, presets: 0, trades: 0, failures: 0 };
    assert.equal(worthReporting(none), false);
    assert.equal(worthReporting({ ...none, presets: 1 }), true);
    assert.equal(worthReporting({ ...none, failures: 1 }), true);
  });
});
