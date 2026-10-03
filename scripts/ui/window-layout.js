// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Window layout state
// ─────────────────────────────────────────────────────────

// Four layouts: the paperdoll open or folded into a strip, with or without a side drawer.
// A drawer takes the paperdoll's place, so the inventory keeps its width.
// Pure: no Foundry or DOM globals, the caller passes the viewport width in.
//
// Column arithmetic (styles/aim/window.css must match): passport 256, doll 312 or strip 56,
// inventory >= 340, drawer 364, rail 40, gaps 10, body padding 14 on each side.

/**
 * @typedef {object} WindowLayoutState
 * @property {null|"spells"|"trade"} drawer  the open side drawer, if any
 * @property {boolean} dollCollapsed          saved preference while no drawer is open
 * @property {boolean} dollBesideDrawer       the user expanded the doll next to the open drawer
 */

/** Preferred window widths (px). */
export const LAYOUT_WIDTHS = Object.freeze({ open: 1080, strip: 824, drawerStrip: 1188, drawerOpen: 1444 });

/** Narrowest widths at which the columns still fit (see the column arithmetic above). */
export const LAYOUT_MIN_WIDTHS = Object.freeze({ open: 1006, strip: 750, drawerStrip: 1124, drawerOpen: 1380 });

/** Room kept free between the window and the screen edges. */
const SCREEN_MARGIN = 40;

/**
 * Name of the layout for a drawer and doll combination.
 * @param {{drawer: string|null, dollOpen: boolean}} layout
 * @returns {"open"|"strip"|"drawerStrip"|"drawerOpen"}
 */
export function layoutName({ drawer, dollOpen }) {
  if (drawer) return dollOpen ? "drawerOpen" : "drawerStrip";
  return dollOpen ? "open" : "strip";
}

/**
 * The doll shows beside a drawer only when the user asked for it; otherwise it follows the saved preference.
 * @param {WindowLayoutState} state
 * @returns {boolean}
 */
export function isDollOpen(state) {
  return state.drawer ? Boolean(state.dollBesideDrawer) : !state.dollCollapsed;
}

/**
 * Open a drawer, switch to another one, or close it when it is already open.
 * Every change folds the doll back into the strip beside the drawer.
 * @param {WindowLayoutState} state
 * @param {"spells"|"trade"} name
 * @returns {WindowLayoutState}
 */
export function toggleDrawer(state, name) {
  const drawer = state.drawer === name ? null : name;
  return { ...state, drawer, dollBesideDrawer: false };
}

/**
 * Flip the doll. Without a drawer this flips the saved preference. With a drawer it shows or folds
 * the doll beside it, unless the screen cannot hold both: then the drawer closes and the doll opens.
 * @param {WindowLayoutState} state
 * @param {number} viewportWidth
 * @returns {{state: WindowLayoutState, closedDrawer: boolean}}
 */
export function toggleDoll(state, viewportWidth) {
  if (!state.drawer) return { state: { ...state, dollCollapsed: !state.dollCollapsed }, closedDrawer: false };
  if (state.dollBesideDrawer) return { state: { ...state, dollBesideDrawer: false }, closedDrawer: false };
  if (viewportWidth - SCREEN_MARGIN < LAYOUT_MIN_WIDTHS.drawerOpen) {
    return { state: { ...state, drawer: null, dollBesideDrawer: false, dollCollapsed: false }, closedDrawer: true };
  }
  return { state: { ...state, dollBesideDrawer: true }, closedDrawer: false };
}

/**
 * Narrowest window width for the current layout.
 * @param {WindowLayoutState} state
 * @returns {number}
 */
export function resolveMinimumWidth(state) {
  return LAYOUT_MIN_WIDTHS[layoutName({ drawer: state.drawer, dollOpen: isDollOpen(state) })];
}

/**
 * Window width for the current layout: the preferred width, shrunk to the viewport
 * but never below the width the layout needs.
 * @param {WindowLayoutState} state
 * @param {number} viewportWidth
 * @returns {number}
 */
export function resolveWindowWidth(state, viewportWidth) {
  const name = layoutName({ drawer: state.drawer, dollOpen: isDollOpen(state) });
  const available = viewportWidth - SCREEN_MARGIN;
  return Math.max(LAYOUT_MIN_WIDTHS[name], Math.min(LAYOUT_WIDTHS[name], available));
}
