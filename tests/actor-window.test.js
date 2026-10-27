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
  resolveTheme,
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
