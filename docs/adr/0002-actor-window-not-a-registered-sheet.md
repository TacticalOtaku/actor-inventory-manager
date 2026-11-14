# The actor window stays a separate window, not a registered sheet

Version 2.0 grows the actor window into a full character sheet but does not register it with
`DocumentSheetConfig.registerSheet`: it stays a window opened from the header button that every `ActorSheetV2` shows
(dnd5e's, Tidy's or any other) and from the `I` key. A separate window works the same over whichever sheet an actor
uses, keeps its own size, layout, linked windows (trade, paperdoll editor) and observer access, and does not have to
fit dnd5e's sheet structure or the third-party code that hooks into it. The GM runs a large module set we cannot
test, and a registered sheet either inherits that code's DOM work against our markup (a dnd5e subclass) or loses it
(a fresh `ActorSheetV2`); the window leaves the actor's own sheet and everything attached to it untouched.

## Considered Options

- Fresh `ActorSheetV2`, registered but not default (the Tidy 5e model).
- Subclass of dnd5e's `CharacterActorSheet` or `BaseActorSheet`.
- Both: one sheet class, selectable per actor and also openable as a window.

## Consequences

- No sheet registration and no preparatory code for it in 2.0; revisiting this needs its own ticket.
- The window never replaces how a sheet opens: no wrapping of the actor directory or token double-click. Opening it
  leaves the actor's sheet as it is.

## Update: Non-GM sheet-open redirect

Revisited the second consequence to support opening the AIM window by default when non-GM players open a supported
actor sheet (Actors Directory click, token double-click, `@UUID` links, etc.), without altering ADR 0002's core
architecture decision:

- AIM still does **not** register via `DocumentSheetConfig.registerSheet` and stores no per-actor sheet flag on documents.
- Wrapping `ActorSheetV2.prototype.render` (and legacy AppV1 `ActorSheet.prototype.render`, using `libWrapper` `MIXED` when
  active) redirects forced initial renders strictly when `!game.user.isGM`, the client setting
  `replaceActorSheet` is enabled (default `true`), the actor/permission passes `isPrimaryActorSheet`, and the sheet is
  not already rendered.
- GM actions are never redirected, and AIM's own menu actions (`"Open character sheet"`, Special traits, Bastion) bypass
  the redirect via `renderVanillaActorSheet`.
- Third-party modules do not see inside the window; anything we want from them goes through the dnd5e API (ADR 0001)
  or hooks we choose to call ourselves.
