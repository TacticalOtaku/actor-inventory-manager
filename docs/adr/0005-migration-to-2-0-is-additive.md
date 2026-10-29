# Migration to 2.0 adds data and removes nothing until 2.1

Worlds running 1.9.x move to 2.0 by one migration that only writes new data. It runs once per world on `ready`, on
the single active GM, over world actors, world items and unlinked token actors on every scene; compendiums are left
alone. Every step is safe to repeat. Once the world has finished, «Повторить миграцию» redoes only the dolls and
presets: quick slots would bring back favorites the player removed, and open trades are 2.0 trades by then. The 1.9 flags and settings stay in place, so a world can go back to 1.9.x
(losing only what changed in 2.0), and 2.1 removes them. Until the migration has run, the window reads 1.9 data with
the same rules, so players never wait for it.

## What moves

- Item flag `slot`: ordinary slots keep their keys. `attunement1–3` reads as no slot (attunement comes from
  `system.attuned`); `quick1–4` adds the item to the character's `system.favorites`. Neither flag is rewritten, and
  `autoReconcileSlots` leaves items with those values alone. `equippedAt` stays: auto-swap uses it.
- Actor flags: `paperdollTemplateId` `dnd2024` → «Стандарт 2024», `dnd2014` → «Стандарт 2014», a custom id → the
  preset made from that template; `paperdollCustomTemplate` → a new world preset «Своя кукла: {актор}» assigned to the
  actor. `paperdollCollapsed` and `spellsPanelOpen` are no longer read (the doll and tabs are window settings now;
  there is no spells drawer). `lockedBy2H`, `quickSlot`, `favorite` and `spellsTab` are not read.
- World setting `customTemplates` → 2.0 doll presets with the humanoid figure and the same slots.
  `enforcementMode`, `showActorPortraitBackdrop` and `autoReconcileSlots` are unchanged.
- Client settings `theme` and `accent` move to user scope: each client copies its values on its first 2.0 load when
  the user has none (dark → Ночь, light → Пергамент, auto → Авто; accents by the table in #17). `useWebFonts`,
  `showSheetButton` and `logLevel` stay on the device.
- Windows: nothing to carry; 2.0 windows start at their default size and remember it by actor UUID.
- Trades: one in recovery is left alone (2.0 reads 1.9 recovery journals). Open trades that have not started executing
  are cancelled and their request flags cleared; participants get «Обмен отменён обновлением модуля» in chat.

## Failure and report

- Each document is migrated on its own; a failure is logged with its UUID and does not stop the rest.
- The hidden world setting `migrationVersion` is set only when nothing failed; otherwise the migration runs again on
  the next GM start, and the module settings offer «Повторить миграцию».
- The GM gets one whisper: the new name (#27) and «перенесено N акторов, M предметов, K пресетов; сбоев: X — см.
  консоль». Players see nothing beyond a cancelled trade of their own.

## Consequences

- 2.0 keeps reading a few 1.9 shapes (slot values, journals) and must not trip over the stale flags.
- 2.1 ships the cleanup: removes the 1.9 flags and settings, after which going back needs a world backup.
- The release notes ask for a world backup before updating.
