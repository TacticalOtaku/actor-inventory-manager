import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_ACCENT, PALETTE, resolveAccent } from "../scripts/tactile/palette.js";

describe("Tactile accent palette", () => {
  it("holds the ten design-system accents with peach first", () => {
    assert.deepEqual(PALETTE.map((p) => p.id), ["peach", "amber", "sage", "mint", "azure", "periwinkle", "lavender", "orchid", "rose", "steel"]);
    assert.deepEqual(resolveAccent("peach"), { id: "peach", h: 45, c: 0.13 });
    assert.deepEqual(resolveAccent("steel"), { id: "steel", h: 250, c: 0.035 });
    assert.equal(DEFAULT_ACCENT, "peach");
  });

  it("falls back to peach for unknown ids", () => {
    assert.equal(resolveAccent("chartreuse").id, "peach");
    assert.equal(resolveAccent(undefined).id, "peach");
  });
});
