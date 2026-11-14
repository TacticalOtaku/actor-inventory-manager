<div align="center">

# AIM: Actor Window

**A full character, NPC & vehicle window for D&D 5e on Foundry VTT** — paperdoll, equipment rules, spells, features, effects, and safe player trading beside whatever actor sheet you use.

[![GitHub Release](https://img.shields.io/github/v/release/TacticalOtaku/actor-inventory-manager?label=Release&color=b8860b)](https://github.com/TacticalOtaku/actor-inventory-manager/releases/latest)
[![CI](https://github.com/TacticalOtaku/actor-inventory-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/TacticalOtaku/actor-inventory-manager/actions/workflows/ci.yml)
[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-14-ff6400)](https://foundryvtt.com/)
[![D&D 5e](https://img.shields.io/badge/D%26D%205e-5.3.3%2B-c62828)](https://github.com/foundryvtt/dnd5e)
[![Languages](https://img.shields.io/badge/Languages-EN%20%7C%20RU-2e7d32)](lang/)
[![License: MIT](https://img.shields.io/badge/License-MIT-3b82f6)](LICENSE)

[Installation](#installation) · [Features](#features) · [Player Trading & Gifts](#player-trading--gifts) · [Integrations](#integrations) · [Customization](#customization) · [Development](#development)

</div>

---

AIM never replaces the system or third-party sheet — it opens alongside it from **AIM** in the sheet's `⋮` menu or with the **`I`** key, while keeping `"Open character sheet"` one click away in its own menu. Full release history lives in [CHANGELOG.md](CHANGELOG.md).

> [!IMPORTANT]
> **Updating from 1.9:** back up your world first. On the first launch of 2.0+, the GM client runs an additive migration once (quick slots → favorites, custom actor dolls → world presets, open trades cancelled) and whispers a report to the GM. Nothing written by 1.9 is deleted, so worlds can still return to 1.9.x if needed.

---

## Installation

### Via Manifest URL (Recommended)

In Foundry VTT Setup → **Add-on Modules** → **Install Module**, paste the Manifest URL:

```text
https://raw.githubusercontent.com/TacticalOtaku/actor-inventory-manager/main/module.json
```

### Manual / Offline Archive

Download `actor-inventory-manager-v<version>.zip` from [GitHub Releases](https://github.com/TacticalOtaku/actor-inventory-manager/releases/latest) and extract it into your Foundry `Data/modules/actor-inventory-manager` folder.

**Requirements:** Foundry VTT **14** (verified on `14.367`), D&D 5e **`5.3.3+`**.

---

## Features

### Adaptive Actor Window
- **Supported actors:** **Characters**, **Vehicles**, and **Player-owned NPCs** (GM-only NPCs and group actors are intentionally untouched).
- **Permissions & tokens:** **Observers** open a read-only `"View only"` window; **Owners** and the GM can edit. Unlinked tokens get independent windows keyed by UUID.
- **Responsive layouts:** Automatically adapts to the window's own width — **Compact** (`< 420 px`, rail only), **Narrow** (`420–759 px`, top rail strip), **Standard** (`760–1319 px`, rail + content), and **Wide** (`≥ 1320 px`, rail + content + live inspector) — plus a one-click collapse-to-column toggle.
- **Keyboard navigation:** Press **`I`** to toggle the controlled token's (or assigned character's) window. Navigate tabs with **`ArrowLeft`**, **`ArrowRight`**, **`Home`**, and **`End`**, with preserved focus across settings drawer and compact layout transitions.

### Side Rail & Inline Vitals
- **Level orb & XP card:** Animated liquid orb that glows as XP fills and lets you level up on click when ready, plus quick XP steps (`+50`, `+100`, `+250`, `+1000`, `Add`, `Set`).
- **Inline edits with validation:** Edit **HP** (`−7` damage, `+5` healing, `20` set, `t8` temporary HP), **coins**, and **feature uses** directly in place with syntax hints, `Enter`/`Escape` support, and draft preservation across background redraws.
- **Combat & survival:** AC hover breakdown (armor, Dexterity, shield, bonuses, cover), hit dice, spell slot tracks, initiative, speed, temporary effects, inspiration, exhaustion, concentration, short/long rests, and reorderable **dnd5e Favorites**.
- **NPC & Vehicle rails:** NPCs show CR and legendary action/resistance pools; vehicles show damage & mishap thresholds, speeds, cargo load, and crew/passenger/draft-animal rosters.
- **Per-player visibility:** Every rail block (except HP) can be toggled on or off in the window's settings drawer.

### Paperdoll & Equipment Rules
- **9 built-in presets across 5 figures:** `Humanoid` (`Standard 2024`, `Standard 2014`), `Beast`, `Wagon` (`hold` and `tack & weapon`), `Ship` (`hold` and `gun ports`), and `Airship` (`hold` and `rigging`).
- **Slot mechanics:** Two-handed weapons lock the off hand automatically; attunement sockets track and respect actor attunement caps; slotless worn items stay visible in a compact strip.
- **GM Preset Editor:** Customize figures, slot placement (`Left`, `Right`, `Under the doll`, `By order`), slot rules, and attunement limits per world or per actor — with JSON import/export.
- **Shared Enforcement Modes:** Choose **Strict Block**, **Smart Auto-Swap**, or **Warn Only** in module settings. Rules are enforced consistently from both the Actor window and the actor's native sheet.
- **Inventory management:** Switch between **List**, **Cards**, and **Icons only** views; sort by name, weight, price, rarity, or manual order; filter by `Equipped` / `Attuned`; manage nested containers, purse totals, and encumbrance meters; or use **"Drop on the ground"** with Item Piles.

### Window Tabs

| Tab | What it provides |
| --- | --- |
| **Overview** | Skills, saving throws, tools, damage/condition defenses, passive scores, senses, proficiencies, and native dnd5e config dialogs |
| **Equipment** | Paperdoll, attunement sockets, nested container trays, inventory views/filters, purse, encumbrance meter, and the Trade panel |
| **Spells** | Interactive spell slot gems, class preparation limits, spellbook by circle, innate/at-will lists, casting dialogs, auto-minimize on spell template placement |
| **Features / Actions** | Features grouped by origin for characters; actions grouped by action cost for NPCs & vehicles, with inline uses and d6 recharge rolls |
| **Effects** | dnd5e effect categories (`Temporary`, `Passive`, `Inactive`, `Unavailable`), conditions grid, switches, and context menu |
| **Biography** | Character traits, appearance, and ProseMirror biography fields, held safely against background redraws while typing |

### Tooltips, Visual Effects & Privacy
- **Nested & pinnable tooltip cards:** Hover items, spells, effects, rules, or damage types to inspect cards up to 4 levels deep, pin them, and drag them around the workspace. Damage types play PixiJS scenes for all 13 dnd5e damage types plus a generic fallback.
- **Reactive & ambient VFX:** Subtle sprite bursts and animations for hits, heals, temporary HP, spent slots/hit dice, starred favorites, coin updates, rests, and refusals.
- **Unidentified item privacy:** Players never see an unidentified item's price, rarity, properties, charges, or magic bonuses in rows, the doll, the inspector, or tooltip cards.
- **Native external drops:** Items, folders, and effects dragged from the sidebar, compendiums, chat, journals, or your other characters route through the actor's sheet so dnd5e stacking, scroll conversion, and advancement rules apply cleanly.

---

## Player Trading & Gifts

Open your character's window, go to **Equipment**, and click **Trade**:

- **Two-way Trade or one-way Gift:** Select another online player's character (`Offer trade` or `Give`). Invited players receive a notification and an indicator dot on their Trade button.
- **Offers without friction:** Click **`⇄`** on an inventory row to offer one item, drag a row into your offer to offer the whole stack, and enter coins (`pp`, `gp`, `ep`, `sp`, `cp` or active Item Piles currencies). Edits send automatically after a short pause, and any change resets confirmations.
- **Weight after the trade:** Live carried-weight preview shows how the exchange affects your encumbrance and highlights load-tier changes.
- **Safe delivery:** Once both sides confirm (or the recipient accepts a gift), an active GM authorizes the transfer. Received items arrive unequipped, unattuned, detached from containers, and marked **`New`** until opened.

<details>
<summary><strong>Technical details: GM authorization, snapshots & recovery</strong></summary>

- **GM-authorized queue:** Players never need ownership of each other's sheets. One connected GM acts as the serialized coordinator; requests run through authenticated `User` flags, and no module socket payload authorizes writes.
- **Pre-trade snapshots & rollback:** Before any debit, the GM locks items and currency on both actors (HP, spell slots, and XP remain playable) and stores a full JSON snapshot in a **GM-only private journal**. A normal transfer error automatically rolls inventories and currencies back.
- **Interrupted trade recovery:** If a transfer or rollback is interrupted, the trade remains locked rather than retrying blindly. A GM can open either participant's Trade panel and use **Restore inventories** (after checking the journal) or **Lift the lock** (if preparation stopped before any debit).
- **Non-transactional Foundry scope:** Foundry VTT has no multi-actor database transaction; avoid macros or manual GM inventory edits on participating actors during active execution or recovery.

</details>

---

## Integrations

All integrations are optional and auto-detected; without them, AIM falls back to its own rules.

| Module | Compatibility | Integration behavior |
| --- | --- | --- |
| **midi-qol** | Optional | Filters automation-only activities out of lists/favorites; routes inline HP damage through `dnd5e.preApplyDamage` |
| **Tidy 5e Sheets** | `5.3.x` line | Adds the **AIM** button to Tidy's sheet menu and preserves native drop behavior |
| **Item Piles** | `3.3.0+` *(with `itempilesdnd5e`)* | Enables custom currencies & automatic change in trades, `"Give to character"`, and `"Drop on the ground"` |
| **Weighty Containers** | `3.5.0+` *(`3.10+` load rules)* | Delegates container load meters, weight reductions, drop restrictions, and post-trade carried weight |
| **SC - Item Rarity Colors** | `3.0.18+` | Applies SC rarity gradients and spell-school styling while keeping row buttons and parchment tags legible |

---

## Customization

Personal window preferences live directly in the window's **Settings drawer** (`⚙`); GM rules live in Foundry's Module Settings.

| Setting | Options | Scope |
| --- | --- | --- |
| **Theme** | `Night` · `Parchment` · `Auto` *(follows Foundry's colour scheme)* | User |
| **Accent** | `Brass` · `Embers` · `Arcane` · `Forest` · `Frost` · `Rose` | User |
| **Density** | `Comfortable` · `Compact` | User |
| **Side column & Tabs** | Toggle individual rail blocks and sheet tabs (`Equipment` always stays visible) | User |
| **Motion** | `All` · `Restrained` *(reactive only)* · `Off` *(fades only; capped by OS reduced motion & Foundry low performance)* | Client |
| **Decorative fonts** | Bundled **Onest** variable font (`assets/fonts/`, zero external CDN requests) | Client |
| **Equipment Rules & Doll** | `Enforcement Mode` (`Block` / `Auto-Swap` / `Warn`), `Portrait Backdrop`, `Auto-Reconcile Slots`, `AIM in sheet menu` | World / Client |

---

## Development

Requires **Node.js 24+** (`npm install`). Automated checks run on in-memory Foundry document doubles — no running Foundry instance is needed.

| Command | Purpose |
| --- | --- |
| `npm run check` | Run ESLint and the Node unit test suite |
| `npm run deploy` | Copy module files to local Foundry `Data/modules/actor-inventory-manager` (`--data <path>` or `FOUNDRY_DATA`) |
| `npm run release` | Run `npm run check`, validate `module.json`, and build `dist/actor-inventory-manager-v<version>.zip` |
| `npm run vendor` | Refresh bundled Onest font files and `styles/theme/fonts.css` |

GitHub Actions ([ci.yml](.github/workflows/ci.yml)) runs linting, unit tests, and Foundry package validation on pushes to `main`, pull requests, and manual dispatches.

### Project Docs
- [docs/architecture.md](docs/architecture.md) — module layering, dnd5e data-model adapters, extension hooks, and public API
- [docs/live-check.md](docs/live-check.md) — manual verification checklist across Foundry module combinations
- [GLOSSARY.md](GLOSSARY.md) — domain vocabulary
- [CHANGELOG.md](CHANGELOG.md) — version-by-version release notes
- [LICENSE](LICENSE) — MIT License
