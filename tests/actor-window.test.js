import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACCENTS,
  DEFAULT_ACCENT,
  accentFromLegacy,
  effectiveMotion,
  fallbackTab,
  layoutForWidth,
  motionCap,
  normalizeAccent,
  crLabel,
  mergeParts,
  orbAction,
  partsForActorChange,
  partsForEffectChange,
  railBlocksFor,
  resolveTheme,
  sheetMenuEntries,
  themeFromLegacy,
  visibleTabs
} from "../scripts/core/actor-window.js";

describe("actor window layout", () => {
  it("picks the layout from the window's own width", () => {
    assert.equal(layoutForWidth(320), "compact");
    assert.equal(layoutForWidth(419), "compact");
    assert.equal(layoutForWidth(420), "narrow");
    assert.equal(layoutForWidth(759), "narrow");
    assert.equal(layoutForWidth(760), "standard");
    assert.equal(layoutForWidth(1319), "standard");
    assert.equal(layoutForWidth(1320), "wide");
  });
});

describe("motion level", () => {
  it("reduced motion in the OS caps at «Выключены», performance-low at «Сдержанно»", () => {
    assert.equal(motionCap({}), "full");
    assert.equal(motionCap({ performanceLow: true }), "reduced");
    assert.equal(motionCap({ reducedMotion: true, performanceLow: true }), "off");
  });

  it("keeps the player's choice under the cap and gives it back when the cap lifts", () => {
    assert.equal(effectiveMotion("full", {}), "full");
    assert.equal(effectiveMotion("full", { performanceLow: true }), "reduced");
    assert.equal(effectiveMotion("reduced", { reducedMotion: true }), "off");
    assert.equal(effectiveMotion("off", {}), "off");
    assert.equal(effectiveMotion("bogus", {}), "full");
  });
});

describe("theme and accent", () => {
  it("«Авто» follows the colour scheme", () => {
    assert.equal(resolveTheme("night", true), "night");
    assert.equal(resolveTheme("parchment", false), "parchment");
    assert.equal(resolveTheme("auto", true), "parchment");
    assert.equal(resolveTheme("auto", false), "night");
    assert.equal(resolveTheme("bogus", true), "night");
  });

  it("names six accents with brass first", () => {
    assert.deepEqual(ACCENTS, ["brass", "embers", "arcane", "forest", "frost", "rose"]);
    assert.equal(DEFAULT_ACCENT, "brass");
    assert.equal(normalizeAccent("frost"), "frost");
    assert.equal(normalizeAccent("peach"), "brass");
  });

  it("maps the ten 1.x hues to the nearest named accent (#17)", () => {
    const map = { amber: "brass", peach: "embers", rose: "rose", orchid: "rose", lavender: "arcane", periwinkle: "arcane", sage: "forest", mint: "forest", azure: "frost", steel: "frost" };
    for (const [old, name] of Object.entries(map)) assert.equal(accentFromLegacy(old), name, old);
    assert.equal(accentFromLegacy(undefined), "brass");
  });

  it("maps the 1.x theme values", () => {
    assert.equal(themeFromLegacy("dark"), "night");
    assert.equal(themeFromLegacy("light"), "parchment");
    assert.equal(themeFromLegacy("auto"), "auto");
    assert.equal(themeFromLegacy(undefined), "night");
  });
});

describe("tabs", () => {
  const all = ["overview", "equipment", "spells", "features", "effects", "biography"];

  it("hides what the user hid and what the actor lacks, never Снаряжение", () => {
    assert.deepEqual(visibleTabs({ hidden: [], missing: [] }), all);
    assert.deepEqual(visibleTabs({ hidden: ["overview", "equipment"], missing: ["spells"] }), ["equipment", "features", "effects", "biography"]);
  });

  it("falls back to Снаряжение when the open tab disappears", () => {
    assert.equal(fallbackTab("spells", ["equipment", "features"]), "equipment");
    assert.equal(fallbackTab("features", ["equipment", "features"]), "features");
  });
});

describe("level orb", () => {
  it("opens the experience card until the orb is ready", () => {
    assert.equal(orbAction({ ready: false, canEdit: true, shift: false, classCount: 1 }), "card");
    assert.equal(orbAction({ ready: true, canEdit: false, shift: false, classCount: 1 }), "card");
    assert.equal(orbAction({ ready: true, canEdit: true, shift: true, classCount: 1 }), "card");
  });

  it("levels up the only class, or asks which class with several", () => {
    assert.equal(orbAction({ ready: true, canEdit: true, shift: false, classCount: 1 }), "level");
    assert.equal(orbAction({ ready: true, canEdit: true, shift: false, classCount: 2 }), "choose");
    assert.equal(orbAction({ ready: true, canEdit: true, shift: false, classCount: 0 }), "card");
  });
});

describe("sheet menu", () => {
  it("offers special traits and the bastion to characters, reverting only while transformed", () => {
    assert.deepEqual(sheetMenuEntries({ type: "character", bastion: true, polymorphed: false }), ["openSheet", "traits", "bastion"]);
    assert.deepEqual(sheetMenuEntries({ type: "character", bastion: false, polymorphed: true }), ["openSheet", "traits", "revert"]);
    assert.deepEqual(sheetMenuEntries({ type: "npc", bastion: true, polymorphed: false }), ["openSheet"]);
  });
});

describe("rail blocks by actor type (#20)", () => {
  const ids = (list) => list.map((b) => b.id);

  it("list only what the actor type can show", () => {
    const has = { hasSpells: true, hasLegendary: true };
    assert.deepEqual(ids(railBlocksFor("character", has)), ["hitDice", "spellSlots", "stats", "spellcasting", "effects", "chips", "rest", "favorites"]);
    assert.deepEqual(ids(railBlocksFor("npc", has)), ["spellSlots", "stats", "legendary", "spellcasting", "effects", "chips"]);
    assert.deepEqual(ids(railBlocksFor("vehicle", has)), ["stats", "cargo", "crew", "effects"]);
  });

  it("keep a block the actor lacks listed as absent, and hide it", () => {
    const npc = railBlocksFor("npc", { hasSpells: false, hasLegendary: false }, ["effects"]);
    const by = Object.fromEntries(npc.map((b) => [b.id, b]));
    assert.deepEqual(by.legendary, { id: "legendary", absent: true, shown: false });
    assert.deepEqual(by.spellSlots, { id: "spellSlots", absent: true, shown: false });
    assert.deepEqual(by.effects, { id: "effects", absent: false, shown: false });
    assert.deepEqual(by.stats, { id: "stats", absent: false, shown: true });
  });
});

describe("challenge rating", () => {
  it("is written as the books write it", () => {
    assert.deepEqual([0.125, 0.25, 0.5, 0, 1, 17, "2"].map(crLabel), ["1/8", "1/4", "1/2", "0", "1", "17", "2"]);
    assert.deepEqual([null, undefined, "", "x"].map(crLabel), ["—", "—", "—", "—"]);
  });
});

describe("what an actor change redraws (#9)", () => {
  it("redraws the rail alone for hit points, death saves and inspiration", () => {
    assert.deepEqual(partsForActorChange({ system: { attributes: { hp: { value: 3 } } }, _id: "a", _stats: { modifiedTime: 1 } }), ["rail"]);
    assert.deepEqual(partsForActorChange({ "system.attributes.hp.temp": 8, "system.attributes.death.success": 1 }), ["rail"]);
    assert.deepEqual(partsForActorChange({ system: { attributes: { inspiration: true } } }), ["rail"]);
  });

  it("redraws everything for anything else, or nothing it can tell", () => {
    assert.equal(partsForActorChange({ system: { attributes: { hp: { value: 3 } }, currency: { gp: 5 } } }), null);
    assert.equal(partsForActorChange({ name: "Аот" }), null);
    assert.equal(partsForActorChange({ _id: "a" }), null);
    assert.equal(partsForActorChange(undefined), null);
  });

  it("redraws the rail alone for dnd5e's Bloodied marker, and the effects tab when it is open", () => {
    const bloodied = { onActor: true, changes: [], statuses: ["bloodied"] };
    assert.deepEqual(partsForEffectChange(bloodied, "equipment"), ["rail"]);
    assert.deepEqual(partsForEffectChange(bloodied, "effects"), ["rail", "main"]);
  });

  it("redraws everything for an effect that may change derived data", () => {
    assert.equal(partsForEffectChange({ onActor: true, changes: [], statuses: ["grappled"] }, "equipment"), null);
    assert.equal(partsForEffectChange({ onActor: true, changes: [{ key: "system.attributes.ac.bonus" }], statuses: ["bloodied"] }, "equipment"), null);
    assert.equal(partsForEffectChange({ onActor: true, changes: [], statuses: [] }, "equipment"), null);
    assert.equal(partsForEffectChange({ onActor: false, changes: [], statuses: ["bloodied"] }, "equipment"), null);
  });

  it("adds up queued parts until one asks for all", () => {
    assert.deepEqual(mergeParts(undefined, ["rail"]), ["rail"]);
    assert.deepEqual(mergeParts(["rail"], ["rail", "main"]), ["rail", "main"]);
    assert.equal(mergeParts(["rail"], null), null);
    assert.equal(mergeParts(null, ["rail"]), null);
    assert.equal(mergeParts(undefined, null), null);
  });
});
