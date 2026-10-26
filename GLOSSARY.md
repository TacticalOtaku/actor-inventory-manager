# Actor Inventory Manager

A Foundry VTT module for dnd5e that gives players one window for their actor's gear, paperdoll and trades, and is
growing into a replacement for the dnd5e character sheet.

## Language

**Supported actor**:
An actor the module opens its window for: a character, a vehicle or an NPC with a player owner; never a group.
_Avoid_: managed actor, AIM actor

**Actor window**:
The module's own window for a supported actor, opened beside whatever sheet the actor uses; a full character sheet
for a character, a simplified shell for a vehicle or NPC.
_Avoid_: sheet, inventory window, AIM window

**Vanilla sheet**:
The actor sheet the dnd5e system ships, which the module aims to make unnecessary for everyday play.
_Avoid_: default sheet, system sheet, dnd5e sheet

**Mock**:
A self-contained HTML design draft under `design/`, paired with a notes file of element behaviours; the basis for
the spec, never the spec itself.
_Avoid_: mockup, prototype, design

**Paperdoll**:
The figure of an actor with equipment slots around it, where items are worn and wielded.
_Avoid_: doll, equipment screen

**Doll preset**:
A named set of paperdoll slots the GM assigns per actor; the module ships standard presets and the GM can build more.
_Avoid_: template, slot template, layout

**Trade**:
An exchange of items and coins between two players' actors, confirmed by both and carried out by the GM.
_Avoid_: swap, exchange, transfer
