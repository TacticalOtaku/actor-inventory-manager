import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { usableActivities } from "../scripts/integrations/midi-qol.js";

afterEach(() => { delete globalThis.game; });

const item = { system: { activities: [
  { id: "use", canUse: true },
  { id: "auto", canUse: true, midiProperties: { automationOnly: true } },
  { id: "locked", canUse: false }
] } };

describe("activities offered to the player", () => {
  it("leave out what dnd5e forbids, and midi-qol's automation-only activities while midi-qol is active", () => {
    globalThis.game = { modules: new Map([["midi-qol", { active: true }]]) };
    assert.deepEqual(usableActivities(item).map((a) => a.id), ["use"]);
  });

  it("keep automation-only activities when midi-qol is off", () => {
    globalThis.game = { modules: new Map() };
    assert.deepEqual(usableActivities(item).map((a) => a.id), ["use", "auto"]);
  });
});
