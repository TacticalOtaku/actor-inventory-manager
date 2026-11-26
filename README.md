<div align="center">

**English** · [Русский](README.ru.md)

# AIM: Actor Window

**A full character, NPC & vehicle window for D&D 5e on Foundry VTT**

Paperdoll, equipment rules, loadouts, spells, features, effects, hover item comparisons, and GM-safe player trading — beside whatever actor sheet you use.

[![Release](https://img.shields.io/github/v/release/TacticalOtaku/actor-inventory-manager?style=flat-square&label=Release&color=b8860b)](https://github.com/TacticalOtaku/actor-inventory-manager/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/TacticalOtaku/actor-inventory-manager/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/TacticalOtaku/actor-inventory-manager/actions/workflows/ci.yml)
[![Foundry VTT](https://img.shields.io/badge/Foundry_VTT-v14_%2814.367%29-ff6400?style=flat-square)](https://foundryvtt.com/)
[![D&D 5e](https://img.shields.io/badge/D%26D_5e-5.3.3%2B-c62828?style=flat-square)](https://github.com/foundryvtt/dnd5e)
[![Languages](https://img.shields.io/badge/Languages-EN_%7C_RU-2e7d32?style=flat-square)](lang/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-3b82f6?style=flat-square)](LICENSE)

[Installation](#installation) · [Screenshots](#screenshots) · [Features](#features) · [Player Trading & Gifts](#player-trading--gifts) · [Integrations](#integrations) · [Customization](#customization) · [Development](#development)

</div>

---

## Installation

In Foundry VTT (**Setup → Add-on Modules → Install Module**), paste the **Manifest URL**:

```text
https://github.com/TacticalOtaku/actor-inventory-manager/releases/latest/download/module.json
```

**Requirements:** Foundry VTT **14** (verified `14.367`), D&D 5e **`5.3.3+`**.  
**Manual install:** Download `actor-inventory-manager-v<version>.zip` from [GitHub Releases](https://github.com/TacticalOtaku/actor-inventory-manager/releases/latest) and extract it into `Data/modules/actor-inventory-manager`.

> [!IMPORTANT]
> **Updating from 1.9:** back up your world first. On the first launch of 2.0+, the GM client runs an additive migration once (quick slots → favorites, custom actor dolls → world presets, open trades cancelled) and whispers a report to the GM. Nothing written by 1.9 is deleted, so worlds can still return to 1.9.x if needed.

---

## Screenshots

![AIM Actor Window Night theme with paperdoll, loadouts, and containers](docs/screenshots/equipment-paperdoll.png)
![Side-by-side hover item comparison tooltip with stat deltas](docs/screenshots/item-compare-tooltip.png)
![Warm Parchment light theme and Spells tab](docs/screenshots/parchment-theme.png)

---

## Overview

AIM keeps the system or third-party sheet intact — for players, opening a supported actor opens AIM automatically (configurable in Module Settings, never affecting the GM), alongside **AIM** in the sheet's `⋮` menu and the **`I`** key, while keeping `"Open character sheet"` one click away in AIM's menu. Full release history lives in [CHANGELOG.md](CHANGELOG.md).

---

## Features

### Adaptive Actor Window

- **Supported actors:** **Characters**, **Vehicles**, and **Player-owned NPCs** (GM-only NPCs and group actors are intentionally untouched).
- **Permissions & tokens:** **Observers** open a read-only `"View only"` window; **Owners** and the GM can edit. Unlinked tokens get independent windows keyed by UUID.
- **Player sheet-open redirect:** With `Open AIM instead of actor sheet` enabled (default), clicking or double-clicking a supported actor (or opening its `@UUID` link) opens AIM directly for players while leaving GM actions, unsupported actors (groups, GM NPCs, `LIMITED`), and AIM's `"Open character sheet"` menu entry untouched.
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
- **Equipment Loadouts:** Save up to 12 named gear sets with custom icons (e.g. _Sword & Shield_, _Bow_, _Camp_) and switch between them in one click under the active equipment rules while leaving backpacks, natural weapons, and ammunition untouched.
- **GM Preset Editor:** Customize figures, slot placement (`Left`, `Right`, `Under the doll`, `By order`), slot rules, and attunement limits per world or per actor — with JSON import/export.
- **Shared Enforcement Modes:** Choose **Strict Block**, **Smart Auto-Swap**, or **Warn Only** in module settings. Rules are enforced consistently from both the Actor window and the actor's native sheet.
- **Inventory management:** Switch between **List**, **Cards**, and **Icons only** views; sort by name, weight, price, rarity, or manual order; filter by `Equipped` / `Attuned`; manage nested containers, purse totals, and encumbrance meters; or use **"Drop on the ground"** with Item Piles.

### Window Tabs

| Tab                    | What it provides                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Overview**           | Skills, saving throws, tools, damage/condition defenses, passive scores, senses, proficiencies, and native dnd5e config dialogs                              |
| **Equipment**          | Paperdoll, attunement sockets, nested container trays, inventory views/filters, purse, encumbrance meter, and the Trade panel                                |
| **Spells**             | Interactive spell slot gems, class preparation limits, spellbook by circle, innate/at-will lists, casting dialogs, auto-minimize on spell template placement |
| **Features / Actions** | Features grouped by origin for characters; actions grouped by action cost for NPCs & vehicles, with inline uses and d6 recharge rolls                        |
| **Effects**            | dnd5e effect categories (`Temporary`, `Passive`, `Inactive`, `Unavailable`), conditions grid, switches, and context menu                                     |
| **Biography**          | Character traits, appearance, and ProseMirror biography fields, held safely against background redraws while typing                                          |

### Tooltips, Visual Effects & Privacy

- **Nested, pinnable & comparing tooltip cards:** Hover items, spells, effects, rules, or damage types to inspect cards up to 4 levels deep, pin them, and drag them around the workspace. Hovering an unequipped backpack item shows a side-by-side comparison card for what is currently worn in the target slot (with AC, Attack, and average Damage deltas), toggleable per user in Settings. Damage types play PixiJS scenes for all 13 dnd5e damage types plus a generic fallback.
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

| Module                      | Compatibility                      | Integration behavior                                                                                                  |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **midi-qol**                | Optional                           | Filters automation-only activities out of lists/favorites; routes inline HP damage through `dnd5e.preApplyDamage`     |
| **Tidy 5e Sheets**          | `5.3.x` line                       | Adds the **AIM** button to Tidy's sheet menu and preserves native drop behavior                                       |
| **Item Piles**              | `3.3.0+` _(with `itempilesdnd5e`)_ | Enables custom currencies & automatic change in trades, `"Give to character"`, and `"Drop on the ground"`             |
| **Weighty Containers**      | `3.5.0+` _(`3.10+` load rules)_    | Delegates container load meters, weight reductions, drop restrictions, and post-trade carried weight                  |
| **SC - Item Rarity Colors** | `3.0.18+`                          | Applies SC rarity gradients and spell-school styling while keeping row buttons and parchment tags legible             |
| **libWrapper**              | `1.12.0+` _(optional)_             | Uses `MIXED` sheet-open wrapping for clean compatibility with other sheet modules (falls back gracefully when absent) |

---

## Customization

Personal window preferences live directly in the window's **Settings drawer** (`⚙`); GM rules live in Foundry's Module Settings.

| Setting                    | Options                                                                                                                                                  | Scope          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Theme**                  | `Night` · `Parchment` · `Auto` _(follows Foundry's colour scheme)_                                                                                       | User           |
| **Accent**                 | `Brass` · `Embers` · `Arcane` · `Forest` · `Frost` · `Rose`                                                                                              | User           |
| **Density**                | `Comfortable` · `Compact`                                                                                                                                | User           |
| **Side column & Tabs**     | Toggle individual rail blocks and sheet tabs (`Equipment` always stays visible)                                                                          | User           |
| **Motion**                 | `All` · `Restrained` _(reactive only)_ · `Off` _(fades only; capped by OS reduced motion & Foundry low performance)_                                     | Client         |
| **Decorative fonts**       | Bundled **Onest** variable font (`assets/fonts/`, zero external CDN requests)                                                                            | Client         |
| **Equipment Rules & Doll** | `Enforcement Mode` (`Block` / `Auto-Swap` / `Warn`), `Portrait Backdrop`, `Auto-Reconcile Slots`, `Open AIM instead of actor sheet`, `AIM in sheet menu` | World / Client |

---

## Development

Requires **Node.js 24+** (`npm install`). Automated checks run on in-memory Foundry document doubles — no running Foundry instance is needed.

| Command           | Purpose                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run check`   | Run ESLint and the Node unit test suite                                                                       |
| `npm run deploy`  | Copy module files to local Foundry `Data/modules/actor-inventory-manager` (`--data <path>` or `FOUNDRY_DATA`) |
| `npm run package` | Validate `module.json` and build `dist/actor-inventory-manager-v<version>.zip`                                |
| `npm run release` | Run `npm run check` and `npm run package`                                                                     |
| `npm run vendor`  | Refresh bundled Onest font files and `styles/theme/fonts.css`                                                 |

GitHub Actions ([ci.yml](.github/workflows/ci.yml)) runs linting, unit tests, and Foundry package validation on pushes to `main` and manual dispatches. Tagged releases (`v*`) build and publish the ZIP archive and `module.json` via [release.yml](.github/workflows/release.yml).

### Project Docs

| Document                                     | Purpose                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| [API.md](API.md)                             | Frozen public API, loadouts, equipment rule hooks, and macro examples       |
| [docs/architecture.md](docs/architecture.md) | Module layering, dnd5e data-model adapters, extension hooks, and public API |
| [docs/live-check.md](docs/live-check.md)     | Manual verification checklist across Foundry module combinations            |
| [GLOSSARY.md](GLOSSARY.md)                   | Domain vocabulary                                                           |
| [CHANGELOG.md](CHANGELOG.md)                 | Version-by-version release notes                                            |
| [CONTRIBUTING.md](CONTRIBUTING.md)           | Issue reporting guidelines                                                  |

---

## AI Disclosure

AI-assisted tools were used during development for tasks such as code drafting, refactoring, tests, documentation, and localization drafts. All architecture, code, behavior, user-facing copy, and Russian/English translations are reviewed, tested, and maintained by **TacticalOtaku**, who retains sole authorship and responsibility for the module.

All bundled package assets and user-facing materials comply with Foundry VTT's [AI Content Policy](https://foundryvtt.com/article/ai-policy/) — no pre-generated AI art, audio, or lore assets are included.

---

## Feedback & License

Pull Requests are disabled on this repository; bug reports and suggestions are welcome via [GitHub Issues](https://github.com/TacticalOtaku/actor-inventory-manager/issues) (see [CONTRIBUTING.md](CONTRIBUTING.md)).

Released under the **GNU General Public License v3.0** ([LICENSE](LICENSE)). Bundled Onest font ([OFL-onest.txt](assets/fonts/OFL-onest.txt)), Kenney Particle Pack ([LICENSE-kenney-particle-pack.txt](assets/vfx/LICENSE-kenney-particle-pack.txt)), and `pixi-filters` ([LICENSE-pixi-filters.txt](scripts/vendor/LICENSE-pixi-filters.txt)) retain their respective notices.
