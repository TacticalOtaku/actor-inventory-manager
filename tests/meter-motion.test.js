import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { animateMeterChanges, readMeterWidths, shouldReduceMotion } from "../scripts/ui/meter-motion.js";

function meter(key, width) {
  return { dataset: { meter: key }, style: { width }, animations: [], animate(keyframes, options) { this.animations.push({ keyframes, options }); } };
}
const windowWith = (...fills) => ({ querySelectorAll: () => fills });

describe("readMeterWidths", () => {
  it("reads each meter's width percentage by key", () => {
    const widths = readMeterWidths(windowWith(meter("hp", "90%"), meter("encumbrance", "37.5%"), meter("broken", "")));
    assert.deepEqual([...widths], [["hp", 90], ["encumbrance", 37.5]]);
  });
});

describe("animateMeterChanges", () => {
  it("slides a meter that changed from its old width to the new one", () => {
    const hp = meter("hp", "40%");
    const load = meter("encumbrance", "37%");
    animateMeterChanges(windowWith(hp, load), new Map([["hp", 90], ["encumbrance", 37]]), { reduce: false });
    assert.equal(load.animations.length, 0);
    assert.equal(hp.animations.length, 1);
    assert.deepEqual(hp.animations[0].keyframes, [{ width: "90%" }, { width: "40%" }]);
  });

  it("does nothing on the first render or when motion should be reduced", () => {
    const hp = meter("hp", "40%");
    animateMeterChanges(windowWith(hp), new Map(), { reduce: false });
    animateMeterChanges(windowWith(hp), new Map([["hp", 90]]), { reduce: true });
    assert.equal(hp.animations.length, 0);
  });
});

describe("shouldReduceMotion", () => {
  const view = ({ reduced = false, performance = "performance-high" } = {}) => ({
    matchMedia: query => ({ matches: reduced && query === "(prefers-reduced-motion: reduce)" }),
    document: { body: { classList: { contains: name => name === performance } } }
  });

  it("follows the OS reduced-motion preference and Foundry's low performance mode", () => {
    assert.equal(shouldReduceMotion(view()), false);
    assert.equal(shouldReduceMotion(view({ reduced: true })), true);
    assert.equal(shouldReduceMotion(view({ performance: "performance-low" })), true);
  });
});
