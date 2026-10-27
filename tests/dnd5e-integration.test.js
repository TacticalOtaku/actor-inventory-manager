import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  extractActorActions,
  extractActorVitals,
  extractSpellSlots,
  formatActivationLabel,
  formatItemForDisplay,
  getContainerContentsCount,
  resolveItemActivation,
  resolveItemUses,
  resolveSpellPreparation,
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
    assert.equal(uses.hasRecharge, false);
  });

  it("reads recharge from uses.recovery", () => {
    const uses = resolveItemUses({
      system: { uses: { max: 1, spent: 0, value: 1, recovery: [{ period: "recharge", formula: "5" }] } }
    });
    assert.equal(uses.hasRecharge, true);
    assert.equal(uses.rechargeDisplay, "5+");
  });

  it("marks a recharging item without uses left as spent", () => {
    const uses = resolveItemUses({
      system: { uses: { max: 1, spent: 1, value: 0, recovery: [{ period: "recharge", formula: "6" }] } }
    });
    assert.equal(uses.rechargeDisplay, "6");
    assert.equal(uses.isCharged, false);
  });
});

describe("extractActorActions", () => {
  const makeFeat = (id, name, activationType, extra = {}) => ({
    id,
    uuid: `Actor.x.Item.${id}`,
    name,
    img: "",
    type: "feat",
    system: {
      activities: activationType
        ? { contents: [{ activation: { type: activationType, value: null } }] }
        : { contents: [] },
      uses: {},
      ...extra
    }
  });

  it("routes activities into the right buckets instead of dumping everything into passives", () => {
    stubDnd5eConfig();
    const actor = {
      items: new Map([
        ["1", makeFeat("1", "Second Wind", "bonus")],
        ["2", makeFeat("2", "Action Surge", "action")],
        ["3", makeFeat("3", "Riposte", "reaction")],
        ["4", makeFeat("4", "Darkvision", null)],
        ["5", makeFeat("5", "Aura of Protection", "longRest")]
      ])
    };

    const result = extractActorActions(actor);
    assert.deepEqual(result.actions.map(a => a.name), ["Action Surge"]);
    assert.deepEqual(result.bonus.map(a => a.name), ["Second Wind"]);
    assert.deepEqual(result.reactions.map(a => a.name), ["Riposte"]);
    assert.deepEqual(result.passives.map(a => a.name).sort(), ["Aura of Protection", "Darkvision"]);
  });

  it("treats items flagged as traits as passive regardless of activation", () => {
    stubDnd5eConfig();
    const feat = makeFeat("1", "Brave", "action", { properties: new Set(["trait"]) });
    const actor = { items: new Map([["1", feat]]) };
    const result = extractActorActions(actor);
    assert.equal(result.actions.length, 0);
    assert.deepEqual(result.passives.map(a => a.name), ["Brave"]);
  });

  it("filters by the search query", () => {
    stubDnd5eConfig();
    const actor = {
      items: new Map([
        ["1", makeFeat("1", "Second Wind", "bonus")],
        ["2", makeFeat("2", "Action Surge", "action")]
      ])
    };
    const result = extractActorActions(actor, "surge");
    assert.deepEqual(result.actions.map(a => a.name), ["Action Surge"]);
    assert.equal(result.bonus.length, 0);
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

describe("formatActivationLabel", () => {
  afterEach(() => {
    delete globalThis.game;
  });

  it("uses the module's own label for a standard activation it translates", () => {
    const own = { "AIM.spells.activation.bonus": "Бонусное действие" };
    globalThis.game = { i18n: { has: (key, fallback) => fallback === false && key in own, localize: key => own[key] ?? key } };
    assert.equal(formatActivationLabel({ type: "bonus", config: { label: "Bonus Action" } }), "Бонусное действие");
  });

  it("keeps the system label, with its count, for anything else", () => {
    globalThis.game = { i18n: { has: () => false, localize: key => key } };
    assert.equal(formatActivationLabel({ type: "legendary", value: 2, config: { label: "Legendary Action" } }), "2 Legendary Action");
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

describe("container contents count", () => {
  it("reads dnd5e 5.3.3's count, a number or a promise for compendium items", async () => {
    assert.equal(await getContainerContentsCount({ type: "container", system: { contentsCount: 11 } }), 11);
    assert.equal(await getContainerContentsCount({ type: "container", system: { contentsCount: Promise.resolve(2) } }), 2);
  });

  it("is zero for anything that is not a container", async () => {
    assert.equal(await getContainerContentsCount({ type: "weapon", system: {} }), 0);
    assert.equal(await getContainerContentsCount(null), 0);
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
      system: { level: 3, activities: { contents: [{ activation: { type: "action" } }] }, getFavoriteData: async () => ({ title: "Огненный шар", subtitle: ["В, С, М", "1 действие"], save: { dc: 15 } }) } };
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
    assert.deepEqual([fb.itemType, fb.itemId, fb.activation, fb.level, fb.save.dc, fb.title], ["spell", "fb", "action", 3, 15, "Огненный шар"]);
    assert.deepEqual([act.activityId, act.itemId, act.activation, act.title], ["act1", "sh", "reaction", "Парирование"]);
    assert.deepEqual([slots.level, slots.uses, slots.img], [3, { value: 1, max: 2 }, "slots-spell3.webp"]);
    assert.deepEqual([skill.title, skill.modifier, skill.img], ["Атлетика", 5, "ath.svg"]);
  });
});
