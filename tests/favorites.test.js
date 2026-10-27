import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupFavorites, reorderFavorites, tabForFavorite } from "../scripts/core/favorites.js";

describe("favorites groups", () => {
  it("group by action cost in order, keep the manual order inside, and hide empty groups", () => {
    const groups = groupFavorites([
      { id: "a", sort: 300, activation: "action" },
      { id: "b", sort: 100, activation: "action" },
      { id: "c", sort: 200, activation: "reaction" },
      { id: "d", sort: 50, activation: "" },
      { id: "e", sort: 10, activation: "minute" }
    ]);
    assert.deepEqual(groups.map((g) => [g.key, g.entries.map((e) => e.id)]), [["action", ["b", "a"]], ["reaction", ["c"]], ["other", ["e", "d"]]]);
    assert.deepEqual(groupFavorites([]), []);
  });
});

describe("favorites order", () => {
  const favorites = [{ id: "a", type: "item", sort: 100 }, { id: "b", type: "item", sort: 200 }, { id: "c", type: "skill", sort: 300 }];

  it("moves a favorite before or after another and renumbers the sort", () => {
    assert.deepEqual(reorderFavorites(favorites, "c", "a", true).map((f) => [f.id, f.sort]), [["c", 100000], ["a", 200000], ["b", 300000]]);
    assert.deepEqual(reorderFavorites(favorites, "a", "b", false).map((f) => f.id), ["b", "a", "c"]);
    assert.deepEqual(reorderFavorites(favorites, "a", "a", true).map((f) => f.id), ["a", "b", "c"]);
    assert.equal(reorderFavorites(favorites, "a", "zz", true).length, 3);
  });
});

describe("where a favorite lives", () => {
  it("opens the tab of its entry", () => {
    assert.equal(tabForFavorite({ type: "skill" }), "overview");
    assert.equal(tabForFavorite({ type: "tool" }), "overview");
    assert.equal(tabForFavorite({ type: "effect" }), "effects");
    assert.equal(tabForFavorite({ type: "slots" }), "spells");
    assert.equal(tabForFavorite({ type: "item", itemType: "spell" }), "spells");
    assert.equal(tabForFavorite({ type: "activity", itemType: "feat" }), "features");
    assert.equal(tabForFavorite({ type: "item", itemType: "weapon" }), "equipment");
  });
});
