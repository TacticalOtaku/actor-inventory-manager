// ─────────────────────────────────────────────────────────
// Actor window - the window's own context menus: which entries show and where groups part (pure)
// ─────────────────────────────────────────────────────────

/**
 * The entries a menu shows, in order, each marked when it starts a new group. Entries come in dnd5e's shape
 * ({name, icon, condition, callback, group}) or Foundry's newer one ({label, icon, visible, onClick, group});
 * `condition` / `visible` may be a function of the menu's target or a plain value.
 * @param {Object[]} entries
 * @param {*} target  what the menu was opened on, handed to the tests
 * @returns {{entry: Object, divider: boolean}[]}
 */
export function menuLayout(entries, target) {
  const shown = entries.filter((entry) => {
    const test = entry.condition ?? entry.visible;
    return typeof test === "function" ? test(target) : test ?? true;
  });
  return shown.map((entry, i) => ({ entry, divider: i > 0 && (entry.group ?? "") !== (shown[i - 1].group ?? "") }));
}
