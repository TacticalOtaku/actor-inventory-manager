# Items dropped from outside are created through the actor's sheet

An exception to ADR 0003. When an item is dropped into the actor window from outside the actor (sidebar, compendium,
compendium browser, a chat or journal link, a bastion order card, another actor), the window resolves it and calls
`actor.sheet._onDropCreateItems(event, items, "copy")`, the protected method dnd5e's own `GroupActorSheet` calls on a
member's sheet and Tidy 5e implements with the same signature. Dropping onto a container tray calls
`actor.sheet._onDropItemContainer(event, item, container)` when the sheet has it. This keeps about ten sheet-only
dnd5e rules (reset of equipped/attuned/prepared, consumable stacking, the advancement prompt and its singleton check,
the class-level merge and subclass checks, the multi-advancement guard, NPC items to gear) without copying them,
which ADR 0001 forbids.

## Rules the window keeps itself

- Move or copy is the window's call, and dnd5e always gets `"copy"`, so dnd5e never deletes the source (it does even
  when creation fails). From the sidebar, a compendium, chat, a journal or a bastion card: copy. From another actor
  the user owns: move — the window copies, checks the actor received the item, then deletes the source. From an
  actor the user does not own, an Item Piles pile included: refused, pointing to a trade or the Item Piles window.
  The GM copies by default and moves with Shift, with the same check.
- Before creating, the window fires `Hooks.call("dropActorSheetData", actor, actor.sheet, data)`; `false` cancels.
- Spells follow the window's tab, not the sheet's: dropped on Снаряжение they become a scroll through
  `Item5e.createScrollFromSpell`; elsewhere they stay spells and are created with public calls
  (`onDropCreate`, then `createDocuments`), because `_onDropSingleItem` reads the sheet's own active tab.
- The sheet's `unsupportedItemTypes` are checked before the call, so the window can say why. An item folder adds its
  items; an active effect is created with `ActiveEffect.implementation.create(data, { parent: actor })`; an actor
  is refused (no polymorph from the window).
- No drops in an observer's window or while a trade locks the inventory. Weighty Containers is pre-checked through
  `integrations/weighty-containers.js` for the window's own message; its `preCreateItem` enforcement still decides.

## Considered Options

- Forward the whole event to `actor.sheet._onDrop`: the sheet reads move/copy from dnd5e's stale static drop effect,
  looks for dnd5e class names in our markup, and reads its own tab.
- Rebuild the rules with public calls: ten rules to keep in step with dnd5e by hand, against ADR 0001.

## Consequences

- If `actor.sheet` lacks `_onDropCreateItems`, the window falls back to `Item5e.createWithContents` and
  `createDocuments({ keepId: true })`; document-level rules still run, and the console says which rules were skipped.
  If it lacks `_onDropItemContainer` (Tidy), a drop on a tray lands in the inventory root with a note.
- The calls sit behind one named helper with a test pinning the 5.3.3 signatures; a dnd5e rename breaks the test, not
  a table.
- Choosing a spellcasting method by the section a spell is dropped on is not part of 2.0; dnd5e's fallback (the first
  slot progression) applies.
- Drags out of the window carry `item.toDragData()` plus our fields, so sheets, the canvas and Item Piles accept them;
  dnd5e treats them as copies.
