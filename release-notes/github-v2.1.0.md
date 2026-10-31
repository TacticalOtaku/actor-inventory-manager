# AIM: Actor Window 2.1.0

Changes since v2.0.9.

## Improved
- Unified equipment planning between the actor window and the dnd5e sheet. Paperdoll slot drops replace the current
  item, while ordinary equip actions continue to respect strict slot blocking.
- External transfers now verify receipt before deleting source items. Operations involving the same actor are
  serialized within the client, and ownership and trade locks are rechecked before removal.
- The trade panel manages its own lifecycle, and background redraw scheduling is consolidated in one queue.

## Fixed
- Equipping from the dnd5e sheet in warning mode no longer leaves two items in one slot. Equipping a bagged item also
  removes it from its container.
- Unlinked token inventories no longer inherit their base actor's trade lock.
- Weight previews after trading use Weighty Containers 3.10+ load rules for items inside containers, with the previous
  estimate retained for older versions.
- Unrelated inventory changes no longer count as proof that a dragged item arrived. Container moves require complete
  receipt; incomplete moves keep the source and undo destination changes when safe. Transfers that cannot be safely
  resolved stop with a recovery notice instead of continuing automatically.
- Container drop creation explicitly uses dnd5e's copy behavior, keeping source deletion under transfer control.
- Rail animations no longer delay background inventory, inspector, settings drawer or trade panel updates.
- Document and trade updates arriving during an asynchronous render are preserved. Releasing an animation hold also
  preserves the 40 ms quiet period for a newly queued document change.
- Biography editing delays only the main part and refreshes it after editing ends. Rail-only updates do not trigger
  an unnecessary biography catch-up.
- Closing the window cancels pending redraw timers. Explicit actions such as HP editing remain immediate.

## Compatibility
- Foundry VTT 14; verified on 14.367.
- D&D 5e system 5.3.3 or later; verified on 5.3.3.
- Weighty Containers 3.10+ is used for precise post-trade bag load calculations; older supported versions keep the fallback.
- No public API or saved-data migration changes are introduced by this release.

## Validation
- `npm run release` passed: ESLint and all 477 tests, followed by packaging.
- The 162-file ZIP passed integrity checks, matches the source files byte for byte, and includes every relative JavaScript import.
- The archive excludes development files, local configuration and attribution metadata.
- External transfer scenarios were exercised locally as GM and player; six redraw lifecycle scenarios were exercised as GM.

## Installation
Download `actor-inventory-manager-v2.1.0.zip` from the release assets, or update an existing installation through
Foundry's module manager.
