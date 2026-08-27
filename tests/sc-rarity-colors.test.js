import test from "node:test";
import assert from "node:assert/strict";

import {
  getRarityColor,
  getSpellSchoolColor,
  hasRarityGlow,
  getItemRarityVisuals,
  isScRarityColorsActive,
  normalizeRarityKey,
  SC_MODULE_ID
} from "../scripts/integrations/sc-rarity-colors.js";
import { formatItemForDisplay } from "../scripts/integrations/dnd5e.js";

test("SC Rarity Colors: normalizeRarityKey handles aliases and case", () => {
  assert.equal(normalizeRarityKey("common"), "common");
  assert.equal(normalizeRarityKey("Common"), "common");
  assert.equal(normalizeRarityKey("обычный"), "common");
  assert.equal(normalizeRarityKey("very-rare"), "veryRare");
  assert.equal(normalizeRarityKey("veryRare"), "veryRare");
  assert.equal(normalizeRarityKey("очень редкий"), "veryRare");
  assert.equal(normalizeRarityKey("legendary"), "legendary");
  assert.equal(normalizeRarityKey("легендарный"), "legendary");
  assert.equal(normalizeRarityKey("artifact"), "artifact");
  assert.equal(normalizeRarityKey("артефакт"), "artifact");
  assert.equal(normalizeRarityKey("custom-cosmic"), "custom-cosmic");
});

test("SC Rarity Colors: getRarityColor uses fallbacks when SC is inactive", () => {
  globalThis.game = { modules: new Map() };
  assert.equal(getRarityColor("common"), "#7f8c8d");
  assert.equal(getRarityColor("uncommon"), "#27ae60");
  assert.equal(getRarityColor("rare"), "#2980b9");
  assert.equal(getRarityColor("veryRare"), "#8e44ad");
  assert.equal(getRarityColor("legendary"), "#d35400");
  assert.equal(getRarityColor("artifact"), "#c0392b");
});

test("SC Rarity Colors: getRarityColor integrates with CONFIG.DND5E.itemRarity", () => {
  globalThis.CONFIG = {
    DND5E: {
      itemRarity: {
        rare: { label: "Rare", color: "#123456" },
        mythic: { label: "Mythic", color: "#ff0077" }
      }
    }
  };

  assert.equal(getRarityColor("rare"), "#123456");
  assert.equal(getRarityColor("mythic"), "#ff0077");
});

test("SC Rarity Colors: getRarityColor reads SC - Item Rarity Colors module settings", () => {
  const mockModules = new Map();
  mockModules.set(SC_MODULE_ID, { active: true });

  globalThis.game = {
    modules: mockModules,
    settings: {
      get: (mod, key) => {
        if (mod === SC_MODULE_ID && key === "rarity-colors") {
          return {
            legendary: "#ffaa00",
            customFabled: { color: "#9900ff" }
          };
        }
        return null;
      }
    }
  };

  assert.equal(isScRarityColorsActive(), true);
  assert.equal(getRarityColor("legendary"), "#ffaa00");
  assert.equal(getRarityColor("customFabled"), "#9900ff");
});

test("SC Rarity Colors: hasRarityGlow flags high-tier items", () => {
  assert.equal(hasRarityGlow("legendary"), true);
  assert.equal(hasRarityGlow("artifact"), true);
  assert.equal(hasRarityGlow("mythic"), true);
  assert.equal(hasRarityGlow("common"), false);
  assert.equal(hasRarityGlow("rare"), false);
});

test("SC Rarity Colors: getItemRarityVisuals provides full presentation package", () => {
  const visuals = getItemRarityVisuals("legendary");
  assert.equal(visuals.rarityKey, "legendary");
  assert.equal(visuals.hasGlow, true);
  assert.ok(visuals.color.length > 0);
  assert.ok(visuals.cssVars.includes("--rarity-color"));
});

test("SC Rarity Colors: formatItemForDisplay includes rarity visuals & glow flags", () => {
  const item = {
    id: "legendary-sword",
    name: "Sun Blade",
    type: "weapon",
    system: {
      rarity: "legendary",
      weight: { value: 3, units: "lb" },
      quantity: 1,
      price: { value: 5000, denomination: "gp" }
    }
  };

  const formatted = formatItemForDisplay(item);
  assert.equal(formatted.rarity, "legendary");
  assert.equal(formatted.hasGlow, true);
  assert.ok(formatted.rarityColor);
  assert.ok(formatted.cssVars.includes("--rarity-color"));
});

test("SC Rarity Colors: getSpellSchoolColor handles schools and SC overrides", () => {
  assert.equal(getSpellSchoolColor("evo"), "#e74c3c");
  assert.equal(getSpellSchoolColor("nec"), "#2ecc71");
  assert.equal(getSpellSchoolColor("div"), "#9b59b6");
});
