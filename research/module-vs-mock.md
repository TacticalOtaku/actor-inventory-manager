# Module 1.9.1 vs the character-sheet mock

Research for issue #4 (map #3). Question: what does module 1.9.1 do today, and what of it is missing, narrowed or
changed in the mock at `design/character-sheet/` (`mock.html` + `mock.notes.json`, 89 elements)?

Sources: module code at tag v1.9.1 (`501dd03`); the mock and its notes as they stand untracked in the main checkout.
Mock elements are named as in `mock.notes.json`; `[spec]` / `[assumption]` is the `source` of the cited behaviour.
Each item reads: **current behaviour** → **mock status** → evidence.

Status words: **missing** (the mock has no counterpart and says nothing), **narrowed** (kept, but with less),
**changed** (kept, but it works differently), **conflict** (the mock states something the module or dnd5e
contradicts).

## Top discrepancies

1. **Containers and Weighty Containers are gone.** The mock has no containers at all: no nested trays, no load
   band, no reduction badge, no rules dialog, no drop into a bag.
2. **Equipping and attunement are merged.** In the mock, equipping an item that needs attunement attunes it, and
   the attunement limit refuses the *equip*. In the module the two are separate, as in dnd5e: you can be attuned
   to an unequipped item.
3. **Trading is reshaped.** There is no Save step, items are offered from inventory rows, and the purse has a fixed
   set of four coins. The Item Piles currencies, electrum and the observer view of the trade drawer all disappear.
4. **The window replaces the vanilla sheet for characters only.** The sheet header button, the `I` hotkey,
   vehicles and player-owned NPCs (all supported today) are not addressed.
5. **The inventory is grouped differently.** Category tabs and sorting are replaced by collapsible sections
   grouped by type. The mock's groups (`Рюкзак`, `Снаряжение`) are not dnd5e item types, and dropping a row on
   a section "moves it to that group".
6. **Paperdoll geometry changes.** The mock uses ten slots beside a silhouette and puts the rest in an overflow
   grid, where the module uses three free columns over the actor portrait. The attunement cap goes up to 10
   (the module allows 9). The 2H off-hand lock, the single-armour/shield rules and the enforcement mode are never
   mentioned.
7. **Settings move into the sheet.** Theme loses `auto`, accents go from 10 to 6, and the fonts and portrait
   backdrop settings have no place. Density, motion, rail blocks and tab visibility are new.
8. **The mock adds a whole character sheet** that the module never had: overview, rolls, HP editing, death saves,
   effects, favorites, notes, the inspector and the level orb (see the last section).

## Window, header and layout

- **Open from the sheet.** Current: a shirt button plus a header-menu entry are injected into every dnd5e
  `ActorSheetV2` the user can observe; the client setting `showSheetButton` turns them off.
  → **changed**: `CharacterSheet` "opens instead of the dnd5e sheet for character actors; the dnd5e sheet stays
  reachable from the window menu" `[assumption]`. So the direction flips. The mock has no window menu entry, and
  it does not say what becomes of `showSheetButton`.
  Evidence: `scripts/foundry/sheet-injection.js:72-118`, `:125-126`; `scripts/foundry/settings.js:81-88`.
- **Supported actors.** Current: characters, vehicles and NPCs with a player owner; never groups or GM-only NPCs.
  → **narrowed**: the mock speaks of character actors only (`CharacterSheet`). Vehicles and player-owned NPCs are
  not addressed.
  Evidence: `scripts/core/actor-scope.js:2-4`.
- **Hotkey.** Current: `I` (rebindable) toggles the window for the controlled token's actor, or else the user's
  character. → **missing** (the mock is silent).
  Evidence: `scripts/foundry/settings.js:145-177`.
- **Window header.** Current: a portrait with a level badge, then the name, then `race · alignment · class level`,
  then a read-only tag. A frame button toggles the theme.
  → **changed**: `sheetHeader` shows the level orb, name, class, subclass, species and background `[spec]`. There
  is no alignment. The theme moves into `settingsDrawer`, and `settingsButton` and `collapseButton` sit in the
  header.
  Evidence: `scripts/ui/inventory-app.js:434-476`.
- **Layout.** Current: five fixed column layouts (`open`, `strip`, `drawerStrip`, `drawerOpen`, `drawerCompact`)
  chosen from the *viewport* width. The minimum width is 750–1380 px, and resizing below it is clamped. The
  default size is 1080 × 760.
  → **changed**: `CharacterSheet` picks compact / narrow / standard / wide from *its own* width `[assumption]`,
  with a 300 × 520 minimum `[assumption]`. `collapseButton` shrinks the window to 320 px `[spec]`.
  Evidence: `scripts/ui/window-layout.js:24-27`, `:85-115`; `scripts/ui/inventory-app.js:137-140`, `:557-565`.
- **Drawers vs tabs.** Current: spells and trade are side drawers opened from a rail on the window edge. Opening
  one folds the paperdoll into a strip. The paperdoll fold and the open grimoire are saved per actor in actor
  flags, written only by editors.
  → **changed**: there are five tabs (`sheetTabs`) and the trade panel opens beside the inventory (`tradePanel`).
  `dollToggle` shows or hides the doll. `settingsDrawer` settings are "per user" `[spec]`. Where the per-tab view
  mode and the doll toggle are stored is not stated.
  Evidence: `templates/inventory-app.hbs:1-36`; `scripts/ui/inventory-app.js:202-207`, `:776-793`;
  `scripts/constants.js:15-16`.
- **Read-only mode.** Current: Observer gets the window with every `.aim-edit` control hidden and no drag and
  drop. Owner or GM may change everything. Windows are keyed by actor UUID.
  → **kept**: `CharacterSheet` keeps the same rule `[spec]` and adds a «Только просмотр» badge. The mock is silent
  about keying windows by UUID.
  Evidence: `scripts/core/actor-scope.js:23-39`; `scripts/ui/inventory-app.js:119-122`, `:506-507`.

## Passport and vitals (now `sheetRail` and `sheetHeader`)

- **HP.** Current: a read-only number and band with a temporary-HP ghost; the number counts to its new value.
  → **changed and extended**: `hpBar` and `hpStepper` let the GM edit HP `[spec]`, and there are effects for
  temporary HP and death saves.
  Evidence: `templates/parts/character-vitals.hbs:2-9`.
- **AC, initiative, speed.** Current: read-only, with the full speed modes in a tooltip.
  → **kept**: `vitalStat` adds a proficiency bonus, an initiative roll and an AC breakdown `[assumption]`.
  Evidence: `templates/parts/character-vitals.hbs:11-15`; `scripts/integrations/dnd5e.js:118-124`.
- **Abilities.** Current: score, modifier and save in the passport; read-only.
  → **changed**: `abilityTile` rolls checks and saves `[assumption]`.
  Evidence: `templates/parts/character-vitals.hbs:17-28`.
- **Passives.** Current: Perception, Investigation and Insight.
  → **changed**: `sensesCard` (passives, senses, proficiencies, languages) and `spellcastingStrip` (passive
  Perception).
  Evidence: `templates/parts/character-vitals.hbs:30-37`.
- **Encumbrance.** Current: follows dnd5e's `encumbrance` setting (`variant` / `normal` / `none`) and the
  system's encumbrance block (metric, size, Powerful Build, effects, Weighty Containers' reductions). It shows tier
  stops and ticks.
  → **narrowed**: `encumbranceMeter` is green, amber and red at fixed 5 × and 10 × Strength `[assumption]`. That
  is the variant rule only, with no `normal`/`none` and no system block.
  Evidence: `scripts/core/weight-calculator.js:226-235`, `:262`; `templates/parts/character-vitals.hbs:39-57`;
  `docs/architecture.md` ("Encumbrance").
- **Purse.** Current: `pp gp ep sp cp` plus a total value. With Item Piles active, the total comes from its
  currency API.
  → **narrowed**: `currencyBar` shows each coin type `[assumption]`, but the mock data has four coins
  (`pp gp sp cp`, no electrum) and no total. Editing amounts "comes later".
  Evidence: `templates/parts/character-vitals.hbs:59-67`; `scripts/integrations/item-piles.js:20`;
  `mock.html:1839`.
- **Rests.** Current: short and long rest buttons for editors, calling `actor.shortRest` / `actor.longRest`.
  → **kept**: `restBar` adds labels and hit dice left `[spec]`, and hides itself for observers.
  Evidence: `templates/parts/character-vitals.hbs:69-74`; `scripts/ui/inventory-app.js:867-873`.

## Inventory

- **Categories and sort.** Current: tabs All / Weapons / Armor / Consumables / Containers / Loot with counts, plus a
  sort select (name, weight, value, rarity).
  → **changed**: `equipmentTab` shows collapsible `listSection`s grouped by type (mock groups: Оружие,
  Снаряжение, Расходуемое, Рюкзак) `[assumption]`. There is no sort. `viewModeSwitch` (list / cards / icons) is new
  `[spec]`.
  Evidence: `scripts/ui/inventory-app.js:96-103`; `scripts/ui/inventory-context.js:43-52`;
  `templates/parts/inventory-grid.hbs:1-19`; `mock.html:1458`.
- **Drop on a section.** → **conflict**: `listSection` says dropping a row on a section "moves it to that group"
  `[assumption]`. Groups follow item types, and an item's type cannot be changed by a drop. Today a drop on the list
  only unequips the item or takes it out of its container.
  Evidence: `scripts/ui/drag-drop-controller.js:137-144`.
- **Containers.** Current: nested container trays you can collapse, an item count, a load band and badge, a weight
  reduction badge, the Weighty Containers rules button, dropping into a bag (with a cycle guard and Weighty
  Containers validation), and asking about contents when you delete a bag.
  → **missing** entirely.
  Evidence: `templates/parts/container-view.hbs:1-21`; `scripts/ui/inventory-app.js:394-432`, `:828-850`;
  `scripts/ui/drag-drop-controller.js:119-136`.
- **Row content.** Current: thumbnail with quantity, rarity name, weight, price, property chips, and Attuned /
  Requires-attunement pills.
  → **narrowed**: `itemRow` has weight, tags and quantity. Rarity shows only as tile colour, and there is no price.
  Evidence: `templates/parts/item-row.hbs:2-14`; `mock.html:1626`.
- **Row click.** Current: clicking the thumbnail or name opens the item sheet.
  → **changed**: `itemRow` click selects the row (inspector, or inline `itemDetail`) `[assumption]`. Editing moves
  to `rowMenuButton`.
  Evidence: `templates/parts/item-row.hbs:4-8`; `scripts/ui/inventory-app.js:813-816`.
- **Row controls.** Current: equip, attune/unattune, use (`item.use`) and delete with a confirmation.
  → **changed**: `equipButton`, `favoriteButton` and `rowMenuButton` (edit, duplicate, delete, send to chat).
  **Attune and Use leave the row**: use survives only as the inspector's main action and `favoriteRow`'s quick
  action. Attuning has no control at all (see Attunement).
  Evidence: `templates/parts/item-row.hbs:15-26`.
- **Rows inside containers** cannot be equipped from the tray today. → **missing** (there are no containers).
  Evidence: `templates/parts/item-row.hbs:17`.

## Paperdoll, doll presets and the doll preset editor

- **Geometry.** Current: three free columns (left / center / right) with any number of slots, over the actor
  portrait. The standard presets have 11 slots: two rings, and armour/waist/feet in the center.
  → **changed**: `paperdoll` has ten slots beside a silhouette (head, neck, cloak, armor, main hand left; hands,
  waist, feet, ring, off hand right) `[assumption]`. The rest go to `extraSlots` `[spec]`. The slot config's
  `column` field and the second ring have no clear home.
  Evidence: `scripts/core/paperdoll-templates.js:12-155`; `templates/parts/paperdoll.hbs:7-13`;
  `templates/editor/slot-config-dialog.hbs:36-40`; `mock.html:1426-1436`.
- **Portrait backdrop.** Current: the world setting `showActorPortraitBackdrop`. → **missing** (the figure is a
  silhouette).
  Evidence: `scripts/foundry/settings.js:100-108`; `mock.html:1714`.
- **Two standard presets.** Current: 2024 and 2014. They differ only in slot `accepts` keywords.
  → **narrowed** in the mock data: «Стандарт 2024» and a demo «Расширенный · 19 слотов». The 2014 preset is not
  shown.
  Evidence: `scripts/core/paperdoll-templates.js:12`, `:157`; `mock.html:1433-1436`.
- **Choosing a preset.** Current: GM-only, inside the doll preset editor (select, apply to actor, save as new,
  update, delete, JSON export/import). The window shows the GM a sliders button and shows players no preset name.
  → **changed**: `dollPresetSelect` sits in the doll header for the GM `[spec]`, and players see the preset name
  in `dollHeader`. `dollPresetEdit` "opens the existing preset editor" `[spec]`, so the editor itself stays.
  Evidence: `templates/parts/paperdoll.hbs:2-6`; `scripts/ui/paperdoll-editor.js:66-78`, `:594-599`.
- **Switching presets.** Current: equipped items whose slot is gone are re-slotted by `autoReconcileSlots`, or else
  stay equipped without a slot. Over-cap attunements are shown as over the limit and nothing is unattuned.
  → **conflict**: `dollPresetSelect` "drops equipment from slots the new preset lacks" `[assumption]`. The mock
  code also unattunes past the new cap.
  Evidence: `scripts/core/equipment-rules.js:114-134`; `templates/parts/paperdoll.hbs:19`; `mock.html:2219-2221`.
- **Attunement cap.** Current: 0–9, clamped in the editor and in template normalisation. The editor writes the
  stored (`_source`) cap only when it changed.
  → **conflict**: `attunementTrack` says the limit can go "up to 10" `[spec]`.
  Evidence: `scripts/core/paperdoll-templates.js:551`; `templates/editor/paperdoll-editor.hbs:27`.
- **Slot interaction.** Current: dropping on a slot equips the item (or swaps it, by the rules). The ✕ button
  unequips; clicking the image opens the item sheet. Tooltips are Foundry text.
  → **changed**: on a filled `dollSlot`, a click unequips; an empty slot equips the first fitting item. While you
  drag, the slots that fit glow. Hover cards appear after 320 ms (`CharacterSheet`) `[assumption]`.
  Evidence: `templates/parts/slot.hbs:7-12`; `scripts/ui/drag-drop-controller.js:110-115`.
- **Two-handed lock.** Current: off-hand slots show a lock while a two-handed weapon is held.
  → **missing** (the mock never mentions it).
  Evidence: `templates/parts/slot.hbs:4-5`; `scripts/core/equipment-rules.js:205-233`.

## Attunement

- Current: attunement is its own toggle on the row and on the socket, independent of equipping (as in dnd5e). The
  limit refuses the *attune*. Sockets show attuned items, which do not need to be worn.
  → **conflict**: `attunementTrack` says "equipping past the limit is refused with a shake" `[assumption]`. In the
  mock code, equip attunes and unequip unattunes. No element attunes or unattunes on its own.
  Evidence: `scripts/ui/item-actions.js:164-195`; `templates/parts/item-row.hbs:20-22`;
  `templates/parts/paperdoll.hbs:14-28`; `mock.html:1985-2002`.
- **Socket layout.** → **kept**: three sockets under the figure, and a full-width strip with more than three
  (`attunementTrack` `[spec]`, which matches the 1.9.0 fix).

## Equipment rules and enforcement

- **Rule engine.** Current: slot compatibility, a single body armour, the 2H off-hand lock, a single shield,
  single-per-actor slots and third-party rules (`registerRule`). An occupied target slot is swapped out.
  → **missing**: the mock mentions only "fits / does not fit" (`dollSlot`).
  Evidence: `scripts/core/equipment-rules.js:158-325`.
- **Sheet enforcement.** Current: `preUpdateItem` applies the same rules to equips from the vanilla sheet, with
  the world setting `enforcementMode` = block / auto_swap / warn.
  → **missing**. It still matters, because the mock keeps the vanilla sheet reachable.
  Evidence: `scripts/foundry/enforcement-hooks.js:23-152`; `scripts/foundry/settings.js:30-43`.
- **Slotless equips.** Current: items with no paperdoll slot (Ioun stones, trinkets) can still be equipped.
  → **missing**: `equipButton` is shown only when a slot fits (`mock.html:1628`).
  Evidence: `scripts/ui/item-actions.js:120-132`.

## Spells and features (grimoire drawer → `spellsTab` and `featuresTab`)

- **Grimoire.** Current: one drawer with sub-tabs All / Spells / Actions / Passives and its own search.
  → **changed**: separate `spellsTab` and `featuresTab`, sharing the tab `searchField`.
  Evidence: `scripts/ui/inventory-app.js:106-111`; `templates/parts/spells-actions.hbs:34-46`.
- **Grouping of features.** Current: features are grouped by activation (action, bonus, reaction, passive).
  → **changed**: `featuresTab` groups by source (class, species, background) `[assumption]`. Grouping by action
  cost moves to `favoritesList`.
  Evidence: `scripts/integrations/dnd5e.js:536-597`.
- **Feature use.** Current: a Use button on every feature row.
  → **narrowed**: `featureRow` has only `usesTrack`, and use goes through the inspector or favorites.
  Evidence: `templates/parts/spells-actions.hbs:14`.
- **Prepared spells.** Current: prepared spells (always-prepared included) leave their level group for a Prepared
  segment.
  → **changed**: `spellsTab` lists them under Подготовленные *and* keeps them in the spellbook, with unprepared
  spells dimmed `[spec]`/`[assumption]`.
  Evidence: `scripts/integrations/dnd5e.js:466-470`; `mock.html:1724-1731`.
- **Cast.** Current: a Cast button (`item.use`) on every spell for editors.
  → **narrowed**: `castButton` appears only for cantrips, prepared spells and rituals. It auto-spends the lowest
  free slot and refuses with no slot `[assumption]`.
  Evidence: `templates/parts/spells-actions.hbs:108`.
- **Slot pips.** Current: each pip is ±1, and Pact Magic slots get their own row.
  → **changed**: `slotPip` spends "down to it" `[assumption]`. Pact slots are not shown.
  Evidence: `templates/parts/spells-actions.hbs:50-71`; `scripts/integrations/dnd5e.js:278-285`.
- **Components.** Current: V / S / M / concentration / ritual chips.
  → **narrowed**: `spellRow` has school, casting time, range, К and Р. There is no V/S/M.
  Evidence: `templates/parts/spells-actions.hbs:98-105`.
- **Preparation limit.** Current: none. → **new** in `preparedCounter` / `prepareButton`.
- **Spell-school colour.** Current: exposed as `--spell-school-color` (with SC Rarity Colors' value when active).
  → **kept** as a tile tone. The mock never mentions SC Rarity Colors.
  Evidence: `templates/parts/spells-actions.hbs:77`; `scripts/integrations/sc-rarity-colors.js:232-272`.

## Trading

- **Rules and coordination.** Current: requests are user flags, one active GM coordinates, rechecks ownership and
  confirmations, snapshots go to a private JournalEntry, there is GM recovery, both sides confirm (gifts included),
  and received items arrive unequipped, unattuned and outside containers.
  → **kept** (`tradePanel`, `tradeConfirmButton` `[spec]`).
  Evidence: `scripts/trade/service.js`; `docs/architecture.md` ("Player trading").
- **Who sees the button.** Current: anyone who can view a trade actor gets the rail button and the drawer (read-only
  for non-participants). The GM always sees it, with Restore while a trade is executing or in recovery.
  → **narrowed**: `tradeButton` is for owners only. The GM sees it only while a trade waits for GM recovery
  `[assumption]`, and no recovery control is drawn.
  Evidence: `templates/inventory-app.hbs:28-34`; `scripts/ui/trade-panel.js:8-19`;
  `templates/parts/trade.hbs:58`.
- **Saving an offer.** Current: edits are a local draft with an "unsaved" warning. **Save** sends the offer, and
  Confirm is disabled while the draft is dirty.
  → **changed**: there is no Save. `myOffer` changes apply live, and either change clears both confirmations
  `[spec]`.
  Evidence: `scripts/ui/trade-panel.js:45-57`, `:68-84`; `templates/parts/trade.hbs:56`, `:79`.
- **Picking items.** Current: a list of every transferable item with a number input. Non-empty containers and Item
  Piles currency items are excluded.
  → **changed**: `offerButton` on inventory rows adds one at a time, and `offerItem` has − / + steppers.
  Evidence: `templates/parts/trade.hbs:46-54`; `scripts/trade/offers.js:7-11`.
- **Currencies.** Current: Item Piles currencies (custom, with exchange and change) when it is active, else the
  five dnd5e coins. A mismatch stops the trade.
  → **narrowed**: `myOffer` has "four coin fields capped by the purse" `[assumption]`. Item Piles is not mentioned.
  Evidence: `scripts/trade/currencies.js:3-32`; `mock.html:986`, `:1866-1867`.
- **Status and errors.** Current: provider label, status, a "no active GM" warning and the last trade's error.
  → **narrowed**: `tradeStatus` says what the trade waits for, with no GM-absent or error state described.
  Evidence: `templates/parts/trade.hbs:9-11`.

## Integrations

- **Weighty Containers.** → **missing** (see Containers). Today it supplies load, reduction, the rules dialog, drop
  validation and the actor total without a system block.
  Evidence: `scripts/integrations/weighty-containers.js:14-312`.
- **Item Piles.** → **missing** (see Purse and Currencies).
  Evidence: `scripts/integrations/item-piles.js`; `scripts/trade/currencies.js:5-32`.
- **SC Rarity Colors.** Current: rarity and school colours from its settings, refreshed when they change.
  → **silent**: the mock uses its own rarity tones.
  Evidence: `scripts/main.js:52-61`; `scripts/integrations/sc-rarity-colors.js`.

## Settings

| Setting (scope) | Today | Mock |
| --- | --- | --- |
| `theme` (client) | dark / light / auto | **narrowed**: `themeSwitch` Ночь / Пергамент, no auto |
| `accent` (client) | 10 OKLCH hues, default peach | **changed**: `accentSwatch`, 6 named accents |
| `useWebFonts` (client, reload) | bundled fonts on/off | **missing** |
| `showSheetButton` (client) | sheet button + menu entry | **changed** meaning (window replaces sheet) |
| `enforcementMode` (world, GM) | block / auto_swap / warn | **missing** |
| `autoReconcileSlots` (world, GM) | re-slot equipped items | **missing** (and contradicted by `dollPresetSelect`) |
| `showActorPortraitBackdrop` (world) | portrait behind doll | **missing** |
| `customTemplates` (world, hidden) | doll presets | **kept** |
| `logLevel` (client) | logging | **missing** (not UI) |
| — | — | **new**: `densitySwitch`, `motionSwitch`, `railWidgetToggle`, `tabVisibilityToggle` |

Evidence: `scripts/foundry/settings.js:30-130`; `scripts/tactile/palette.js:2-13`. The mock edits settings in
`settingsDrawer` inside the sheet `[spec]`, not in Foundry's settings window.

## Motion and theme

- **Reduced motion.** Current: driven by the OS preference or Foundry's `performance-low`, and leaves a 150 ms fade.
  → **changed**: `motionSwitch` adds a user setting, and reduced means "instant" `[assumption]`.
  Evidence: `scripts/ui/meter-motion.js:32-35`; `docs/architecture.md` ("Motion").
- **Animation scope.** Current: window entrance, counting HP/AC, slot pop, refusal shake, drawer slide, FLIP rows
  after tab/search/sort, press feedback.
  → **kept and much extended**: layout FLIP, sparks, the HP heartbeat, fly-to-slot and so on.
  Evidence: `scripts/tactile/motion.js:22-112`.
- **Theme tokens on the root.** → **kept** (`CharacterSheet` `[spec]`, matching `.tc-root`).

## Public API and hooks

- Current: `api.*` (open/toggle, doll preset CRUD, equip/attune actions, the rule engine, the slot registry) and
  the hooks `ready`, `prepareContext`, `renderInventory`, `refresh`. `prepareContext` and `renderInventory` expose
  today's context and DOM.
  → **silent**. A new sheet changes both shapes.
  Evidence: `scripts/main.js:81-140`; `docs/architecture.md` ("Extension points").

## What the mock adds that the module lacks

- **Rail.** `sheetRail` and its compact/narrow forms, `hitDiceTrack`, `slotRunes`, `deathSaves`,
  `inspirationToggle`, `exhaustionTrack`, `concentrationBadge`, `effectsList` / `effectRow` / `addEffectButton`,
  `spellcastingStrip`, `favoritesList` / `favoriteRow` / `favoriteCastButton`.
- **HP.** HP edits by the GM (`hpBar`, `hpStepper`), temporary HP as a shield, and floating numbers.
- **Header.** `levelOrb` (XP progress from the dnd5e XP table; level only under milestone), `abilityTile` rolls,
  `settingsButton`, `collapseButton`.
- **Overview.** `overviewTab` with `skillsCard` / `skillRow`, `savesCard` / `saveRow` and `sensesCard`.
- **Equipment.** `inventoryToolbar` with `viewModeSwitch` and `dollToggle`; `addItemButton`; the
  `rowMenuButton` actions duplicate and send to chat; inline `itemDetail`; `extraSlots`; `dollPresetSelect` in the
  window.
- **Spells and features.** `preparedCounter` with a limit, auto-spending `castButton`, `featuresTab` by source,
  `usesTrack`.
- **Notes.** `notesTab` / `notesField`.
- **Wide layout.** `inspectorPanel`, plus hover cards.
- **Settings.** `settingsDrawer` with density, motion, rail blocks and tab visibility.

Under ADR 0001, every roll and resource change has to go through dnd5e (`actor.rollSkill`, `item.use`,
`actor.applyDamage`, `actor.rollHitDie`, `actor.rollDeathSave`, rests). Some mock assumptions read as direct
writes and need checking against that rule before they become spec:

- `hitDiceTrack`: click spends a die.
- `deathSaves`: click sets the count.
- `castButton`: picks the lowest slot, which normally comes from dnd5e's usage dialog.
- `restButton`: long rest returns half the hit dice, a rule that dnd5e already applies.

## Not verified

- No live Foundry check. Everything above comes from reading code, templates and the mock.
- Whether the "window menu" in `CharacterSheet` refers to the Foundry frame's header controls is not stated in the
  mock.
- The mock's coin list (no electrum) and its preset data are demo data. They may be illustrative rather than
  intended scope; the notes say "each coin type".
