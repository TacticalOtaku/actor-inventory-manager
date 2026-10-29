# AIM: Actor Window

**AIM, formerly Actor Inventory Manager & Paperdoll.** A full actor window for D&D 5e on Foundry VTT: paperdoll,
equipment rules, spells, features, effects and player trading, beside whatever sheet the actor uses. It never replaces
the sheet: the window opens next to it, and «Open character sheet» in its menu reaches the sheet with everything
other modules add there.

Foundry VTT 14, D&D 5e 5.3.3 or newer. Release notes: [CHANGELOG.md](CHANGELOG.md).

> **Updating from 1.9:** back up your world first. The first start of 2.0 moves the world's data once (quick slots to
> favorites, own dolls to presets, open trades cancelled) and whispers the GM a report; nothing 1.9 wrote is deleted,
> so the world can still go back to 1.9.x.

---

## Features

- **One window per actor**, opened from **AIM** in the sheet's ⋮ menu or the `I` key. It picks its layout
  from its own width: compact, narrow, standard, and wide with an inspector. Observers get a read-only window.
- **The rail**: hit points (type −7, +5, or t8 for temporary HP), hit dice, spell slots, AC, initiative, speed, effects,
  inspiration, exhaustion, concentration, rests and dnd5e favorites. Each block can be hidden.
- **Overview and biography**: skills, saves, tools, defenses and senses with dnd5e's rolls and dialogs; the biography
  in dnd5e's own fields.
- **Equipment with the paperdoll**: slots by figure (humanoid, beast, wagon, ship, airship), the two-handed lock,
  attunement sockets, nested containers, filters, sorting, manual order, a purse and the load meter. A GM preset
  editor shapes the figure, the slots and the attunement limit, per world or per actor.
- **Spells**: slots as gems, prepared spells with the class limit, the spellbook by circle, innate and at-will spells,
  casting through dnd5e's own dialog.
- **Features and actions**: features by origin for characters, actions by cost for NPCs and vehicles.
- **Effects and conditions**: dnd5e's categories, the conditions grid, enable and disable, the effect menu.
- **Tooltip cards** for items, spells, effects, rules and damage types, with nesting and pinning; damage types play
  a small scene in their colour.
- **NPC and vehicle windows**: challenge rating, legendary actions and resistance; damage and mishap thresholds,
  cargo in tons, crew and passengers.
- **Player trading** in a panel beside the inventory, authorised by the GM, with coins or Item Piles currencies.
- **Items from outside**: drop items, folders and effects from the sidebar, compendiums, chat, journals or another
  actor onto any tab; they go through the actor's sheet, so dnd5e's rules (stacking, advancement) hold.
- **Look**: Night, Parchment or Auto themes, six accents, two densities, and three motion levels (All, Restrained,
  Off); the system's reduced-motion setting caps them. Interface fonts are bundled; nothing is fetched from a CDN.

### Works with

Each one is optional and detected; without it the window uses its own rules.

- *midi-qol* — its automation-only activities stay out of the lists; damage typed into HP goes through it.
- *Tidy 5e Sheets* (the 5.3.x line) — the AIM button sits in its header too; drops work with it.
- *Item Piles* (3.3+, with «Item Piles: D&D 5e») — currencies, payment with change, «Give to character».
- *Weighty Containers* — container load, weight reduction and restrictions.
- *SC - Item Rarity Colors* — rarity and spell-school colours where the GM switched them on.

---

## Installation

### Via Manifest URL
In Foundry VTT Setup > **Add-on Modules** > **Install Module**, paste the Manifest URL:
```
https://raw.githubusercontent.com/TacticalOtaku/actor-inventory-manager/main/module.json
```

---

## Using player trading

Open your character's window, go to **Equipment** and press **Trade**. Choose another online player's character and
start a trade; the invited player gets a notification and a dot on their Trade button. Offer items with ⇄ on a row or
by dragging a row onto your offer, and set coins. Edits are sent by themselves; any change clears both
confirmations. Confirm when the offers suit you; cancelling ends the trade for both. An active GM authorises the
transfer. Received items arrive marked «New».

---

## Development

### Trading in detail

Open your character's window, go to **Equipment** and press **Trade**; the panel opens beside the inventory. Choose another online player's character and start a trade; the invited player gets a notification and a dot on their Trade button. Add items with ⇄ on an inventory row (one at a time) or by dragging a row onto your offer (the whole stack), and set coins. There is no Save step: an edit is sent by itself half a second after the last change, and any change clears both confirmations. Confirming is accepting and can be withdrawn; cancelling ends the trade for both sides at once. A free gift requires the recipient's confirmation too. An active GM is required to authorize the transfer to both actors and sees the trade read-only; players do not need ownership of each other's sheets.

Only one trade per actor can be active. Nonempty containers must be emptied first; individual contained items can be offered. Received items are unequipped, unattuned, detached from their former container, have no AIM equipment-slot assignment, and are marked «New» until opened. Item Piles currency items appear as currency rather than being offered twice as ordinary items.

With Item Piles active, custom currencies, exchange rates and change are handled by its [official currency API](https://github.com/fantasycalendar/FoundryVTT-ItemPiles/blob/master/src/API/api.js). Different currency definitions on the participants, changed settings, or an unavailable active API stop the trade. There is no silent fallback mid-trade. With Item Piles absent, enter exact quantities of `pp`, `gp`, `ep`, `sp`, and `cp`; this mode does not automatically make change.

### Interrupted trades

Before any assets move, the GM saves both inventories and currency attributes in a **GM-only recovery journal**. A normal transfer error triggers restoration. If restoration fails or the GM disconnects during execution, the trade stays blocked and is never retried automatically. A GM can open either participant's Trade panel and select **Restore inventories** after checking the journal; an interrupted preparation that never debited anything offers **Lift the lock** instead. The confirmation explains that this replaces inventories and currency with the saved state, including any later edits. Successful trades and successful restores remove their recovery journal.

Recovery payloads are encoded as JSON inside the private journal flag so document processing cannot rewrite currency paths or mutate the comparison baseline. Asset comparisons ignore object property ordering. If assets really change before transfer, the trade is cancelled without restoring anything; the GM console identifies affected item IDs and currency paths. Older object-shaped recovery records remain readable.

Foundry does not provide a database transaction spanning both actors. Keep other macros and GM inventory edits away from the participants during execution and recovery. Local edit guards and snapshots provide coordinated transfer and recovery, not database-level atomicity.

### Foundry acceptance checks

The full live check, with the module sets to run it on, is in [docs/live-check.md](docs/live-check.md). The trade
checks below are part of it. Use two player accounts and one GM in a test world:

1. Trade part of a stack for coins; confirm one side only and verify nothing moves. Edit the other offer and verify confirmations reset. Confirm both and verify quantities and balances.
2. Repeat without Item Piles using standard coins, then with the campaign's configured attribute and item currencies. Check exact receipt amounts and Item Piles change.
3. Cancel a trade, exhaust an offered item, disconnect a participant, and change currency settings. Verify no invalid transfer completes.
4. If deliberately testing interrupted execution, use disposable actors and verify the GM recovery path before resuming normal play.

Automated tests use in-memory Foundry document doubles.

```bash
npm install
npm run check    # ESLint and the unit tests (no Foundry required)
npm run deploy   # copy the module into the local Foundry Data/modules folder
npm run release  # check, then dist/actor-inventory-manager-v<version>.zip
```

`npm run deploy` targets `%LOCALAPPDATA%\FoundryVTT\Data` by default; override it with
`--data <path>` or the `FOUNDRY_DATA` environment variable (the Foundry `Data` folder).
Reload Foundry (F5) afterwards. Node.js 24 or newer is required.

See [docs/architecture.md](docs/architecture.md) for the module layout, the public API and
hooks, how doll presets and equipment rules work, and the dnd5e data-shape differences the
code adapts to.

---

## License
This project is licensed under the [MIT License](LICENSE).
