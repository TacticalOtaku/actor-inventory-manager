# Research: vanilla sheet (dnd5e 5.3.3) vs the character-sheet mock

Ticket: #5 (map #3). Question: which everyday player tasks does the **vanilla sheet** handle, which of them the
**mock** (`design/character-sheet/mock.html` + `mock.notes.json`, 89 elements) does not cover, and for each gap —
everyday (lives in our sheet) or rare (opens dnd5e's own dialog, ADR 0001).

## Sources

All read locally, read-only.

- dnd5e 5.3.3 (`system.json` → `"version": "5.3.3"`), compiled bundle
  `Data/systems/dnd5e/dnd5e.mjs` (cited as `mjs:LINE`) and templates `Data/systems/dnd5e/templates/` (cited as
  `tpl/PATH:LINE`). Key classes: `BaseActorSheet` mjs:55714, `CharacterActorSheet` mjs:57813,
  `PrimarySheetMixin` mjs:53127, `InventoryElement` mjs:64123, `EffectsElement` mjs:51026, `Actor5e` mjs:36026,
  `Item5e` mjs:22910.
- Foundry core 14.367.0 (`app/package.json`), only for the version check.
- The mock's notes (`behaviour` entries per element) and HTML; element names below are the mock's `data-ui` names.

## How the vanilla sheet is built (what the table refers to)

- Tabs (`CharacterActorSheet.TABS`, mjs:57921): Details, Inventory, Features, Spells, Effects, Biography,
  Bastion (only if the actor has one), Special Traits. Plus a header (tpl/actors/character-header.hbs) and a sidebar
  (tpl/actors/character-sidebar.hbs) with AC, initiative, speed, proficiency, HP, hit dice, death saves, favorites.
- Two modes, Play and Edit (`PrimarySheetMixin.MODES`, mjs:53154). In templates `editable` means *Edit mode*
  (mjs:53279); most config cogs (`showConfiguration`) appear only in Edit mode, most rolls only in Play mode.
- Sheet-level click actions: `BaseActorSheet.DEFAULT_OPTIONS.actions` (mjs:55732: `rest`, `roll`, `togglePip`,
  `showConfiguration`, `restoreTransformation`, `showArtwork`, warnings, sidebar) and
  `CharacterActorSheet.DEFAULT_OPTIONS.actions` (mjs:57816: favorites, `findItem`, `setSpellcastingAbility`,
  `toggleDeathTray`, `toggleInspiration`, bastion). Item rows are handled by the `<dnd5e-inventory>` element
  (`_onAction` switch mjs:64582-64596), its context menu by `_getContextOptions` mjs:64431; effects by
  `<dnd5e-effects>` (context menu mjs:51181, `toggleCondition` mjs:51251/51286).
- Any vanilla tab can be opened directly: `_configureRenderOptions` honours `options.tab` on first render
  (mjs:55837-55840), so `actor.sheet.render({ force: true, tab: "specialTraits" })` is a clean hand-off for tasks that have
  no standalone dnd5e dialog.

## Gap table

Legend — Covered: **yes** / **partial** / **no** (mock element in backticks). Class: **everyday** = must live in our
sheet; **rare** = open dnd5e's own dialog/sheet (ADR 0001). API = what our sheet calls.

### Vitals (sidebar + header)

| Task | Vanilla sheet | Covered by mock? | Class | dnd5e API |
|---|---|---|---|---|
| Player changes own HP (damage/heal, `-7`/`+5` deltas) | HP meter click → hidden input `system.attributes.hp.value`, delta parsing; owner in Play mode — tpl/actors/character-sidebar.hbs:140-157, listeners mjs:56815-56825, `_onChangeInputDelta` mjs:56967 | **no** — `hpBar`/`hpStepper` give HP changes to the GM only; players "the bar does nothing" | **everyday** (biggest gap) | `actor.applyDamage(amount)` / `applyDamage(-amount)` for heal (mjs:36705), or `actor.update` with the parsed delta as vanilla does |
| Set temporary HP | `system.attributes.hp.temp` input, tpl/actors/character-sidebar.hbs:158-161 | **partial** — shown; only GM shield button sets it | **everyday** | `actor.applyTempHP(n)` (mjs:36981; keeps the higher value) |
| HP max override / bonuses | cog `data-config="hitPoints"` (Edit mode), tpl/actors/character-sidebar.hbs:132 → `HitPointsConfig` mjs:54329 | no | rare | `new dnd5e.applications.actor.HitPointsConfig({ document: actor }).render(true)` |
| Hit dice display | meter, tpl/actors/character-sidebar.hbs:168-190 | yes `hitDiceTrack` | everyday | read `system.attributes.hd` |
| Spend a hit die | **not on the sheet** — only inside the short rest dialog | **partial** — `hitDiceTrack` click "spends" a die with no roll, right click gives one back | everyday, but must roll | `actor.rollHitDie({ denomination })` (mjs:37916); "give back" has no API → drop it or make it GM-only edit via `HitDiceConfig` (mjs:54231) |
| Hit dice config | cog `data-config="hitDice"`, tpl/actors/character-sidebar.hbs:173 | no | rare | `HitDiceConfig` mjs:54231 |
| AC with breakdown | badge + `data-attribution` tooltip, tpl/actors/character-sidebar.hbs:57-69 | yes `vitalStat` hover | everyday | `system.attributes.ac` |
| AC formula/config | cog `armorClass` → `ArmorClassConfig` mjs:53798 | no | rare | `ArmorClassConfig` |
| Roll initiative | lozenge `data-action="roll" data-type="initiative"`, tpl/actors/character-sidebar.hbs:85; mjs:57067 | yes `vitalStat` | everyday | `actor.rollInitiativeDialog({ event })` (mjs:37842) |
| Initiative / movement / senses config | cogs, tpl/actors/character-sidebar.hbs:89,107; `InitiativeConfig` mjs:54451, `MovementSensesConfig` mjs:51451 | no | rare | those classes |
| Speed, proficiency display | tpl/actors/character-sidebar.hbs:104-124 | yes `vitalStat` | everyday | — |
| Death saves: **roll** | button `data-type="deathSave"` (Play mode), tpl/actors/character-sidebar.hbs:212; mjs:57065 | **no** — `deathSaves` only lets you click marks | **everyday** | `actor.rollDeathSave({ event, legacy: false })` (mjs:37548) |
| Death saves: set marks by hand | pips `togglePip` on `system.attributes.death.success/failure`, tpl/actors/character-sidebar.hbs:198-224; mjs:57219 | yes `deathSaves` | everyday | `actor.update` (as vanilla `togglePip`) |
| Death tray auto-opens at 0 HP, manual open | mjs:58716-58720, `toggleDeathTray` mjs:58836 | yes (shown at 0 HP); no manual open above 0 | everyday | — |
| Death save config (bonus, DC) | cog `death` (Edit mode) → `DeathConfig` mjs:54180 | no | rare | `DeathConfig` |
| Inspiration toggle | `toggleInspiration`, tpl/actors/character-header.hbs:26; mjs:58864 | yes `inspirationToggle` | everyday | `actor.update({"system.attributes.inspiration": !v})` |
| Exhaustion level | pips on `system.attributes.exhaustion`, tpl/actors/character-sidebar.hbs:48-78; levels from `CONFIG.DND5E.conditionTypes.exhaustion.levels` (mjs:58347) | yes `exhaustionTrack` — but hard-codes six pips | everyday | `actor.update`; read the level count from `CONFIG` (fewer/more under house rules) |
| Short / long rest | header buttons `data-action="rest"`, tpl/actors/character-header.hbs:39-48 → `actor.initiateRest({ type })` mjs:57029, 38140 | yes `restBar` | everyday | `actor.initiateRest({ type: "short" \| "long" })`. Vanilla hides the buttons unless GM or `allowRests` setting (mjs:58291) — mock hides them only for observers |
| XP value edit | header input `system.details.xp.value`, tpl/actors/character-header.hbs:51-69; hidden when `levelingMode === "noxp"` (mjs:58290) | **no** — `levelOrb` is read-only | **everyday** (players write XP after a session) | `actor.update({"system.details.xp.value"})`; respect `levelingMode` |
| Level up / level down | class pill `<select class="level-selector">`, tpl/actors/parts/actor-classes.hbs:44 → `#changeLevel` mjs:56887 | **no** — no entry point at all | rare (dnd5e dialog), but **needs an entry point** in our sheet | `dnd5e.applications.advancement.AdvancementManager.forLevelChange(actor, classId, +1)` (mjs:7301), `AdvancementConfirmationDialog.forLevelDown`; fallback `classItem.update({"system.levels"})` when `disableAdvancements` |
| Epic boons badge | tpl/actors/character-header.hbs:31-35 | no | rare (level 20+) | `system.details.xp.boonsEarned` |
| Name, portrait edit, show artwork | tpl/actors/character-header.hbs:8, character-sidebar.hbs:18-37; `editImage`, `showArtwork` mjs:57111 | no (portrait shown only in compact) | rare | Foundry `FilePicker`, `ImagePopout` |
| Token portrait toggle | `flags.dnd5e.showTokenPortrait`, tpl/actors/character-sidebar.hbs:18 | no | rare | `actor.update` |
| Preparation warnings (e.g. too many attuned) | header warnings, `openWarnings` mjs:57011 | no | everyday display (small) | `actor._preparationWarnings` (private field — check stability) |
| Revert transformation | window control `restoreTransformation` mjs:55754 → `actor.revertOriginalForm()` mjs:39123 | no | rare | same |

### Abilities, skills, tools, traits (Details tab)

| Task | Vanilla sheet | Covered by mock? | Class | dnd5e API |
|---|---|---|---|---|
| Ability check / saving throw | tpl/actors/character-ability-scores.hbs:18, tpl/actors/tabs/character-details.hbs:219-220; mjs:57058-57064 | yes `abilityTile`, `saveRow` | everyday | `actor.rollAbilityCheck({ ability, event })` mjs:37418, `actor.rollSavingThrow` mjs:37440 |
| Skill check | tpl/actors/tabs/character-details.hbs:195; mjs:57069 | yes `skillRow` | everyday | `actor.rollSkill({ skill, event })` mjs:37194 |
| **Tool check** | Tools box, tpl/actors/tabs/character-details.hbs:20-40; roll mjs:57071 | **no** — no tools anywhere in the mock | **everyday** | `actor.rollToolCheck({ tool, event })` mjs:37221 |
| Proficiency / ability override per skill or tool | `<proficiency-cycle>`, ability `<select>`, cog (Edit mode), tpl/actors/tabs/character-details.hbs:185-200 | no | rare | `SkillsConfig` mjs:54619, `ToolsConfig` mjs:54765, `AbilityConfig` mjs:53754 |
| Ability score edit | input `system.abilities.X.value` (Edit mode), tpl/actors/character-ability-scores.hbs:32 | no | rare (creation/ASI through advancement) | `AbilityConfig` or advancement |
| Senses, languages, weapon/armor proficiencies (display) | trait pills, tpl/actors/tabs/character-details.hbs:143-177 | partial `sensesCard` (passives, darkvision, weapons, languages; no armor/tools) | everyday display | `system.attributes.senses`, `system.traits.*` |
| **Resistances, immunities, vulnerabilities, condition immunities, damage modification** (display) | pills, tpl/actors/tabs/character-details.hbs:148-166 | **no** | **everyday display** (matters every time damage is taken) | `system.traits.dr/di/dv/ci/dm` |
| Edit any trait | pill → `showConfiguration` `data-trait` (mjs:57136-57142): `DamagesConfig` mjs:54093, `LanguagesConfig` mjs:54527, `ToolsConfig`, `WeaponsConfig`; `TraitsConfig` mjs:53945 | no | rare | those classes |
| Species, background, size, creature type | pills + `findItem`/`deleteDocument`, tpl/actors/tabs/character-details.hbs:76-133 | partial — names in `sheetHeader`, no open/replace | rare (open item sheet on click is cheap) | `item.sheet.render(true)`; `findItem` → `CompendiumBrowser.selectOne` mjs:58792 |
| Add class / subclass | `findItem` empty pill, tpl/actors/parts/actor-classes.hbs:13,56 | no | rare | `dnd5e.applications.CompendiumBrowser.selectOne(...)` mjs:32520, then drop through advancement |

### Inventory tab

| Task | Vanilla sheet | Covered by mock? | Class | dnd5e API |
|---|---|---|---|---|
| Use an item / attack with a weapon | row click `ctx.clickAction` (`use`), tpl/inventory/inventory.hbs:94 → `_onUseItem` mjs:64960 | **partial** — row click *selects*; "use" only via favorites (`favoriteCastButton`) or the inspector's "main action" (wide layout only); `itemDetail` has no action | **everyday** | `item.use({ event })` (Item5e mjs:23586) — lets dnd5e pick the activity, consume ammo, roll |
| Use a specific activity | activity sub-rows, tpl/inventory/activity.hbs:5 (`activity-use`, mjs:64582) | no | everyday (covered if `item.use` opens dnd5e's activity chooser) | `activity.use({ event })` |
| **Change quantity** (±1) | `increase`/`decrease`, tpl/inventory/columns/quantity.hbs:6,12 | **no** | **everyday** (rations, arrows, potions) | `item.update({"system.quantity"})` |
| **Spend/restore item charges** (wand, potion uses) | uses column, delta input `system.uses.value` → `uses.spent` (mjs:56975-56981) | **no** for items (`usesTrack` exists only on `featureRow`) | **everyday** | `item.update({"system.uses.spent"})` |
| Recharge roll | `recharge`, tpl/inventory/columns/uses.hbs:4 → `_onRollRecharge` mjs:64767 | no | rare for characters | `item.system.uses.rollRecharge()` (verify name) |
| Equip / unequip | control `equip`, tpl/inventory/columns/controls.hbs:32 → `item.update({"system.equipped"})` mjs:64823 | yes `equipButton`, `dollSlot` | everyday | as vanilla; doll slot is our own flag on top |
| **Attune / unattune** | control `attune`, tpl/inventory/columns/controls.hbs:22; mjs:64799 | **partial** — `attunementTrack` shows sockets, but the notes tie the limit to *equipping* ("equipping past the limit is refused"); no attune control | **everyday** | `item.update({"system.attuned"})`; limit `system.attributes.attunement.max` |
| Identify | context menu `identify`, mjs:64516-64525 | no | rare | `item.update({"system.identified": true})` |
| View / edit / duplicate / delete / send to chat | context menu, mjs:64435-64460 | yes `rowMenuButton` (no "view" read-only entry) | everyday | `item.sheet`, `item.clone`/`duplicate`, `item.deleteDialog()`, `item.displayCard()` mjs:23613 |
| Create item | `addDocument`/`create`, mjs:56844-56880 | yes `addItemButton` | everyday | `Item.implementation.createDialog` or `create` |
| **Currency edit** (inline, deltas) | inputs `system.currency.X`, tpl/inventory/inventory.hbs:12-21 | **no** — `currencyBar`: "editing amounts comes later" | **everyday** | `actor.update({"system.currency.gp"})` with delta parsing |
| Currency manager (convert, transfer to another actor/container) | coin button `currency`, tpl/inventory/inventory.hbs:7 → `CurrencyManager` mjs:30532 | no | rare (dnd5e dialog) | `new dnd5e.applications.CurrencyManager({ document: actor }).render({ force: true })` |
| Encumbrance | tpl/actors/tabs/character-inventory.hbs:7-27 (`hasBreakpoints`) | yes `encumbranceMeter` — but hard-codes 5×/10× Str | everyday | read `system.attributes.encumbrance` (`value`, `max`, `thresholds`) — respects the encumbrance setting and size; go through Weighty Containers integration where it applies |
| **Containers** (see, open, drop into, move out) | container strip, tpl/inventory/containers.hbs:1-16; drop into `_onDropItemContainer` mjs:57431; move out mjs:57414 | **no** — no containers at all (the "Рюкзак" group is an item-type group) | **everyday** | open `container.sheet` (`ContainerSheet` mjs:65485); `item.update({"system.container": id})`; capacity via the Weighty Containers port |
| Search | `<item-list-controls>`, tpl/inventory/inventory.hbs:29 | yes `searchField` | everyday | — |
| Filters (action, bonus action, equipped, attuned…), sort (alpha/manual/priority), grouping | same element; `SORT_MODES` mjs:53165 | no | everyday-light | our own filter on item data |
| Manual sort by drag | `_onSortItem` mjs:57623 | no (drag only to sections/doll) | everyday-light | `item.sortRelative` / batch `update` of `sort` |
| Drop item from compendium / sidebar / chat onto the sheet | `_onDropItem` mjs:57402, stacking `_onDropStackConsumables` mjs:57609, create `_onDropCreateItems` mjs:57488 | **no** — only drags inside the sheet | **everyday** (loot) | reuse dnd5e: `actor.sheet._onDropCreateItems` is protected — prefer `Item.implementation.create(data, { parent })` + let dnd5e advancement hooks run; verify stacking path |
| Drag item out (to hotbar, other sheet) | `_onDragItem` mjs:57349 | no | everyday (hotbar macros) | standard `Item` drag data `item.toDragData()` |
| Create spell scroll | context menu, mjs:64469-64479 | no | rare | `Item5e.createScrollFromSpell` mjs:24196 |

### Features tab

| Task | Vanilla sheet | Covered by mock? | Class | dnd5e API |
|---|---|---|---|---|
| Classes with levels, subclass | tpl/actors/parts/actor-classes.hbs | partial — `sheetHeader` names only | everyday display; changes rare | see Level up |
| Use a feature (Second Wind, Action Surge…) | row click → `item.use` | **partial** — `featureRow` has no use control; only via favorites/inspector | **everyday** | `item.use({ event })` |
| Spend/restore feature uses | uses column | yes `usesTrack` | everyday | `item.update({"system.uses.spent"})` |
| Group by origin (class/species/background) | `_prepareItemFeature` mjs:58641 | yes `featuresTab` | everyday | `item.system.type`, advancement origin |

### Spells tab

| Task | Vanilla sheet | Covered by mock? | Class | dnd5e API |
|---|---|---|---|---|
| Cast a spell | row → `item.use` / activity | yes `castButton`, but notes say "spends the lowest free slot" | everyday | `item.use({ event })` — dnd5e's usage dialog picks the slot and **upcasting**; the mock must not choose the slot itself |
| Slot pips spend/restore | `togglePip` on `system.spells.spellN.value` (mjs:57219) | yes `slotPip` | everyday | `actor.update` |
| **Pact magic slots** | spellbook section per method (`_prepareSpellbook` mjs:56212) | **no** — only "per circle" | **everyday** for warlocks | `system.spells.pact` (`value`, `max`, `level`) |
| Other methods (innate, at-will, always-prepared) | same | no | everyday display | `item.system.method`, `CONFIG.DND5E.spellcasting` |
| Prepare / unprepare | control `prepare` mjs:64932, context menu mjs:64506 | yes `prepareButton`, `preparedCounter` | everyday | `item.update({"system.prepared"})`; limit from class `spellcasting.preparation.max` (verify path) |
| **Concentration saving throw** | "Concentration" roll on the spells tab, tpl/actors/tabs/creature-spells.hbs:58 → `rollConcentration` mjs:57060 | **no** — badge only ends it | **everyday** | `actor.rollConcentration({ event, legacy: false })` mjs:37694 |
| End concentration | context menu `ConcentrationBreak` (items mjs:64482, effects) | yes `concentrationBadge` | everyday | `actor.endConcentration(item)` mjs:37050 |
| Concentration config | cog → `ConcentrationConfig` mjs:53888 | no | rare | same |
| Spellcasting ability, slot overrides | `setSpellcastingAbility` mjs:58823; `spellSlots` cog → `SpellSlotsConfig` mjs:54694 | no (strip is read-only) | rare | those |
| Spell DC / attack display | tpl/actors/tabs/creature-spells.hbs | yes `spellcastingStrip` | everyday | `system.attributes.spell.dc`, `.attack` |
| Spell filters (action, ritual, concentration, prepared) | `<item-list-controls>` | no (search only) | everyday-light | own filter |

### Effects tab

| Task | Vanilla sheet | Covered by mock? | Class | dnd5e API |
|---|---|---|---|---|
| See active / passive / inactive effects | tpl/shared/active-effects.hbs:8-60 | partial `effectsList` (active only) | everyday | `actor.allApplicableEffects()` |
| **Enable / disable an effect** (Rage, item toggles) | context menu `toggle` mjs:51203-51207, toggle control tpl/shared/active-effects.hbs:147 | **no** — right click *ends/removes* | **everyday** | `effect.update({ disabled: !effect.disabled })` |
| Toggle a condition (Prone, Poisoned…) | conditions list in the tab, tpl/shared/active-effects.hbs:68-90 → `_onToggleCondition` mjs:51286 | partial `addEffectButton` "opens the dnd5e conditions list" — **dnd5e has no standalone conditions dialog**; the list is inline in the vanilla Effects tab | **everyday** | `actor.toggleStatusEffect(id)` (mjs:39476) — build the list ourselves from `CONFIG.statusEffects` / `CONFIG.DND5E.conditionTypes` |
| Create / edit / duplicate / delete effect | context menu mjs:51181-51200, `_addDocument` mjs:56846 | partial — click opens the effect | rare | `ActiveEffect.implementation.create`, `effect.sheet` |

### Biography, Bastion, Special Traits

| Task | Vanilla sheet | Covered by mock? | Class | dnd5e API |
|---|---|---|---|---|
| Characteristics (alignment, gender, eyes, height, faith…) | tpl/actors/tabs/character-biography.hbs:4-18 | **no** | everyday display, rare edit | `system.details.*` |
| Ideals, bonds, flaws, traits, appearance | tpl/actors/tabs/character-biography.hbs:24-34 | **no** | everyday display (roleplay reference) | `system.details.ideal/bond/flaw/trait/appearance` |
| Biography (rich text) | `<prose-mirror name="system.details.biography.value">`, tpl/actors/tabs/character-biography.hbs:47 | partial — `notesTab` is one plain text field "saves on blur"; target field not specified | everyday | decide: `system.details.biography.value` (shared with vanilla) vs a module flag; rich text needs Foundry `ProseMirror` editor |
| Bastion | Bastion tab (`hasBastion`), tpl/actors/tabs/character-bastion.hbs; `useFacility` mjs:58876 | no | rare | hand off: `actor.sheet.render({ force: true, tab: "bastion" })` |
| Special traits (flags: Jack of All Trades, Elven Accuracy…) | Special Traits tab, tpl/actors/tabs/creature-special-traits.hbs | no | rare — **no standalone dnd5e dialog** in 5.3.3 | hand off: `actor.sheet.render({ force: true, tab: "specialTraits" })` |

### Favorites (sidebar)

| Task | Vanilla sheet | Covered by mock? | Class | dnd5e API |
|---|---|---|---|---|
| Favorite items, spells, features | context menu `toggleFavorite` mjs:64526-64532 | yes `favoriteButton`, `favoritesList` | everyday | `actor.system.addFavorite({ type: "item", id: item.getRelativeUUID(actor) })` / `removeFavorite(id)` (mjs:72212, 72236) — store in dnd5e's `system.favorites`, not our own list, so both sheets agree |
| Favorite **skills, tools, spell slot levels, effects, activities** | drag onto favorites, `_onDragStart` mjs:58926, `_getFavoriteData` mjs:58513 | **no** (items/spells/features only) | everyday-light | same `addFavorite` with `type: "skill"/"tool"/"slots"/"effect"/"activity"` |
| Use / roll from a favorite (incl. effect toggle, skill roll) | `useFavorite` mjs:58891 | partial `favoriteCastButton` (items/spells) | everyday | as `useFavorite` |
| Reorder favorites | `_onSortFavorites` mjs:59091 (manual `sort`) | **conflict** — mock orders "in the order they were starred" and groups by action cost | everyday | `system.favorites[].sort` |
| Legacy resources (`system.resources.primary…`) | shown as favorites, mjs:58422-58437 | no | rare (legacy) | `system.resources` |

### Sheet-wide

| Task | Vanilla sheet | Covered by mock? | Class | dnd5e API |
|---|---|---|---|---|
| Play / Edit mode | `changeMode` mjs:53135, 53446 | no — mock is always "play", edits hidden | rare (edit happens through dnd5e dialogs, ADR 0001) | — |
| Limited permission view | `LIMITED_PARTS` (header + biography), mjs:55771 | no — mock covers Observer, not Limited | rare | fall back to the vanilla limited sheet |
| Drop an actor → transform (Wild Shape, Polymorph) | `_onDropActor` mjs:57384, 59000 | no | rare | `actor.transformInto(source, settings)` mjs:38755 |
| Drop an active effect / folder | `_onDropActiveEffect` mjs:58974, `_onDropFolder` mjs:57467 | no | rare | Foundry drop helpers |
| Sheet size remembered per user | `sheetPrefs` flag, mjs:55719-55723 | yes (own) | — | — |

## Biggest everyday gaps (ranked)

1. **Players cannot change their own HP or temp HP.** Vanilla lets any owner type damage/heal deltas; the mock gives
   HP to the GM only. → `actor.applyDamage` / `actor.applyTempHP`.
2. **No death save roll** (only manual marks). → `actor.rollDeathSave`.
3. **No concentration save roll.** → `actor.rollConcentration`.
4. **No tool checks** and no tool list. → `actor.rollToolCheck`.
5. **Inventory basics missing:** quantity ±, item charges, currency editing, containers, drop-in from compendium/chat.
6. **Using items/features from their tab** is only via favorites or the wide-layout inspector. → `item.use`.
7. **Attunement is separate from equipping** in dnd5e; the mock conflates them and has no attune control.
8. **Effects: enable/disable missing; the "dnd5e conditions list" dialog does not exist** — the list must be ours,
   calling `actor.toggleStatusEffect`.
9. **Resistances/immunities/vulnerabilities not displayed.**
10. **Pact magic slots** not modelled; casting must leave slot choice/upcasting to dnd5e's usage dialog.
11. XP has no input; level-up has no entry point (the dialog itself is dnd5e's `AdvancementManager`).
12. Biography fields absent; the Notes field's target is undecided.

## Conflicts with mock assumptions (to settle in the spec)

- `hitDiceTrack` "spend a die" without a roll, and "right click gives one back": no dnd5e API for either outside
  `rollHitDie` / rests. ADR 0001 → route through `actor.rollHitDie`.
- `restButton` "Long rest restores HP, slots…": the restoring is dnd5e's (`initiateRest`); our animation must react to
  the resulting update, not predict it (ADR 0001 consequence). Also respect `allowRests` (mjs:58291).
- `castButton` "spends the lowest free slot": dnd5e's activity usage dialog chooses the slot level.
- `encumbranceMeter` 5×/10× Str and `exhaustionTrack` six pips: read thresholds and level count from dnd5e.
- `favoritesList` ordering by star time vs dnd5e's manual `sort`.

## Not verified

- Exact class paths under `dnd5e.applications.*` for `HitPointsConfig`, `CurrencyManager`, `AdvancementManager`
  etc. (found by class name in the compiled bundle, not by namespace export).
- Name of the recharge roll method on `UsesField` and the preparation-limit path on class items.
- Whether `Item.implementation.create` on drop reproduces vanilla stacking and advancement prompts (vanilla goes
  through protected `_onDropCreateItems` / `_onDropSingleItem`).
- Whether `actor._preparationWarnings` is stable enough to read.
- Nothing was checked live in Foundry; all from source.
