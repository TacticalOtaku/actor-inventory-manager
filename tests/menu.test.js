import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { menuLayout } from "../scripts/core/menu.js";

describe("window menus", () => {
  it("show the entries whose test passes, in either shape", () => {
    const entries = [
      { name: "a" },
      { name: "b", condition: () => false },
      { label: "c", visible: (target) => target === "row" },
      { label: "d", visible: false }
    ];
    assert.deepEqual(menuLayout(entries, "row").map(({ entry }) => entry.name ?? entry.label), ["a", "c"]);
  });

  it("part groups with a divider where the group changes", () => {
    const entries = [{ name: "view" }, { name: "edit" }, { name: "scroll", group: "action" }, { name: "attune", group: "state" }, { name: "equip", group: "state" }];
    assert.deepEqual(menuLayout(entries).map(({ divider }) => divider), [false, false, true, true, false]);
  });

  it("start no group with a divider when the entry before it is hidden", () => {
    const entries = [{ name: "a", condition: false }, { name: "b", group: "state" }];
    assert.deepEqual(menuLayout(entries).map(({ entry, divider }) => [entry.name, divider]), [["b", false]]);
  });
});
