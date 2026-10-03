import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LAYOUT_MIN_WIDTHS, LAYOUT_WIDTHS, isCompact, isDollOpen, layoutName, resolveMinimumWidth, resolveWindowWidth, toggleDoll, toggleDrawer
} from "../scripts/ui/window-layout.js";

const base = { drawer: null, dollCollapsed: false, dollBesideDrawer: false };

describe("window layout", () => {
  it("opening a drawer folds the doll into a strip and closing it brings the doll back", () => {
    const open = toggleDrawer(base, "spells");
    assert.equal(open.drawer, "spells");
    assert.equal(isDollOpen(open), false);
    assert.equal(layoutName({ drawer: open.drawer, dollOpen: isDollOpen(open) }), "drawerStrip");
    const closed = toggleDrawer(open, "spells");
    assert.equal(closed.drawer, null);
    assert.equal(isDollOpen(closed), true);
  });

  it("switching drawers keeps one drawer open", () => {
    const trade = toggleDrawer(toggleDrawer(base, "spells"), "trade");
    assert.equal(trade.drawer, "trade");
  });

  it("a collapsed doll preference survives a drawer round trip", () => {
    const collapsed = { ...base, dollCollapsed: true };
    assert.equal(isDollOpen(toggleDrawer(toggleDrawer(collapsed, "trade"), "trade")), false);
  });

  it("expanding the doll beside a drawer needs room, otherwise the drawer closes", () => {
    const drawer = toggleDrawer(base, "spells");
    const wide = toggleDoll(drawer, 1920);
    assert.equal(wide.closedDrawer, false);
    assert.equal(isDollOpen(wide.state), true);
    assert.equal(wide.state.drawer, "spells");
    assert.equal(wide.state.dollCollapsed, false, "the saved preference is untouched");
    const narrow = toggleDoll(drawer, 1280);
    assert.equal(narrow.closedDrawer, true);
    assert.equal(narrow.state.drawer, null);
    assert.equal(isDollOpen(narrow.state), true);
  });

  it("without a drawer the doll toggle flips the saved preference", () => {
    const { state } = toggleDoll(base, 1920);
    assert.equal(state.dollCollapsed, true);
  });

  it("hides the passport beside a drawer on screens too narrow for the strip layout", () => {
    const drawer = toggleDrawer(base, "trade");
    assert.equal(isCompact(drawer, 1920), false);
    assert.equal(isCompact(drawer, 1100), true);
    assert.equal(isCompact(base, 900), false, "without a drawer the window keeps all its columns");
    assert.equal(resolveMinimumWidth(drawer, 1100), LAYOUT_MIN_WIDTHS.drawerCompact);
    assert.equal(resolveWindowWidth(drawer, 1100), 1060);
    assert.equal(resolveMinimumWidth(drawer, 1920), LAYOUT_MIN_WIDTHS.drawerStrip);
  });

  it("clamps the preferred width to the screen but never below the layout minimum", () => {
    assert.equal(resolveWindowWidth(base, 1920), LAYOUT_WIDTHS.open);
    assert.equal(resolveWindowWidth(base, 1060), 1020);
    assert.equal(resolveWindowWidth(base, 800), LAYOUT_MIN_WIDTHS.open);
    assert.equal(resolveMinimumWidth(toggleDrawer(base, "trade")), LAYOUT_MIN_WIDTHS.drawerStrip);
  });
});
