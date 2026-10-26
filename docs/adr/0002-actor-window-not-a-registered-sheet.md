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
- Third-party modules do not see inside the window; anything we want from them goes through the dnd5e API (ADR 0001)
  or hooks we choose to call ourselves.
