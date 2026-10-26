# Registering our own actor sheet on Foundry 14.367 + dnd5e 5.3.3, and how other modules reach dnd5e sheets

Research for issue #6 (map #3), input to grilling ticket #7 "Лист или отдельное окно". This note lists facts and
trade-offs. It does not make the decision.

Sources, primary first. Paths are abbreviated as:

- `core/` = `/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/client/` (build 14.367, `package.json`
  `release.build: 367`)
- `dnd5e.mjs` = `Data/systems/dnd5e/dnd5e.mjs` (dnd5e 5.3.3, single bundled file; line numbers are from that file)
- `midi-qol.js` = `Data/modules/midi-qol/midi-qol.js` (midi-qol 14.0.12), `dae.js` = `Data/modules/dae/module/dae.js`
  (DAE 14.0.14)
- `tidy:` = Tidy 5e Sheets source, shallow clone of `github.com/kgar/foundry-vtt-tidy-5e-sheets` at `main`
  `0de9090` (2026-10-24). That `main` is the 14.x line for dnd5e 6.x; the GM's dnd5e 5.3.x pairs with Tidy 13.10.5
  (see section 5), so Tidy line numbers below are indicative, not from the exact build the GM would run.
- **[web]** marks facts that come only from web pages, not from code I read.

## 1. How sheet registration works in core 14.367

`foundry.applications.apps.DocumentSheetConfig.registerSheet(documentClass, scope, sheetClass, options)`
(`core/applications/apps/document-sheet-config.mjs:410-424`).

- Sheet id is `${scope}.${sheetClass.name}` (`:412`). The class name is part of a persisted id (world setting and actor
  flag), so renaming the class orphans every saved choice.
- The class must subclass `foundry.appv1.api.Application` or `foundry.applications.api.DocumentSheetV2`, else it
  throws (`:414-418`). Both `ActorSheetV2` and dnd5e's sheets qualify.
- Before `game.ready` the call is queued and applied in `initializeSheets()` (`:379-401`, `:419-423`), so registering in
  our `init` hook is fine. dnd5e registers its sheets in its own `init` (`dnd5e.mjs:82371`, `:82465-82491`).
- Options (`:20-36`): `types`, `label`, `themes` (omitted = light+dark, `null` = no theming), `makeDefault=false`,
  `canBeDefault=true`, `canConfigure=true`.

How the sheet for one actor is chosen (`core/documents/abstract/client-document.mjs:255-268`):

1. The actor flag `flags.core.sheetClass`, if it names a registered sheet. This flag lives **on the actor document**,
   so it is the same for every user: if a player switches their character to our sheet, the GM and everyone else see our
   sheet for that actor too.
2. Otherwise the sheet marked `default` for the sub-type; otherwise the first with `canBeDefault`.
3. If the flag names a sheet that is no longer registered (module disabled), it is ignored and the default is used
   (`:262`). Disabling the module degrades gracefully.

What `makeDefault` really does (`document-sheet-config.mjs:432-460`, `:501-520`):

- A world default stored by the GM in the `core.sheetClasses` setting **always wins** over `makeDefault`
  (`:449-450`: `isDefault = existingDefault ? existingDefault === id : makeDefault`).
- With no stored world default, the **last** registration with `makeDefault: true` wins (`:451` clears the flag on the
  others). dnd5e registers `CharacterActorSheet` with `makeDefault: true` (`dnd5e.mjs:82467-82471`); a module
  registering later with `makeDefault: true` would become the default for `character` in every world that never saved a
  choice. That flips the sheet for the GM and all players at once, including on characters the user never touched.

Who can switch sheets:

- The "Configure Sheet" header control shows only when the user can edit the document (Owner) and the actor has no
  `flags.core.sheetLock` (`core/applications/api/document-sheet.mjs:69-80`, `:123-129`, `:291-295`).
- In the config form, only a GM may change the world default; any Owner may set the per-actor flag
  (`document-sheet-config.mjs:266-306`).
- `canBeDefault: false` keeps the sheet out of the world-default list but still selectable per actor
  (`:317-327`). `canConfigure: false` hides it from the form entirely.

Precedent: Tidy 5e registers every sheet with **no** `makeDefault`, under scope `"dnd5e"` (`tidy:src/main.svelte.ts:65-73`
and following; `src/constants.ts:5`). Users opt in per world (GM) or per actor (Owner).

## 2. Render and other application hooks: names depend on the class chain

ApplicationV2 fires lifecycle hooks once **per class in the inheritance chain**, using each class's `name`, from the
concrete class up to `ApplicationV2` (`core/applications/api/application.mjs:416-423` `inheritanceChain`,
`:1672-1730` `_doEvent` / `#callHooks`). This applies to `render{}`, `preRender{}` (`:546-547`, `:591-592`),
`close{}` (`:1032-1033`), `getHeaderControls{}` (`:762-766`) and `get{}ContextOptions` for menus built with
`_createContextMenu` (`:2230-2236`).

dnd5e 5.3.3 chain for the character sheet (class names verified in the bundle):

| Class (hook suffix) | Where |
| --- | --- |
| `CharacterActorSheet` | `dnd5e.mjs:57813` |
| `BaseActorSheet` | `dnd5e.mjs:55714-55716` |
| `PrimarySheet5e` (from `PrimarySheetMixin`) | `dnd5e.mjs:53127-53128` |
| `DragDropApplication` (from `DragDropApplicationMixin`) | `dnd5e.mjs:50562-50563` |
| `BaseApplication5e` (from `ApplicationV2Mixin`, adds class `dnd5e2`) | `dnd5e.mjs:1546-1558` |
| `HandlebarsApplication` (core mixin) | `core/applications/api/handlebars-application.mjs:39` |
| `ActorSheetV2` | `core/applications/sheets/actor-sheet.mjs:17` |
| `DocumentSheetV2` | `core/applications/api/document-sheet.mjs:37` |
| `ApplicationV2` | base |

So `renderCharacterActorSheet`, `renderBaseActorSheet`, ..., `renderActorSheetV2` all fire for the default sheet. The
old v3/v4 names (`renderActorSheet5eCharacter2` etc.) do not exist in 5.3.3 (no match in `dnd5e.mjs`), so modules still
on those names are already dead on this version regardless of what we do.

Which of these fire on our sheet depends on the base class:

| Our sheet | Hooks third-party modules can catch |
| --- | --- |
| `class X extends dnd5e.applications.actor.CharacterActorSheet` | `renderX` + every row above |
| `class X extends dnd5e.applications.actor.BaseActorSheet` | `renderX` + all rows from `BaseActorSheet` down; **not** `renderCharacterActorSheet` |
| Fresh `class X extends HandlebarsApplicationMixin(ActorSheetV2)` | `renderX`, `renderHandlebarsApplication`, `renderActorSheetV2`, `renderDocumentSheetV2`, `renderApplicationV2` |
| Separate window (today's `ActorInventoryApp`) | its own chain only; the dnd5e sheet stays as is |

Rough usage of hook names on GitHub (code search `total_count`, 2026-10-26; counts files, includes forks and dead
repos, so only an order of magnitude) **[web]**: `renderActorSheetV2` 214, `tidy5e-sheet.ready` 92,
`renderCharacterActorSheet` 89, `renderBaseActorSheet` 66, `getHeaderControlsActorSheetV2` 64,
`dnd5e.getItemContextOptions` 62, `dnd5e.prepareSheetContext` 13. Repos listening to `renderCharacterActorSheet`
include item/notes/achievement/print/nutrition helpers (e.g. `SoSly/foundryvtt-dnd5e-sheet-notes`,
`EddieDover/fvtt-player-achievements`, `jdeon/dnd5e-printSheet`, `Kapuzenjoe/simple-nutrition-5e`).

Important property of render hooks: a module that listens to `renderCharacterActorSheet` usually then
`querySelector`s dnd5e's markup. Example from the GM-likely set: DAE on every `renderActorSheetV2` looks for
`.items-section[data-effect-type="suppressed"] .items-header` and adds a button (`dae.js:1950-1951`, `:2244-2268`). It
bails out quietly when the selector is missing. Code that does not bail out would throw or inject into the wrong place
on markup it did not expect. Firing the hook is therefore a double-edged gain: more modules "see" our sheet, and their
DOM code runs against our layout.

## 3. dnd5e's own extension points for sheets

| Extension point | Fired / read where | Reaches our sheet when |
| --- | --- | --- |
| `dnd5e.prepareSheetContext(sheet, partId, context, options)` | `PrimarySheet5e._preparePartContext`, `dnd5e.mjs:53285-53303` | we subclass dnd5e and call `super._preparePartContext` |
| Static `TABS` array read through `this.constructor.TABS` | `dnd5e.mjs:53146`, `_getTabs` `:53312-53323`; character list `:57921-57930` | subclass of `CharacterActorSheet` that does **not** redefine `TABS` (mutations to the parent array are then visible) |
| Static `PARTS`, deep-cloned from `this.constructor.PARTS` per render | `core/applications/api/handlebars-application.mjs:88-92`; character parts `dnd5e.mjs:57836-57902` | same: only if we do not redefine `PARTS` |
| `dnd5e.filterItem(sheet, item, filters)` | `BaseActorSheet._filterItem`, `dnd5e.mjs:57749-57762` | subclass of `BaseActorSheet` or below, using its filter pipeline |
| `dnd5e.getItemContextOptions(item, menuItems)` | inside the `<dnd5e-inventory>` custom element, `dnd5e.mjs:64746-64754` | our template renders `<dnd5e-inventory>` (any sheet class) |
| `dnd5e.getActiveEffectContextOptions(effect, menuItems)` | inside `<dnd5e-effects>`, `dnd5e.mjs:51026-51050` | our template renders `<dnd5e-effects>` |
| `dnd5e.dropItemSheetData` | item sheets, `dnd5e.mjs:52894`, `:65649` | not actor sheets |
| Roll/use/rest hooks (`dnd5e.preRoll*`, `dnd5e.preUseActivity`, `dnd5e.preShortRest`, ...) | document API (`dnd5e.mjs:68411-68412`, `:38169`, ...) | always, as long as we call the dnd5e API (ADR 0001) |

Tab precedent: prime-psionics adds a "Powers" tab by splicing into `CharacterActorSheet.TABS` and adding a key to
`CharacterActorSheet.PARTS` (`github.com/JPMeehan/prime-psionics/blob/main/module/powersTab.mjs` lines 24-30) **[web]**.
The part's template expects dnd5e's tab container (`container: { id: "tabs" }`), so it renders sensibly only inside a
layout that keeps dnd5e's container ids.

The custom elements are not free-standing. They find their app with
`foundry.applications.instances.get(this.closest(".application")?.id)` and then call into it:

- `<dnd5e-inventory>` uses `app.document` / `app.inventorySource`, `app.canExpand`, `app.expandedSections`,
  `app._expanded` (fallback), `app._openDocumentSheet` (unguarded) (`dnd5e.mjs:64288-64313`, `:64341-64385`,
  `:64464-64465`, `:64544`, `:64725`).
- `<item-list-controls>` uses `app._filters` (unguarded) and `app._filterChildren?.()`, `app._sortChildren?.()`
  (optional) (`dnd5e.mjs:55423`, `:55580`, `:55642`).
- `<dnd5e-effects>` uses `app.document`, `app._concentration?.` (`dnd5e.mjs:51182`).

Reusing these elements on a fresh sheet means re-implementing those private members, which is coupling to dnd5e
internals by another route.

## 4. What breaks on a sheet that is not a dnd5e subclass

### dnd5e itself calls private methods on `actor.sheet`

- `GroupActorSheet._onDropItem` drops an item onto a member with `target.sheet._onDropCreateItems(event, [item])`
  (`dnd5e.mjs:60145-60149`).
- `ContainerSheet._onDropSingleItem` stacks consumables with
  `this.item.actor.sheet._onDropStackConsumables(event, itemData, { container })` (`dnd5e.mjs:65762-65764`).

Both are defined on `BaseActorSheet` (`dnd5e.mjs:57488`, `:57609`). On a fresh sheet they throw `TypeError` unless we
implement them with the same signature. Tidy does exactly that: its base re-implements `_onDropCreateItems` and
`_onDropStackConsumables` (`tidy:src/sheets/quadrone/Tidy5eActorSheetQuadroneBase.svelte.ts:1735`, `:1912`; multi-actor
`Tidy5eMultiActorSheetQuadroneBase.svelte.ts:810-838`).

(`sheet._confirmDialog` calls at `dnd5e.mjs:6434`, `:24088-24094`, `:25510` only run when the caller passes `sheet`
explicitly, so they matter only if we pass ours.)

### Modules that patch dnd5e sheet prototypes

midi-qol, which the GM most likely runs:

- `libWrapper.register(..., "dnd5e.applications.actor.BaseActorSheet.prototype._prepareItem", ...)`
  (`midi-qol.js:10280`) hides automation-only activities from item rows (`:11864-11869`).
- `libWrapper.register(..., "CONFIG.Actor.sheetClasses.character['dnd5e.CharacterActorSheet'].cls.prototype._filterItems", ...)`
  and the NPC twin (`midi-qol.js:10528-10531`) change the "reaction" filter (`:12345-12353`). The method is defined on
  `BaseActorSheet` (`dnd5e.mjs:57693`) but the wrapper sits on `CharacterActorSheet.prototype`.

Consequences per base class:

- Subclass of `CharacterActorSheet` that calls `super`: both wrappers apply.
- Subclass of `BaseActorSheet`: `_prepareItem` wrapper applies, `_filterItems` wrapper does not.
- Fresh sheet: neither applies. Our rows would show activities midi marks automation-only, unless we copy that rule.
- midi resolves `CONFIG.Actor.sheetClasses.character['dnd5e.CharacterActorSheet']` at `ready`; if we ever unregistered
  dnd5e's sheet, that path is `undefined` and midi's patching throws. Registering ours next to it is safe.

### Hooks and sheet-level integrations

| Integration style | Subclass `CharacterActorSheet` | Subclass `BaseActorSheet` | Fresh `ActorSheetV2` | Separate window |
| --- | --- | --- | --- | --- |
| `getHeaderControlsActorSheetV2` (midi `midi-qol.js:13217`, DAE `dae.js:1947`, our current button) | fires | fires | fires | dnd5e sheet unchanged, fires there |
| `renderActorSheetV2` DOM tweaks (DAE `dae.js:1950-1951`) | fires, DOM may differ | fires, DOM may differ | fires, DOM differs | unchanged |
| `renderCharacterActorSheet` listeners | fire, DOM may differ | do not fire | do not fire | unchanged |
| `CharacterActorSheet.TABS/PARTS` mutations | inherited unless we redefine | not inherited | not inherited | unchanged |
| `dnd5e.prepareSheetContext` | fires if `super` chain kept | fires | does not fire | unchanged |
| `dnd5e.filterItem` | fires if we use dnd5e filtering | fires | does not fire | unchanged |
| `dnd5e.getItemContextOptions` / effect menus | fire if we use dnd5e elements | same | only if we re-fire them or use dnd5e elements | unchanged |
| midi-qol `_prepareItem` / `_filterItems` wrappers | apply | `_prepareItem` only | none | unchanged |
| dnd5e cross-calls into `actor.sheet._onDrop*` | work | work | throw unless re-implemented | unchanged |
| dnd5e CSS (`.dnd5e2`, `.character`, `.vertical-tabs` classes, merged from `DEFAULT_OPTIONS`) | inherited, competes with our tokens | `dnd5e2` inherited | none | n/a |
| Tidy-specific APIs (`tidy5e-sheet.ready`, `registerCharacterTab`...) | not ours | not ours | not ours | n/a |

Note on CSS: `DEFAULT_OPTIONS.classes` arrays are concatenated down the chain
(`core/applications/api/application.mjs:438-451`), so a dnd5e subclass carries `dnd5e2` (`dnd5e.mjs:1554`) and
`character vertical-tabs` (`dnd5e.mjs:57826`) and gets dnd5e's whole stylesheet unless we strip them. Our invariant
"theme tokens live on `.tc-root`" (`CLAUDE.md`) would then share the element with dnd5e's selectors.

## 5. Tidy 5e Sheets as the precedent

- Architecture: fresh Svelte sheets on `foundry.applications.sheets.ActorSheetV2` via Tidy's own mixins, not dnd5e
  classes (`tidy:src/sheets/quadrone/Tidy5eActorSheetQuadroneBase.svelte.ts:76-83`). Registered, not default
  (`tidy:src/main.svelte.ts:65-73`).
- To keep dnd5e-targeted modules working it **re-fires** a few dnd5e hooks itself: `dnd5e.getActiveEffectContextOptions`,
  `dnd5e.dropItemSheetData`, `dnd5e.getItemAdvancementContext`, `dnd5e.getItemContextOptions`
  (`tidy:src/foundry/TidyHooks.ts:38`, `:49`, `:69`, `:89`). It does not re-fire `dnd5e.prepareSheetContext` or
  `dnd5e.filterItem` (no match in `tidy:src`).
- It publishes its own API for other modules, obtained via `Hooks.once("tidy5e-sheet.ready", api => ...)`: register
  tabs per actor type, inject HTML/Handlebars content at a selector, register header controls, `isTidy5eSheet(app)`
  helpers, plus ~20 `tidy5e-sheet.*` hooks **[web]**:
  <https://kgar.github.io/foundry-vtt-tidy-5e-sheets/classes/Tidy5eSheetsApi.html>,
  <https://kgar.github.io/foundry-vtt-tidy-5e-sheets/classes/TidyHooks.html>. Its quick-start still shows plain
  `renderActorSheetV2` + `.tidy5e-sheet` class check for HTML injection
  (<https://kgar.github.io/foundry-vtt-tidy-5e-sheets/>) **[web]**.
- How much support that takes from others: midi-qol has dedicated Tidy code (`midi-qol.js:13132-13215`: item summary
  commands, item header controls, activity filtering through `tidy5e-sheet.getActivitiesForPlay`), and so does DAE
  (`dae.js:2131-2145`). The Tidy package page says incompatible modules are fixed by working with their authors, and
  some premium content needs separate "compatibility modules" (example: Ember needs "Ember Tidy Integration")
  (<https://foundryvtt.com/packages/tidy5e-sheet>) **[web]**. In other words, even the most popular alternative sheet
  relies on per-module integration work, done over years.
- Version pairing for the GM's stack: dnd5e 5.3.x pairs with Tidy 13.10.5 on Foundry 13 to 14.367 (legacy table on
  <https://foundryvtt.com/packages/tidy5e-sheet>) **[web]**.

I found no public install statistics for Tidy or other sheets (foundryvtt.com and Forge pages show none) **[web]**. The
GitHub counts in section 2 are the only proxy: about as many repos mention `tidy5e-sheet.ready` (92) as
`renderCharacterActorSheet` (89).

## 6. Options laid out for ticket #7

Two independent axes: **what class** the sheet is, and **how it gets selected**.

### Axis A: class

**A1. Separate window (today).** `ActorInventoryApp` stays an ApplicationV2 window opened from a header control that
fires on every `ActorSheetV2`, Tidy included (`scripts/foundry/sheet-injection.js:125-126`). The dnd5e sheet and
everything other modules do to it are untouched. Cost: two windows; nothing third-party appears inside ours.

**A2. Subclass `CharacterActorSheet`.** Highest compatibility for hooks, wrappers, tabs and dnd5e cross-calls (table in
section 4). Cost: we inherit dnd5e's parts, tabs, actions, CSS classes and private API. Changing layout means
overriding `PARTS`/`TABS` (which then cuts off modules that mutate dnd5e's), and every module listening to
`renderCharacterActorSheet` runs its DOM code against our markup. We become tied to dnd5e internals that already changed
names once between majors (no `ActorSheet5eCharacter2` in 5.3.3).

**A3. Subclass `BaseActorSheet`.** Keeps `_onDrop*`, `_prepareItem`, `dnd5e.prepareSheetContext`, `dnd5e.filterItem`
and `dnd5e2` styling; drops `renderCharacterActorSheet`, `CharacterActorSheet.TABS/PARTS` and midi's `_filterItems`
wrapper. A middle ground with the same internal coupling as A2.

**A4. Fresh `ActorSheetV2` (Tidy model).** Full control of markup and theme; `renderActorSheetV2` and
`getHeaderControlsActorSheetV2` still fire. Must at minimum implement `_onDropCreateItems` and
`_onDropStackConsumables` so dnd5e's group and container sheets do not throw, and decide whether to re-fire
`dnd5e.getItemContextOptions` / `dnd5e.getActiveEffectContextOptions` from our own menus (Tidy does). Loses midi-qol's
sheet wrappers, `renderCharacterActorSheet` listeners, tabs added through dnd5e's `TABS`, and any module integration
written against Tidy's API. Rolls and item use stay compatible as long as they go through the dnd5e API (ADR 0001).

### Axis B: selection

**B1. `makeDefault: true`.** Takes over every character in every world that has no stored GM default, for all users
at once (section 1). Highest blast radius for an untestable module set.

**B2. Registered, not default** (Tidy's choice). Nothing changes until someone opts in: the GM per world, or an Owner
per actor. Note the per-actor choice is shared: a player switching their PC also switches it for the GM. Turning the
module off falls back to dnd5e's sheet automatically. The GM can still pin dnd5e's sheet with `flags.core.sheetLock`.

**B3. `canBeDefault: false`.** Per-actor only; the GM cannot make it the world default from the form.

**B4. Not registered (A1).** No selection at all; open on demand.

### Risk view for "large unknown GM module set"

- What we can verify offline: core and dnd5e behaviour (above, from source). What we cannot: what each unknown module
  does in its `render*` / `TABS` / libWrapper code.
- Fewer shared surfaces = fewer unknowns: A1 shares only the header control hook; A4 shares
  `renderActorSheetV2`-level hooks and whatever dnd5e hooks we choose to re-fire; A2/A3 share almost everything,
  including DOM-level code from modules written for dnd5e's markup.
- Missing integrations fail quietly (a button or tab simply absent); DOM code against unexpected markup or missing
  private methods fails loudly (exceptions). A4 risks the first kind plus the two known `_onDrop*` calls; A2 risks the
  second kind spread over unknown modules.
- B2/B3 limit any of A2-A4 to actors whose owner opted in, and give a one-click way back (switch the sheet).

## Unverified

- Behaviour of Tidy 13.10.5 specifically (I read `main` at 14.x).
- Which modules the GM runs; GitHub counts are only a rough proxy for popularity.
- Whether `dnd5e.getItemContextOptions` etc. are fired from places other than the custom elements in 5.3.3 (searched the
  literal hook names only).
- No live test: nothing here was run in a world.
