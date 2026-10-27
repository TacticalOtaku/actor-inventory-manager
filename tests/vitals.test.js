import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { heartbeatFor, parseHpEntry, previewHp, railEvents, vitalState } from "../scripts/core/vitals.js";

describe("HP entry", () => {
  it("reads damage, healing, a bare number and temporary HP", () => {
    assert.deepEqual(parseHpEntry("−7"), { kind: "damage", amount: 7 });
    assert.deepEqual(parseHpEntry("-7"), { kind: "damage", amount: 7 });
    assert.deepEqual(parseHpEntry(" +5 "), { kind: "heal", amount: 5 });
    assert.deepEqual(parseHpEntry("20"), { kind: "set", amount: 20 });
    assert.deepEqual(parseHpEntry("в8"), { kind: "temp", amount: 8 });
    assert.deepEqual(parseHpEntry("В 8"), { kind: "temp", amount: 8 });
    assert.deepEqual(parseHpEntry("t8"), { kind: "temp", amount: 8 });
  });

  it("refuses what it cannot read", () => {
    for (const bad of ["", "abc", "+", "−", "в", "7-", "1.5", "+-3"]) assert.equal(parseHpEntry(bad), null, bad);
  });
});

describe("HP preview", () => {
  const hp = { value: 31, max: 38, temp: 5 };

  it("takes temporary HP first on damage", () => {
    assert.deepEqual(previewHp(hp, { kind: "damage", amount: 7 }), { value: 29, temp: 0, lostTemp: 5 });
    assert.deepEqual(previewHp(hp, { kind: "damage", amount: 3 }), { value: 31, temp: 2, lostTemp: 3 });
    assert.deepEqual(previewHp(hp, { kind: "damage", amount: 99 }), { value: 0, temp: 0, lostTemp: 5 });
  });

  it("heals up to max, sets within bounds, keeps the higher temporary HP", () => {
    assert.deepEqual(previewHp(hp, { kind: "heal", amount: 20 }), { value: 38, temp: 5, lostTemp: 0 });
    assert.deepEqual(previewHp(hp, { kind: "set", amount: 50 }), { value: 38, temp: 5, lostTemp: 0 });
    assert.deepEqual(previewHp(hp, { kind: "temp", amount: 3 }), { value: 31, temp: 5, lostTemp: 0 });
    assert.deepEqual(previewHp(hp, { kind: "temp", amount: 8 }), { value: 31, temp: 8, lostTemp: 0 });
  });
});

describe("vital state", () => {
  it("names the state and quickens the heartbeat as HP fall", () => {
    assert.equal(vitalState(38, 38), "ok");
    assert.equal(vitalState(19, 38), "hurt");
    assert.equal(vitalState(9, 38), "critical");
    assert.equal(vitalState(0, 38), "down");
    assert.equal(heartbeatFor(38, 38), "2.8s");
    assert.equal(heartbeatFor(19, 38), "1.7s");
    assert.equal(heartbeatFor(9, 38), "0.85s");
    assert.equal(vitalState(5, 0), "ok");
  });
});

describe("rail events", () => {
  const base = { hp: 20, max: 30, temp: 0, dice: 3, slots: 4, success: 0, failure: 0, inspiration: false, concentration: "" };
  const after = (change) => railEvents(base, { ...base, ...change });

  it("play nothing on the first render or when nothing changed", () => {
    assert.deepEqual(railEvents(null, base), []);
    assert.deepEqual(after({}), []);
  });

  it("tell a hit from a heal, and a heal from 0 as coming back", () => {
    assert.deepEqual(after({ hp: 12 }), ["hit"]);
    assert.deepEqual(after({ hp: 25 }), ["heal"]);
    assert.deepEqual(railEvents({ ...base, hp: 0 }, { ...base, hp: 1 }), ["heal", "revive"]);
    assert.deepEqual(after({ hp: 25, max: 40 }), [], "a new maximum is no heal");
  });

  it("raise, dent and break the temporary HP shield", () => {
    assert.deepEqual(after({ temp: 8 }), ["shieldUp"]);
    assert.deepEqual(railEvents({ ...base, temp: 8 }, { ...base, temp: 3 }), ["absorb"]);
    assert.deepEqual(railEvents({ ...base, temp: 8 }, { ...base, temp: 0 }), ["shieldBreak"]);
  });

  it("see dice spent, resources restored, death marks, inspiration and concentration", () => {
    assert.deepEqual(after({ dice: 2 }), ["diceSpent"]);
    assert.deepEqual(after({ dice: 4 }), ["restored"]);
    assert.deepEqual(after({ slots: 5 }), ["restored"]);
    assert.deepEqual(after({ success: 1, failure: 1 }), ["deathSuccess", "deathFail"]);
    assert.deepEqual(after({ inspiration: true }), ["inspired"]);
    assert.deepEqual(railEvents({ ...base, inspiration: true }, base), []);
    assert.deepEqual(after({ concentration: "a" }), ["concentration"]);
    assert.deepEqual(railEvents({ ...base, concentration: "a" }, base), [], "ending concentration plays nothing");
  });
});
