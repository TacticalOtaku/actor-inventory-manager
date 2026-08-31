// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Paperdoll Templates & GM Editor Tests
// ─────────────────────────────────────────────────────────

import test from "node:test";
import assert from "node:assert/strict";

import { FLAGS, MODULE_ID, SLOTS, TEMPLATE_PRESETS } from "../scripts/constants.js";
import { configurePaperdollRuntime, resetPaperdollRuntime } from "../scripts/core/paperdoll-runtime.js";
import {
  DND_2014_TEMPLATE,
  DND_2024_TEMPLATE,
  deleteWorldCustomTemplate,
  exportTemplateJSON,
  getAllTemplates,
  getActorPaperdollTemplate,
  getActorSlots,
  getTemplateById,
  importTemplateJSON,
  PRESET_TEMPLATES,
  setActorPaperdollTemplate
} from "../scripts/core/paperdoll-templates.js";
import { getValidSlotsForItem, isItemCompatibleWithSlot } from "../scripts/core/item-classifier.js";
import { equipmentRuleEngine } from "../scripts/core/equipment-rules.js";

test("Paperdoll Templates: Built-in presets structure & validity", () => {
  assert.ok(DND_2024_TEMPLATE, "D&D 2024 template must exist");
  assert.equal(DND_2024_TEMPLATE.id, TEMPLATE_PRESETS.DND_2024);
  assert.equal(DND_2024_TEMPLATE.attunementMax, 3);
  assert.ok(Array.isArray(DND_2024_TEMPLATE.slots));
  assert.equal(DND_2024_TEMPLATE.slots.length, 11);

  assert.ok(DND_2014_TEMPLATE, "D&D 2014 template must exist");
  assert.equal(DND_2014_TEMPLATE.id, TEMPLATE_PRESETS.DND_2014);
  assert.equal(DND_2014_TEMPLATE.attunementMax, 3);
  assert.ok(Array.isArray(DND_2014_TEMPLATE.slots));
  assert.equal(DND_2014_TEMPLATE.slots.length, 11);
});

test("Paperdoll Templates: Default fallback to D&D 2024 when unassigned", () => {
  const blankActor = {
    id: "actor-blank-1",
    name: "Blank Hero",
    flags: {},
    getFlag(mod, flag) {
      return this.flags?.[mod]?.[flag];
    }
  };

  const templateCtx = getActorPaperdollTemplate(blankActor);
  assert.equal(templateCtx.templateId, TEMPLATE_PRESETS.DND_2024, "Must default to dnd2024");
  assert.equal(templateCtx.attunementMax, 3);
  assert.equal(templateCtx.slots.length, 11);
  assert.equal(templateCtx.leftSlots.length, 4);
  assert.equal(templateCtx.centerSlots.length, 3);
  assert.equal(templateCtx.rightSlots.length, 4);
});

test("Paperdoll Templates: Actor assigned D&D 2014 template", () => {
  const actor2014 = {
    id: "actor-2014",
    name: "Old School Fighter",
    flags: {
      [MODULE_ID]: {
        [FLAGS.TEMPLATE_ID]: TEMPLATE_PRESETS.DND_2014
      }
    },
    getFlag(mod, flag) {
      return this.flags?.[mod]?.[flag];
    }
  };

  const templateCtx = getActorPaperdollTemplate(actor2014);
  assert.equal(templateCtx.templateId, TEMPLATE_PRESETS.DND_2014);
  assert.equal(templateCtx.isPreset, true);
});

test("Paperdoll Templates: Actor with custom slot overrides (e.g. Monk Tattoo & Potion Belt)", () => {
  const customSlots = [
    {
      id: "tattoo1",
      label: "Dragon Tattoo",
      icon: "fa-solid fa-dragon",
      column: "left",
      category: "equipment",
      itemTypes: ["equipment", "loot"],
      accepts: ["tattoo", "ink", "mark"],
      order: 10,
      rules: { singlePerActor: false, locksOffHandOn2H: false }
    },
    {
      id: "potion_belt",
      label: "Alchemist Belt",
      icon: "fa-solid fa-flask",
      column: "center",
      category: "equipment",
      itemTypes: ["consumable"],
      accepts: ["potion", "elixir", "vial"],
      order: 10,
      rules: { singlePerActor: false, locksOffHandOn2H: false }
    }
  ];

  const customActor = {
    id: "actor-monk",
    name: "Monk Master",
    flags: {
      [MODULE_ID]: {
        [FLAGS.CUSTOM_TEMPLATE]: {
          id: "custom-monk",
          name: "Monk Custom",
          attunementMax: 4,
          slots: customSlots
        }
      }
    },
    getFlag(mod, flag) {
      return this.flags?.[mod]?.[flag];
    }
  };

  const templateCtx = getActorPaperdollTemplate(customActor);
  assert.equal(templateCtx.attunementMax, 4);
  assert.equal(templateCtx.slots.length, 2);
  assert.equal(templateCtx.leftSlots[0].id, "tattoo1");
  assert.equal(templateCtx.centerSlots[0].id, "potion_belt");

  // Verify dynamic slot compatibility
  const tattooItem = {
    id: "item-tat",
    name: "Tattoo of the Dragon",
    type: "equipment",
    system: { type: { value: "tattoo" } }
  };

  const validSlots = getValidSlotsForItem(tattooItem, customActor);
  assert.ok(validSlots.includes("tattoo1"), "Tattoo must fit into custom tattoo1 slot");

  const potionItem = {
    id: "item-pot",
    name: "Potion of Healing",
    type: "consumable",
    system: { type: { value: "potion" } }
  };

  const isPotCompatible = isItemCompatibleWithSlot(potionItem, "potion_belt", customActor);
  assert.equal(isPotCompatible, true, "Potion must fit into custom potion_belt slot");
});

test("Paperdoll Templates: JSON Export and Import roundtrip", async () => {
  const original = getTemplateById(TEMPLATE_PRESETS.DND_2024);
  const json = exportTemplateJSON(TEMPLATE_PRESETS.DND_2024);
  assert.ok(json.includes('"id": "dnd2024"'));

  const parsed = JSON.parse(json);
  assert.equal(parsed.id, "dnd2024");
  assert.equal(parsed.slots.length, 11);
});

test("Paperdoll Templates: runtime port isolates Foundry persistence", async () => {
  let storedTemplates = {};
  const logEntries = [];
  configurePaperdollRuntime({
    getCustomTemplates: () => storedTemplates,
    setCustomTemplates: async value => {
      storedTemplates = value;
    },
    isGM: () => true,
    localize: (key, fallback) => fallback ?? key,
    logInfo: (message, data) => logEntries.push({ message, data })
  });

  try {
    const imported = await importTemplateJSON(JSON.stringify({
      id: "runtime-test",
      name: "Runtime Test",
      slots: []
    }));

    assert.equal(imported.id, "runtime-test");
    assert.equal(storedTemplates["runtime-test"].isPreset, false);
    assert.equal(logEntries.at(-1).data.templateId, "runtime-test");
  } finally {
    resetPaperdollRuntime();
  }
});

test("Paperdoll Templates: non-GM assignment warns without actor writes", async () => {
  const warnings = [];
  let writes = 0;
  configurePaperdollRuntime({
    isGM: () => false,
    localize: (key, fallback) => fallback ?? key,
    notifyWarning: message => warnings.push(message)
  });
  const actor = {
    setFlag: async () => { writes += 1; },
    unsetFlag: async () => { writes += 1; }
  };

  try {
    await setActorPaperdollTemplate(actor, TEMPLATE_PRESETS.DND_2014);
    assert.equal(writes, 0);
    assert.equal(warnings.length, 1);
  } finally {
    resetPaperdollRuntime();
  }
});

test("Paperdoll Templates: GM assignment and deletion use injected persistence", async () => {
  let storedTemplates = {
    removable: { id: "removable", name: "Remove Me", slots: [], isPreset: false }
  };
  const flagWrites = [];
  const actorUpdates = [];
  configurePaperdollRuntime({
    getCustomTemplates: () => storedTemplates,
    setCustomTemplates: async value => { storedTemplates = value; },
    isGM: () => true,
    localize: (key, fallback) => fallback ?? key
  });
  const actor = {
    id: "actor-runtime",
    system: { attributes: { attunement: { max: 3 } } },
    setFlag: async (moduleId, key, value) => flagWrites.push({ moduleId, key, value }),
    unsetFlag: async (moduleId, key) => flagWrites.push({ moduleId, key, unset: true }),
    update: async changes => actorUpdates.push(changes)
  };

  try {
    await setActorPaperdollTemplate(actor, TEMPLATE_PRESETS.DND_2014);
    assert.deepEqual(flagWrites, [
      { moduleId: MODULE_ID, key: FLAGS.CUSTOM_TEMPLATE, unset: true },
      { moduleId: MODULE_ID, key: FLAGS.TEMPLATE_ID, value: TEMPLATE_PRESETS.DND_2014 }
    ]);
    assert.deepEqual(actorUpdates, [{ "system.attributes.attunement.max": 3 }]);

    await deleteWorldCustomTemplate("removable");
    assert.equal(storedTemplates.removable, undefined);
    await assert.rejects(
      deleteWorldCustomTemplate(TEMPLATE_PRESETS.DND_2024),
      /Cannot delete built-in preset/
    );
  } finally {
    resetPaperdollRuntime();
  }
});
