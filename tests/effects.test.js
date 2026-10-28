import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { categorizeEffects, changeText, conditionGrid } from "../scripts/core/effects.js";

const statusIds = new Set(["prone", "dodging", "concentrating"]);
const options = { statusIds, concentrating: "concentrating" };
const effect = (id, extra = {}) => ({ id, statuses: [], onActor: false, disabled: false, suppressed: false, temporary: false, ...extra });

describe("effect categories", () => {
  it("sort effects into dnd5e's categories, hide empty ones, and lead the temporary ones with concentration and statuses", () => {
    const groups = categorizeEffects([
      effect("haste", { temporary: true, onActor: true }),
      effect("cloak"),
      effect("light", { disabled: true }),
      effect("ring", { suppressed: true, disabled: true }),
      effect("prone", { statuses: ["prone"], onActor: true }),
      effect("conc", { statuses: ["concentrating"], onActor: true, temporary: true })
    ], options);
    assert.deepEqual(groups.map((g) => [g.key, g.entries.map((e) => e.id)]), [
      ["temporary", ["conc", "prone", "haste"]],
      ["passive", ["cloak"]],
      ["inactive", ["light"]],
      ["suppressed", ["ring"]]
    ]);
    assert.deepEqual(categorizeEffects([effect("cloak")], options).map((g) => g.key), ["passive"]);
  });

  it("give concentration and a removable condition their ×, everything else a switch", () => {
    const kinds = categorizeEffects([
      effect("conc", { statuses: ["concentrating"], onActor: true }),
      effect("prone", { statuses: ["prone"], onActor: true }),
      // toggleStatusEffect removes only an effect on the actor that carries that one status
      effect("web", { statuses: ["prone", "dodging"], onActor: true }),
      effect("boots", { statuses: ["prone"] })
    ], options).flatMap((g) => g.entries).map((e) => [e.id, e.kind]);
    assert.deepEqual(kinds, [["conc", "concentration"], ["prone", "condition"], ["web", "effect"], ["boots", "effect"]]);
  });
});

describe("effect changes", () => {
  it("read as the label and the change by its type", () => {
    assert.equal(changeText({ type: "add", value: "1" }, "КД"), "КД +1");
    assert.equal(changeText({ type: "add", value: -2 }, "Скорость"), "Скорость −2");
    assert.equal(changeText({ type: "add", value: "+1d4" }, "Атака"), "Атака +1d4");
    assert.equal(changeText({ type: "multiply", value: "2" }, "Вес"), "Вес ×2");
    assert.equal(changeText({ type: "override", value: "19" }, "Телосложение"), "Телосложение: 19");
    assert.equal(changeText({ type: "upgrade", value: "60" }, "Тёмное зрение"), "Тёмное зрение ≥ 60");
    assert.equal(changeText({ type: "custom.0", value: "x" }, "flags.a"), "flags.a: x");
  });
});

describe("conditions grid", () => {
  it("list conditions, then statuses, each by name, with the active ones lit", () => {
    const grid = conditionGrid([
      { id: "prone", name: "Лежит", condition: true },
      { id: "blinded", name: "Ослеплён", condition: true },
      { id: "hiding", name: "Прячется", condition: false },
      { id: "dodging", name: "Уклоняется", condition: false }
    ], new Set(["prone", "dodging"]), "ru");
    assert.deepEqual(grid.conditions.map((c) => [c.id, c.on]), [["prone", true], ["blinded", false]]);
    assert.deepEqual(grid.statuses.map((c) => [c.id, c.on]), [["hiding", false], ["dodging", true]]);
  });
});
