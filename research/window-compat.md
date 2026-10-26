# What the actor window can take from dnd5e and other modules without being a sheet

Research for issue #18 (map #3), input to grilling ticket #19. ADR 0002 keeps the **actor window** a separate
ApplicationV2 window, not a registered sheet; ADR 0001 sends every action through the dnd5e document API. This note
lists what the window can still pick up by calling dnd5e's API and hooks itself, and what each option costs. It
records facts and makes no decision.

Prior notes, not repeated here: `research/sheet-registration.md` (branch `research/sheet-registration`: hook chains,
registration, the midi `_prepareItem`/`_filterItems` wrappers, the private members the custom elements read) and
`research/dnd5e-sheet-vs-mock.md` (branch `research/dnd5e-sheet-vs-mock`: the everyday task table and dnd5e API per
task).

Sources and the short names used below:

- `mjs:N` = `Data/systems/dnd5e/dnd5e.mjs`, dnd5e 5.3.3 (one bundled file).
- `core:` = `/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/client/`, build 14.367
  (`app/package.json` `"version": "14.367.0"`).
- `midi:N` = `Data/modules/midi-qol/midi-qol.js` (midi-qol 14.0.12). `dae:N` = `Data/modules/dae/module/dae.js`, and
  `dae-api:N` = `Data/modules/dae/module/API/api.js` (DAE 14.0.14).
- `tidy:` = Tidy 5e Sheets, shallow clone of `main` at `0de9090` (2026-10-24). That `main` is the Tidy 14.x line for
  dnd5e 6.x; the GM's dnd5e 5.3.3 pairs with Tidy 13.10.5, so the Tidy lines show the pattern, not the exact build.
- `aim:` = this repo at `501dd03` (v1.9.1).
- **[web]** = read on GitHub with `gh`, not from an installed copy. Use it as a sample, not as a census.

## 1. `dnd5e.getItemContextOptions` and `dnd5e.getActiveEffectContextOptions`

### Facts

Where dnd5e fires them, and with what arguments:

| Hook | Fired in | Call | Arguments |
| --- | --- | --- | --- |
| `dnd5e.getItemContextOptions` | `InventoryElement._onOpenContextMenu`, `mjs:64746-64755` | `Hooks.callAll` (a listener cannot stop the others) | `(item, menuItems)` |
| `dnd5e.getActiveEffectContextOptions` | `EffectsElement.connectedCallback` → `ContextMenu5e` `onOpen`, `mjs:51045-51050` | `Hooks.call` (a listener returning `false` stops the listeners after it) | `(effect, menuItems)` |
| `dnd5e.getItemActivityContext` | `UtilityActivity.onContextMenu(item, target)` (static, public), `mjs:17697-17713` | `Hooks.callAll` | `(activity, target, menuItems)` |

- These three are the only call sites in 5.3.3. No literal match anywhere else in `dnd5e.mjs`. dnd5e registers no
  listener of its own on them.
- The application is **not** passed. A listener gets the document and the array; it can reach the sheet only through
  the DOM (`target.closest(".application")`) or `ui.context`.
- `menuItems` is assigned to `ui.context.menuItems` before the hook (`mjs:64752`, `mjs:51048`), so listeners mutate
  the live menu. For activities the hook runs first and the array is assigned afterwards (`mjs:17711-17712`).
- dnd5e's own item entries use the deprecated v13 shape `{ name, icon, condition, callback, group }`, plus
  `id: "delete"` on the delete entry (`mjs:64435-64547`). Every own callback is `li => this._onAction(li, …)` on the
  element, which then uses `this.app` (see section 2). Entry labels are i18n keys such as `"DND5E.Identify"` and
  `"DND5E.ContextMenuActionAttune"`.
- Core 14 `ContextMenu` accepts both shapes. The new shape is `{ label, icon, visible(target), onClick(event, target),
  group }`. The old `name`/`condition`/`callback` keys still work, with a deprecation warning "since 14, until 16"
  (`core:applications/ux/context-menu.mjs:5-28`, `:371-375`, `:399-403`, `:616-622`). `callback` receives the target
  element, or a jQuery object when the menu was built with `jQuery: true`.
- `ContextMenu5e` (`mjs:1506-1529`) is core `ContextMenu` with fixed positioning and the `dnd5e2` class on the menu.
  It is exported as `dnd5e.applications.ContextMenu5e` (used that way at `mjs:1779`). Its static
  `triggerEvent` turns a click on a `[data-context-menu]` button into a `contextmenu` event on the nearest
  `[data-item-id]`/`[data-effect-id]`/`[data-activity-id]`.
- Activity menus are self-contained: `activity.getContextMenuOptions()` (`mjs:17598-17645`) is public, and its
  callbacks use `this.item.sheet` (the **item** sheet) and `this.actor.system.addFavorite`, not the actor sheet.

Listeners in the GM's likely set:

- midi-qol 14.0.12 and DAE 14.0.14 listen to **none** of the three hooks (no match for `ContextOptions`,
  `getItemActivityContext` or `ContextMenu` in `midi-qol.js`, `dae/module/dae.js`; the only `ContextMenu` hit is a
  comment at `dae:2171`). Their sheet integrations are `getHeaderControlsActorSheetV2` / `getHeaderControlsItemSheet5e`
  header buttons (`midi:13217-13229`, `dae:1946-1947`, `dae:2151-2160`), a DOM button on `renderActorSheetV2`
  (`dae:1950-1951`, `:2244-2268`) and the midi libWrapper patches (section 3).

How Tidy does it (`tidy:`, 14.x line):

- Tidy builds its **own** entry list (it does not call dnd5e's `_getContextOptions`) and then fires the dnd5e hook with
  the same `(item, menuItems)` / `(effect, menuItems)` arguments:
  `tidy:src/context-menu/tidy5e-item-context-menu.ts:19-33`, `…/tidy5e-active-effect-context-menu.ts:26-27`, wrappers
  `tidy:src/foundry/TidyHooks.ts:34-39`, `:85-90`. Note that Tidy uses `Hooks.call` for the **item** hook, where
  dnd5e uses `Hooks.callAll`.
- It fires `dnd5e.getItemActivityContext` with `(activity, element, menuItems)` the way dnd5e does
  (`tidy:src/context-menu/tidy5e-activities-context-menu.ts:37-48`).
- One `FloatingContextMenu` per sheet is bound to `[data-context-menu]`, and the target's `data-context-menu` attribute
  picks the builder (`tidy:src/context-menu/tidy5e-context-menu.ts:23-100`).

Sample of third-party listeners **[web]** (`gh search code "dnd5e.getItemContextOptions"`; about 40 files listed,
many of them forks of dnd5e or Tidy):

| Repo, file | What the listener uses |
| --- | --- |
| `Larkinabout/fvtt-custom-dnd5e` `scripts/item-interactions/drop-items.js:366-375` | `item` only; new shape (`label`/`visible`/`onClick`) |
| `MrPrimate/ddb-importer` `src/hooks/tattoo/main.ts:208-221` | `item` only; old shape |
| `fantasycalendar/FoundryVTT-ItemPiles` `systems/dnd5e-4.0.0.js:261-275` ("Give to character") | `item` only; old shape |
| `ionrift-gm/ionrift-respite` `scripts/services/ui/sheet/InventoryContextMenu.js:29-50` | `item` only; old shape |
| `gandb/foundry-common-scripts` `src/submodules/hide-unindentify/hide-unidentify.ts:41-90` | **removes** dnd5e entries by matching `option.name === "DND5E.Identify"` / `"DND5E.ContextMenuActionAttune"` |

- None of the five reads an app, a sheet or the DOM. One depends on dnd5e's entry **names**.
- `dnd5e.getActiveEffectContextOptions` has almost no real listeners on GitHub **[web]**: the hits are dnd5e, its
  forks, Tidy, and `Silvestrae/ve-mobile` `src/foundry/active-effect-context-gateway.mjs:190-192`. That last one is an
  alternative sheet: it calls the `<dnd5e-effects>` element's protected `_getContextOptions` and re-fires the hook.

The actor window today (`aim:`):

- It fires none of these hooks and builds no context menu (no `ContextMenu` or `Hooks.call("dnd5e.` anywhere in
  `scripts/`). The item actions are buttons (`aim:scripts/ui/inventory-app.js:146-167`).

### Risk for us

- If the window fires `dnd5e.getItemContextOptions` with `(item, menuItems)`, listeners like the sampled ones work
  without a sheet. Their entries come in **both** shapes, so the window must render both, either through core
  `ContextMenu` (with deprecation warnings until v16) or its own menu that maps `name|label`, `condition|visible`,
  `callback|onClick` and HTML `icon` strings.
- A listener that removes or edits dnd5e's entries finds them only if our entries carry dnd5e's `name` keys (and the
  `id: "delete"` key). Entries we name differently silently escape such listeners.
- Old-shape callbacks get the clicked element as `li`. A listener that does `li.closest(...)` against dnd5e's markup
  would get our markup. None of the sample does, but the sample is small.
- `Hooks.callAll` versus `Hooks.call`: dnd5e lets every item listener run. If we copy Tidy's `Hooks.call`, one
  listener returning `false` hides the entries of every listener after it.
- The activity menu can be reused almost as is: `activity.getContextMenuOptions()` plus the hook. The item and effect
  menus cannot: dnd5e's option builders are protected methods on the custom elements and call back into the sheet.

### Unknown

- The long tail: how many listeners in an unknown GM module set touch the DOM or a sheet in their callbacks. The sample
  is 5 files out of about 40 hits.
- Whether any module listens through `ui.context` or by subclassing `ContextMenu5e` instead of using the hook.

## 2. Using `<dnd5e-inventory>`, `<dnd5e-effects>` and other dnd5e elements outside a sheet

### Facts

Registered custom elements (`mjs:65342-65355`). Only four look up a host application, all the same way:
`foundry.applications.instances.get(this.closest(".application")?.id)`:

| Element | Host lookup | Members of the host it reads (unguarded = throws if missing) |
| --- | --- | --- |
| `<dnd5e-inventory>` | `mjs:64343` | `document` via `app.inventorySource ?? app.document` (`mjs:64310-64312`), unguarded; `expandedSections` or else `_expanded`, unguarded in `_getContextOptions` (`mjs:64464-64465`) and `_onToggleExpand` (`mjs:64863-64901`); `canExpand` optional (`mjs:64544`); `_openDocumentSheet`, unguarded, for view/edit (`mjs:64724-64726`, `:64972-64974`); `_onChangeInputDelta` only checked for presence (`mjs:64653`) |
| `<dnd5e-effects>` | `mjs:51029` | `document` (`mjs:51084-51086`); `_concentration?.effects` optional (`mjs:51182`); `_openDocumentSheet`, unguarded (`mjs:51268`); `render()` after delete (`mjs:51264`) |
| `<item-list-controls>` | `mjs:55420` | `_filters[...]`, unguarded (`mjs:55423`); `options.elements.inventory` (`mjs:55425`); `_filterChildren?.()` / `_sortChildren?.()` optional (`mjs:55580`, `:55642`); `document.type` for the user flag `sheetPrefs.<type>.tabs.<tab>` (`mjs:55400`, `:55677`) |
| `<dnd5e-activities>` (item sheet list) | `mjs:62429` | host item sheet |

The other elements do not look up an app: `<dnd5e-checkbox>`, `<slide-toggle>`, `<proficiency-cycle>`,
`<dnd5e-icon>`, `<filigree-box>`, `<filter-state>`, `<copyable-text>` (`mjs:50686`, `:65294`, `:65052`, `:63951`,
`:63696`, `:63826`, `:62525`). The chat-card elements `<damage-application>`, `<effect-application>` and
`<enchantment-application>` belong to chat messages.

What the inventory and effects elements do with the host besides reading it. These are not in the prior note, and
they matter for a window that is not a `BaseApplication5e`:

- They pass the host on as `sheet` to dnd5e's dialogs. `_onUseItem` → `item.use({ event }, { options: { sheet: app } })`
  (`mjs:64960-64962`); `_onUseActivity` does the same (`mjs:64946-64948`); `_onDeleteItem` →
  `item.deleteDialog({ sheet: app })` (`mjs:64698-64700`); the effects delete → `effect.deleteDialog({ sheet: app })`
  (`mjs:51263`).
- Downstream, dnd5e calls `sheet._renderChild(...)` or `sheet._confirmDialog(...)` behind `if ( sheet )` only, so a
  host without those methods throws:
  - `ActivityChoiceDialog.create`, `mjs:5274-5280`, reached from `Item5e.use` when an item has more than one usable
    activity (`mjs:23597-23599`);
  - `ActivityUsageDialog.create`, `mjs:16201-16211`, reached from `activity.use` (`mjs:16872`);
  - `Item5e.deleteDialog`, `mjs:24044-24104` (advancement, container contents and the plain confirm);
  - `ActiveEffect5e.deleteDialog`, `mjs:25498-25511`;
  - `AdvancementConfirmationDialog`, `mjs:8032-8056`.
- `_renderChild` and `_confirmDialog` are defined only on dnd5e's `ApplicationV2Mixin` (`BaseApplication5e`,
  `mjs:1921-1965`). Core 14 `ApplicationV2` has a public `renderChild(app, options)` for detached windows
  (`core:applications/api/application.mjs:1279-1290`), but not the underscored dnd5e names.
- Exception: the roll pipeline guards the lookup. `BasicRoll.buildConfigure` sets
  `dialog.sheet ??= instances.get(config.event?.target?.closest(".application")?.id)` (`mjs:68416`), so a roll started
  with an event from our window picks our window as `dialog.sheet`. The roll dialog then checks
  `dialog.sheet?._renderChild` before using it (`mjs:19887-19893`). Today the roll dialogs open as their own windows. If
  the window ever defines a `_renderChild`, they become its children.

Rendering the markup:

- The elements only add behaviour to markup that is already rendered. The markup comes from dnd5e's templates
  (`templates/inventory/inventory.hbs`, `templates/shared/active-effects.hbs`), and those read sheet-built context:
  `sections`, `itemContext[item.id]` through the `dnd5e-itemContext` helper (`mjs:1024-1033`, registered `mjs:1100`),
  `listControls`, `currency`, `elements.inventory`, `@root.rollableClass`, `@root.locked`.
- Public static builders exist: `InventoryElement.mapColumns`, `prepareSections`, `unionColumns`, `COLUMNS`,
  `SECTIONS` (`mjs:64132-64259`, `:64999-65030`); `EffectsElement.prepareCategories` (`mjs:51099-51169`); per-type
  `CONFIG.Item.dataModels[type].inventorySection` (read at `mjs:55979-55981`).
- The per-item context, however, is built by the sheet's protected `_prepareItem`, `_prepareItemPhysical`,
  `_prepareItemSpell`, `_prepareItemFeature` and `_prepareActivity` (`mjs:56480-56620`). `_prepareItem` reads
  `this._concentration` (`mjs:56489`) and `this.actor`. The condition list for the effects tab is likewise built in
  `BaseActorSheet._prepareEffectsContext` (`mjs:55900-55945`).
- Styling: dnd5e's rules for these lists hang off the `.dnd5e2` class (for example `.dnd5e2 .items-section .item
  .item-row`; 3060 `dnd5e2` matches in `dnd5e.css`), and `BaseApplication5e` puts that class on the application
  (`mjs:1554`).

The actor window today:

- `ActorInventoryApp` is `HandlebarsApplicationMixin(ApplicationV2)` with classes `actor-inventory-manager-app tc-root`
  and a `this.actor` field. It has no `document`, `inventorySource`, `expandedSections`, `_openDocumentSheet`,
  `_renderChild` or `_confirmDialog` (`aim:scripts/ui/inventory-app.js:128-170`, `:195`).

### Risk for us

- Placing `<dnd5e-inventory>` or `<dnd5e-effects>` in the window as it is throws on first use. `this.document` is
  `undefined` (no `document`/`inventorySource`), and the context menu reads `this.app._expanded.has` when
  `expandedSections` is absent.
- Making them work means giving our window dnd5e's sheet-private names: `document`, `expandedSections`,
  `_openDocumentSheet`, `_renderChild`, `_confirmDialog`, and `_filters` for the list controls. dnd5e can rename these
  without a deprecation path. The `// TODO: Remove when V1 sheets are gone` fallbacks (`mjs:64465`, `:64862`) show the
  surface is still moving.
- The markup also needs the sheet's per-item context, which only protected sheet methods produce, plus `.dnd5e2` on the
  window. `.dnd5e2` pulls in dnd5e's whole sheet stylesheet next to our `.tc-root` tokens (CLAUDE.md theme rule).
- Gain if done: dnd5e's own row actions, inline quantity/uses editing, and the item and effect context menus with
  their hooks come for free.
- Elements that need no host (`dnd5e-icon`, `dnd5e-checkbox`, `slide-toggle`, `proficiency-cycle`, `filigree-box`,
  `copyable-text`) can be used without that coupling. They are cosmetic or input widgets.

### Unknown

- Whether dnd5e 5.3.x patch releases change these private members. I checked only 5.3.3.
- Whether `<item-list-controls>` writing `sheetPrefs.<type>.tabs.<tab>` user flags from our window would disturb the
  vanilla sheet's saved filters. The flag path is shared; I did not run it.
- Nothing here was run in a world.

## 3. midi-qol's "hide automation-only activities" rule

### Facts

- The rule is one data field. midi adds `midiProperties.automationOnly` (`BooleanField`, default `false`) to the
  activity schema (`midi:7356`, `:7372`). Its field browser describes it as "Hidden from manual use (automation only)"
  (`midi:34989`).
- On the vanilla sheet, the row filter is a libWrapper `WRAPPER` on
  `dnd5e.applications.actor.BaseActorSheet.prototype._prepareItem`, registered in `initPatching` at `init`
  (`midi:10270-10280`, called `midi:40000`). It removes `ctx.activities` entries whose activity has
  `midiProperties?.automationOnly` (`midi:11864-11869`). dnd5e's own `_prepareItem` has already kept only
  `a.canUse` (`mjs:56484-56486`). So the activities shown on the vanilla sheet are `canUse && !automationOnly`.
- For Tidy, midi applies the same rule through Tidy's `tidy5e-sheet.getActivitiesForPlay` hook. There it also drops
  activities listed in `item.flags.dnd5e.riders.activity` (`midi:13132-13140`).
- On **use**, midi wraps `CONFIG.Item.documentClass.prototype.use` (`MIXED`, registered in `itemPatching` at `setup`,
  `midi:12385-12395`, called `midi:40193`). The wrapper `doItemUse` keeps only activities with
  `canUse !== false && !riders && !automationOnly && !inProgress` (`midi:12239-12264`). It then picks the single
  attack activity directly, or opens `MidiActivityChoiceDialog`. It ignores `dialog.options.sheet`.
- midi publishes that filter. `MidiActivityChoiceDialog.getActivities(item)` (static, async) returns the surviving
  `{ id, name, img, sort }` list after the same filter. It also awaits midi's own hook `midi-qol.itemUseActivitySelect`
  so other modules can prune it (`midi:9963-9980`, method at `:9974-9980`). The class is exposed as `MidiQOL.apps.MidiActivityChoiceDialog`
  (`midi:39916-39921`, in the `globalThis.MidiQOL` API object). The doc comment calls it the "single source of truth
  for 'which activities can be used'" (`midi:9970-9973`).
- The `_filterItems` wrapper changes the "reaction" filter (`midi:10528-10531`, `:12345-12353`). It applies only to
  dnd5e's character/NPC sheet classes and only when that filter is on.

### Risk for us

- Calling `item.use({ event })` from the window, as `aim:scripts/ui/item-actions.js:142-155` does now, already goes
  through midi's `doItemUse`. Automation-only activities are never offered on use. No copy is needed for **using**
  items.
- The rule matters only if the window **lists** activities (activity sub-rows, favorites, the inspector). Two ways to
  ask instead of copying:
  - read the data field `activity.midiProperties?.automationOnly`. This is synchronous and is the same check midi's
    sheet wrapper makes, but it still hard-codes the field name;
  - call `MidiQOL.apps.MidiActivityChoiceDialog.getActivities(item)`. This is async and also applies riders,
    `inProgress` and third-party pruning, but it reaches into a dialog class of an undocumented API object. The method
    exists in 14.0.12 and may move.
- Neither choice is "the sheet asks midi": on the vanilla sheet midi pushes the rule into dnd5e by patching. Without a
  sheet there is nothing for midi to patch, so the window has to look the rule up itself. Feature-detect `MidiQOL` and
  fall back to `canUse` only.

### Unknown

- Whether any other module the GM runs hides activities through `_prepareItem` wrappers. That would be invisible to a
  window that does not call `_prepareItem`.
- Whether midi plans a public, non-dialog entry for this filter. Its changelog was not checked.

## 4. Everyday actions that dnd5e performs only in the sheet, not through the document API

The prior note (#5) lists the dnd5e API per task. This section separates what lives on the **sheet or element
instance**, and so is out of reach from a window, from what is a document or static call. Lines are verified in
5.3.3.

### Only in the sheet (protected or private methods; no public equivalent)

| Everyday action | Where dnd5e does it | Public pieces a window could call instead |
| --- | --- | --- |
| Drop an item from the sidebar, a compendium or another actor | `BaseActorSheet._onDropItem` → `_onDropCreateItems` → `_onDropSingleItem` (`mjs:57402-57585`). This covers: unsupported type check; spell → scroll when the **Inventory tab** is active (`this.tabGroups.primary`, `mjs:57545-57549`); reset `attuned/equipped/prepared` (`mjs:57594-57597`); stack consumables by compendium source (`mjs:57609-57618`); singleton rule and `AdvancementManager.forNewItem` for items with advancement (`mjs:57559-57578`); NPC → gear (`mjs:57502-57504`); `CONFIG.Item.dataModels[type].onDropCreate(event, actor, itemData)`, which for spells reads the drop target's DOM to pick the method (`mjs:22504-22520`) | `Item5e.createWithContents`, `Item5e.createDocuments`, `Item5e.createScrollFromSpell`, `AdvancementManager.forNewItem`, `actor.sourcedItems`. The order and rules above would be ours to keep in step. Core `dropActorSheetData(actor, sheet, data)` fires only in `ActorSheetV2._onDrop` (`core:applications/sheets/actor-sheet.mjs:257-261`), so modules hooked there (for example Item Piles) do not see drops on the window unless it calls that hook itself |
| Drop into a container | `_onDropItemContainer` (`mjs:57431-57462`): recursion check, then `item.update({"system.container"})` or create inside | same building blocks; the window already does the move and the cycle check (`aim:scripts/ui/drag-drop-controller.js:83-140`) |
| Manual sort by drag | `_onSortItem` (`mjs:57623-57650`) on core `foundry.utils.performIntegerSort` | `performIntegerSort` + `updateEmbeddedDocuments` |
| Activity rows, uses bar, to-hit, save DC per row | `_prepareItem`, `_prepareActivity` and friends (`mjs:56480-56620`) | data on `item.system`, `item.labels`, `activity.*`; midi rule as in section 3 |
| Spellbook sections (method × level, pact, at-will) | `_prepareSpellbook` (`mjs:56212`, used `:57983`) | `dnd5e.dataModels.spellcasting` models (`getLabel`, `slots`, `order`) and `CONFIG.DND5E.spellcasting` |
| Condition list on the Effects tab | `_prepareEffectsContext` builds it from `CONFIG.DND5E.conditionTypes`, skipping `pseudo` (`mjs:55900-55945`); the toggle is `EffectsElement._onToggleCondition`, which creates or deletes the `dnd5e<id>` static-ID effect directly (`mjs:51286-51291`) | `actor.toggleStatusEffect(id)`. dnd5e overrides it to also clear other statuses in the same `exclusiveGroup` (`mjs:39476-39486`), which the vanilla tab toggle does **not** do |
| Search, filter, sort and group lists | `<item-list-controls>` + `BaseActorSheet._filterItems` / `dnd5e.filterItem` hook (`mjs:57693`, `:57749-57762`) | none; own filter. `dnd5e.filterItem` would be ours to fire |
| Level up and level down from the class pill | private `#changeLevel` (`mjs:56886-56906`) | `AdvancementManager.forLevelChange(actor, classId, delta)`, `AdvancementConfirmationDialog.forLevelDown(classItem)`, else `classItem.update({"system.levels"})`; the sheet adds only `_renderChild` |
| Use a favourite (item, activity, effect, skill, tool) | private `#useFavorite` (`mjs:58887-58907`) | each branch is a document call: `item.use`, `activity.use`, `effect.update({disabled})`, `actor.rollSkill`, `actor.rollToolCheck`; favourites stored via `actor.system.addFavorite` / `removeFavorite` |
| Transform by dropping an actor | `_onDropActor` (`mjs:57384-57397`) | `TransformDialog.promptSettings` (`mjs:55153`) + `actor.transformInto` (`mjs:38755`) |

### Done by the sheet or element, but a public call does the same thing

| Action | Sheet or element code | Public call |
| --- | --- | --- |
| Use item / activity | `_onUseItem`, `_onUseActivity` (`mjs:64946-64962`) | `item.use({ event })`, `activity.use({ event })`. Do **not** pass `options.sheet` from a non-dnd5e app (section 2) |
| Quantity, charges, item uses with deltas (`+1`, `-2`) | `_onChangeInput`, `_onChangeInputDelta` (`mjs:64629-64671`, `:56967-56985`); uses map to `system.uses.spent = max - value` | `dnd5e.utils.parseDelta` / `parseInputDelta` (exported, `mjs:1484-1485`) + `item.update` / `item.updateActivity` |
| HP and temp HP typed on the vanilla sheet | the same generic `_onChangeInputDelta` → `actor.update({"system.attributes.hp.value": n})` (`mjs:56967-56985`) | the same `actor.update`. Note that `actor.applyDamage` (`mjs:36705`) is a different path: it applies resistances and fires `dnd5e.preApplyDamage`, which midi listens to (`midi:14247`). The vanilla HP field does **not** use it |
| Recharge roll | `_onRollRecharge` (`mjs:64767-64770`) | `item.system.uses.rollRecharge({ apply: true, event })` (this settles the open point in the #5 note) |
| Expend / restore a recharge charge | `_onToggleCharge` (`mjs:64811-64813`) | `item.update({"system.uses.spent": 1 - spent})` |
| Equip, attune, identify, prepare | `mjs:64799-64934` | plain `item.update`. dnd5e's attune toggle has **no** limit check; the limit shows as a count, since `prepareFinalEquippableData` adds 1 to `system.attributes.attunement.value` per attuned item (`mjs:13909-13914`) |
| Expand item summary | `_onToggleExpand` (`mjs:64861-64907`) | `item.getChatData({ secrets })` + `templates/items/parts/item-summary.hbs` |
| Delete item | `_onDeleteItem` → `item.deleteDialog({ sheet })` | `item.deleteDialog()` without `sheet` (`mjs:24044-24106`): asks about removing advancements (`AdvancementManager.forDeletedItem`) and shows the container-contents checkbox. The window currently uses its own `DialogV2` with its own contents checkbox (`aim:scripts/ui/inventory-app.js:828-840`), so it skips the advancement step |
| Create spell scroll, end concentration, favourite toggle, display card | item context entries (`mjs:64468-64532`) | `Item5e.createScrollFromSpell`, `actor.endConcentration(item)`, `system.addFavorite/removeFavorite`, `item.displayCard()` |
| Currency manager | `_onManageCurrency` (`mjs:64735-64737`) | `new dnd5e.applications.CurrencyManager({ document }).render({ force: true })` (exported in `dnd5e.applications`, `mjs:70339`) |
| Effect toggle, duplicate, edit | `EffectsElement._onAction` (`mjs:51243-51276`) | `effect.update({disabled})`, `effect.clone({...},{save:true})`, `effect.sheet.render` |

Sheet-bound behaviour that follows `actor.sheet`, not the window:

- Template placement and summoning minimise `actor.sheet` (the registered sheet), not whichever window started the
  use (`mjs:16331`, `:16362-16365`; `mjs:34392-34395`). On Foundry 14 they skip this when the sheet is in a detached
  window. The actor window stays over the canvas during placement.

### Risk for us

- Drop-in from outside (loot, compendium) is the one everyday action that has no single public call. Rebuilding it
  means copying about eight rules from `_onDropSingleItem`, plus the advancement prompt. They drift silently between
  dnd5e versions.
- dnd5e does the same thing across sheets: `GroupActorSheet` calls `target.sheet._onDropCreateItems(event, [item])`
  (`mjs:60145-60149`, per the prior note). The window could do the same against `actor.sheet`. That ties it to a
  protected method of whatever sheet the actor uses (Tidy re-implements it; see the prior note), and the scroll rule
  reads `this.tabGroups.primary` of that sheet, not of our window.
- HP: copying the vanilla sheet (plain `actor.update`) and using `applyDamage` give different results with midi and
  with resistances. That choice is for #19, not this note.
- The condition toggle: `actor.toggleStatusEffect` and the vanilla tab's direct create/delete differ on
  `exclusiveGroup`.

### Unknown

- Whether `_onDropSingleItem`'s rules are all of the drop path. `DragDropApplicationMixin` and core `_onDrop` add
  `_dropBehavior` (`mjs:57376-57379`), which I did not follow.
- Whether `actor.sheet._onDropCreateItems(event, items)` works with an `event` whose target is in our window. The
  spell `onDropCreate` reads `event.target.closest(".items-header")`. I did not run it.
- No live check in a world for any of the above.
