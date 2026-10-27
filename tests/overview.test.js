import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CARD_CONFIGS, profMark, signed } from "../scripts/core/overview.js";

describe("overview marks", () => {
  it("read dnd5e's proficiency multiplier as hollow, half, filled or ringed", () => {
    assert.deepEqual([0, 0.5, 1, 2, undefined].map(profMark), ["none", "half", "prof", "expert", "none"]);
  });

  it("sign bonuses as the sheet does", () => {
    assert.deepEqual([3, 0, -1, "2"].map(signed), ["+3", "+0", "−1", "+2"]);
  });

  it("give every card with a gear at least one dnd5e dialog", () => {
    for (const [card, configs] of Object.entries(CARD_CONFIGS)) assert.ok(configs.length, card);
    assert.deepEqual(CARD_CONFIGS.defenses.map((c) => c.kind), ["damages", "damages", "damages", "damages", "traits"]);
  });
});
