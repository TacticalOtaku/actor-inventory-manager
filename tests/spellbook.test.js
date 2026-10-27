import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { castable, groupSpellbook, pipTarget, preparationState } from "../scripts/core/spellbook.js";

const spell = (name, level, extra = {}) => ({
  id: name, name, level, method: "spell", prepared: 0, ritual: false, concentration: false, activation: "action", sort: 0, ...extra
});

describe("spellbook sections", () => {
  const spells = [
    spell("Свет", 0),
    spell("Волшебная стрела", 1, { prepared: 1 }),
    spell("Щит", 1, { prepared: 2, activation: "reaction" }),
    spell("Обнаружение магии", 1, { ritual: true, concentration: true }),
    spell("Огненный шар", 3, { prepared: 1 }),
    spell("Мистический заряд", 0, { method: "pact" }),
    spell("Невидимость", 2, { method: "innate" }),
    spell("Маскировка", 1, { method: "atwill" })
  ];

  it("lists prepared spells of circle 1 and higher by circle, then the book by circle with cantrips first", () => {
    const book = groupSpellbook(spells, { slotLevels: [1, 2, 3] });
    assert.deepEqual(book.prepared.map((s) => s.name), ["Волшебная стрела", "Щит", "Огненный шар"]);
    assert.deepEqual(book.circles.map((c) => [c.level, c.entries.map((s) => s.name)]), [
      [0, ["Мистический заряд", "Свет"]],
      [1, ["Волшебная стрела", "Обнаружение магии", "Щит"]],
      [2, []],
      [3, ["Огненный шар"]]
    ]);
    assert.deepEqual(book.innate.map((s) => s.name), ["Невидимость"]);
    assert.deepEqual(book.atwill.map((s) => s.name), ["Маскировка"]);
  });

  it("combines filters and the search", () => {
    const only = (filters, query = "") => groupSpellbook(spells, { slotLevels: [1, 2, 3], filters, query });
    const names = (book) => [...book.circles.flatMap((c) => c.entries), ...book.innate, ...book.atwill].map((s) => s.name);
    assert.deepEqual(names(only(["ritual", "concentration"])), ["Обнаружение магии"]);
    assert.deepEqual(names(only(["reaction"])), ["Щит"]);
    assert.deepEqual(names(only(["prepared"])), ["Мистический заряд", "Свет", "Волшебная стрела", "Щит", "Огненный шар", "Невидимость", "Маскировка"]);
    assert.deepEqual(names(only([], "шар")), ["Огненный шар"]);
    assert.equal(only([], "шар").count, 1);
  });
});

describe("casting and slots", () => {
  it("can cast cantrips, prepared, always prepared, innate, at-will and ritual spells, not an unprepared one", () => {
    assert.equal(castable(spell("a", 0)), true);
    assert.equal(castable(spell("b", 1, { prepared: 1 })), true);
    assert.equal(castable(spell("c", 1, { prepared: 2 })), true);
    assert.equal(castable(spell("d", 2, { method: "innate" })), true);
    assert.equal(castable(spell("e", 1, { method: "atwill" })), true);
    assert.equal(castable(spell("f", 1, { ritual: true })), true);
    assert.equal(castable(spell("g", 1)), false);
    assert.equal(castable(spell("h", 1, { method: "pact" })), false);
    assert.equal(castable(spell("i", 1, { method: "pact", known: true })), true, "a class without a preparation limit knows its spells");
  });

  it("spends down to a lit gem and restores up to a hollow one", () => {
    assert.equal(pipTarget(3, 1), 1, "clicking the second of three lit gems leaves one");
    assert.equal(pipTarget(3, 0), 0);
    assert.equal(pipTarget(1, 3), 4, "clicking the fourth gem, hollow, lights four");
    assert.equal(pipTarget(2, 2), 3);
  });
});

describe("preparation against the class limit", () => {
  it("is fine below the limit, full at it and over past it, with the warning naming the totals", () => {
    assert.deepEqual(preparationState([{ name: "Волшебник", value: 6, max: 10 }]), { classes: [{ name: "Волшебник", value: 6, max: 10, state: "ok" }], over: null });
    assert.equal(preparationState([{ name: "Волшебник", value: 10, max: 10 }]).classes[0].state, "full");
    assert.deepEqual(preparationState([{ name: "Жрец", value: 4, max: 4 }, { name: "Волшебник", value: 11, max: 10 }]).over, { value: 11, max: 10 });
    assert.deepEqual(preparationState([{ name: "Чародей", value: 0, max: 0 }]).classes, []);
  });
});
