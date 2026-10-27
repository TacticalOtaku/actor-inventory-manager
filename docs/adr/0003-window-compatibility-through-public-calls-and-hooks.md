# The actor window meets other modules through public calls and dnd5e's own hooks

The GM's module set cannot be reproduced, so the actor window (ADR 0002) reaches other modules only in ways that
need no sheet: it calls dnd5e's public document and static API (ADR 0001) and fires the dnd5e hooks whose arguments
carry no sheet, with the same arguments and call type dnd5e uses. It never calls protected or private members of a
dnd5e sheet or custom element, never hosts `<dnd5e-inventory>`, `<dnd5e-effects>` or `<item-list-controls>`, never
takes their private member names (`document`, `expandedSections`, `_renderChild`, `_confirmDialog`, `_filters`), and
never passes `options.sheet` to dnd5e calls, so dnd5e's dialogs stay separate windows. What a module does to the
vanilla sheet's own markup stays on that sheet, one click away.

## What the window does itself

- Item, feature and effect menus are our own component. Entries keep dnd5e's keys (`name: "DND5E.Identify"`,
  `"DND5E.ContextMenuActionAttune"`, `id: "delete"` and the rest), then the window fires
  `dnd5e.getItemContextOptions(item, menuItems)` with `Hooks.callAll` and
  `dnd5e.getActiveEffectContextOptions(effect, menuItems)` with `Hooks.call`; activity menus use
  `activity.getContextMenuOptions()` and `dnd5e.getItemActivityContext`. The component renders both entry shapes,
  `name/condition/callback` and `label/visible/onClick`; old-shape callbacks get our row element.
- Activity lists (inspector, favorites) keep `activity.canUse`; with midi-qol active they also drop
  `midiProperties.automationOnly`, checked in `integrations/midi-qol.js` behind feature detection. Using an item needs
  no filter: midi wraps `item.use`.
- HP: `−N`/`+N` go through `actor.applyDamage`, `вN` through `actor.applyTempHP`, a bare number through
  `actor.update`. The vanilla field writes `actor.update` for everything; we accept the difference so
  `dnd5e.preApplyDamage` listeners (midi) run.
- Conditions toggle with `actor.toggleStatusEffect`, which clears other statuses of the same `exclusiveGroup`; the
  vanilla Effects tab does not. Accepted.
- Deleting uses `item.deleteDialog()` and `effect.deleteDialog()` without `sheet`, so dnd5e asks about advancement and
  container contents. The 1.x delete dialog goes.
- While an activity template of the window's actor is being placed, the window minimises on
  `dnd5e.preCreateActivityTemplate` and restores on `dnd5e.createActivityTemplate`; dnd5e minimises only
  `actor.sheet`.
- Sorting, levelling, favorites and the rest follow the public calls listed in §4 of `research/window-compat.md` on
  the `research/window-compat` branch (`performIntegerSort`, `AdvancementManager.forLevelChange`,
  `system.addFavorite`, …). Drop-in from outside the actor is ADR 0004.

## Considered Options

- Host dnd5e's inventory and effects elements and give the window the sheet-private names they read.
- Copy midi's and other modules' sheet rules into the window.
- Fire every dnd5e sheet hook, including those that pass the sheet (`dnd5e.filterItem`).

## Consequences

- The window does not get other modules' `_prepareItem`/`_filterItems` wrappers, header buttons added through
  `getHeaderControlsActorSheetV2` (midi, DAE), DOM added on `renderActorSheetV2`, or anything written into vanilla
  rows. «Открыть лист персонажа» in the window's «⋯» menu opens `actor.sheet` with all of that.
- A conflict report gets that menu entry and a look at whether a hook would carry the feature; no per-module patches.
- Compatibility is `minimum: 5.3.3`, `verified: 5.3.3` for dnd5e, with no hard maximum. Moved dnd5e fields stay behind
  the named helpers with their 5.3.3 tests. midi-qol, Item Piles, Weighty Containers, SC Rarity Colors and Tidy are
  each feature-detected and skipped when absent.
- A use of a sheet-private member needs a new ADR.
- Live checks follow `docs/live-check.md` in our own world.
