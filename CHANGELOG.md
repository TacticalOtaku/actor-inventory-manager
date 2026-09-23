# Changelog

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
