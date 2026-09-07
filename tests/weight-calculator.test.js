import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeActorCapacity,
  computeActorEncumbrance,
  convertWeight,
  getSystemEncumbrance,
  num
} from "../scripts/core/weight-calculator.js";

describe("num", () => {
  it("returns the fallback for absent values", () => {
    // Number(null) is 0 and finite, which used to swallow nullable dnd5e fields.
    assert.equal(num(null, 7), 7);
    assert.equal(num(undefined, 7), 7);
    assert.equal(num("", 7), 7);
  });

  it("keeps explicit zeroes", () => {
    assert.equal(num(0, 7), 0);
    assert.equal(num("0", 7), 0);
  });

  it("falls back for non-numeric input", () => {
    assert.equal(num("abc", 7), 7);
    assert.equal(num(NaN, 7), 7);
  });
});

describe("convertWeight", () => {
  it("is a no-op between identical unit systems", () => {
    assert.equal(convertWeight(10, "lb", "lb"), 10);
    assert.equal(convertWeight(10, "kg", "kg"), 10);
  });

  it("round-trips through the other unit", () => {
    const kg = convertWeight(100, "lb", "kg");
    assert.ok(Math.abs(convertWeight(kg, "kg", "lb") - 100) < 1e-9);
  });
});

describe("computeActorCapacity", () => {
  const bareActor = { system: { abilities: { str: { value: 10 } }, traits: { size: "med" } } };

  it("uses imperial thresholds for pounds", () => {
    const cap = computeActorCapacity(bareActor, "lb");
    assert.equal(cap.max, 150);
    assert.equal(cap.encumbered, 50);
    assert.equal(cap.heavilyEncumbered, 100);
    assert.equal(cap.fromSystem, false);
  });

  it("uses the system's metric thresholds, not a unit conversion", () => {
    // dnd5e defines 7.5 kg per STR, which is NOT 15 lb converted (~6.8 kg).
    const cap = computeActorCapacity(bareActor, "kg");
    assert.equal(cap.max, 75);
    assert.equal(cap.encumbered, 25);
    assert.equal(cap.heavilyEncumbered, 50);
  });

  it("doubles capacity for Powerful Build", () => {
    const powerful = {
      system: { abilities: { str: { value: 10 } }, traits: { size: "med" } },
      flags: { dnd5e: { powerfulBuild: true } }
    };
    assert.equal(computeActorCapacity(powerful, "lb").max, 300);
  });

  it("prefers the encumbrance block dnd5e derives", () => {
    const actor = {
      system: {
        abilities: { str: { value: 10 } },
        attributes: {
          encumbrance: {
            value: 42,
            max: 240,
            thresholds: { encumbered: 80, heavilyEncumbered: 160, maximum: 240 }
          }
        }
      }
    };
    const cap = computeActorCapacity(actor, "lb");
    assert.equal(cap.fromSystem, true);
    assert.equal(cap.max, 240);
    assert.equal(cap.encumbered, 80);
    assert.equal(cap.heavilyEncumbered, 160);
  });
});

describe("getSystemEncumbrance", () => {
  it("rejects an unusable block", () => {
    assert.equal(getSystemEncumbrance(null), null);
    assert.equal(getSystemEncumbrance({ system: {} }), null);
    assert.equal(getSystemEncumbrance({ system: { attributes: { encumbrance: { value: 1, max: 0 } } } }), null);
  });
});

describe("computeActorEncumbrance", () => {
  const makeActor = (value, max) => ({
    system: {
      abilities: { str: { value: 10 } },
      attributes: {
        encumbrance: {
          value,
          max,
          thresholds: { encumbered: max / 3, heavilyEncumbered: (max / 3) * 2, maximum: max }
        }
      }
    }
  });

  it("classifies the normal tier", () => {
    const enc = computeActorEncumbrance(makeActor(10, 150), { unit: "lb" });
    assert.equal(enc.tier, "normal");
    assert.equal(enc.isEncumbered, false);
  });

  it("classifies encumbered and heavily encumbered", () => {
    assert.equal(computeActorEncumbrance(makeActor(60, 150), { unit: "lb" }).tier, "encumbered");
    assert.equal(computeActorEncumbrance(makeActor(120, 150), { unit: "lb" }).tier, "heavily_encumbered");
  });

  it("classifies overburdened past the maximum", () => {
    const enc = computeActorEncumbrance(makeActor(200, 150), { unit: "lb" });
    assert.equal(enc.tier, "overburdened");
    assert.equal(enc.isOverMax, true);
    assert.equal(enc.pct, 100);
  });

  it("exposes tier marker offsets for the meter", () => {
    const enc = computeActorEncumbrance(makeActor(10, 150), { unit: "lb" });
    assert.equal(enc.stops.encumbered, 33);
    assert.equal(enc.stops.heavilyEncumbered, 67);
  });

  it("honours a carried-weight override", () => {
    const enc = computeActorEncumbrance(makeActor(999, 150), { unit: "lb", overrideCarriedLbs: 30 });
    assert.equal(enc.value, 30);
    assert.equal(enc.tier, "normal");
  });
});
