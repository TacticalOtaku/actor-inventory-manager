import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyCoinEntry,
  chargeChange,
  containerDropRefusal,
  goldParts,
  groupInventory,
  listPrefsFor,
  loadBand,
  parseCoinEntry,
  showsCharges,
  trayFolded,
  trayPeek,
  withListPref
} from "../scripts/core/inventory.js";

const entry = (id, type, extra = {}) => ({
  id, type, name: id, container: null, weight: 1, price: 1, rarity: "", quantity: 1, sort: 0, equipped: false, attuned: false, ...extra
});

describe("list preferences per tab", () => {
  it("fills defaults and drops what it does not know", () => {
    assert.deepEqual(listPrefsFor({}, "equipment"), { view: "list", sort: "name", filters: [] });
    assert.deepEqual(listPrefsFor({ equipment: { view: "icons", sort: "price", filters: ["attuned", "x"] } }, "equipment"),
      { view: "icons", sort: "price", filters: ["attuned"] });
    assert.deepEqual(listPrefsFor({ equipment: { view: "tiles", sort: "?" } }, "equipment"), { view: "list", sort: "name", filters: [] });
  });

  it("keeps only the filters the tab knows", () => {
    assert.deepEqual(listPrefsFor({ spells: { filters: ["ritual", "equipped"] } }, "spells", ["ritual", "prepared"]).filters, ["ritual"]);
    assert.deepEqual(withListPref({}, "spells", { filters: ["ritual"] }, ["ritual"]).spells.filters, ["ritual"]);
  });

  it("changes one tab without touching another", () => {
    const all = { spells: { view: "grid", sort: "name", filters: [] } };
    const next = withListPref(all, "equipment", { view: "icons" });
    assert.deepEqual(next.equipment, { view: "icons", sort: "name", filters: [] });
    assert.deepEqual(next.spells, all.spells);
    assert.equal(all.equipment, undefined);
  });
});

describe("inventory grouping", () => {
  const items = [
    entry("Меч", "weapon", { weight: 3, price: 15, rarity: "common", equipped: true }),
    entry("Арбалет", "weapon", { weight: 5, price: 25, rarity: "rare" }),
    entry("Кольцо", "equipment", { attuned: true, rarity: "veryRare" }),
    entry("Зелье", "consumable", { quantity: 3, price: 50 }),
    entry("Рюкзак", "container"),
    entry("Верёвка", "loot", { container: "Рюкзак" }),
    entry("Кошель", "container", { container: "Рюкзак" }),
    entry("Самоцвет", "loot", { container: "Кошель", price: 100 }),
    entry("Странное", "facility")
  ];

  it("puts items in sections by type and never repeats container contents", () => {
    const { sections, containers } = groupInventory(items, { sort: "name" });
    assert.deepEqual(sections.map((s) => [s.id, s.entries.map((e) => e.id)]), [
      ["weapon", ["Арбалет", "Меч"]],
      ["equipment", ["Кольцо"]],
      ["consumable", ["Зелье"]],
      ["tool", []],
      ["loot", ["Странное"]]
    ]);
    assert.equal(containers.length, 1);
    assert.equal(containers[0].entry.id, "Рюкзак");
    assert.deepEqual(containers[0].contents.map((e) => e.id), ["Верёвка"]);
    assert.equal(containers[0].trays[0].entry.id, "Кошель");
    assert.deepEqual(containers[0].trays[0].contents.map((e) => e.id), ["Самоцвет"]);
  });

  it("sorts by weight, price (both totals, heaviest first), rarity and by hand", () => {
    const ids = (sort) => groupInventory(items, { sort }).sections[0].entries.map((e) => e.id);
    assert.deepEqual(ids("weight"), ["Арбалет", "Меч"]);
    assert.deepEqual(ids("price"), ["Арбалет", "Меч"]);
    assert.deepEqual(ids("rarity"), ["Арбалет", "Меч"]);
    const manual = [entry("b", "weapon", { sort: 200 }), entry("a", "weapon", { sort: 100 })];
    assert.deepEqual(groupInventory(manual, { sort: "manual" }).sections[0].entries.map((e) => e.id), ["a", "b"]);
    const stacked = [entry("one", "consumable", { price: 10 }), entry("many", "consumable", { price: 5, quantity: 3 })];
    assert.deepEqual(groupInventory(stacked, { sort: "price" }).sections[2].entries.map((e) => e.id), ["many", "one"]);
  });

  it("filters by name and by equipped or attuned, keeping containers that hold a match", () => {
    const found = groupInventory(items, { query: "самоц" });
    assert.ok(found.sections.every((s) => !s.entries.length));
    assert.equal(found.containers[0].entry.id, "Рюкзак");
    assert.deepEqual(found.containers[0].contents, []);
    assert.deepEqual(found.containers[0].trays[0].contents.map((e) => e.id), ["Самоцвет"]);
    assert.deepEqual(groupInventory(items, { query: "нет такого" }).containers, []);
    const worn = groupInventory(items, { filters: ["equipped"] });
    assert.deepEqual(worn.sections.flatMap((s) => s.entries.map((e) => e.id)), ["Меч"]);
    assert.deepEqual(worn.containers, []);
    const attuned = groupInventory(items, { filters: ["attuned"] });
    assert.deepEqual(attuned.sections.flatMap((s) => s.entries.map((e) => e.id)), ["Кольцо"]);
  });

  it("counts every visible entry", () => {
    assert.equal(groupInventory(items).count, 9);
    assert.equal(groupInventory(items, { query: "самоц" }).count, 1);
  });
});

describe("charges", () => {
  it("shows pips for charged items, a quantity for stacks of single-use consumables", () => {
    assert.equal(showsCharges({ max: 7, quantity: 1, autoDestroy: false }), true);
    assert.equal(showsCharges({ max: 1, quantity: 1, autoDestroy: false }), true);
    assert.equal(showsCharges({ max: 1, quantity: 3, autoDestroy: true }), false);
    assert.equal(showsCharges({ max: 1, quantity: 1, autoDestroy: true }), false);
    assert.equal(showsCharges({ max: 1, quantity: 10, autoDestroy: false }), false);
    assert.equal(showsCharges({ max: 4, quantity: 2, autoDestroy: false }), true);
    assert.equal(showsCharges({ max: 0, quantity: 1, autoDestroy: false }), false);
  });

  it("spends and restores one charge within bounds", () => {
    assert.equal(chargeChange(2, 7, "spend"), 3);
    assert.equal(chargeChange(7, 7, "spend"), 7);
    assert.equal(chargeChange(2, 7, "restore"), 1);
    assert.equal(chargeChange(0, 7, "restore"), 0);
  });
});

describe("coin entry", () => {
  it("reads −5 as spending, +10 as adding and 20 as setting", () => {
    assert.deepEqual(parseCoinEntry("−5"), { kind: "spend", amount: 5 });
    assert.deepEqual(parseCoinEntry("-5"), { kind: "spend", amount: 5 });
    assert.deepEqual(parseCoinEntry(" +10 "), { kind: "add", amount: 10 });
    assert.deepEqual(parseCoinEntry("20"), { kind: "set", amount: 20 });
    for (const bad of ["", "abc", "+", "1.5", "5-"]) assert.equal(parseCoinEntry(bad), null, bad);
  });

  it("never goes below zero", () => {
    assert.equal(applyCoinEntry(12, { kind: "spend", amount: 5 }), 7);
    assert.equal(applyCoinEntry(3, { kind: "spend", amount: 5 }), 0);
    assert.equal(applyCoinEntry(3, { kind: "add", amount: 10 }), 13);
    assert.equal(applyCoinEntry(3, { kind: "set", amount: 20 }), 20);
  });
});

describe("price in coins", () => {
  it("shows gold, silver below a gold piece and copper below a silver one", () => {
    assert.deepEqual(goldParts(15), { amount: 15, denom: "gp" });
    assert.deepEqual(goldParts(2.54), { amount: 2.5, denom: "gp" });
    assert.deepEqual(goldParts(0.5), { amount: 5, denom: "sp" });
    assert.deepEqual(goldParts(0.02), { amount: 2, denom: "cp" });
    assert.equal(goldParts(0), null);
  });
});

describe("container trays", () => {
  it("start folded beyond three containers, keep what the user chose, and open while searching", () => {
    assert.equal(trayFolded("a", {}, 3, false), false);
    assert.equal(trayFolded("a", {}, 4, false), true);
    assert.equal(trayFolded("a", { a: false }, 4, false), false);
    assert.equal(trayFolded("a", { a: true }, 2, false), true);
    assert.equal(trayFolded("a", { a: true }, 4, true), false);
  });

  it("peeks at up to six tiles and counts the rest", () => {
    const list = (n, p) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}` }));
    const peek = trayPeek(list(5, "c"), list(3, "t").map((entry) => ({ entry })));
    assert.deepEqual(peek.tiles.map((e) => e.id), ["c0", "c1", "c2", "c3", "c4", "t0"]);
    assert.equal(peek.more, 2);
    assert.deepEqual(trayPeek([], []), { tiles: [], more: 0 });
  });

  it("refuses a container inside itself or its own contents, and a drop where the item already is", () => {
    const entries = [
      { id: "bag", container: null }, { id: "pouch", container: "bag" }, { id: "box", container: "pouch" }, { id: "gem", container: "pouch" }
    ];
    assert.equal(containerDropRefusal(entries, "bag", "bag"), "self");
    assert.equal(containerDropRefusal(entries, "bag", "box"), "inside");
    assert.equal(containerDropRefusal(entries, "gem", "pouch"), "same");
    assert.equal(containerDropRefusal(entries, "gem", null), null);
    assert.equal(containerDropRefusal(entries, "bag", null), "same");
    assert.equal(containerDropRefusal(entries, "gem", "bag"), null);
  });

  it("turns a load into a band, over capacity marked, nothing without a capacity", () => {
    assert.deepEqual(loadBand({ value: 15, max: 30 }), { share: "0.500", over: false });
    assert.deepEqual(loadBand({ value: 45, max: 30 }), { share: "1.000", over: true });
    assert.equal(loadBand({ value: 5, max: Infinity }), null);
    assert.equal(loadBand({ value: 5, max: 0 }), null);
    assert.equal(loadBand(null), null);
  });
});
