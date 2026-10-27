import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ACTION_GROUPS, applyUsesEntry, groupByAction, groupByOrigin, rechargeLabel } from "../scripts/core/features.js";

const feat = (name, extra = {}) => ({ id: name, name, origin: { kind: "other", key: "other" }, activation: "action", passive: false, isAttack: false, ...extra });

describe("features by origin", () => {
  const entries = [
    feat("Второе дыхание", { origin: { kind: "class", key: "fighter" }, activation: "bonus" }),
    feat("Боевой стиль", { origin: { kind: "class", key: "fighter" }, passive: true, activation: "" }),
    feat("Тайное восстановление", { origin: { kind: "class", key: "wizard" } }),
    feat("Тёмное зрение", { origin: { kind: "species", key: "species" }, passive: true, activation: "" }),
    feat("Убежище верующих", { origin: { kind: "background", key: "background" }, passive: true, activation: "" }),
    feat("Стойкий", { passive: true, activation: "" })
  ];

  it("gives each class its section in class order, then species, background and the rest", () => {
    const groups = groupByOrigin(entries, { classes: ["wizard", "fighter"] });
    assert.deepEqual(groups.map((g) => [g.key, g.entries.map((e) => e.name)]), [
      ["wizard", ["Тайное восстановление"]],
      ["fighter", ["Боевой стиль", "Второе дыхание"]],
      ["species", ["Тёмное зрение"]],
      ["background", ["Убежище верующих"]],
      ["other", ["Стойкий"]]
    ]);
  });

  it("filters by activation and passivity with the search, and hides sections left empty only when narrowed", () => {
    const passive = groupByOrigin(entries, { classes: ["wizard", "fighter"], filters: ["passive"] });
    assert.deepEqual(passive.map((g) => g.key), ["fighter", "species", "background", "other"]);
    assert.deepEqual(groupByOrigin(entries, { classes: ["fighter"], filters: ["bonus"] }).map((g) => g.entries.map((e) => e.name)), [["Второе дыхание"]]);
    assert.deepEqual(groupByOrigin(entries, { classes: ["fighter"], query: "зрен" }).map((g) => g.key), ["species"]);
    assert.equal(groupByOrigin([], { classes: [] }).length, 0);
  });
});

describe("actions of an NPC or vehicle", () => {
  it("groups features and attacks by action cost and hides empty groups", () => {
    const groups = groupByAction([
      feat("Многоатака"),
      feat("Укус", { isAttack: true }),
      feat("Парирование", { activation: "reaction" }),
      feat("Нюх", { passive: true, activation: "" }),
      feat("Хвост", { activation: "legendary" }),
      feat("Ритуал", { activation: "minute" })
    ]);
    assert.deepEqual(groups.map((g) => [g.key, g.entries.map((e) => e.name)]), [
      ["passive", ["Нюх"]],
      ["action", ["Многоатака", "Укус"]],
      ["reaction", ["Парирование"]],
      ["legendary", ["Хвост"]],
      ["other", ["Ритуал"]]
    ]);
    assert.deepEqual(ACTION_GROUPS, ["passive", "action", "bonus", "reaction", "legendary", "lair", "other"]);
  });
});

describe("uses", () => {
  it("edits a counter like HP: −1 spends, +2 restores, 5 sets, within 0 and the maximum", () => {
    assert.equal(applyUsesEntry({ value: 7, max: 10 }, "−1"), 6);
    assert.equal(applyUsesEntry({ value: 7, max: 10 }, "+5"), 10);
    assert.equal(applyUsesEntry({ value: 7, max: 10 }, "5"), 5);
    assert.equal(applyUsesEntry({ value: 2, max: 10 }, "-9"), 0);
    assert.equal(applyUsesEntry({ value: 2, max: 10 }, "x"), null);
  });

  it("names a recharge by its threshold", () => {
    assert.equal(rechargeLabel("5"), "5–6");
    assert.equal(rechargeLabel("6"), "6");
    assert.equal(rechargeLabel(""), "6");
  });
});
