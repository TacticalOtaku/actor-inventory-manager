import test from "node:test";
import assert from "node:assert/strict";

import {
  computeActorCapacity,
  computeActorEncumbrance,
  formatWeight,
  getItemWeightLbs
} from "../scripts/core/weight-calculator.js";
import { formatItemForDisplay } from "../scripts/integrations/dnd5e.js";

test("Weight Calculator: Base Carrying Capacity & Thresholds", () => {
  const actor = {
    system: {
      abilities: { str: { value: 10 } },
      traits: { size: "med" }
    }
  };

  const cap = computeActorCapacity(actor, "lb");
  assert.equal(cap.max, 150); // 10 * 15
  assert.equal(cap.encumbered, 50); // 10 * 5
  assert.equal(cap.heavilyEncumbered, 100); // 10 * 10
  assert.equal(cap.maxPushDrag, 300); // 10 * 30
});

test("Weight Calculator: Size Multiplier and Powerful Build", () => {
  const largeActor = {
    system: {
      abilities: { str: { value: 16 } },
      traits: { size: "lg" }
    }
  };

  const capLarge = computeActorCapacity(largeActor, "lb");
  assert.equal(capLarge.max, 16 * 15 * 2); // 480 lbs

  const goliathActor = {
    system: {
      abilities: { str: { value: 16 } },
      traits: { size: "med", traits: { powerfulBuild: true } }
    }
  };

  const capGoliath = computeActorCapacity(goliathActor, "lb");
  assert.equal(capGoliath.max, 16 * 15 * 2); // 480 lbs
});

test("Weight Calculator: Item Weight & Encumbrance Status", () => {
  const item = {
    system: {
      weight: { value: 5, units: "lb" },
      quantity: 3
    }
  };
  assert.equal(getItemWeightLbs(item), 15);

  const actor = {
    system: {
      abilities: { str: { value: 10 } },
      traits: { size: "med" },
      attributes: { encumbrance: { value: 60 } }
    }
  };

  const enc = computeActorEncumbrance(actor, { unit: "lb" });
  assert.equal(enc.value, 60);
  assert.equal(enc.max, 150);
  assert.equal(enc.tier, "encumbered");
  assert.equal(enc.isEncumbered, true);
  assert.equal(enc.isHeavilyEncumbered, false);
});

test("DnD5e Integration: formatItemForDisplay formats weight correctly", () => {
  const item = {
    id: "item1",
    uuid: "Actor.123.Item.item1",
    name: "Longsword",
    type: "weapon",
    system: {
      weight: { value: 3, units: "lb" },
      quantity: 2,
      price: { value: 15, denomination: "gp" }
    }
  };

  const formatted = formatItemForDisplay(item);
  assert.equal(formatted.name, "Longsword");
  assert.equal(formatted.quantity, 2);
  assert.equal(formatted.hasMultiple, true);
  assert.ok(formatted.weightDisplay.includes("6.0"));
});
