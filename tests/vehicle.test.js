import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cargoMeter, convertWeight, seats, weightText } from "../scripts/core/vehicle.js";

const FACTORS = { lb: 1, tn: 2000, kg: 2.5, Mg: 2500 };

describe("vehicle cargo", () => {
  it("converts the hold's load into its capacity unit", () => {
    assert.equal(convertWeight(4000, "lb", "tn", FACTORS), 2);
    assert.equal(convertWeight(2500, "kg", "Mg", FACTORS), 2.5);
    assert.equal(convertWeight(10, "lb", "stone", FACTORS), null);
  });

  it("fills the bar against capacity and turns it over capacity", () => {
    assert.deepEqual(cargoMeter(25, 100), { value: 25, max: 100, share: 0.25, over: false });
    assert.deepEqual(cargoMeter(120, 100), { value: 120, max: 100, share: 1, over: true });
    assert.deepEqual(cargoMeter(5, null), { value: 5, max: 0, share: 0, over: false });
  });

  it("writes weights with at most two decimals", () => {
    assert.deepEqual([weightText(2), weightText(0.125), weightText(1.005), weightText(undefined)], ["2", "0.13", "1", "0"]);
  });
});

describe("vehicle crew places", () => {
  it("count taken and free places against the maximum", () => {
    assert.deepEqual(seats(3, 4), { count: 3, max: 4, free: 1, over: false });
    assert.deepEqual(seats(5, 4), { count: 5, max: 4, free: 0, over: true });
  });

  it("leave a group without a maximum without free places", () => {
    assert.deepEqual(seats(2, null), { count: 2, max: 0, free: 0, over: false });
  });
});
