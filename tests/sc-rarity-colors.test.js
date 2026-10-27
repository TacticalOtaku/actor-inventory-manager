import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { ITEM_RARITY_COLORS, SPELL_SCHOOL_COLORS } from "../scripts/constants.js";
import {
  SC_MODULE_ID,
  getRarityColor,
  getSpellSchoolColor,
  hasRarityGlow,
  invalidateRarityColorCache,
  scRarityColor,
  scSchoolColor
} from "../scripts/integrations/sc-rarity-colors.js";

/** SC - Item Rarity Colors 3.0.x as a world sees it: one setting per rarity field, one for spell schools. */
function stubSc(values, { active = true } = {}) {
  const store = new Map(Object.entries(values).map(([key, value]) => [`${SC_MODULE_ID}.${key}`, value]));
  globalThis.game = {
    modules: new Map([[SC_MODULE_ID, { active }]]),
    settings: {
      settings: store,
      get: (moduleId, key) => store.get(`${moduleId}.${key}`)
    }
  };
}

afterEach(() => {
  delete globalThis.game;
  invalidateRarityColorCache();
});

describe("SC rarity colours", () => {
  it("reads <rarity>-item-color when the GM switched it on, for dnd5e's lowercased rarity too", () => {
    stubSc({ "veryRare-enable-item-color": true, "veryRare-item-color": "#123456" });
    assert.equal(getRarityColor("veryrare"), "#123456");
  });

  it("ignores a colour the GM left switched off and falls back to the module's colours", () => {
    stubSc({ "rare-enable-item-color": false, "rare-item-color": "#000000" });
    assert.equal(getRarityColor("rare"), ITEM_RARITY_COLORS.rare);
  });

  it("uses the inventory border colour when that is the only colour switched on", () => {
    stubSc({ "uncommon-enable-inventory-border-color": true, "uncommon-inventory-border-color": "#00ff00" });
    assert.equal(getRarityColor("uncommon"), "#00ff00");
  });

  it("ignores SC settings while SC is inactive", () => {
    stubSc({ "rare-enable-item-color": true, "rare-item-color": "#abcdef" }, { active: false });
    assert.equal(getRarityColor("rare"), ITEM_RARITY_COLORS.rare);
  });

  it("takes the glow from <rarity>-glow-option", () => {
    stubSc({ "uncommon-glow-option": true });
    assert.equal(hasRarityGlow("uncommon"), true);
    assert.equal(hasRarityGlow("rare"), false);
  });
});

describe("SC spell school colours", () => {
  const profile = (color) => ({ "enable-item-color": true, "item-color": color });

  it("reads the school profile of spell-school-styles", () => {
    stubSc({ "spell-school-styles": { useLevelVariants: false, profiles: { school_evo: profile("#ff4400") } } });
    assert.equal(getSpellSchoolColor("evo", 3), "#ff4400");
  });

  it("prefers the level profile with level variants and falls back to the school profile", () => {
    stubSc({ "spell-school-styles": { useLevelVariants: true, profiles: { school_evo: profile("#ff4400"), school_evo_lvl_3: profile("#ffaa00") } } });
    assert.equal(getSpellSchoolColor("evo", 3), "#ffaa00");
    assert.equal(getSpellSchoolColor("evo", 2), "#ff4400");
  });

  it("falls back to the module's school colours when the profile has no colour on", () => {
    stubSc({ "spell-school-styles": { useLevelVariants: false, profiles: { school_abj: { "enable-item-color": false } } } });
    assert.equal(getSpellSchoolColor("abj", 1), SPELL_SCHOOL_COLORS.abj);
  });
});

describe("colours SC itself gives (the window keeps its palette otherwise)", () => {
  it("give a rarity's colour only when SC is on and the GM switched it on", () => {
    stubSc({ "rare-enable-item-color": true, "rare-item-color": "#ff00aa" });
    assert.equal(scRarityColor("rare"), "#ff00aa");
    stubSc({ "rare-enable-item-color": false, "rare-item-color": "#000000" });
    assert.equal(scRarityColor("rare"), null);
    stubSc({ "rare-enable-item-color": true, "rare-item-color": "#ff00aa" }, { active: false });
    assert.equal(scRarityColor("rare"), null);
  });

  it("give no school colour when SC's school profile is left off", () => {
    const on = (color) => ({ "enable-item-color": true, "item-color": color });
    stubSc({ "spell-school-styles": { useLevelVariants: false, profiles: { school_evo: { "enable-item-color": false, "item-color": "#000000" } } } });
    assert.equal(scSchoolColor("evo"), null);
    assert.equal(scSchoolColor(null), null);
    stubSc({ "spell-school-styles": { useLevelVariants: true, profiles: { school_evo: on("#ff4400"), school_evo_lvl_3: on("#ffaa00") } } });
    assert.deepEqual([scSchoolColor("evo", 3), scSchoolColor("evo", 2)], ["#ffaa00", "#ff4400"]);
  });
});
