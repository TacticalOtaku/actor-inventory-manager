# Dropping items into the actor window from outside

Research for issue #23 (map #3), input to grilling ticket #24. ADR 0002 keeps the **actor window** a separate
ApplicationV2 window, not a registered sheet; ADR 0001 sends every action through the dnd5e document API. This note
traces what the **vanilla sheet** does when an item is dropped on it from a compendium, the sidebar, chat, another
actor or Item Piles, which of those steps the window can reach, and what each way of reaching them costs. It records
facts and makes no decision.

Prior note, not repeated here: `research/window-compat.md` (branch `research/window-compat`), which first listed the
`_onDropSingleItem` rules and the two dnd5e cross-calls into `actor.sheet._onDrop*`.

Sources and the short names used below:

- `mjs:N` = `Data/systems/dnd5e/dnd5e.mjs`, dnd5e 5.3.3 (one bundled file).
- `core:` = `/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/client/`, build 14.367.
- `midi:N` = `Data/modules/midi-qol/midi-qol.js` (midi-qol 14.0.12). `dae:` = `Data/modules/dae/module/` (DAE 14.0.14).
  libWrapper 1.13.5.1 and socketlib 1.1.4 are installed too.
- `wc:` = Weighty Containers 3.8.0, clone of `TacticalOtaku/Weighty-Containers` at `59ee845`.
- `ip:` = Item Piles 3.3.4 (latest release, 2026-07-18), `src/` read file by file from tag `3.3.4` with `gh api`.
  **[web]**: not installed here.
- `tidy:` = Tidy 5e Sheets tag `v13.10.5` (the line that pairs with dnd5e 5.3.3), two files read with `gh api`:
  `src/sheets/quadrone/Tidy5eActorSheetQuadroneBase.svelte.ts` and `Tidy5eCharacterSheetQuadrone.svelte.ts`. **[web]**
- `aim:` = this repo at `501dd03` (v1.9.1).
- **[web]** marks facts read on GitHub rather than from an installed copy. Nothing here was run in a world.

## 1. The vanilla sheet's drop chain, step by step

### 1.1 Wiring

| Step | Where | What happens |
| --- | --- | --- |
| DragDrop class | `mjs:82417` | dnd5e sets `CONFIG.ux.DragDrop = DragDrop5e`, so every `DragDrop.implementation` in the client is dnd5e's. |
| Drag start | `DragDrop5e._handleDragStart`, `mjs:50519-50529` | After the app's own `dragstart` callback, it parses `application/json` or `text/plain` and keeps it in a private static `#payload`. Only drags started through a `DragDrop5e` instance fill it. |
| Drag over | `DragDropApplicationMixin._onDragOver`, `mjs:50565-50569` | Sets the static `DragDrop5e.dropEffect` and `event.dataTransfer.dropEffect` to `this._dropBehavior(event, payload)`, or to `"copy"` when there is no payload. |
| Drag end | `DragDrop5e._handleDragEnd`, `mjs:50534-50538` | Resets `dropEffect` and `#payload` to `null`. Only for drags started through `DragDrop5e`. |
| Sheet listener | core `ActorSheetV2._dragDrop`, `core:applications/sheets/actor-sheet.mjs:81-94` | `new DragDrop.implementation({ dragSelector: ".draggable", permissions: { drop: _canDragDrop } … })`. `_canDragDrop` is `this.isEditable` (`:212-214`). |
| Drop entry | `BaseActorSheet._onDrop`, `mjs:57376-57379` | `event._behavior = this._dropBehavior(event)`, before any `await`, then `super._onDrop(event)`. |
| Core drop | `ActorSheetV2._onDrop`, `core:…/actor-sheet.mjs:257-268` | `TextEditor.implementation.getDragEventData(event)` (parses `text/plain` only, `core:applications/ux/text-editor.mjs:878-889`), then `Hooks.call("dropActorSheetData", actor, this, data)`; `false` stops the drop. Then `documentClass.fromDropData(data)` and `_onDropDocument`. |
| Resolve | `ClientDocumentMixin.fromDropData`, `core:documents/abstract/client-document.mjs:971-994` | `data.data` → a new unsaved document; else `fromUuid(data.uuid)`. A compendium document gets `_stats.compendiumSource` set. |
| Dispatch | `ActorSheetV2._onDropDocument`, `core:…/actor-sheet.mjs:282-295` | `ActiveEffect` / `Actor` / `Item` / `Folder` → `_onDropActiveEffect` / `_onDropActor` / `_onDropItem` / `_onDropFolder`. |

The appv1 `ActorSheet` fires the same hook (`core:appv1/sheets/actor-sheet.mjs:192`). These two lines are the only call
sites of `dropActorSheetData` in core. dnd5e fires no hook of its own anywhere in the actor drop chain. Its item
sheets fire `dnd5e.dropItemSheetData` instead (`mjs:52885`, `:65655`).

### 1.2 Move or copy (`_dropBehavior`)

- `_dropBehavior(event, data)`, `mjs:50580-50592`: start from `DragDrop5e.dropEffect ?? event.dataTransfer.dropEffect`.
  On `dragover` only, a held key overrides it: `dragMove` (default Shift or OS key) → `"move"`, `dragCopy` (default
  Ctrl or Alt) → `"copy"`, else `_defaultDropBehavior`. Keybindings: `mjs:49615-49623`. Key test: `areKeysPressed`,
  `mjs:484-499`. The result is clamped to `_allowedDropBehaviors`.
- `PrimarySheetMixin._allowedDropBehaviors`, `mjs:53637-53649`: no uuid → `copy`/`link`. Otherwise
  `copy`/`move`/`link`, and no `move` when either side is in a compendium (unless it is the same one).
- `BaseActorSheet._defaultDropBehavior`, `mjs:57305-57312`: `"move"` only when the dragged uuid belongs to the same
  document as `inventorySource` (the same actor). From another actor, the sidebar, a compendium or chat the default
  is `"copy"`. `CharacterActorSheet` adds `"link"` for the favourites bar (`mjs:58917-58921`).
- So on the vanilla sheet, an item from **another actor is copied** unless the player holds Shift while dragging
  over the sheet.

### 1.3 Item path on `BaseActorSheet`

| Step | Lines | Rule |
| --- | --- | --- |
| `_onDropItem(event, item)` | `mjs:57402-57419` | Stops if `!inventorySource.isOwner` or behavior `"none"`. If `event.target.closest(".container[data-item-id]")` names a container on this actor → `_onDropItemContainer`. If `move` and the item already belongs to this actor → clear `system.container`, then `_onSortItem` (sort by the DOM siblings of `event.target.closest("[data-item-id]")`, `mjs:57623-57650`). Otherwise `_onDropCreateItems(event, [item])`. |
| `_onDropItemContainer(event, item, container)` | `mjs:57431-57462` | Recursion check (`DND5E.ContainerRecursiveError`). `move` within the actor → `item.update({"system.container": id})`. NPC item → `item.system.asGear()`. Otherwise `Item5e.createWithContents([item], { container, transformFirst: d => this._onDropSingleItem(event, d, { container: container.id }) })`, `Item5e.createDocuments(…, { parent, keepId: true })`, and on `move` `item.delete({ deleteContents: true })`. |
| `_onDropFolder(event, data)` | `mjs:57467-57476` | Item folders only; all contents → `_onDropCreateItems`. |
| `_onDropCreateItems(event, items, behavior)` | `mjs:57488-57516` | (a) More than one item with advancement → warning `DND5E.WarnCantAddMultipleAdvancements`, those are dropped. (b) Contents whose container is also in the drop are skipped. (c) NPC items → `asGear()`. (d) `Item5e.createWithContents(items, { transformFirst: d => this._onDropSingleItem(event, d) })`. (e) `Item5e.createDocuments(toCreate, { parent: inventorySource, keepId: true })`. (f) On `move`, `items.forEach(i => i.delete({ deleteContents: true }))`, not awaited. |
| `_onDropSingleItem(event, itemData, { container })` | `mjs:57530-57585` | 1. `this.constructor.unsupportedItemTypes` → warning, `false`. 2. Spell on the Inventory tab (`this.tabGroups.primary === "inventory"`) or on a vehicle → `Item5e.createScrollFromSpell(itemData)` (opens `CreateScrollDialog`, fires `dnd5e.preCreateScrollFromSpell`, `mjs:24196-24250`). 3. `_onDropResetData`: delete `system.attuned/equipped/prepared/crew.value` (`mjs:57594-57597`). 4. `_onDropStackConsumables`: a consumable with the same compendium source and name in the same container gets its quantity raised instead (`mjs:57609-57618`, via `inventorySource.sourcedItems`). 5. With advancement and advancements enabled: singleton check, then `AdvancementManager.forNewItem(actor, itemData)`; if it has steps it is rendered and the item returns `false` (the manager creates it later). 6. `CONFIG.Item.dataModels[type].onDropCreate?.(event, actor, itemData)`. |
| `createWithContents` | `mjs:24153-24185` | Public static. Walks contents to `PhysicalItemTemplate.MAX_DEPTH`, applies `transformAll`/`transformFirst`, drops falsy results, sets `system.container`, new ids unless `keepId`. |

Subclass overrides in 5.3.3:

| Sheet | Override | Lines |
| --- | --- | --- |
| `CharacterActorSheet` | `_onDropSingleItem`: a dropped **class** with the same identifier raises the existing class's levels (via `AdvancementManager.forLevelChange`, else `cls.update`) and caps at `CONFIG.DND5E.maxLevel`; a **subclass** with a duplicate identifier, or for a class that already has one, is refused. | `mjs:59037-59080` |
| `CharacterActorSheet` | `_onDrop`, `_onDropItem`, `_onDropActiveEffect`, `_onDropActivity`: a drop on `.favorites` adds a favourite. `_onDropActor` on `.facility-occupants` adds an occupant. | `mjs:58951-59032` |
| `MultiActorSheet` (group, encounter) | `unsupportedItemTypes` = background, class, facility, feat, race, spell, subclass; `_onDropCreateItems` keeps physical items only. | `mjs:59165-59167`, `:59277-59288` |
| `GroupActorSheet` | `_onDropItem` onto a member row → `target.sheet._onDropCreateItems(event, [item])`. | `mjs:60145-60150` |
| `VehicleActorSheet` | `unsupportedItemTypes` = background, class, facility, race, spell, subclass. The vehicle branch of the scroll rule is therefore never reached on this sheet. | `mjs:61069` |
| `NPCActorSheet` | no drop override; `unsupportedItemTypes` empty. | — |

### 1.4 What the spell hook reads from the DOM

`SpellData.onDropCreate` (`mjs:22504-22528`) picks the spellcasting method from the drop target:
`event.target.closest(".items-header")`, or the `.item-list`'s previous sibling, then `closest("[data-level]")
.dataset.method`. If none, it uses the actor's first slot progression or `"spell"`. All other item types use the empty
base (`mjs:10528`).

### 1.5 Rules that run on any creation path

These live on the document or data model, so they apply whether the window, a sheet or a macro creates the item:

- `Item5e._preCreate`: a non-physical item on a group actor is refused; `system.identifier` is filled from the name
  (`mjs:23992-24002`). `_onCreate` runs `onCreateActivities` (`mjs:24007-24010`).
- `SystemDataModel._preCreate`: singleton types (background, race, …) on a **character** are refused with
  `DND5E.ACTOR.Warning.Singleton` (`mjs:10218-10229`). The sheet's own singleton check only fires on the advancement
  branch.
- Class `_preCreate` → `preCreateAdvancement` fills default advancement (`mjs:13691-13694`, `:10918-10931`).
- `preCreateEquipped`: on a creature, equipment and weapons without `system.equipped` become equipped for NPCs and
  unequipped for PCs (`mjs:13928-13932`, used `:19028`, `:77092`).
- `preCreateGear`: adds or removes the `gear` property depending on NPC ownership (`mjs:14274-14281`).
- Spell `_preCreate`: sets `prepared` by actor type and the source class (`mjs:22621-22640`).
- Core: a `false` from `_preCreate` or from any `preCreateItem` listener drops just that document from the batch
  (`core:data/client-backend.mjs:103-108`). This is where Weighty Containers acts (section 5).
- `AdvancementManager.#complete` creates the item with `isAdvancement: true` and fires
  `dnd5e.preAdvancementManagerComplete` / `dnd5e.advancementManagerComplete` (`mjs:7800-7848`).

So the sheet-only rules are: unsupported types, spell to scroll, reset of attuned/equipped/prepared, consumable
stacking, the advancement prompt with its singleton check, `onDropCreate` (spell method), NPC → gear, the class-level
merge and subclass checks, the multi-advancement guard, and move = delete the source.

## 2. What the window can call

Public in the sense "exported and documented as such":

| Piece | Handle |
| --- | --- |
| `Item5e.createWithContents`, `createScrollFromSpell`, `createDocuments` | `dnd5e.documents.Item5e` (`mjs:80040`) or `Item.implementation` |
| `AdvancementManager.forNewItem`, `forLevelChange` | `dnd5e.applications.advancement.AdvancementManager` (`mjs:62216`) |
| `CONFIG.Item.dataModels[type].onDropCreate(event, actor, itemData)` | static, documented hook point |
| `actor.sourcedItems.get(uuid, { legacy: false })` | `mjs:36307`, used by the stacking rule |
| `item.system.asGear()`, `container.system.allContainers()` | data model methods |
| `dnd5e.utils.areKeysPressed(event, "dragMove")` | `mjs:1453` |
| `DragDropApplicationMixin` | `dnd5e.applications.api` (`mjs:62240`) |
| `DragDrop5e` | not exported by name; reachable as `CONFIG.ux.DragDrop` |
| `BaseActorSheet` and the concrete sheets | `dnd5e.applications.actor.*` (`mjs:61686-61713`) |

Marked `@protected` (callable from JS, no stability promise): `_onDrop`, `_onDropItem`, `_onDropItemContainer`,
`_onDropCreateItems`, `_onDropSingleItem`, `_onDropStackConsumables`, `_dropBehavior`, `_defaultDropBehavior`,
`_allowedDropBehaviors`. `_onDropResetData` has no annotation. dnd5e itself calls two of them across applications:
`GroupActorSheet` → `target.sheet._onDropCreateItems` (`mjs:60148`) and `ContainerSheet._onDropSingleItem` →
`this.item.actor.sheet._onDropStackConsumables` (`mjs:65762-65764`).

## 3. What each source puts in the drag

| Source | Payload | Through `DragDrop5e`? |
| --- | --- | --- |
| Sidebar Items, compendium | `{ type: "Item", uuid }` from core `toDragData` | yes (`ItemDirectory5e`, `ItemCompendium5e` mix in `DragDropApplicationMixin`, `mjs:65894`, `:65974`). Their own dragover sets `dropEffect` to `move` for an entry of the same collection (`mjs:65977-65995`). |
| dnd5e Compendium Browser | `{ type, uuid }` (`mjs:33366-33373`) | not via `DragDrop5e` callbacks |
| A dnd5e sheet's item row | `item.toDragData()` (`mjs:57349-57353`) | yes |
| Content link in chat or a journal | `{ type, uuid }`, document body listener (`core:applications/ux/text-editor.mjs:781-783`, `:843-866`) | no |
| Bastion order chat card | `{ type: "Item", data: <item data> }`, no uuid (`mjs:74228-74234`; a TODO there says the item cannot be marked as claimed) | no |
| Item Piles pile window row | `{ type: "Item", uuid }` of the pile actor's item, plus `Hooks.callAll("item-piles-onDragDocument")` (`ip:src/applications/item-pile-inventory-app/ListEntry.svelte:30-38`) | no (Svelte `on:dragstart`) |
| Our window today | `{ type: "Item", uuid, itemId, actorId, actorUuid, fromSlot }`, `effectAllowed = "move"` (`aim:scripts/ui/drag-drop-controller.js:50-60`) | no |

Consequences of the static state (from the code; not run live):

- `DragDrop5e.dropEffect` is reset only at the end of a drag that **started** through `DragDrop5e`. A drag that passes
  over a dnd5e app sets it, and nothing resets it if the drag started elsewhere (chat link, Item Piles, our window).
- A drag from the sidebar that passes over the sidebar on its way out leaves `dropEffect = "move"`. On a vanilla sheet
  the sheet's own dragover replaces it with `"copy"`. A target that has no dnd5e dragover handler (our window) does
  not, so any call to `actor.sheet._dropBehavior(event)` made at drop time on our window would read the sidebar's
  `"move"`. For a world item that passes the allowed set and would delete the world item after creating the copy.
- A drag from our window onto a vanilla sheet has no `DragDrop5e` payload, so the sheet treats it as `copy`/`link`
  only. Shift does not turn it into a move.

## 4. `dropActorSheetData`: who listens

Signature `(actor, sheet, data)`, called with `Hooks.call`, so a listener may return `false` to cancel
(`core:hooks.mjs:993-1002`).

In the GM's installed set:

- **midi-qol 14.0.12**: no listener. Its only `_onDrop` is on its own on-use macro config field (`midi:12652-12655`).
  Its sheet integration is the `_prepareItem` / `_filterItems` libWrapper patches (`midi:10280`, `:10530-10531`); it
  has a `deleteItem` hook (`midi:14077`). Nothing in the drop path.
- **DAE 14.0.14**: no listener. It reacts to `createItem` / `deleteItem` (`dae:dae.js:1767-1768`, `:1929-1930`), for
  transfer effects and status effects, so it sees an item however it is created. `_onDropActiveEffect` in
  `dae:Systems/DAEdnd5e.js:1528` is defined but not referenced anywhere in DAE.
- **libWrapper, socketlib**: infrastructure, no listener.
- **Weighty Containers 3.8.0**: no listener; `preCreateItem` / `preUpdateItem` only (section 5).
- **Item Piles 3.3.4** [web]: no listener in `src/`. It hooks `dropCanvasData` (`ip:src/API/private-api.js:39`,
  handler `:1792-1860`, which reads `data.uuid` or `actorId`/`tokenId`) and wraps
  `foundry.applications.ux.DragDrop.implementation.prototype.callback` to fire `item-piles-onDragDocument` /
  `item-piles-onDropDocument` on any `DragDrop` drag or drop (`ip:src/libwrapper.js:82-98`; only its vault window
  listens, to size the drag ghost, `ip:src/applications/vault-app/vault-shell.svelte:91-115`). It tracks piles with
  `createItem` / `updateItem` / `deleteItem` (`ip:src/API/private-api.js:29-31`). A pile row dropped on a sheet is a
  plain uuid drop, so the vanilla sheet **copies** it; taking it out of the pile is Item Piles' own "take" flow over
  its GM socket, not a sheet drop.
- **Tidy 5e** [web]: re-fires `dropActorSheetData` from its own `_onDrop` (`tidy:…QuadroneBase.svelte.ts:1436-1445`),
  so listeners work on Tidy.

Sample of dnd5e-relevant listeners on GitHub [web] (`gh search code dropActorSheetData`, 60 hits, most of them other
game systems):

| Repo, file | What it does on the hook | Uses `sheet`? |
| --- | --- | --- |
| `DFreds/dfreds-convenient-effects` `src/ts/hooks/dropActorSheetData.ts` | If `data.effectId`, adds that Convenient Effect to `actor` | no |
| `ironmonk108/monks-enhanced-journal` `monks-enhanced-journal.js:4525-4540` | An item dragged from a loot/encounter/quest page is recorded as taken by `actor` (page `itemDropped`) | no |
| `Forien/foundryvtt-forien-quest-log` `src/control/FQLHooks.js:72`, `:100` | Quest reward items dropped on an actor | not checked |
| `tposney/dnd5e-scriptlets` `scripts/containerHelper.js:1-33` | Settings `AutoRemoveItemsFromActor` / `AutoRemoveItems`: **deletes the source item** (directly or through a socketlib GM call) when an item is dropped from another actor or a world container. It runs before the sheet creates anything. | only to find the actor |
| `sweetrpg/lootparcels-foundryvtt` `loot-parcels.js:35-45` | A dropped journal "parcel" is turned into items on a PC | passes it on |
| `geoidesic/foundryvtt-actor-studio` `src/index.js:164-166` | empty listener (logging commented out) | no |
| `p4535992/foundryvtt-inventory-plus` `src/scripts/main.js:149-151` | empty listener (last push 2023) | no |

All of them read `actor` and `data`; none needs the sheet to be a dnd5e sheet. If the window does not fire the hook,
these silently do nothing on a drop into the window: no Convenient Effect from a drop, no loot marked as taken, no
auto-removal of the source. If the window fires it, dnd5e-scriptlets may delete the source even when the window then
refuses or fails to create the item. The same is true on the vanilla sheet.

## 5. Weighty Containers

- WC enforces in `preCreateItem` and `preUpdateItem` (`wc:scripts/foundry/enforcement.js:319-324`). It projects the
  actor with the change applied and checks content rules when `system.container` changes, and capacity
  (`:274-317`). In `block` mode it returns `false`, which drops that document from the batch (section 1.5). It skips
  options carrying `{ "weighty-containers": { bypass: true } }` (`:224-230`).
- Because the check sits on the document hooks, it runs on **every** creation path: vanilla sheet, Tidy, our window,
  a macro. Our window adds a pre-check only to show its own message and shake animation
  (`aim:scripts/ui/drag-drop-controller.js:128-135` → `aim:scripts/integrations/weighty-containers.js:229-275`, which
  calls `api.validateContainerRestrictions(container, itemData)`, documented for item data, `wc:API.md:73`).
- Known gap, written in WC's own comment: each document is projected alone, so a container dropped together with its
  contents is weighed empty and the contents pass unchecked (`wc:scripts/foundry/enforcement.js:281-293`).
- dnd5e's move does not look at the result: `_onDropCreateItems` and `_onDropItemContainer` delete the source on
  `move` whatever `createDocuments` returned (`mjs:57514`, `:57460`). A move that WC blocks therefore deletes the source
  and creates nothing. The same holds for a move whose item went to the AdvancementManager and was then cancelled.
  This is dnd5e's behaviour on the vanilla sheet, from the code; not reproduced live.

## 6. The ways the window could take a drop

### A. Forward the whole event: `actor.sheet._onDrop(event)`

`actor.sheet` is built lazily without rendering (`core:documents/abstract/client-document.mjs:213-229`). It is the
actor's configured sheet: dnd5e's, Tidy's or another.

Works:

- The full chain of section 1 for that sheet, including `dropActorSheetData` (fired with `sheet` = the actor's sheet,
  not our window), folders, active effects and actor drops.

Breaks or differs:

- `_onDrop` computes `_dropBehavior(event)` from the stale static `dropEffect` (section 3). Without our own dragover
  writing the right value first, a sidebar item can be moved (deleted from the sidebar) instead of copied.
- Every DOM read uses `event.target`, which is in **our** markup: the container branch (`.container[data-item-id]`),
  sorting (`[data-item-id]` and its siblings), favourites (`.favorites`), facility occupants, and the spell method
  (`.items-header`, `.item-list`, `[data-level]`). Our 1.9.1 templates use none of these class names; `data-item-id`
  does appear (`aim:templates/parts/*.hbs`). What 2.0 markup will contain is open.
- The scroll rule reads the sheet's `tabGroups.primary`, which is `"details"` on a never-rendered character sheet
  (`mjs:57956-57958`, `core:applications/api/application.mjs:287`) and otherwise whatever tab the user last left that
  sheet on. Our window's own tab does not count.
- Dropping an **actor** on the window would open dnd5e's polymorph dialog (`mjs:57384-57397`) if forwarded unfiltered.
- On Tidy 13.10.5 `_onDrop` takes a different route (sheet pins, journals, activities) and its own DOM selectors
  (`tidy:…QuadroneBase.svelte.ts:1436-1470`).
- On an unknown third-party sheet anything goes; on a non-dnd5e `ActorSheetV2` the core `_onDropItem` only does
  `Item.implementation.create` (`core:…/actor-sheet.mjs:341-351`).

### B. Forward the item only: `actor.sheet._onDropCreateItems(event, [item], behavior)`

The `GroupActorSheet` precedent (`mjs:60148`). The window resolves the item, decides `behavior` itself and passes it
explicitly. Containers would be `actor.sheet._onDropItemContainer(event, item, container)`.

Works:

- All `_onDropCreateItems` and `_onDropSingleItem` rules of section 1.3 for dnd5e sheets, including the
  CharacterActorSheet class/subclass rules and the multi-advancement guard.
- Same signature on Tidy 13.10.5: `_onDropCreateItems(event, items, behavior)` (`tidy:…QuadroneBase.svelte.ts:1708-1757`).

Breaks or differs:

- `dropActorSheetData` is not fired; the window would have to fire it itself (with which `sheet` argument is open).
- `_onDropItemContainer` exists on dnd5e's `BaseActorSheet` only. Tidy 13.10.5's base has no such method (no match in
  the file), so container drops on a Tidy actor would need another route.
- Tidy's `_onDropSingleItem` takes `(itemData, event)`, the reverse of dnd5e's `(event, itemData, options)`
  (`tidy:…QuadroneBase.svelte.ts:1765-1768`), so calling `_onDropSingleItem` directly is not portable. Going through
  `_onDropCreateItems` avoids that.
- Tidy's copy of the rules differs from dnd5e's: no `onDropCreate` (spell method), no `crew.value` reset, the scroll
  rule reads Tidy's own active tab from its DOM and also applies to groups, the AdvancementManager is opened with
  `this._renderChild(manager)` (`:1765-1866`). The two Tidy files read have no class-level merge (no
  `_onDropSingleItem` in the character file).
- Still reads `event.target` for the spell method and the scroll rule reads the sheet's tab (as in A).
- Still dnd5e's move semantics (delete the source after create, whatever the result).

### C. Rebuild the rules with public calls

`Item5e.createWithContents` with our own `transformFirst`, then `Item5e.createDocuments({ parent, keepId: true })`;
`createScrollFromSpell`; `AdvancementManager.forNewItem` / `forLevelChange`; `actor.sourcedItems` for stacking;
`asGear()`; `CONFIG.Item.dataModels[type].onDropCreate(event, actor, itemData)` with an event whose target the window
controls (or a synthetic one).

Works:

- Same result on every sheet the actor uses; no dependency on protected methods, the sheet's tab or its DOM.
- The window decides move/copy itself and can check the result before deleting the source.
- The document-level rules of section 1.5 and Weighty Containers' enforcement still run, since creation goes through
  `createDocuments`.

Breaks or differs:

- About ten sheet-only rules (end of section 1.5) to keep in step with dnd5e by hand, including the
  CharacterActorSheet class/subclass rules. They have moved between versions: the prior note counted about eight.
  The project's "named helper with a 5.3.3 test" rule would apply to each one.
- A third-party sheet's own drop rules (Tidy's or any other) do not apply in the window.
- `dropActorSheetData` again has to be fired by the window if wanted.

### D. Mixed

Examples that combine the above, each built from the facts already listed:

- C for the rules, plus `Hooks.call("dropActorSheetData", actor, <window or actor.sheet>, data)` before creating, to
  keep the module listeners of section 4.
- B on dnd5e's own sheet classes (checked with `instanceof dnd5e.applications.actor.BaseActorSheet`), C otherwise.
- For a drop onto a container in the window: the container's item sheet already handles drops into itself
  (`ContainerSheet._onDropItem`, `mjs:65705-65740`). It fires `dnd5e.dropItemSheetData`, not `dropActorSheetData`
  (`mjs:65655`), turns every spell into a scroll, stacks through `item.actor.sheet._onDropStackConsumables`, and skips
  the actor sheet's reset, advancement and unsupported-type rules (`mjs:65755-65768`).

### How move vs copy and Weighty Containers land on each option

| | A: `_onDrop` | B: `_onDropCreateItems` | C: own rules |
| --- | --- | --- | --- |
| Who picks move/copy | the sheet, from static `dropEffect` (stale on our window unless we set it) | the window, passed as `behavior` | the window |
| Default from another actor | copy; Shift = move, if `dropEffect` was set by us | the window's choice | the window's choice |
| Source deleted when creation fails | yes (dnd5e/Tidy code) | yes | up to us |
| Moving from an actor the player does not own | create runs, `item.delete` is refused by the server and not awaited; the item is copied, not moved (from the code; not run) | same | up to us; the trade invariant routes cross-player transfers through the GM |
| Weighty Containers content and capacity rules | enforced by WC's `preCreateItem` | enforced | enforced |
| WC pre-check message in the window | not shown unless the window checks first | same | the window can call `validateContainerDrop` first, as today |
| Container plus contents in one drop | contents unchecked by WC (WC's documented gap) | same | same |

## 7. The window today

- Raw `dragstart`/`dragover`/`drop` listeners on `[data-drag-item]` and `[data-drop-target]`; no `DragDrop` instance,
  so no `DragDrop5e` payload and no Item Piles callback hooks (`aim:scripts/ui/drag-drop-controller.js:16-35`).
- A drop is acted on only when the item already belongs to this actor; anything from outside is ignored
  (`:103-106`). Inside the actor it equips to a slot, moves into or out of a container (with our cycle check and the
  WC pre-check), or unequips.
- `dragover` always sets `dropEffect = "move"` (`:72`).
- No `dropActorSheetData`, no `Item.create` from a drop. The only item creation in the module is the trade code's
  `createEmbeddedDocuments` (`aim:scripts/trade/transfer.js:37`, `:67`).

## Unknown

- No live check of anything above: the stale `dropEffect` after a sidebar drag, the not-awaited delete on a refused
  move, WC blocking a move, `actor.sheet` used without rendering.
- Whether `AdvancementManager` and `CreateScrollDialog` behave when their caller is a never-rendered sheet; dnd5e's
  base uses `manager.render(true)`, Tidy uses `this._renderChild(manager)`, which was not traced.
- Tidy: only two files of v13.10.5 were read. Whether it handles container drops or the class-level merge elsewhere is
  not known. The Tidy `main` (14.x) line was not compared.
- The `sheet` argument the GitHub listeners expect was read for the ones in the table only; Forien Quest Log's handler
  body was not read.
- Item Piles: only `src/` of 3.3.4 was searched; its `systems/` adapters and any build-time code were not. Whether a
  newer release changes this is not known.
- The GM's full module list is unknown; section 4 is a sample, not a census.
