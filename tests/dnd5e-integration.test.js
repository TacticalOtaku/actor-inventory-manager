import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  extractActorActions,
  extractSpellSlots,
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
