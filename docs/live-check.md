# Live check

The GM's world cannot be tested, so before a release we check the actor window in our own world, adding modules in
steps. The rules being checked are in ADR 0003. Each item names what to do and what must happen.

## Setup

- A test world with dnd5e 5.3.3 on Foundry 14.367, one GM and two player accounts.
- Test actors: a caster with a class that has advancement, a non-caster, a vehicle and an NPC with a player owner, a
  GM-only NPC.
- Back up the world before the run and restore it afterwards.
- Throughout: the console shows no errors and no warnings from this module.

## Module sets

Run the whole list on set 1, then repeat it on each set after adding its modules.

1. dnd5e only.
2. + midi-qol, DAE, libWrapper, socketlib.
3. + Tidy 5e Sheets (the line that matches dnd5e 5.3.x).
4. + Item Piles and «Item Piles: D&D 5e» (`itempilesdnd5e`).
5. + Weighty Containers, SC - Item Rarity Colors.

## Checklist

### Opening

1. The header button of the dnd5e sheet opens the window; on set 3 so does the button of the Tidy sheet. The `I` key
   opens it for the controlled token.
2. A GM-only NPC shows no button and ignores the key; a group actor never gets one.
3. «Открыть лист персонажа» in the window's «⋯» menu opens the actor's own sheet (dnd5e's, or Tidy's on set 3).
4. A player with Observer permission gets a read-only window with the «Только просмотр» badge.

### Actions

5. An item with several activities opens dnd5e's activity choice as its own window; the chosen activity runs.
6. On set 2, an activity marked «only for automation» in midi is missing from the inspector's activity buttons and from
   favorites, and using the item does not offer it.
7. Damage typed into HP (`−7`) on set 2 runs through midi (`dnd5e.preApplyDamage`); `в8` grants temporary HP and the
   higher value stays; a bare number sets HP.
8. Turning on a condition from an `exclusiveGroup` turns off the other one of that group.
9. Deleting a class asks about removing its advancement; deleting a filled container asks about its contents.
10. A recharge roll, a level up from the level orb, a short and a long rest each give dnd5e's result.
11. Placing a spell template minimises the window; it comes back when the template is placed or cancelled.

### Items from outside (ADR 0004)

12. An item dragged from the sidebar is copied; the sidebar keeps it. A compendium item arrives with equipped and
    attuned cleared.
13. A class with advancement opens dnd5e's advancement manager; a second species or background is refused by dnd5e.
14. A consumable from the same compendium entry raises the existing stack instead of adding a row.
15. A spell dropped on Снаряжение opens the scroll dialog; dropped on Заклинания it stays a spell.
16. An item from the player's own second character moves (gone there, here once). Someone else's item and an Item
    Piles pile row are refused with the reason.
17. On set 5, a drop into a full container is refused by Weighty Containers and nothing is created or deleted.
18. On set 3, the same drops work with a Tidy sheet; a drop onto a tray lands in the inventory root with the note.

### Menus

19. The item menu shows the same entries as the vanilla sheet. On set 4, Item Piles' «Give to character» entry
    appears and works.
20. The effect menu offers edit, duplicate, delete, enable or disable.

### Integrations

21. On set 4, coins and Item Piles currencies show in the purse and the trade checks in `README.md` pass.
22. On set 5, container load and restrictions match Weighty Containers, and rarity colours match SC - Item Rarity
    Colors.

### Look

23. Both themes, a narrow window and each motion level; with reduced motion on in the OS only «Выключены» is
    available.

### Migration from 1.9 (ADR 0005)

24. Prepare a copy of the test world on 1.9.1 with items in ordinary and quick slots, a custom template, an actor
    with its own doll, an open trade, and a non-default theme and accent on one client.
25. Update to 2.0: slots are where they were, quick-slot items are in favorites, presets exist (including «Своя
    кукла: …»), the theme and accent carried over, the open trade is cancelled with a chat line, the GM gets the
    report whisper.
26. A second start changes nothing and sends no report.
27. Going back to 1.9.1 opens the world with its 1.9 slots and templates.

### Release

28. The name «AIM: Actor Window» is not taken: search the Foundry package list and GitHub for «AIM» and «Actor Window»
    modules. If it is, fall back to «Actor Inventory Manager» (#27).
