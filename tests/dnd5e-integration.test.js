import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  extractActorVitals,
  extractSpellSlots,
  formatItemForDisplay,
  resolveItemActivation,
  resolveItemUses,
  resolveSpellPreparation,
  hasPreparationToggle,
  resolveSpellSlotMax
} from "../scripts/integrations/dnd5e.js";

/** Minimal CONFIG.DND5E stand-in matching dnd5e 5.3.3. */
function stubDnd5eConfig() {
  globalThis.CONFIG = {
    DND5E: {
      spellcasting: {
        atwill: {},
        innate: {},
        ritual: {},
        pact: { prepares: true },
        spell: { prepares: true }
      },
      activityActivationTypes: {
        action: { label: "Action" },
        bonus: { label: "Bonus Action" },
        reaction: { label: "Reaction" },
        legendary: { label: "Legendary Action", scalar: true },
        longRest: { label: "Long Rest", passive: true }
      }
    }
  };
}

afterEach(() => {
  delete globalThis.CONFIG;
});

describe("resolveSpellSlotMax", () => {
  it("uses max when override is null (the dnd5e default)", () => {
    // `override` is a nullable NumberField; Number(null) is 0, which used to
    // zero out every spell slot in the tracker.
    assert.equal(resolveSpellSlotMax({ value: 2, max: 4, override: null }), 4);
    assert.equal(resolveSpellSlotMax({ value: 2, max: 4 }), 4);
  });

  it("respects an explicit override, including zero", () => {
    assert.equal(resolveSpellSlotMax({ max: 4, override: 6 }), 6);
    assert.equal(resolveSpellSlotMax({ max: 4, override: 0 }), 0);
  });
});

describe("extractSpellSlots", () => {
  it("builds pips from the derived max", () => {
    stubDnd5eConfig();
    const actor = {
      system: {
        spells: {
          spell1: { value: 2, max: 4, override: null },
          spell2: { value: 0, max: 0, override: null },
          pact: { value: 1, max: 2, level: 3, override: null }
        }
      }
    };
    const slots = extractSpellSlots(actor);
    assert.equal(slots.length, 2);

    const pact = slots.find(s => s.key === "pact");
    assert.equal(pact.max, 2);
    assert.equal(pact.value, 1);
    assert.equal(pact.level, 3);
    assert.equal(pact.pips.length, 2);
    assert.deepEqual(pact.pips.map(p => p.filled), [true, false]);

    const first = slots.find(s => s.key === "spell1");
    assert.equal(first.max, 4);
    assert.equal(first.pips.filter(p => p.filled).length, 2);
    assert.equal(first.isFull, false);
    assert.equal(first.isEmpty, false);
  });

  it("skips levels the actor has no slots for", () => {
    stubDnd5eConfig();
    const actor = { system: { spells: { spell1: { value: 0, max: 0, override: null } } } };
    assert.deepEqual(extractSpellSlots(actor), []);
  });
});

describe("resolveSpellPreparation", () => {
  it("handles the method/prepared pair", () => {
    stubDnd5eConfig();
    const prepared = resolveSpellPreparation({ system: { level: 1, method: "spell", prepared: 1 } });
    assert.equal(prepared.isPrepared, true);
    assert.equal(prepared.isAlways, false);
    assert.equal(prepared.canPrepare, true);

    const unprepared = resolveSpellPreparation({ system: { level: 1, method: "spell", prepared: 0 } });
    assert.equal(unprepared.isPrepared, false);
    assert.equal(unprepared.canPrepare, true);
  });

  it("marks 'always prepared' as not togglable state", () => {
    stubDnd5eConfig();
    const always = resolveSpellPreparation({ system: { level: 3, method: "spell", prepared: 2 } });
    assert.equal(always.isPrepared, true);
    assert.equal(always.isAlways, true);
  });

  it("treats pact magic as preparable", () => {
    stubDnd5eConfig();
    const pact = resolveSpellPreparation({ system: { level: 2, method: "pact", prepared: 0 } });
    assert.equal(pact.canPrepare, true);
  });

  it("never asks to prepare cantrips or innate spells", () => {
    stubDnd5eConfig();
    assert.equal(resolveSpellPreparation({ system: { level: 0, method: "spell", prepared: 0 } }).canPrepare, false);
    assert.equal(resolveSpellPreparation({ system: { level: 0, method: "spell", prepared: 0 } }).isPrepared, true);
    assert.equal(resolveSpellPreparation({ system: { level: 2, method: "innate", prepared: 0 } }).canPrepare, false);
  });

  it("offers the prepare toggle only for a preparing spell that is not always prepared, of a class with a limit", () => {
    stubDnd5eConfig();
    const wizard = { spellcastingClasses: { wizard: { system: { spellcasting: { preparation: { max: 6 } } } } } };
    const sorcerer = { spellcastingClasses: { sorcerer: { system: { spellcasting: { preparation: { max: 0 } } } } } };
    const spell = (prepared, classIdentifier = "wizard") => ({ system: { level: 1, method: "spell", prepared, classIdentifier } });
    assert.equal(hasPreparationToggle(spell(0), wizard), true);
    assert.equal(hasPreparationToggle(spell(2), wizard), false);
    assert.equal(hasPreparationToggle(spell(0, "sorcerer"), sorcerer), false);
    assert.equal(hasPreparationToggle({ ...spell(1), actor: wizard }), true);
  });
});

describe("resolveItemActivation", () => {
  it("reads the first activity", () => {
    stubDnd5eConfig();
    const feat = { system: { activities: { contents: [{ activation: { type: "bonus", value: null } }] } } };
    assert.equal(resolveItemActivation(feat).type, "bonus");
  });

  it("reads system.activation of a spell without activities", () => {
    stubDnd5eConfig();
    assert.equal(resolveItemActivation({ system: { activation: { type: "reaction" } } }).type, "reaction");
  });

  it("reports no activation for a passive feature", () => {
    stubDnd5eConfig();
    assert.equal(resolveItemActivation({ system: { activities: { contents: [] } } }).type, "");
  });
});

describe("resolveItemUses", () => {
  it("derives uses from the max/spent pair", () => {
    const uses = resolveItemUses({ system: { uses: { max: 3, spent: 1, value: 2, recovery: [] } } });
    assert.equal(uses.hasUses, true);
    assert.equal(uses.usesDisplay, "2 / 3");
  });
});

describe("extractActorVitals", () => {
  /**
   * Plain stand-in for a dnd5e 5.3.3 character. `actor.classes` is a record of
   * class items keyed by identifier; the class level is `system.levels`.
   */
  const makeActor = ({ hp = { value: 10, max: 10, temp: 0 }, movement = { walk: 30, units: "ft" }, classes } = {}) => ({
    name: "Hero",
    img: "hero.webp",
    type: "character",
    items: new Map(),
    classes,
    system: {
      attributes: { hp, movement, attunement: { max: 3 } },
      details: {},
      currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }
    }
  });

  it("exposes walking speed, temp-hp share and class for the passport", () => {
    const actor = makeActor({
      hp: { value: 58, max: 64, temp: 5 },
      classes: { paladin: { name: "Паладин", system: { levels: 7 } } }
    });
    const vitals = extractActorVitals(actor);
    assert.equal(vitals.speedWalk, 30);
    assert.equal(vitals.speedUnit, "ft");
    assert.equal(vitals.hp.tempPct, 98);
    assert.equal(vitals.className, "Паладин");
  });

  it("reads the save bonus from 5.3.3's { value } shape", () => {
    const actor = makeActor();
    actor.system.abilities = { str: { value: 16, mod: 3, save: { value: 5 }, proficient: 1 } };
    assert.equal(extractActorVitals(actor).abilities.str.save, "+5");
  });

  it("clamps the temp-hp share to 0..100 and is 0 without a maximum", () => {
    assert.equal(extractActorVitals(makeActor({ hp: { value: 60, max: 64, temp: 20 } })).hp.tempPct, 100);
    assert.equal(extractActorVitals(makeActor({ hp: { value: -5, max: 64, temp: 0 } })).hp.tempPct, 0);
    assert.equal(extractActorVitals(makeActor({ hp: { value: 0, max: 0, temp: 5 } })).hp.tempPct, 0);
  });

  it("names the class with the most levels and is empty without classes", () => {
    const multiclass = makeActor({
      classes: {
        fighter: { name: "Fighter", system: { levels: 2 } },
        wizard: { name: "Wizard", system: { levels: 5 } }
      }
    });
    assert.equal(extractActorVitals(multiclass).className, "Wizard");
    assert.equal(extractActorVitals(makeActor()).className, "");
  });

  it("defaults the walking speed to 30 when the actor has none", () => {
    assert.equal(extractActorVitals(makeActor({ movement: {} })).speedWalk, 30);
  });
});

describe("formatItemForDisplay weight", () => {
  afterEach(() => {
    delete globalThis.game;
  });

  function metricWorld() {
    stubDnd5eConfig();
    globalThis.CONFIG.DND5E.weightUnits = {
      lb: { conversion: 1, abbreviation: "lb" },
      kg: { conversion: 2.5, abbreviation: "kg" }
    };
    globalThis.game = {
      settings: { get: (namespace, key) => namespace === "dnd5e" && key === "metricWeightUnits" },
      i18n: { localize: key => key }
    };
  }

  it("shows the weight in the world's unit, not the unit stored on the item", () => {
    metricWorld();
    const greataxe = { id: "a", name: "Greataxe", type: "weapon", system: { quantity: 1, weight: { value: 7, units: "lb" } } };
    const rock = { id: "b", name: "Rock", type: "loot", system: { quantity: 1, weight: { value: 1, units: "kg" } } };
    assert.equal(formatItemForDisplay(greataxe).weightDisplay, "2.8 kg");
    assert.equal(formatItemForDisplay(rock).weightDisplay, "1.0 kg");
  });

  it("multiplies by quantity, but not a container's own weight", () => {
    metricWorld();
    const rations = { id: "c", name: "Rations", type: "consumable", system: { quantity: 2, weight: { value: 2, units: "lb" } } };
    const bags = { id: "d", name: "Bag", type: "container", system: { quantity: 2, weight: { value: 5, units: "lb" } } };
    assert.equal(formatItemForDisplay(rations).weightDisplay, "1.6 kg");
    assert.equal(formatItemForDisplay(bags).weightDisplay, "2.0 kg");
  });
});

describe("formatItemForDisplay rarity label", () => {
  afterEach(() => {
    delete globalThis.game;
  });

  function world() {
    stubDnd5eConfig();
    // dnd5e 5.3.3 pre-localizes CONFIG.DND5E.itemRarity: the values are display strings by ready time.
    globalThis.CONFIG.DND5E.itemRarity = { common: "Common", uncommon: "Uncommon", veryRare: "Very Rare" };
    globalThis.game = { settings: { get: () => false }, i18n: { localize: key => key } };
  }

  it("names the rarity from the system config", () => {
    world();
    const cloak = { id: "a", name: "Cloak", type: "equipment", system: { rarity: "veryRare", quantity: 1 } };
    assert.equal(formatItemForDisplay(cloak).rarityLabel, "Very Rare");
  });

  it("stays quiet for common items and rarities the system does not know", () => {
    world();
    const rope = { id: "b", name: "Rope", type: "loot", system: { rarity: "common", quantity: 1 } };
    const relic = { id: "c", name: "Relic", type: "loot", system: { rarity: "mythic", quantity: 1 } };
    assert.equal(formatItemForDisplay(rope).rarityLabel, "");
    assert.equal(formatItemForDisplay(relic).rarityLabel, "");
  });
});

describe("actor window header reads (dnd5e 5.3.3)", () => {
  afterEach(() => { delete globalThis.CONFIG; });

  it("reads abilities with the save as an object, not the modifier", async () => {
    const { readAbilities } = await import("../scripts/integrations/dnd5e.js");
    globalThis.CONFIG = { DND5E: { abilities: { str: { abbreviation: "Сил", label: "Сила" }, int: { abbreviation: "Инт", label: "Интеллект" } } } };
    const actor = { system: { abilities: {
      str: { value: 8, mod: -1, proficient: 0, save: { value: -1 } },
      int: { value: 18, mod: 4, proficient: 1, save: { value: 7 } }
    } } };
    assert.deepEqual(readAbilities(actor), [
      { key: "str", abbr: "Сил", label: "Сила", value: 8, mod: -1, save: -1, proficient: false },
      { key: "int", abbr: "Инт", label: "Интеллект", value: 18, mod: 4, save: 7, proficient: true }
    ]);
  });

  it("reads level, experience, classes with subclasses, species and background", async () => {
    const { readIdentity } = await import("../scripts/integrations/dnd5e.js");
    const wizard = { id: "w1", name: "Волшебник", system: { levels: 6 }, subclass: { id: "s1", name: "Школа Воплощения" } };
    const fighter = { id: "f1", name: "Воин", system: { levels: 1 }, subclass: null };
    const actor = {
      type: "character",
      classes: { wizard, fighter },
      system: { details: {
        level: 7,
        xp: { value: 20500, min: 14000, max: 23000, pct: 72 },
        race: { id: "r1", name: "Высший эльф" },
        background: { id: "b1", name: "Мудрец" }
      } }
    };
    assert.deepEqual(readIdentity(actor), {
      level: 7,
      xp: { value: 20500, min: 14000, max: 23000, pct: 72, ready: false },
      classes: [
        { id: "w1", name: "Волшебник", levels: 6, subclass: { id: "s1", name: "Школа Воплощения" } },
        { id: "f1", name: "Воин", levels: 1, subclass: null }
      ],
      species: { id: "r1", name: "Высший эльф" },
      background: { id: "b1", name: "Мудрец" }
    });
    actor.system.details.xp.value = 23000;
    assert.equal(readIdentity(actor).xp.ready, true);
  });
});

describe("actor window rail reads (dnd5e 5.3.3)", () => {
  afterEach(() => { delete globalThis.CONFIG; });

  it("reads HP, AC, initiative, speed, proficiency, inspiration, exhaustion, death saves and hit dice", async () => {
    const { readRail } = await import("../scripts/integrations/dnd5e.js");
    globalThis.CONFIG = { DND5E: { conditionTypes: { exhaustion: { levels: 6 } }, abilities: { int: { label: "Интеллект" } }, movementUnits: { ft: { abbreviation: "фт" } } } };
    const wizard = { name: "Волшебник", system: { hd: { denomination: "d6" } }, spellcasting: { ability: "int", attack: 7, save: 15, progression: "full" } };
    const actor = {
      classes: { wizard },
      concentration: { items: new Set([{ name: "Обнаружение магии" }]), effects: new Set() },
      system: {
        abilities: { con: { mod: 2 } },
        skills: { prc: { passive: 14 } },
        spells: { spell1: { value: 3, max: 4 } },
        attributes: {
          hp: { value: 31, max: 38, temp: 5 },
          ac: { value: 18 },
          init: { total: 3 },
          movement: { walk: 30, units: "ft" },
          prof: 3,
          inspiration: true,
          exhaustion: 2,
          death: { success: 1, failure: 0 },
          hd: { value: 4, max: 6, largestAvailable: "d6" }
        }
      }
    };
    const rail = readRail(actor);
    assert.deepEqual(rail.hp, { value: 31, max: 38, temp: 5 });
    assert.deepEqual([rail.ac, rail.init, rail.speed, rail.speedUnit, rail.prof], [18, 3, 30, "фт", 3]);
    assert.equal(rail.inspiration, true);
    assert.deepEqual(rail.exhaustion, { value: 2, max: 6 });
    assert.deepEqual(rail.death, { success: 1, failure: 0 });
    assert.deepEqual(rail.hitDice, { value: 4, max: 6, formula: "d6 + 2" });
    assert.deepEqual(rail.casting, [{ name: "Волшебник", ability: "Интеллект", dc: 15, attack: 7 }]);
    assert.equal(rail.passivePerception, 14);
    assert.deepEqual(rail.concentration, ["Обнаружение магии"]);
    assert.deepEqual(rail.slots.map((s) => [s.level, s.value, s.max]), [[1, 3, 4]]);
  });
});

describe("actor window inventory reads (dnd5e 5.3.3)", () => {
  afterEach(() => { delete globalThis.CONFIG; });

  const currencies = {
    pp: { label: "Платина", abbreviation: "пм", conversion: 0.1 },
    gp: { label: "Золото", abbreviation: "зм", conversion: 1 },
    sp: { label: "Серебро", abbreviation: "см", conversion: 10 }
  };

  it("reads price per unit in gold, charges from uses.spent, the holding container and properties", async () => {
    const { readInventory } = await import("../scripts/integrations/dnd5e.js");
    globalThis.CONFIG = { DND5E: { currencies, itemProperties: { mgc: { label: "Магический" } } } };
    const wand = {
      id: "w", uuid: "Actor.a.Item.w", name: "Жезл", img: "wand.webp", type: "equipment", sort: 300,
      system: {
        quantity: 1, container: "bag", rarity: "rare", equipped: true, attunement: "required", attuned: true, identified: false,
        price: { value: 50, denomination: "sp" }, weight: { value: 1, units: "lb" },
        uses: { max: 7, spent: 2, value: 5, autoDestroy: false, recovery: [] }, properties: new Set(["mgc"])
      }
    };
    const spell = { id: "s", name: "Огненный шар", type: "spell", system: {} };
    const [entry, ...rest] = readInventory({ items: [wand, spell] });
    assert.equal(rest.length, 0);
    assert.equal(entry.price, 5);
    assert.deepEqual(entry.charges, { value: 5, max: 7, spent: 2, autoDestroy: false });
    assert.equal(entry.container, "bag");
    assert.equal(entry.attunement, "attuned");
    assert.equal(entry.attuned, true);
    assert.equal(entry.identified, false);
    assert.deepEqual(entry.tags, ["Магический"]);
    assert.equal(entry.weight, 1);
    assert.equal(entry.sort, 300);
  });

  it("reads coins in the system's order with their abbreviations", async () => {
    const { readCoins } = await import("../scripts/integrations/dnd5e.js");
    globalThis.CONFIG = { DND5E: { currencies } };
    assert.deepEqual(readCoins({ system: { currency: { pp: 2, gp: 31, sp: 0 } } }), [
      { key: "pp", label: "Платина", abbr: "пм", value: 2 },
      { key: "gp", label: "Золото", abbr: "зм", value: 31 },
      { key: "sp", label: "Серебро", abbr: "см", value: 0 }
    ]);
  });
});

describe("container capacity without Weighty Containers (dnd5e 5.3.3)", () => {
  it("reads computeCapacity, keeping an infinite max for a container without capacity", async () => {
    const { readContainerCapacity } = await import("../scripts/integrations/dnd5e.js");
    const bag = { system: { capacity: { weight: { value: 30, units: "lb" } }, computeCapacity: async () => ({ value: 12.5, max: 30, pct: 41.6, units: "Pounds" }) } };
    assert.deepEqual(await readContainerCapacity(bag), { value: 12.5, max: 30, kind: "weight", unit: "lb" });
    const quiver = { system: { capacity: { count: 20, weight: { units: "lb" } }, computeCapacity: async () => ({ value: 12, max: 20, pct: 60, units: "Items" }) } };
    assert.equal((await readContainerCapacity(quiver)).kind, "count");
    const sack = { system: { capacity: { weight: { units: "kg" } }, computeCapacity: async () => ({ value: 0, max: Infinity, pct: 0 }) } };
    assert.equal((await readContainerCapacity(sack)).max, Infinity);
    assert.equal(await readContainerCapacity({ system: {} }), null);
  });
});

describe("vehicle reads for the doll (dnd5e 5.3.3)", () => {
  afterEach(() => { delete globalThis.CONFIG; });

  it("reads the vehicle type from details.type, falling back to the old vehicleType", async () => {
    const { readVehicleType } = await import("../scripts/integrations/dnd5e.js");
    assert.equal(readVehicleType({ type: "vehicle", system: { details: { type: "air" } } }), "air");
    assert.equal(readVehicleType({ type: "vehicle", system: { vehicleType: "land" } }), "land");
    assert.equal(readVehicleType({ type: "character", system: { details: { type: "air" } } }), null);
  });

  it("reads the size label and the cargo capacity for the hold banner", async () => {
    const { readVehicleHold } = await import("../scripts/integrations/dnd5e.js");
    globalThis.CONFIG = { DND5E: { actorSizes: { grg: { label: "Громадный" } }, weightUnits: { tn: { abbreviation: "т" } } } };
    assert.deepEqual(readVehicleHold({ system: { traits: { size: "grg" }, attributes: { capacity: { cargo: { value: 2, units: "tn" } } } } }),
      { size: "Громадный", cargo: 2, unit: "т" });
    assert.equal(readVehicleHold({ system: { traits: { size: "lg" }, attributes: { capacity: { cargo: { value: null, units: "lb" } } } } }).cargo, null);
  });
});

describe("spells tab reads (dnd5e 5.3.3)", () => {
  afterEach(() => { delete globalThis.CONFIG; });

  it("reads method, preparation, properties, labels, materials and innate uses", async () => {
    const { readSpellbook } = await import("../scripts/integrations/dnd5e.js");
    globalThis.CONFIG = { DND5E: { spellcasting: { spell: { prepares: true }, innate: {} } } };
    const fireball = {
      id: "f", uuid: "Actor.a.Item.f", name: "Огненный шар", img: "fb.webp", type: "spell", sort: 100,
      labels: { school: "Воплощение", activation: "1 действие", range: "150 фт", components: { vsm: "В, С, М" } },
      system: { level: 3, school: "evo", method: "spell", prepared: 1, properties: new Set(["vocal", "somatic", "material"]),
        activation: { type: "action" }, materials: { value: "шарик гуано", cost: 0 }, uses: { max: "", spent: 0 } }
    };
    const invis = { id: "i", name: "Невидимость", type: "spell", labels: {}, system: { level: 2, method: "innate", prepared: 0, properties: new Set(["concentration"]), activation: { type: "action" }, uses: { max: 1, spent: 1 } } };
    const sword = { id: "s", name: "Меч", type: "weapon", system: {} };
    const [fb, iv, ...rest] = readSpellbook({ items: [fireball, invis, sword] });
    assert.equal(rest.length, 0);
    assert.deepEqual([fb.level, fb.method, fb.prepared, fb.canPrepare, fb.ritual, fb.concentration], [3, "spell", 1, true, false, false]);
    assert.deepEqual([fb.schoolLabel, fb.activation, fb.activationLabel, fb.range, fb.components], ["Воплощение", "action", "1 действие", "150 фт", "В, С, М"]);
    assert.deepEqual(fb.materials, { text: "шарик гуано", cost: 0 });
    assert.equal(fb.uses, null);
    assert.deepEqual([iv.canPrepare, iv.concentration, iv.uses], [false, true, { value: 0, max: 1, spent: 1 }]);
  });

  it("treats the spells of a class without a preparation limit as known", async () => {
    const { readSpellbook } = await import("../scripts/integrations/dnd5e.js");
    globalThis.CONFIG = { DND5E: { spellcasting: { pact: { prepares: true } } } };
    const warlock = { system: { spellcasting: { preparation: { value: 0, max: 0 } } } };
    const wizard = { system: { spellcasting: { preparation: { value: 2, max: 4 } } } };
    const spell = (id, cls) => ({ id, name: id, type: "spell", labels: {}, system: { level: 1, method: "pact", prepared: 0, classIdentifier: cls, properties: new Set(), activation: {} } });
    const [hex, sleep, loose] = readSpellbook({ spellcastingClasses: { warlock, wizard }, items: [spell("hex", "warlock"), spell("sleep", "wizard"), spell("loose", "")] });
    assert.deepEqual([hex.known, hex.canPrepare], [true, false]);
    assert.deepEqual([sleep.known, sleep.canPrepare], [false, true]);
    assert.deepEqual([loose.known, loose.canPrepare], [false, true]);
  });

  it("reads each casting class's prepared count and limit", async () => {
    const { readSpellPreparation } = await import("../scripts/integrations/dnd5e.js");
    const wizard = { id: "w", name: "Волшебник", system: { spellcasting: { preparation: { value: 11, max: 10, formula: "@abilities.int.mod + @classes.wizard.levels" } } } };
    assert.deepEqual(readSpellPreparation({ spellcastingClasses: { wizard } }), [{ id: "w", name: "Волшебник", value: 11, max: 10 }]);
    assert.deepEqual(readSpellPreparation({}), []);
  });
});

describe("features tab reads (dnd5e 5.3.3)", () => {
  afterEach(() => { delete globalThis.CONFIG; });

  it("reads the origin from advancementRoot, passivity, uses with recovery and recharge, and attacks", async () => {
    const { readFeatures } = await import("../scripts/integrations/dnd5e.js");
    globalThis.CONFIG = { DND5E: { limitedUsePeriods: { sr: { label: "Короткий отдых" } }, itemProperties: { mgc: { label: "Магический" } } } };
    const fighter = { id: "cls", type: "class", identifier: "fighter", system: {} };
    const champion = { id: "sub", type: "subclass", system: { classIdentifier: "fighter" } };
    const elf = { id: "race", type: "race", system: {} };
    const items = new Map();
    const add = (item) => { items.set(item.id, item); return item; };
    [fighter, champion, elf].forEach(add);
    const act = (type, extra = {}) => ({ type, activation: { type: "bonus" }, ...extra });
    add({ id: "sw", name: "Второе дыхание", type: "feat", flags: { dnd5e: { advancementOrigin: "cls.adv1" } }, system: { properties: new Set(), activities: { contents: [act("heal")], [Symbol.iterator]: function* () { yield* this.contents; } }, uses: { max: 1, spent: 1, recovery: [{ period: "sr" }] } } });
    add({ id: "crit", name: "Улучшенный критический удар", type: "feat", flags: { dnd5e: { advancementRoot: "sub.adv2" } }, system: { properties: new Set(["trait"]), activities: [] } });
    add({ id: "dark", name: "Тёмное зрение", type: "feat", flags: { dnd5e: { advancementOrigin: "race.adv3" } }, system: { activities: [] } });
    add({ id: "breath", name: "Дыхание", type: "feat", flags: {}, system: { properties: new Set(["mgc"]), activities: [act("save")], uses: { max: 1, spent: 0, recovery: [{ period: "recharge", formula: "5" }] } } });
    const bite = { id: "bite", name: "Укус", type: "weapon", system: { activities: [act("attack", { labels: { toHit: "+5", damage: [{ label: "1к10 + 3 колющего" }] } })] } };
    add(bite);
    const actor = { items: Object.assign([...items.values()], { get: (id) => items.get(id) }) };
    const byId = Object.fromEntries(readFeatures(actor, { attacks: true }).map((f) => [f.id, f]));
    assert.deepEqual(byId.sw.origin, { kind: "class", key: "fighter" });
    assert.deepEqual([byId.sw.passive, byId.sw.uses, byId.sw.recovery], [false, { value: 0, max: 1, spent: 1 }, ["Короткий отдых"]]);
    assert.deepEqual([byId.crit.origin.key, byId.crit.passive], ["fighter", true]);
    assert.deepEqual([byId.dark.origin.kind, byId.dark.passive], ["species", true]);
    assert.deepEqual([byId.breath.origin.key, byId.breath.recharge, byId.breath.tags], ["other", { formula: "5" }, ["Магический"]]);
    assert.deepEqual(byId.bite.attack, { toHit: "+5", damage: "1к10 + 3 колющего" });
    assert.equal(readFeatures(actor).some((f) => f.id === "bite"), false);
  });
});

describe("favorites reads (dnd5e 5.3.3)", () => {
  afterEach(() => { delete globalThis.CONFIG; delete globalThis.fromUuid; });

  it("resolves items, activities and effects by relative UUID, slots by key and skills by key", async () => {
    const { readFavorites } = await import("../scripts/integrations/dnd5e.js");
    globalThis.CONFIG = { DND5E: { skills: { ath: { label: "Атлетика", icon: "ath.svg" } }, spellcasting: { spell: { img: "slots-{id}.webp" } } } };
    const fireball = { id: "fb", type: "spell", name: "Огненный шар", img: "fb.webp",
      system: { level: 3, activities: { contents: [{ activation: { type: "action" } }] }, getFavoriteData: async () => ({ title: "Огненный шар", subtitle: ["В, С, М", "1 действие"], save: { ability: new Set(["dex"]), dc: { calculation: "spellcasting", formula: "", value: 15 } } }) } };
    const shield = { id: "sh", type: "spell", name: "Щит", system: { level: 1 } };
    const parry = { id: "act1", item: shield, activation: { type: "reaction" }, getFavoriteData: async () => ({ title: "Парирование" }) };
    const gone = null;
    const docs = { ".Item.fb": fireball, ".Item.sh.Activity.act1": parry, ".Item.missing": gone };
    globalThis.fromUuid = async (id) => docs[id] ?? null;
    const actor = { system: {
      favorites: [
        { type: "item", id: ".Item.fb", sort: 100 },
        { type: "activity", id: ".Item.sh.Activity.act1", sort: 200 },
        { type: "item", id: ".Item.missing", sort: 300 },
        { type: "slots", id: "spell3", sort: 400 },
        { type: "skill", id: "ath", sort: 500 }
      ],
      spells: { spell3: { value: 1, max: 2, level: 3, type: "spell" } },
      skills: { ath: { total: 5 } }
    } };
    const [fb, act, slots, skill, ...rest] = await readFavorites(actor);
    assert.equal(rest.length, 0, "a favorite whose document is gone is left out");
    assert.deepEqual([fb.itemType, fb.itemId, fb.activation, fb.level, fb.saveDc, fb.title], ["spell", "fb", "action", 3, 15, "Огненный шар"]);
    assert.deepEqual([act.activityId, act.itemId, act.activation, act.title], ["act1", "sh", "reaction", "Парирование"]);
    assert.deepEqual([slots.level, slots.uses, slots.img], [3, { value: 1, max: 2 }, "slots-spell3.webp"]);
    assert.deepEqual([skill.title, skill.modifier, skill.img], ["Атлетика", 5, "ath.svg"]);
  });
});

describe("effects reads (dnd5e 5.3.3, Foundry 14)", () => {
  afterEach(() => { delete globalThis.CONFIG; delete globalThis.foundry; });

  it("reads state, statuses, time, source and why dnd5e suppresses an effect, skipping hidden ones", async () => {
    const { readEffects } = await import("../scripts/integrations/dnd5e.js");
    globalThis.foundry = { utils: { fromUuidSync: (uuid) => ({ "Compendium.x.Item.mage": { name: "Доспехи мага" } })[uuid] ?? null } };
    const actor = { documentName: "Actor" };
    const cloak = { documentName: "Item", name: "Плащ защиты", system: { equipped: false, attunement: "required", attuned: true } };
    const ring = { documentName: "Item", name: "Кольцо", system: { equipped: true, attunement: "required", attuned: false } };
    const scroll = { documentName: "Item", name: "Свиток", system: { identified: false } };
    const fx = (id, extra) => ({ id, uuid: `U.${id}`, name: id, img: `${id}.webp`, statuses: new Set(), duration: { remaining: Infinity, label: "Нет" },
      getRelativeUUID: () => `.ActiveEffect.${id}`, parent: actor, ...extra });
    actor.allApplicableEffects = function* () {
      yield fx("mage", { origin: "Compendium.x.Item.mage", isTemporary: true, duration: { remaining: 28800, label: "8 ч" } });
      yield fx("cloak", { parent: cloak, isSuppressed: true });
      yield fx("ring", { parent: ring, isSuppressed: true });
      yield fx("prone", { statuses: new Set(["prone"]) });
      yield fx("hidden", { parent: scroll });
      yield fx("rider", { dependentOrigin: { active: false } });
    };
    const byId = Object.fromEntries(readEffects(actor).map((e) => [e.id, e]));
    assert.deepEqual(Object.keys(byId), ["mage", "cloak", "ring", "prone"]);
    assert.deepEqual([byId.mage.time, byId.mage.source, byId.mage.temporary, byId.mage.onActor, byId.mage.relativeId], ["8 ч", "Доспехи мага", true, true, ".ActiveEffect.mage"]);
    assert.deepEqual([byId.cloak.suppressedBy, byId.cloak.source, byId.cloak.onActor], ["unequipped", "Плащ защиты", false]);
    assert.equal(byId.ring.suppressedBy, "unattuned");
    assert.deepEqual([byId.prone.statuses, byId.prone.time, byId.prone.suppressedBy], [["prone"], "", null]);
    assert.equal(readEffects(actor, { isGM: true }).some((e) => e.id === "hidden"), true);
  });

  it("reads changes from system.changes with field labels, and the HUD statuses without exhaustion and concentration", async () => {
    const { readEffectChanges, readStatusEffects } = await import("../scripts/integrations/dnd5e.js");
    const actor = { system: { schema: { getField: (path) => ({ "attributes.ac": { label: "КД" }, "attributes.ac.bonus": undefined })[path] } } };
    globalThis.CONFIG = { DND5E: { abilities: { con: { label: "Телосложение" } }, skills: { prc: { label: "Внимательность" } } } };
    const effect = { system: { changes: [
      { key: "system.attributes.ac.bonus", type: "add", value: "1" }, { key: "flags.x", type: "override", value: "2" },
      { key: "system.abilities.con.value", type: "override", value: "19" }, { key: "system.skills.prc.bonuses.check", type: "add", value: "2" }
    ] } };
    assert.deepEqual(readEffectChanges(effect, actor).map((c) => [c.label, c.type, c.value]),
      [["КД", "add", "1"], ["flags.x", "override", "2"], ["Телосложение", "override", "19"], ["Внимательность: system.skills.prc.bonuses.check", "add", "2"]]);
    globalThis.CONFIG = {
      specialStatusEffects: { CONCENTRATING: "concentrating" },
      DND5E: { conditionTypes: { prone: {}, bleeding: { pseudo: true }, exhaustion: {} } },
      statusEffects: [{ id: "prone", name: "Лежит" }, { id: "bleeding", name: "Кровотечение" }, { id: "dodging", name: "Уклоняется" },
        { id: "exhaustion", name: "Истощение" }, { id: "concentrating", name: "Концентрация" }, { id: "encumbered", name: "Нагружен", hud: false }]
    };
    const galley = { system: { traits: { ci: { value: new Set(["prone"]) } } } };
    assert.deepEqual(readStatusEffects(galley).map((s) => [s.id, s.condition, s.immune]), [["prone", true, true], ["bleeding", false, false], ["dodging", false, false]]);
  });
});

describe("overview and biography reads (dnd5e 5.3.3)", () => {
  afterEach(() => { delete globalThis.CONFIG; delete globalThis.dnd5e; });

  const stub = () => {
    globalThis.CONFIG = { DND5E: {
      skills: { arc: { label: "Магия" }, prc: { label: "Внимательность" } },
      abilities: { int: { abbreviation: "инт" }, wis: { abbreviation: "мдр" }, dex: { abbreviation: "лвк" } },
      damageTypes: { fire: { label: "Огонь" }, cold: { label: "Холод" } },
      senses: { darkvision: "Тёмное зрение", blindsight: "Слепое зрение" },
      communicationTypes: { telepathy: { label: "Телепатия" } },
      movementUnits: { ft: { abbreviation: "фт" } }
    } };
    globalThis.dnd5e = { documents: { Trait: { keyLabel: (key) => ({ acid: "Кислота", sim: "Простое", lgt: "Лёгкие", herb: "Набор травника", poisoned: "Отравлен" })[key] ?? key } } };
  };

  it("reads skills and tools with the multiplier in effect, total and passive", async () => {
    const { readSkills, readTools } = await import("../scripts/integrations/dnd5e.js");
    stub();
    const actor = { system: {
      skills: { arc: { ability: "int", value: 1, prof: { multiplier: 2 }, total: 7, passive: 17 }, prc: { ability: "wis", value: 0, prof: { multiplier: 0.5 }, total: 2, passive: 12 } },
      tools: { herb: { ability: "int", value: 1, prof: { multiplier: 1 }, total: 3 } }
    } };
    assert.deepEqual(readSkills(actor).map((s) => [s.key, s.label, s.abilityAbbr, s.prof, s.total, s.passive]),
      [["arc", "Магия", "инт", 2, 7, 17], ["prc", "Внимательность", "мдр", 0.5, 2, 12]]);
    assert.deepEqual(readTools(actor).map((s) => [s.label, s.prof, s.total]), [["Набор травника", 1, 3]]);
  });

  it("reads defenses with custom entries and damage modification, senses from ranges, languages from labels", async () => {
    const { readDefenses, readSenses } = await import("../scripts/integrations/dnd5e.js");
    stub();
    const actor = { system: {
      traits: {
        di: { value: new Set(["acid"]), custom: "Магический урон; Серебро" }, dr: { value: new Set() }, dv: { value: new Set() },
        ci: { value: new Set(["poisoned"]) }, dm: { amount: { fire: "-3", cold: "2", acid: "" } },
        armorProf: { value: new Set(["lgt"]), custom: "" }, weaponProf: { value: new Set(["sim"]), custom: "Кнут" },
        languages: { labels: { languages: ["Общий", "Драконий"] }, communication: { telepathy: { value: 30 } } }
      },
      attributes: { senses: { ranges: { darkvision: 120, blindsight: 0 }, units: "ft", special: "Видит невидимое" } },
      skills: { prc: { passive: 14 }, inv: { passive: 11 }, ins: { passive: 13 } }
    } };
    globalThis.CONFIG.DND5E.damageTypes.acid = { label: "Кислота" };
    assert.deepEqual(readDefenses(actor), {
      dr: [], di: ["Кислота", "Магический урон", "Серебро"], dv: [], ci: ["Отравлен"], dm: ["Огонь −3", "Холод +2"],
      types: { dr: [], di: ["acid"], dv: [], dm: ["fire", "cold"] }
    });
    assert.deepEqual(readSenses(actor), {
      passive: { prc: 14, inv: 11, ins: 13 },
      senses: ["Тёмное зрение 120 фт", "Видит невидимое"],
      armor: ["Лёгкие"], weapon: ["Простое", "Кнут"],
      languages: ["Общий", "Драконий", "Телепатия 30 фт"]
    });
  });

  it("reads the stored characteristics and the raw biography, not the prepared values", async () => {
    const { readBiography } = await import("../scripts/integrations/dnd5e.js");
    const actor = { system: { details: { age: "999" } }, _source: { system: { details: { age: "142", eyes: null, biography: { value: "<p>Долг</p>" } } } } };
    assert.deepEqual(readBiography(actor, ["age", "eyes"]), { fields: { age: "142", eyes: "" }, biography: "<p>Долг</p>" });
  });
});

describe("tooltip card reads (dnd5e 5.3.3)", () => {
  afterEach(() => { delete globalThis.CONFIG; });

  it("reads an item's card data into numbers, text and pills", async () => {
    const { readCardData } = await import("../scripts/integrations/dnd5e.js");
    globalThis.CONFIG = { DND5E: { currencies: { gp: { abbreviation: "зм" } }, weightUnits: { lb: { abbreviation: "фнт" } } } };
    const sickle = {
      documentName: "Item", type: "weapon", name: "Серп", img: "sickle.webp", isOwner: true,
      system: {
        rarity: "", attunement: "", armor: { value: null },
        getCardData: async () => ({
          name: "Серп", img: "sickle.webp", subtitle: "Простое рукопашное • Подсечка",
          labels: { toHit: "+2", damages: [{ formula: "1d4", label: "1d4 Рубящий", damageType: "slashing" }, { label: "1d6 Огонь", damageType: "fire|cold" }] },
          uses: null, weight: { value: 2, units: "lb" }, price: { value: 1, denomination: "gp" },
          tags: ["Ритуал"], properties: ["Действие", "", "Владение"], description: { value: "<p>Изогнутый клинок.</p>" }
        })
      }
    };
    const card = await readCardData(sickle);
    assert.deepEqual(card.stats, [
      { key: "toHit", value: "+2" }, { key: "damage", value: "1d4 Рубящий, 1d6 Огонь" },
      { key: "weight", value: "2 фнт" }, { key: "price", value: "1 зм" }
    ]);
    assert.deepEqual(card.damages.map((d) => d.types), [["slashing"], ["fire", "cold"]]);
    assert.deepEqual([card.kind, card.subtitle, card.properties, card.rarity, card.school], ["item", "Простое рукопашное • Подсечка", ["Ритуал", "Действие", "Владение"], "common", null]);
  });

  it("wraps an effect's or a rule page's rich tooltip, and names anything else", async () => {
    const { readCardData } = await import("../scripts/integrations/dnd5e.js");
    const effect = { documentName: "ActiveEffect", name: "Ускорение", img: "haste.webp", richTooltip: async () => ({ content: "<section>Скорость ×2</section>" }) };
    const page = { documentName: "JournalEntryPage", name: "Лежит", system: { richTooltip: async function () { return { content: `<p>${this.text}</p>` }; }, text: "Помеха" } };
    const actor = { documentName: "Actor", name: "Торвин", img: "torvin.webp" };
    assert.deepEqual([await readCardData(effect)].map((c) => [c.kind, c.html]), [["rich", "<section>Скорость ×2</section>"]]);
    assert.equal((await readCardData(page)).html, "<p>Помеха</p>");
    assert.deepEqual([(await readCardData(actor)).kind, await readCardData(null)], ["doc", null]);
  });
});

describe("damage type reads (dnd5e 5.3.3)", () => {
  afterEach(() => { delete globalThis.CONFIG; });

  it("reads the label, the Color as CSS and the rule page; an added type may have no colour", async () => {
    const { readDamageType } = await import("../scripts/integrations/dnd5e.js");
    globalThis.CONFIG = { DND5E: { damageTypes: {
      fire: { label: "Огонь", color: { css: "#ff6a2b" }, reference: "Compendium.dnd5e.rules.JournalEntry.x.JournalEntryPage.fire" },
      acid: { label: "Кислота", color: 0x839d50 },
      eldritch: { label: "Потустороннее" }
    } } };
    assert.deepEqual(readDamageType("fire"), { key: "fire", label: "Огонь", color: "#ff6a2b", reference: "Compendium.dnd5e.rules.JournalEntry.x.JournalEntryPage.fire" });
    assert.equal(readDamageType("acid").color, "#839d50");
    assert.deepEqual([readDamageType("eldritch").color, readDamageType("nope")], [null, null]);
  });
});

describe("NPC reads (dnd5e 5.3.3)", () => {
  afterEach(() => { delete globalThis.CONFIG; });

  it("reads challenge rating, experience, size, prepared type label and legendary pools", async () => {
    const { readNpc } = await import("../scripts/integrations/dnd5e.js");
    globalThis.CONFIG = { DND5E: { actorSizes: { huge: { label: "Огромный" } } } };
    const dragon = { type: "npc", system: {
      details: { cr: 17, xp: { value: 18000 }, type: { value: "dragon", subtype: "", swarm: "", custom: "", label: "Дракон" } },
      traits: { size: "huge" },
      resources: { legact: { max: 3, spent: 1, value: 2 }, legres: { max: 3, spent: 0, value: 3 }, lair: { value: true } }
    } };
    assert.deepEqual(readNpc(dragon), { cr: 17, xp: 18000, size: "Огромный", type: "Дракон",
      legendary: { actions: { max: 3, value: 2 }, resistance: { max: 3, value: 3 } } });
    const guard = { type: "npc", system: { details: { cr: 0.125, xp: { value: 25 }, type: { label: "Гуманоид" } }, traits: { size: "med" },
      resources: { legact: { max: 0, spent: 0 }, legres: { max: 0, spent: 0 } } } };
    assert.deepEqual(readNpc(guard).legendary, { actions: null, resistance: null });
    assert.equal(readNpc(guard).cr, 0.125);
    assert.equal(readNpc({ type: "character", system: {} }), null);
    assert.equal(readNpc({ type: "npc", system: { details: { cr: null } } }).cr, null);
  });
});

describe("vehicle reads (dnd5e 5.3.3)", () => {
  afterEach(() => { delete globalThis.CONFIG; });

  it("reads type, size, keel and beam, thresholds, travel speed, the hold in tons and the crew groups", async () => {
    const { readVehicle } = await import("../scripts/integrations/dnd5e.js");
    globalThis.CONFIG = { DND5E: {
      vehicleTypes: { water: "Водный транспорт" }, actorSizes: { grg: { label: "Громадный" } },
      movementUnits: { ft: { abbreviation: "фт" } },
      travelUnits: { mph: { abbreviationHour: "миль/ч", conversion: 1 } },
      weightUnits: { lb: { abbreviation: "фнт", conversion: 1 }, kg: { abbreviation: "кг", conversion: 2.5 }, tn: { abbreviation: "т", conversion: 2000 } }
    } };
    const ship = { type: "vehicle", system: {
      details: { type: "water" },
      traits: { size: "grg", keel: { value: 70, units: "ft" }, beam: { units: "ft" } },
      attributes: { hp: { value: 300, max: 300, dt: 15, mt: 20 }, travel: { speeds: { land: 0.5, water: 5, air: 0 }, units: "mph" },
        encumbrance: { value: 4000, max: 200000 }, capacity: { cargo: { value: 100, units: "tn" } } },
      crew: { max: 4, value: ["Actor.a", "Actor.b"] }, passengers: { max: 6, value: [] }, draft: { value: [] },
      cargo: { crew: [{ name: "Матросы", quantity: 10 }], passengers: [{ name: "", quantity: 1 }] }
    } };
    const v = readVehicle(ship);
    assert.deepEqual([v.typeLabel, v.size, v.keel, v.beam, v.dt, v.mt], ["Водный транспорт", "Громадный", "70 фт", "", 15, 20]);
    assert.deepEqual(v.speed, { value: 5, unit: "миль/ч" });
    assert.deepEqual(v.cargo, { load: 2, capacity: 100, unit: "т" });
    assert.deepEqual(v.crew, { max: 4, uuids: ["Actor.a", "Actor.b"] });
    assert.deepEqual(v.draft, { max: null, uuids: [] });
    assert.deepEqual(v.legacy, [{ kind: "crew", name: "Матросы", quantity: 10 }]);
    globalThis.game = { settings: { get: (scope, key) => key === "metricWeightUnits" } };
    try {
      assert.equal(readVehicle(ship).cargo.load, 5);
      // A metric hold in megagrams: dnd5e's key is «Mg», not «mg».
      CONFIG.DND5E.weightUnits.Mg = { abbreviation: "Мг", conversion: 2500 };
      ship.system.attributes.capacity.cargo.units = "Mg";
      assert.equal(readVehicle(ship).cargo.load, 4);
    } finally {
      delete globalThis.game;
    }
    assert.equal(readVehicle({ type: "npc", system: {} }), null);
  });
});

describe("drops from outside (dnd5e 5.3.3 sheet calls, ADR 0004)", () => {
  afterEach(() => { delete globalThis.CONFIG; });

  it("create through the sheet's _onDropCreateItems(event, items, \"copy\"), or _onDropItemContainer for a container", async () => {
    const { createDroppedItems, sheetUnsupportedTypes } = await import("../scripts/integrations/dnd5e.js");
    const calls = [];
    class CharacterActorSheet {
      static unsupportedItemTypes = new Set(["facility"]);
      async _onDropCreateItems(event, items, behavior) { calls.push(["create", event, items, behavior]); return items.map((i) => ({ id: `new-${i.id}` })); }
      async _onDropItemContainer(event, item, container) { calls.push(["container", event, item, container]); return [{ id: `in-${item.id}` }]; }
    }
    const actor = { sheet: new CharacterActorSheet() };
    const event = { type: "drop" };
    const sword = { id: "s" };
    assert.deepEqual(await createDroppedItems(actor, event, [sword]), [{ id: "new-s" }]);
    assert.deepEqual(calls[0], ["create", event, [sword], "copy"]);
    const bag = { id: "bag" };
    assert.deepEqual(await createDroppedItems(actor, event, [sword], { container: bag }), [{ id: "in-s" }]);
    assert.deepEqual(calls[1], ["container", event, sword, bag]);
    assert.equal(CharacterActorSheet.prototype._onDropCreateItems.length, 3, "dnd5e's signature: (event, items, behavior)");
    assert.equal(CharacterActorSheet.prototype._onDropItemContainer.length, 3, "dnd5e's signature: (event, item, container)");
    assert.deepEqual([...sheetUnsupportedTypes(actor)], ["facility"]);
  });

  it("fall back to createWithContents and createDocuments with keepId on a sheet without those methods", async () => {
    const { createDroppedItems } = await import("../scripts/integrations/dnd5e.js");
    const seen = [];
    globalThis.CONFIG = { Item: { documentClass: {
      createWithContents: async (items, options) => { seen.push(["contents", items, options]); return items.map((i) => ({ name: i.id })); },
      createDocuments: async (data, options) => { seen.push(["documents", data, options]); return data; }
    } } };
    const actor = { sheet: {} };
    const info = console.info;
    console.info = () => {};
    try {
      assert.deepEqual(await createDroppedItems(actor, {}, [{ id: "s" }]), [{ name: "s" }]);
    } finally {
      console.info = info;
    }
    assert.deepEqual(seen[1], ["documents", [{ name: "s" }], { parent: actor, keepId: true }]);
  });

  it("create a spell that stays a spell with dnd5e's data reset and the spell type's onDropCreate", async () => {
    const { createDroppedSpell } = await import("../scripts/integrations/dnd5e.js");
    const made = [];
    const actor = { id: "a" };
    globalThis.CONFIG = { Item: {
      dataModels: { spell: { onDropCreate: (event, who, data) => { data.system.method = "spell"; } } },
      documentClass: { create: async (data, options) => { made.push([data, options]); return { id: "new" }; } }
    } };
    const spell = { toObject: () => ({ _id: "x", name: "Огненный шар", type: "spell", system: { prepared: 1, level: 3 } }) };
    assert.deepEqual(await createDroppedSpell(actor, {}, spell), [{ id: "new" }]);
    assert.deepEqual(made, [[{ name: "Огненный шар", type: "spell", system: { level: 3, method: "spell" } }, { parent: actor }]]);
  });
});
