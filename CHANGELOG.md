# Changelog

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
