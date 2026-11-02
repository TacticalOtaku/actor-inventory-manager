# AIM: Actor Window 2.1.1

Changes since v2.1.0.

## Trade reliability
- Consolidated lifecycle transitions, persistence and request receipts in one serialized workflow.
- Recovery retains the Trade lock until restoration is verified, including missing or incomplete journals, rejected writes and coordinator handoff.
- Recovery uses saved currency paths even when the original Item Piles currency provider is unavailable.
- Cleanup failures after a completed Trade no longer turn a successful transfer into a failed request.

## Equipment outcomes
- Actor window actions and redirected native sheet equips verify all affected items, including displaced equipment.
- Recognizable partial writes are compensated when safe. Concurrent changes are preserved; unresolved outcomes show a partial-failure notice.
- Container placement and unequip use one item update, so a refused unequip cannot be followed by an independent container move.
- Native sheet equips that require replacement cancel the original update and execute the complete replacement separately. Other handlers observe that cancellation; unrelated requested fields are preserved.
- Equipped items are removed from containers, including a container introduced by the same redirected update.

## Inline editing
- HP, coins and feature uses share draft, validation, focus and listener cleanup.
- Repeated Enter cannot submit the same draft twice. A failed save retains the text for an explicit retry; the current value should be checked before retrying a relative entry.
- A refresh failure after a successful write does not restore an already-applied draft.
- Redraws preserve text and invalid state; old asynchronous completions cannot overwrite a new edit or reopen a closed window.
- HP still uses dnd5e's damage, healing and temporary-HP actions. The existing per-editor redraw/write ordering is retained.

## Compatibility and limits
- Foundry VTT 14; verified on 14.367.
- D&D 5e 5.3.3 or later; declared verified version remains 5.3.3.
- No saved-data migration or dependency changes.
- Equipment queues are per client. Foundry embedded-document batches are not transactions; a vetoed compensation can still require manual inspection.

## Validation
- ESLint and 531 tests passed before packaging.
- The release archive was checked for integrity, manifest consistency, source parity, relative imports and unwanted files.
- Seven inline-edit scenarios passed in local Foundry 14.367 as GM: HP validation across redraw, Escape, damage, repeated Enter for coins, draft preservation, hook refusal and feature uses. This does not represent a full player or module compatibility matrix.
- GitHub Actions now runs lint, tests and package validation for main pushes and pull requests.

## Installation
Update through Foundry's module manager, or download `actor-inventory-manager-v2.1.1.zip` from the release assets.
