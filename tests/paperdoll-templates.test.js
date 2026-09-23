import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { configurePaperdollRuntime, resetPaperdollRuntime } from "../scripts/core/paperdoll-runtime.js";
import {
  getActorPaperdollTemplate,
  importTemplateJSON,
  isWorldCustomTemplate,
  normalizeTemplateData,
  saveWorldCustomTemplate
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

  it("marks an actor-only layout as custom", () => {
    const actor = { flags: { "actor-inventory-manager": { paperdollCustomTemplate: { slots: [slot("x")] } } } };
    const context = getActorPaperdollTemplate(actor);
    assert.equal(context.templateId, "custom");
    assert.equal(context.isActorCustom, true);
  });
});
