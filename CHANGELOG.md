# Changelog

## Unreleased

### Added
- Gift: «Подарить» starts a one-way trade. Only the giver offers items or coins, the receiver accepts or declines;
  a payment is a gift of coins.
- The trade panel shows your carried weight after the trade, coloured when the load tier would change.
- «Бросить на землю» in an item's menu turns it into an Item Piles pile at the actor's token (Item Piles active, a
  token on the scene, not a container).
- The level orb is a liquid with a moving surface and bubbles; its glow grows with the experience, from 90% it pulses,
  and when the level is ready it throws golden stars and shows an arrow. The XP card has +50/+100/+250/+1000, «Задать»
  and the ready hint.
- Tabs show how many items, spells and features they hold.
- The armor class shows its breakdown (armor, Dexterity, shield, bonuses, cover) on hover.
- Hit die, death save and concentration rolls show their result beside the button.
- An item, feature, spell or activity used from the window lands with sparks in its school's or rarity's colour; a
  refused one shakes its row and says why beside it. Starring an entry throws amber sparks.
- Motion: the window settles in when it opens, a tab or a section brings its entries in as a short cascade, cards
  light up under the cursor, presses send a ripple, buttons and doll slots lift, a row's tile catches a sheen, the tab
  strip casts a shadow over a scrolled panel, a new accent or theme crossfades, slot gems glint like runes, a changed
  quantity pops, a new attunement socket lands, an offered item slides in.
- Vehicle crew shows as pills with portrait and name; the banner of a doll without slots shows its figure large.

### Fixed
- Generic equipment («Stone of Light», «Heavy Coat», «Robe of Stars», goggles) no longer takes the armor slot and
  pushes off the worn armor.
- Equipped ammunition takes no hand, so a shield can still be equipped from the dnd5e sheet.
- Deleting a world preset gives a vehicle or a beast its own default doll back, not a humanoid one.
- `formatItemForDisplay` of the API no longer shows players an unidentified item's price, rarity and description.
- An unlinked token's window takes outside drops while its base actor trades.
- Trading:
  - A trade stuck in recovery locks only the items and coins: hit points, slots, death saves and experience change.
  - A big trade no longer times out on the player's screen while the GM is still carrying it out.
  - Received items join an identical stack outside containers instead of adding a second row.
  - The chosen partner no longer resets to the first one on a redraw.
  - An offer edit made just before closing the window is sent.
  - The panel slides in and out; its error shakes once, not on every keystroke; withdrawing your own confirmation no
    longer shakes the status.
  - In a window under about 1040 px the open panel covers the inventory instead of crushing it.
- Biography text being typed is no longer lost when something else redraws the window.
- In a popped-out window, typed text and open menus behave as in the main one.
- A long rest refills the dice and runes after the dawn, once; a hit die roll spins the die it spent.
- HP, coin and quantity animations are no longer cut off by the redraw that follows.
- A wrecked vehicle shows no death saves.
- In the card view an item's tags wrap inside the card.
- The inspector slides in only when an entry is picked, not on every change.
- An observer's header tools no longer cover the actor's name.
- The preset editor follows Foundry's light or dark scheme in «Авто».
- «Сдержанно» stops the particle bursts too.
- The «⋯» menu and the XP card close on a click outside; the menu entry names the NPC or vehicle sheet.
- The I key brings a minimised window back instead of closing it; collapse and expand keep the width you had.
- The list view, folded trays and the hidden doll follow in every open window.
- A tray that sprang open under a drag stays open; a socket dragged out of the doll ends the attunement.
- A refused activity shakes its row; a doll slot or socket click scrolls the item's details into view.
- The closed settings drawer is out of the Tab order and Escape drops a pending reset.
- The narrow window's rail scrolls with the wheel and fades where more blocks wait.
- A vehicle's or NPC's settings list only the tabs it can have, with the names its tabs show.

## 2.0.8

### Fixed
- Trading works for a GM who hosts over plain http on the local network: the item digest no longer needs the
  browser's `crypto.subtle`, which only https and localhost have. Digests stay SHA-256, so open offers keep theirs.
- Pressing Enter in the XP field no longer reloads Foundry.
- Unidentified items: the Actions tab no longer shows a weapon's to-hit, damage, properties or charges to players,
  and the hover card no longer shows an armor's AC with its magic bonus.
- Clothes and robes are worn under armor and take no slot: armor goes on over Traveler's Clothes instead of being
  refused or pushing them off. Clothes an older doll put in the armor slot leave it.
- A shield equipped with both hands free goes to the off hand.
- «Iron Bands of Bilarro» is no longer offered the ring slots.
- «Повторить миграцию» after a finished migration no longer cancels open trades or brings back removed favorites.
- A window whose first render fails (broken item data) opens again on the next press instead of never; the same for
  the preset editor.
- The window of an unlinked token closes when its scene is deleted.
- Unlocking a trade stopped while preparing deletes the snapshot journal it left.
- The filter textures of an effect (tens of MB after a long rest) go back to the GPU once nothing plays.
- Effects keep playing in a popped-out window while the main Foundry tab is hidden.
- The psychic damage card's rings keep their colour for their whole life.
- A spell's details agree with its row for classes that know their spells (Cast, no Prepare).
- An item menu open while its window closes no longer leaves a listener on the page.
- The purse total uses the world's coin rates, as item prices do.

### Removed
- Three unused translation strings, an unused style rule and the `readVehicleOf` alias.

## 2.0.7

### Fixed
- Unidentified items no longer tell players their price, rarity, properties or charges, in rows, the doll, the
  inspector and hover cards; a player's card also leaves out to-hit, damage and save, which carry the magic bonus.
- A player who loses sight of an actor (the GM takes Observer away) sees its window close.
- Trading:
  - An offered item that changed (a potion drunk from the offered stack) no longer jams the trade: the offer is read
    again and both players confirm what is offered now.
  - Item Piles secondary currencies are no longer offered as money, which Item Piles never moved; they trade as
    items.
  - The GM can cancel an open trade, for when a player left it.
- Equipping:
  - Natural weapons (claws, a bite) no longer take a hand on the doll.
  - Equipping a potion or a scroll no longer pushes the held weapon or shield out of a hand; with both hands full it
    is equipped without a slot.
  - A spell scroll no longer lands in the head slot by its name («Crown of Madness»).
- A space vehicle shows its speed.
- Effects keep their size after a browser zoom or a move to another screen, and no longer reallocate the renderer
  every frame at a fractional display scale.
- A favorite no longer opens a tab the user hid.
- An item deleted by another player while being dragged no longer throws.
- A weight unit whose key has capitals converts by its exact key.

### Removed
- Unused translation strings, the Unbounded and JetBrains Mono fonts, the old slot registry and unused constants.

## 2.0.6

### Fixed
- Moving a consumable onto an identical stack of another actor no longer duplicates it: dnd5e grows the stack
  without waiting, and the source used to stay.
- Trading:
  - An offer stores a digest of each item instead of the item itself. The trade state is a world setting every
    client reads, and it held an unidentified item's real name and description. Finished trades drop their
    fingerprints.
  - Wearing, unequipping or opening an offered item no longer makes the offer impossible to confirm.
  - Confirm sends the revision drawn on the button, so an offer changed a moment before is not accepted unseen.
  - An offered item that was used up or deleted can be taken out of the offer; typing in its field no longer fails.
  - The GM's restore skips an actor deleted since and returns the trade to recovery when it fails, instead of
    locking both inventories for good.
  - A co-owner of the actor sees the trade but no longer gets controls that every action refuses.
- The actor window:
  - A trade no longer redraws away a biography being typed.
  - Clicking the canvas after a search no longer sends every later keystroke back into the search field.
  - Opening a window twice in quick succession no longer makes two windows (the same for the preset editor).
  - A redraw from another client no longer closes the HP entry being typed.
  - The window of an unlinked token closes with its token.
  - Two uses waiting on dnd5e's dialog at once no longer leave `ui.notifications` wrapped.
  - An HP change redraws the rail without rebuilding every tab's rows, the details and the biography.
- Equipping from the dnd5e sheet ignores the slot a copied item remembered from its old actor.
- Two quick attunements from one client can no longer both take the last place.
- An item of an actor inside a compendium is copied, as on the dnd5e sheet, instead of being refused.
- A 1.9 own doll migrated to a world preset uses that preset, so editing it shows on the doll.
- Importing a preset file whose id is built in or already taken adds a new preset instead of overwriting one.
- With two GMs online the migration runs on the trade coordinator and no longer fails on every start.
- Prices below 1 gp read in copper unless they are whole silver (15 cp, not «2 sp»).
- Hover cards show an item's weight in the world's unit.
- An «add» effect change with its own sign reads «+1d4», not «++1d4».
- Powerful Build carries one size up (a Small creature as a Medium one) in the fallback capacity.
- Public API:
  - `extractActorVitals` reads the save bonus.
  - `computeActorEncumbrance` and `computeActorCapacity` convert dnd5e's numbers into the unit asked for.
  - A vehicle's hold in megagrams converts.

### Removed
- `api.slotRegistry`: slots it registered never reached a doll. Slots come from the doll presets.
- Unused helpers: `getContainerContentsCount`, `watchContainerRules` (the hook name is `CONTAINER_RULES_HOOK`),
  and the recharge fields of `resolveItemUses`.

## 2.0.5

### Fixed
- Hover cards no longer show unrevealed secret blocks to anyone, owners and the GM included, as dnd5e's own
  tooltips do. The details, effects and biography keep Foundry's rule (owners see secrets) and mark them as a
  dashed block.
- Secret blocks lose Foundry's «Reveal» button in the window: it only works on document sheets and did nothing here.

## 2.0.4

### Fixed
- The rail fits its column again: the rest buttons stack one per row at equal width; «Продолжительный отдых»
  widened its half and pushed the rail into a sideways scroll.
- A narrowing window keeps its controls tidy: the inventory filters, doll toggle and view switch wrap under the
  search as one group, and the narrow layout keeps ⋯ ⚙ ⤢ beside the name instead of on a row of their own.
- Above the inventory, the doll is a full-width card like the sections; in the narrow strip every card takes the
  strip's height.

## 2.0.3

### Fixed
- The window header's ⋮ and × show their icons again (2.0.2 gave the header buttons the window's text font).
- Headings set Cyrillic in the interface font; Palatino is used for Latin only, so Russian headings match the rest
  of the window.

## 2.0.2

### Fixed
- Button labels use the window's font: Foundry gave them Signika, whose Cyrillic stood out (the doll's slot names).
- The settings switches no longer show Foundry's checkbox square in the off position.
- With «Decorative fonts» off, headings use the system interface font as well.
- SC - Item Rarity Colors styles the window's item and spell rows through its own API (3.0.18+), as it styles an
  actor sheet's inventory: the rarity gradient, title and detail colours, the icon border and effects.
- The window's rarity accent (tiles, tooltip frames, the inspector) takes the colour SC shows: the icon border, or
  a gradient's bright second stop, instead of the gradient's dark first stop.

## 2.0.1

### Added
- The preset editor places each slot again: left, right, under the doll, or by order as before. Presets without a
  choice keep their layout.

### Changed
- AIM opens from the sheet's ⋮ menu and the `I` key; the separate header button is gone.
- Big trades move items in one write per kind, so offers of many items finish well inside the request timeout.

### Fixed
- Buttons in the window size to their content: initiative, the hit-dice track, chips and item tiles were cut to
  Foundry's 28px button height.
- The theme, density and motion choices in the settings no longer overlap.
- With the portrait backdrop on, the paperdoll shows the portrait instead of drawing the figure over it.
- An item can no longer exist twice after a move from an owned actor whose trade is running.
- A second confirmation that cannot settle (an item ran out, the partner left) clears both confirmations instead
  of leaving the trade looking finished.
- The 2.0 migration no longer makes a preset for every unlinked token of an actor with its own doll.
- The item menu offers Prepare only where the spells tab does (no cantrips, no classes that know their spells).
- The module API opens a window only for users with Observer permission.

## 2.0.0

**Renamed from Actor Inventory Manager & Paperdoll: the module is now AIM: Actor Window.** Its id stays
`actor-inventory-manager`, so updating keeps the world's data. **Back up your world before updating.**

### Added
- The actor window replaces the inventory window: one window per actor beside its sheet, with a rail and tabs for
  overview, equipment, spells, features or actions, effects and biography. It picks its layout from its own width,
  and observers get a read-only window.
- The rail: hit points with typed entry (−7, +5, t8), hit dice, spell slots, AC, initiative, speed, effects,
  inspiration, exhaustion, concentration, rests and dnd5e favorites; each block can be hidden.
- Overview with skills, saves, tools, defenses and senses; the biography in dnd5e's own fields.
- Spells tab with slot gems, preparation and casting through dnd5e; features by origin, NPC and vehicle actions by
  cost; effects with the conditions grid.
- The paperdoll gains figures for beasts, wagons, ships and airships, and a GM preset editor with live preview.
- Tooltip cards for items, spells, effects, rules and damage types, with nesting and pinning; damage types play a
  scene in their colour, and the window's reactions (damage, healing, temporary HP, death saves, spent slots, the
  long rest) burst with particles.
- NPC windows with challenge rating and legendary actions; vehicle windows with thresholds, cargo in tons, crew and
  passengers.
- Items, folders and effects dropped from outside the actor go through its sheet, so dnd5e's drop rules hold; items
  from another owned actor move, someone else's are refused.
- Item, activity and effect menus carry dnd5e's entries and fire its context-menu hooks, so other modules' entries
  appear.
- Night, Parchment and Auto themes, six accents, two densities and three motion levels.

### Changed
- Trading moved into a panel beside the inventory in the equipment tab.
- The sheet header button reads «AIM»; the key binding is «Open the actor window».

### Migration
- The first start of 2.0 moves the world's 1.9 data once, on the GM: quick-slot items become favorites, an actor's
  own doll becomes a world preset «Own doll: {actor}», world templates become presets, open trades are cancelled with
  a chat line, and each device's theme and accent move to its user. The GM gets one whispered report; «Run the
  migration again» in the module settings repeats it. Nothing 1.9 wrote is deleted, so the world can go back to 1.9.x.

### Fixed
- Colours from SC - Item Rarity Colors reach the window. Before, the module looked for settings SC does not have and
  always showed its own colours: rarity colours, the rarity glow and spell-school colours (including SC's per-level
  variants) now come from what the GM set in SC.
- With Item Piles, the purse total leaves out secondary currencies. Before, each one counted as one gold piece,
  since Item Piles gives them no exchange rate.
- With Item Piles active but no currencies set up for the system (Item Piles 3.3 needs the «Item Piles: D&D 5e»
  module for dnd5e), coin trades say what is missing instead of a generic Item Piles error.

## 1.9.1

### Fixed
- Trading coins without Item Piles works. Before, every trade that moved D&D5e coins failed after the debit and was
  rolled back: Foundry adds `_id` to the update data, and the balance check read it as a currency.
- The Trade drawer shows the actor's latest trade. Before, finished trades were stored newest first, so the drawer
  showed the oldest result and the 30-trade history limit dropped the newest ones.
- A failed trade is labelled "Trade failed" instead of "Cancelled; assets restored", which was wrong when the
  recovery journal was missing and nothing could be restored.
- The spells drawer title wraps onto a second line instead of ending in an ellipsis.

## 1.9.0

### Fixed
- Equipping a shield while a two-handed weapon is held is refused. Before, the shield pushed the weapon out and took
  the main hand. Dropping a shield straight onto the main hand still swaps the weapon out.
- More than three attunement slots no longer widen the paperdoll over the inventory: the sockets move to their own
  line and wrap there.
- On screens narrower than 1164 px, an open drawer hides the passport as intended. Before, the layout rule lost to
  the drawer layout and squeezed the inventory into a 56 px column.
- The paperdoll editor starts from the actor's own attunement cap and writes it only when it was changed. Before,
  applying the editor reset a cap set on the sheet (6, say) to the template's 3.
- Deleting a container from the window asks whether its contents go too. Before, they were kept pointing at the
  deleted container, and the window then hid them; such items now show at the top level, as on the dnd5e sheet.
- Reopening a window during its closing animation, opening it twice at once, or adding slots in quick succession
  no longer leaves a window Foundry has lost track of (Escape and window order did not reach it).
- Unequipping from a slot shakes it when another module vetoes the change, like the other refused actions.
- A slot labelled *Левое кольцо* (left ring) is no longer treated as an off hand, so a two-handed weapon does not
  lock it. A Russian label now needs both *лев* and *рук* to mean the off hand.
- GM recovery of an interrupted trade whose snapshot journal was deleted closes the trade with its own error
  instead of failing again and keeping both characters locked.

### API
- `findBestSlotForEquipping` returns the same rule-checked slot as clicking Equip. Before, it could pick a slot the
  rules then refused.

### Development
- Removed `tools/preview-trade.mjs`, which still read the removed stylesheet, and the Handlebars helper fallbacks
  that Foundry 14 already provides.
- Weighty Containers is recommended from 3.5.0, the version the README and the integration expect.

## 1.8.0

### Interface
- The inventory window, the paperdoll editor, the slot dialog and the character sheet button are redrawn in the
  Tactile style: a passport column with a large hit point number, the paperdoll rack in a sunken tray, a quieter
  inventory list and nested container trays.
- Opening the grimoire or the trade drawer folds the paperdoll into its strip, so the inventory keeps its width and
  the window grows less. Closing the drawer brings the paperdoll back. The paperdoll can be expanded beside a drawer
  when the screen holds both; otherwise expanding it closes the drawer. On a screen too narrow for a drawer beside the
  folded paperdoll, the passport column hides while the drawer is open.
- New client setting *Accent colour* with ten colours (default Peach). Open windows and editors re-tint without
  reopening.
- Item rows show the rarity name of uncommon and rarer items.
- Icons use Font Awesome Light, including the default paperdoll slots. Saved custom templates keep their icons.

### Fonts
- The interface fonts (Onest, JetBrains Mono, Unbounded) ship with the module, with Latin and Cyrillic subsets. The
  module no longer requests anything from Google Fonts. The setting is now called *Interface Fonts*; turned off, the
  windows use system fonts.

### Motion
- Animations run on GSAP 3.13 bundled with the module, on a private instance that leaves any global `gsap` from
  other modules alone: the window settles in, numbers count to their new value, a filled slot settles, rows slide
  to their new place after sorting or filtering, and drawers slide in.
- A refused change (an equip the rules forbid, attunement past the limit, an invalid drop) shakes its target.
- With reduced motion (the operating system's preference or Foundry's low performance mode) only a short fade
  remains.

### Fixed
- An equip or attunement change vetoed by another module's update hook no longer shows a success notification.

### API
- `equipItem`, `unequipItem`, `toggleItemEquipped` and `toggleAttunement` resolve to `true` when the change was
  written and `false` when it was refused or vetoed.
- `formatItemForDisplay` adds `rarityLabel`; `extractActorVitals` adds `className`, `hp.tempPct`, `speedWalk` and
  `speedUnit`.

### Development
- `npm run vendor` copies GSAP and the fonts from `node_modules` into `scripts/vendor/gsap/` and `assets/fonts/`.
- Styles are split into `styles/tactile/` (tokens and primitives) and `styles/aim/`; `styles/actor-inventory.css`
  was removed. After `npm run deploy`, restart the Foundry server once, because `module.json` lists new stylesheets.

## 1.7.0

### Changed
- The manifest caps compatibility at Foundry 14 until the next core generation is tested.
- Item Piles, Weighty Containers and SC - Item Rarity Colors are listed under `relationships.recommends`, so Foundry
  shows them as recommended modules. The previous `optional` key is not part of Foundry's manifest schema and was
  dropped silently.
- Theme tokens are declared on the module's windows and its header button instead of `:root`, so they no longer
  leak into Foundry or other modules.

### Development
- ESLint and Prettier; `npm run check`, `deploy`, `package` and `release` as in the other TacticalOtaku modules.
  `npm run deploy` replaces `npm run sync`; `FOUNDRY_DATA` now names the Foundry `Data` folder.
- `npm run release` validates `module.json` and writes `dist/actor-inventory-manager-v<version>.zip`; it never
  replaces an existing archive.
- `ARCHITECTURE.md` moved to `docs/architecture.md`; project rules in `CLAUDE.md`.

## 1.6.1

### Motion
- Hit point, load and container meters slide from their old value to the new one. Their CSS transition never played, because every update redraws the window.
- The window respects the operating system's reduce-motion preference and Foundry's low performance mode: transitions, the overburdened pulse and the meter slides are turned off.
- Hover and state transitions animate only colour, background, border, shadow, transform and opacity instead of every property.

### Character sheets
- The inventory entry in an actor sheet's ⋮ menu is added through Foundry's `getHeaderControlsActorSheetV2` hook instead of patching sheet classes at startup, so sheets registered later get it too.

## 1.6.0

### Window layout
- The Spells and Trade switches moved from tabs hanging outside the window into a slim rail inside its right edge. They no longer cover Foundry's sidebar, overlap each other with longer translations, or turn red on hover. An open trade shows as a dot on the Trade button.
- All inventory and spell categories are visible at once. The tab rows wrap instead of hiding categories behind a scrollbar, and in a narrow column inactive tabs show only their icon and count, with the name in the tooltip.
- A side panel left open no longer pushes the window past a small screen: the paperdoll folds away for the session when both do not fit, and the window's content never spills past its frame.
- The folded paperdoll shows an icon and the attunement count instead of sideways text.

### Character column
- The column fits the default window height without scrolling, so the purse is no longer hidden under the rest buttons. AC, initiative and speed share one strip, and each ability shows its modifier and save on one line.
- Long character names wrap onto a second line instead of being cut to a few letters, and letters with descenders are no longer clipped.
- Shorter headings that stay on one line: "Load", "Equipment" and, in Russian, "Характеристики".

### Spells & Actions drawer
- Spell slots take one row per level. The pips are buttons — a filled pip spends a slot, an empty one restores it — so the separate − and + buttons are gone, and the slots stay usable from the keyboard.
- Long spell names wrap onto a second line, and a long drawer title no longer runs under the close button.
- Activation labels (Action, Bonus Action, Reaction, …) come from the module's own translations, so they are no longer English in a world without a dnd5e translation.

### Items
- Item weights are shown in the world's unit. With metric weights enabled, rows used to print the unit stored on each item (lb next to kg totals).
- Property chips wrap onto a second line instead of being cut mid-word.
- Paperdoll slot labels stay readable over the portrait backdrop, and the light theme no longer draws the paperdoll on a dark background.

### Trade
- With no other players' characters online, the drawer shows just that message instead of an empty partner list.

## 1.5.1

### Spells & Actions drawer
- Spell and action cards no longer clip their details: the school, activation and range of a spell (e.g. "Self", "Bonus Action"), and the source, activation, uses and recharge of a feature wrap onto a second line in a narrow drawer instead of being cut off.
- The spell level in the prepared segment moved from the meta row onto the corner of the spell icon, leaving the row its full width.
- Activation pills (Action / Bonus Action / Reaction) are readable on the light theme.

## 1.5.0

### Spells
- Prepared spells get their own segment at the top of the spell list. It holds every leveled spell prepared for the day, including always-prepared ones, sorted by level and then name, with the spell level on each card.
- Prepared spells move out of their level groups instead of being listed twice; unpreparing a spell sends it back to its level. Cantrips stay in their own group.
- The segment follows the spell search and disappears when nothing is prepared.

## 1.4.0

### Requirements
- Foundry VTT **14** or newer. Foundry 12 and 13 are no longer supported.
- D&D 5e **5.3.3** or newer. dnd5e 3.x, 4.x and 5.0–5.3.2 are no longer supported.
- Item Piles (optional) **3.3.0** or newer.

### Removed legacy code
- Attunement reads only `system.attunement` (requirement) and `system.attuned` (state); the numeric 3.x/4.x encoding is gone, including in trades.
- Spell preparation uses only `system.method` / `system.prepared`; the `system.preparation` fallback is gone.
- Uses and recharge come from `system.uses` and `uses.recovery`; the old `system.recharge` object is no longer read.
- Spell components come from `system.properties`; the old `system.components` object is no longer read.
- Item properties, weight, price and armor category are read in the current dnd5e shapes only (`Set`, `{ value, units }`, `{ value, denomination }`, `system.type.value`). The `backpack` item type is no longer recognised.
- Actor sheets: the ApplicationV1 header button (`getActorSheetHeaderButtons`) and the old dnd5e sheet render hooks were removed; one `renderActorSheetV2` hook covers every dnd5e sheet.
- `loadTemplates`, `FilePicker` and `fromUuidSync` are used from the `foundry.*` namespaces only; the Foundry 12 globals are no longer looked up.
- Item Piles: only `game.itempiles.API` is used; the `ItemPiles` global and the manual reading of the Item Piles currency settings were removed.
- Pre-release paperdoll flags (`customTemplate`, `templateId`) are no longer read.
- Application renders use the ApplicationV2 options object instead of the boolean argument.

## 1.3.0

### Equipment rules
- Item names are matched by whole words (with plural and Russian case endings), so "Bandage" is no longer a ring and "Cloak of Light" no longer fits the armor slot.
- Gloves and gauntlets never go into the weapon hands.
- A real armor category always counts as body armor: "Chain Shirt" / "Кольчужная рубаха" now obey the single-armor rule.
- Drag and drop respects body locations: a helmet can no longer be dropped on the feet or a ring slot.
- No more invisible slots: potions, pants and bracelets are only offered slots that exist in the actor's template.
- Items without a place on the paperdoll (Ioun stones, trinkets) are equipped without a slot instead of being blocked.
- Loot, which dnd5e cannot equip, no longer shows an equip button.
- Two-handed locking follows the `locksOffHandOn2H` / `isShield` flags of custom templates; the main hand is no longer shown as locked.
- The "Single per Actor" slot rule is enforced; only one shield can be equipped across all slots.
- Auto-swap mode swaps out the item causing a conflict (a two-handed weapon, a second armor or shield) instead of equipping an invalid loadout.
- Equipping writes the displaced items and the new one in a single update and takes the item out of its container.
- Rule messages are localized. The "Auto-Reconcile Equipped Items" setting now works.

### Paperdoll templates and editor
- World templates stay linked by id, so updating a template reaches every actor using it.
- "Update Template" and "Delete" only apply to world templates; saving an actor-only layout no longer writes a hidden `dnd2024` entry.
- Template data and JSON imports are validated; preset ids cannot be shadowed and existing templates are not overwritten without confirmation.
- Slot ids may use any letters; an empty id is refused.
- Dialogs no longer throw when closed with the window button.

### Attunement
- The attunement limit comes from the actor, including effects such as Magic Item Adept. Items attuned beyond the limit are still shown and marked.
- Items that do not require attunement cannot be attuned.

### Weight, encumbrance and Weighty Containers
- Weights use dnd5e's unit table (a kilogram is 2.5 lb), matching the sheet and Weighty Containers.
- Without a system encumbrance block, the carried weight comes from Weighty Containers' `computeActorCarriedLbs`; the raw fallback ignores the contents of weightless bags.
- Container rule rejections are shown as localized sentences instead of codes such as "type"; subtype matching mirrors Weighty Containers.
- Encumbrance tiers follow dnd5e's encumbrance rule (none / standard / variant).

### Permissions
- Opening the inventory requires Observer permission; Limited users no longer see the full inventory.
- Observers get a read-only window. Every change requires Owner (or GM).

### Interface
- Nested containers are shown inside their parent; moving an item between containers no longer races a second update.
- Windows of unlinked tokens no longer merge with their base actor's window.
- The window never becomes narrower than its layout, and the paperdoll collapses automatically when a side panel does not fit.
- Rarity glows work with every colour format; sorting by rarity and value is correct.
- Theme toggle works from "Auto", and changing settings refreshes every open window.
- Decorative web fonts are loaded through the new "Decorative Web Fonts" client setting instead of a CSS `@import`.
- Remaining English strings are localized in Russian.

### Compatibility
- Templates load on Foundry 12 again; FilePicker uses the Foundry 13 namespace.
- No duplicate header button on ApplicationV1 sheets.
- The unused `lib-wrapper` optional dependency was removed.

### Trading
- Only the invited player gets the trade invitation.
- A trade cancelled just before transfer reports an error instead of a silent success.
- Item Piles item currencies are matched by the configured item.
