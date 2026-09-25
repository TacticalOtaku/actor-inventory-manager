# Actor Inventory Manager & Paperdoll (AIM)

A modern, highly immersive RPG-style Actor Inventory Window & Equipment Paperdoll module for **Foundry VTT** (D&D 5e v5.3.3+ on Foundry v14+).

Release notes: [CHANGELOG.md](CHANGELOG.md).

---

## Features

- **Prepared Spells**: the Spells drawer opens with a segment of the spells prepared for the day (including always-prepared ones), ordered by level, above the regular level groups.
- **Player Trading**: a second expandable drawer beside Spells, with two-sided item and currency offers, partial stacks, gifts, and confirmation by both participants. Active Item Piles supplies custom currency definitions and payment/transfer calculations. Without Item Piles, trading uses standard D&D5e denominations.
- **Actor Scope**: GM-only NPCs are excluded from sheet buttons, hotkeys, inventory/editor entry points, item actions, and equipment enforcement. Player-owned NPCs remain supported.

- **Interactive Equipment Paperdoll**:
  - Anatomical equipment slots layout (Head, Neck, Cloak, Armor, Hands, Waist, Boots, Rings, Weapons).
  - Multi-tier Paperdoll presets: D&D 2024 Rules and Classic D&D 2014.
  - In-game GM Paperdoll Editor to customize slot layouts, add custom slots, and configure slot rules.
  - Auto-locking of off-hand when equipping Two-Handed weapons.
  - Solar Attunement bar with quick attunement tracking.

- **Vitals & Encumbrance HUD**:
  - HP, Temp HP, Armor Class, Speed, Initiative, and Passives display.
  - Multi-tier dynamic carrying capacity & encumbrance meter with imperial/metric support.
  - Currency purse with coin breakdown and total gold value.

- **Category Filter Tabs & Instant Search**:
  - All, Weapons, Armor, Consumables, Containers, and Loot with live count badges.
  - Real-time instant search filter and multi-criteria sorting (Name, Weight, Value, Rarity).

- **Weighty Containers Integration**:
  - Expandable nested container trees for Bags and Backpacks.
  - Weight capacity and weight reduction badge support.
  - Full compatibility with the *Weighty Containers* module.

- **SC - Item Rarity Colors Integration**:
  - Seamless visual integration with *SC - Item Rarity Colors* & *Custom DND5E*.
  - Vibrant horizontal rarity gradients, glowing thumbnails, and magical school spell effects.

- **Dual Theme Support**:
  - Dark Fantasy (Midnight Obsidian & Gold).
  - Light Parchment (Ancient Gilded Tome).

---

## Installation

### Via Manifest URL
In Foundry VTT Setup > **Add-on Modules** > **Install Module**, paste the Manifest URL:
```
https://raw.githubusercontent.com/TacticalOtaku/actor-inventory-manager/main/module.json
```

---

## Requirements & Compatibility
- **Foundry VTT**: v14+
- **System**: D&D 5e (v5.3.3+)
- **Optional Recommended Modules**:
  - *Item Piles* (3.3.0+) for custom currencies and trading
  - *SC - Item Rarity Colors*
  - *Weighty Containers* (3.5.0+ for API v2 weights)

---

---

## Development

### Using player trading

Open your character's AIM inventory and select the **Trade** button (handshake) on the window's right edge. Choose another online player's world actor and start a trade. Both players can enter item quantities and currency, save their offer, and confirm. Saving a changed offer clears both confirmations. A free gift requires the recipient's confirmation too. An active GM is required to authorize the transfer to both actors; players do not need ownership of each other's sheets.

Only one trade per actor can be active. Nonempty containers must be emptied first; individual contained items can be offered. Received items are unequipped, unattuned, detached from their former container, and have no AIM equipment-slot assignment. Item Piles currency items appear as currency rather than being offered twice as ordinary items.

With Item Piles active, custom currencies, exchange rates and change are handled by its [official currency API](https://github.com/fantasycalendar/FoundryVTT-ItemPiles/blob/master/src/API/api.js). Different currency definitions on the participants, changed settings, or an unavailable active API stop the trade. There is no silent fallback mid-trade. With Item Piles absent, enter exact quantities of `pp`, `gp`, `ep`, `sp`, and `cp`; this mode does not automatically make change.

### Interrupted trades

Before any assets move, the GM saves both inventories and currency attributes in a **GM-only recovery journal**. A normal transfer error triggers restoration. If restoration fails or the GM disconnects during execution, the trade stays blocked and is never retried automatically. A GM can open either participant's Trade drawer and select **Restore before trade** after checking the journal. The confirmation explains that this replaces inventories and currency with the saved state, including any later edits. Successful trades and successful restores remove their recovery journal.

Recovery payloads are encoded as JSON inside the private journal flag so document processing cannot rewrite currency paths or mutate the comparison baseline. Asset comparisons ignore object property ordering. If assets really change before transfer, the trade is cancelled without restoring anything; the GM console identifies affected item IDs and currency paths. Older object-shaped recovery records remain readable.

Foundry does not provide a database transaction spanning both actors. Keep other macros and GM inventory edits away from the participants during execution and recovery. Local edit guards and snapshots provide coordinated transfer and recovery, not database-level atomicity.

### Foundry acceptance checks

Use two player accounts and one GM in a test world before relying on the feature in a campaign:

1. Verify a GM-only NPC has no AIM button and is unaffected by equipment changes or the inventory hotkey. Check a player character still opens normally.
2. Trade part of a stack for coins; confirm one side only and verify nothing moves. Edit the other offer and verify confirmations reset. Confirm both and verify quantities and balances.
3. Repeat without Item Piles using standard coins, then with the campaign's configured attribute and item currencies. Check exact receipt amounts and Item Piles change.
4. Cancel a trade, exhaust an offered item, disconnect a participant, and change currency settings. Verify no invalid transfer completes.
5. Inspect both themes and a narrow window. If deliberately testing interrupted execution, use disposable actors and verify the GM recovery path before resuming normal play.

Automated tests use in-memory Foundry document doubles. `tools/preview-trade.mjs` renders the actual templates with fictional fixtures and checks them in Playwright; it does not modify a running world. Pass a Handlebars CommonJS runtime, an output directory, and a Playwright package directory to run it.

```bash
npm test        # run the unit tests (no Foundry required)
npm run sync    # copy the module into the local Foundry data directory
```

`npm run sync` targets `%LOCALAPPDATA%\FoundryVTT` by default; override it with
`--data <path>` or the `FOUNDRY_DATA` environment variable. Reload Foundry (F5)
afterwards.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the module layout, the public API and
hooks, how to register custom slots and equipment rules, and the dnd5e data-shape
differences the code adapts to.

---

## License
This project is licensed under the [MIT License](LICENSE).
