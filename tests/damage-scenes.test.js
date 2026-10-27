import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SCENES, damageParts, sceneFor, scenePlan } from "../scripts/core/damage-scenes.js";

describe("damage scenes", () => {
  it("have one scene for each of dnd5e's thirteen types and a generic one for the rest", () => {
    assert.equal(SCENES.length, 13);
    assert.equal(sceneFor("fire"), "fire");
    assert.equal(sceneFor("eldritch"), "generic");
  });

  it("split a multi-type part into one chip per known type", () => {
    assert.deepEqual(damageParts("fire|cold"), ["fire", "cold"]);
    assert.deepEqual(damageParts(" fire | | acid "), ["fire", "acid"]);
    assert.deepEqual(damageParts(""), []);
    assert.deepEqual(damageParts(undefined), []);
  });

  it("loop at «Все», play one loop and hold at «Сдержанно», draw only a still frame when off", () => {
    assert.deepEqual(scenePlan("full"), { loop: true, stillOnly: false });
    assert.deepEqual(scenePlan("reduced"), { loop: false, stillOnly: false });
    assert.deepEqual(scenePlan("off"), { loop: false, stillOnly: true });
  });
});
