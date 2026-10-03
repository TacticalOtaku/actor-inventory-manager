import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { configurePaperdollRuntime, resetPaperdollRuntime } from "../scripts/core/paperdoll-runtime.js";
import {
  getActorPaperdollTemplate,
  importTemplateJSON,
  isWorldCustomTemplate,
  normalizeTemplateData,
  planTemplateApply,
  saveWorldCustomTemplate,
  setActorPaperdollTemplate
} from "../scripts/core/paperdoll-templates.js";

afterEach(() => resetPaperdollRuntime());

const slot = id => ({ id, label: id, column: "left", itemTypes: ["equipment"] });

describe("template validation", () => {
  it("refuses ids reserved by presets", () => {
    assert.throws(() => normalizeTemplateData({ id: "dnd2024", slots: [slot("a")] }), /reserved/);
    assert.throws(() => normalizeTemplateData({ id: "custom", slots: [slot("a")] }), /reserved/);
  });

  it("refuses duplicate or missing slot ids", () => {
    assert.throws(() => normalizeTemplateData({ id: "t", slots: [slot("a"), slot("a")] }), /more than once/);
    assert.throws(() => normalizeTemplateData({ id: "t", slots: [{ label: "x" }] }), /no id/);
  });

  it("normalises columns, rules and the attunement cap", () => {
    const template = normalizeTemplateData({ id: "t", attunementMax: 42, slots: [{ id: "a", column: "sideways" }] });
    assert.equal(template.slots[0].column, "center");
    assert.deepEqual(template.slots[0].rules, { singlePerActor: false, locksOffHandOn2H: false, isArmor: false, isShield: false });
    assert.equal(template.attunementMax, 9);
  });

  it("plans an apply from the editor without touching an unchanged cap", () => {
    // Opened on an actor whose cap (6) differs from the template's (3), only a slot moved.
    assert.deepEqual(planTemplateApply({ isCustomWorking: false, templateCap: 3, initialCap: 6, cap: 6 }), { custom: false, writeCap: false });
    // The GM changed the cap away from the template: the actor gets its own copy.
    assert.deepEqual(planTemplateApply({ isCustomWorking: false, templateCap: 3, initialCap: 3, cap: 5 }), { custom: true, writeCap: true });
    // Changed back to the template's own cap: stay linked, write it.
    assert.deepEqual(planTemplateApply({ isCustomWorking: false, templateCap: 3, initialCap: 6, cap: 3 }), { custom: false, writeCap: true });
    // Edited slots always make an actor-only layout.
    assert.deepEqual(planTemplateApply({ isCustomWorking: true, templateCap: 3, initialCap: 3, cap: 3 }), { custom: true, writeCap: false });
  });

  it("reports invalid JSON in words", async () => {
    await assert.rejects(importTemplateJSON("{nope"), /not valid JSON/);
  });
});

describe("world templates", () => {
  it("are linked by id and read back from the world", async () => {
    let stored = {};
    configurePaperdollRuntime({ isGM: () => true, getCustomTemplates: () => stored, setCustomTemplates: async value => { stored = value; } });
    await saveWorldCustomTemplate({ id: "elf", name: "Elf", slots: [slot("ear")] });
    assert.equal(isWorldCustomTemplate("elf"), true);
    assert.equal(isWorldCustomTemplate("dnd2024"), false);

    const actor = { flags: { "actor-inventory-manager": { paperdollTemplateId: "elf" } } };
    const context = getActorPaperdollTemplate(actor);
    assert.equal(context.templateId, "elf");
    assert.equal(context.isActorCustom, false);
    assert.deepEqual(context.slots.map(s => s.id), ["ear"]);
  });

  it("leave the actor's attunement cap alone when asked to", async () => {
    configurePaperdollRuntime({ isGM: () => true });
    const writes = [];
    const actor = {
      type: "character", hasPlayerOwner: true, flags: {},
      system: { attributes: { attunement: { max: 6 } } },
      async update(changes) { writes.push(changes); },
      async setFlag(scope, key, value) { writes.push({ [`flags.${scope}.${key}`]: value }); }
    };
    await setActorPaperdollTemplate(actor, "dnd2024", null, { applyAttunement: false });
    assert.equal(writes.some(change => "system.attributes.attunement.max" in change), false);
    await setActorPaperdollTemplate(actor, "dnd2024", null);
    assert.equal(writes.some(change => change["system.attributes.attunement.max"] === 3), true);
  });

  it("marks an actor-only layout as custom", () => {
    const actor = { flags: { "actor-inventory-manager": { paperdollCustomTemplate: { slots: [slot("x")] } } } };
    const context = getActorPaperdollTemplate(actor);
    assert.equal(context.templateId, "custom");
    assert.equal(context.isActorCustom, true);
  });
});
