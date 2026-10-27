# Architecture

A map of the module for anyone extending it, plus the rules that keep its reads
of the dnd5e data model in one place.

Supported platform: Foundry 14+, dnd5e 5.3.3+, Item Piles 3.3.0+ (optional).
Older versions are not supported and there are no compatibility branches for
them - code targets the current APIs directly (`foundry.applications.*`,
ApplicationV2 sheets, `game.itempiles.API`).

## Layering

```
scripts/
  constants.js      module id, flag names, slot ids, enums
  core/             pure logic - no game/ui/Hooks access, unit tested
  foundry/          adapters to the Foundry runtime (settings, hooks, logging)
  integrations/     adapters to the game system and to other modules
  trade/            currency adapter, offer validation, transfers and GM coordinator
  ui/               ApplicationV2 windows and their controllers
  main.js           composition root: wires ports, registers hooks, exposes the API
```

The dependency direction is one-way: `ui` → `integrations` → `core`, with
`foundry` supplying the platform. **`core/` must stay importable in plain Node**
— that is what makes `npm test` possible without booting Foundry. If a `core`
module needs something from the runtime, add a port (see
`core/paperdoll-runtime.js` and its adapter `foundry/paperdoll-runtime.js`)
rather than reaching for `game` directly.

## Player trading

`core/actor-scope.js` defines supported actors without touching runtime globals. NPCs without a player owner are excluded at UI and mutation boundaries. `trade/currencies.js` selects either the active Item Piles API or exact standard D&D5e denominations. `trade/offers.js` validates assets and offer revisions. `trade/transfer.js` handles item data cleanup and inventory snapshots.

`trade/service.js` is the runtime coordinator. Requests are serialized JSON in the requesting User's AIM flag; `updateUser` supplies the authenticated initiating user ID. No module socket payload authorizes writes. One active GM serializes requests and retains its persisted coordinator ID while connected, so another GM joining cannot take over mid-transfer. The coordinator rechecks actor ownership and both users' confirmations and persists the editing lock before taking snapshots. Complete inventory snapshots live only in a private JournalEntry, never in the public session state; their contents are revalidated before any debit. Transfer and recovery writes check coordinator ownership across asynchronous boundaries. Persisted executing/recovery sessions cannot be resubmitted as transfers. The GM's explicit recovery action restores the saved inventories; interrupted preparation without a saved transfer phase can simply be unlocked.

The actor window's trade panel (`ui/trade.js`, `templates/window/trade.hbs`) is a client of this service only: it reads the saved session, sends requests through `requestTrade`, and keeps a local draft that leaves by itself after a pause (a stale revision is sent again; an unchanged draft is not sent). Besides the request actions the service adds `unconfirm` (a side withdraws only its own confirmation) and records `cancelledBy`; received items carry the `tradeNew` flag until their owner opens them. `actor-inventory-manager.tradeState` fires when the saved session changes.

## Data-model adapter rule

dnd5e reshapes its data model between major versions. Every place that reads a
field dnd5e has moved before goes through a named helper so there is exactly
one place to update when it moves again. Never inline these reads at a call site.

| Concern | Helper | Where |
| --- | --- | --- |
| Attunement state | `isItemAttuned`, `itemRequiresAttunement`, `getAttunementStatus` | `core/attunement.js` |
| Attunement cap | `getActorAttunementMax` (prepared), `getActorSourceAttunementMax` (stored) | `core/attunement.js` |
| Container contents | `getContainerContentsCount` | `integrations/dnd5e.js` |
| Spell preparation | `resolveSpellPreparation` | `integrations/dnd5e.js` |
| Spell slot maximum | `resolveSpellSlotMax` | `integrations/dnd5e.js` |
| Item activation | `resolveItemActivation` | `integrations/dnd5e.js` |
| Limited uses / recharge | `resolveItemUses` | `integrations/dnd5e.js` |
| Carrying capacity | `getSystemEncumbrance`, `computeActorCapacity` | `core/weight-calculator.js` |
| Abilities for the window header | `readAbilities` | `integrations/dnd5e.js` |
| Level, experience, classes, species, background | `readIdentity` | `integrations/dnd5e.js` |
| Inventory rows (price per unit in gold, charges from `uses.spent`, holding container) | `readInventory` | `integrations/dnd5e.js` |
| Coins in the system's order | `readCoins` | `integrations/dnd5e.js` |
| Container capacity without Weighty Containers (`computeCapacity`) | `readContainerCapacity` | `integrations/dnd5e.js` |
| Vehicle type (`details.type`, formerly `vehicleType`) | `readVehicleType` | `integrations/dnd5e.js` |
| Vehicle size and cargo capacity for the hold banner | `readVehicleHold` | `integrations/dnd5e.js` |
| Spells for the spells tab (method, prepared, properties, labels, materials, uses) | `readSpellbook` | `integrations/dnd5e.js` |
| Prepared spells against each class limit (`spellcasting.preparation`) | `readSpellPreparation` | `integrations/dnd5e.js` |
| Features by origin (`advancementRoot`/`advancementOrigin`), uses, recovery, recharge, attacks | `readFeatures` | `integrations/dnd5e.js` |
| Activities a player picks (`canUse`, midi-qol automation-only left out) | `usableActivities` | `integrations/midi-qol.js` |
| Favorites (`system.favorites`: relative UUIDs, slot keys, skill and tool keys) | `readFavorites` | `integrations/dnd5e.js` |
| Effects as dnd5e's sheet lists them (`allApplicableEffects`, `isSuppressed` and why, time left, source) | `readEffects` | `integrations/dnd5e.js` |
| Effect changes (Foundry 14 `system.changes` with `type`) and their field labels | `readEffectChanges` | `integrations/dnd5e.js` |
| Statuses for the conditions grid (`CONFIG.statusEffects`, non-pseudo `conditionTypes`, immunities from `traits.ci`) | `readStatusEffects` | `integrations/dnd5e.js` |
| Tooltip cards (`system.getCardData()` read into numbers, text and pills; `richTooltip()` of effects and rule pages) | `readCardData` | `integrations/dnd5e.js` |
| Damage types (`CONFIG.DND5E.damageTypes[key]`: label, `color` as a Foundry `Color`, `reference` page) | `readDamageType` | `integrations/dnd5e.js` |
| Skills and tools (`prof.multiplier` in effect, total, passive) | `readSkills`, `readTools` | `integrations/dnd5e.js` |
| Defenses (`traits.dr/di/dv/ci` with custom entries, `traits.dm.amount`) | `readDefenses` | `integrations/dnd5e.js` |
| Passive scores, senses (`attributes.senses.ranges`, moved in 5.3), armor, weapons, languages (`labels`, telepathy) | `readSenses` | `integrations/dnd5e.js` |
| Characteristics, personality and biography as stored (`_source.system.details`) | `readBiography` | `integrations/dnd5e.js` |

Shapes handled (dnd5e 5.3.3):

- **Attunement** — `system.attunement` is the *requirement*
  (`"" | "required" | "optional"`) and `system.attuned` is the boolean state.
  Writing `"attuned"` into `system.attunement` corrupts the item. The cap
  `system.attributes.attunement.max` is raised by effects; editors read and
  write the stored `_source` value so a bonus is never baked into the base.
- **Container contents** — `system.contentsCount` counts nested items by
  quantity and is a promise inside a compendium. Deleting a container leaves
  its contents pointing at the deleted id unless `{ deleteContents: true }`.
- **Spell preparation** — `system.method` (`"spell" | "pact" | "atwill" |
  "innate" | "ritual"`) plus numeric `system.prepared` (`0/1/2`, where `2` is
  always-prepared). There is no `"prepared"` method.
- **Activation** — activation lives on activities:
  `system.activities.contents[0].activation.type`. Only spells still carry
  `system.activation`.
- **Uses / recharge** — `system.uses.{max,spent,value}`; recharge is a
  `uses.recovery` entry with `period: "recharge"`.
- **Properties** — `system.properties` is a `Set`; read it with
  `hasItemProperty`. Weight and price are `{ value, units }` /
  `{ value, denomination }` objects; armor category is `system.type.value`.
- **Spell slots** — `override` is a *nullable* number. `Number(null)` is `0` and
  finite, so a plain numeric coercion silently zeroes every slot.
- **Encumbrance** — always prefer `actor.system.attributes.encumbrance`. It
  already accounts for the metric variant (7.5 kg per STR, not a conversion of
  15 lb), size, Powerful Build, bonuses/multipliers from effects, and currency
  weight. Weighty Containers patches dnd5e's `ContainerData#contentsWeight`
  getter, so this block already includes every container reduction;
  recomputing raw item weights discards them. Only without the block does the
  window ask Weighty Containers for `computeActorCarriedLbs`, and only without
  that does it sum raw weights (skipping `weightlessContents` bags).
- **Encumbrance rule** — the tiers follow dnd5e's `encumbrance` setting:
  `variant` shows encumbered / heavily encumbered, `normal` only the carrying
  capacity, `none` tracks nothing (`getEncumbranceRule`).
- **Weight units** — conversions use `CONFIG.DND5E.weightUnits`. dnd5e's
  kilogram is **2.5 lb**, not 2.20462; Weighty Containers uses the same table,
  so any other factor makes the two modules disagree.

## Extension points

The public API is on `game.modules.get("actor-inventory-manager").api` and on
`globalThis.ActorInventoryManager`.

The item actions `equipItem`, `unequipItem`, `toggleItemEquipped` and
`toggleAttunement` resolve to `true` when the write went through and `false`
when it was refused (permission, slot rules, attunement limit) or vetoed by a
`preUpdateItem` hook. A vetoed write shows no success notification.

### Hooks

| Hook | Arguments | Use |
| --- | --- | --- |
| `actor-inventory-manager.ready` | `(api)` | Register slots and rules |
| `actor-inventory-manager.prepareContext` | `(app, context, actor)` | Read or augment render data (mutate `context`) |
| `actor-inventory-manager.renderInventory` | `(app, element, context)` | Decorate the rendered DOM |
| `actor-inventory-manager.refresh` | `()` | Ask every open window to re-render |

### Adding an equipment slot

```js
Hooks.on("actor-inventory-manager.ready", api => {
  api.slotRegistry.register({
    id: "tattoo",
    labelKey: "MYMOD.slots.tattoo",
    icon: "fa-solid fa-fingerprint",
    category: "equipment",
    accepts: ["tattoo"],
    itemTypes: ["equipment"],
    order: 120
  });
});
```

Slots supplied this way are the default set. A per-actor paperdoll template
(built in the GM editor) overrides them; see `core/paperdoll-templates.js`.

### Adding an equipment rule

```js
Hooks.on("actor-inventory-manager.ready", api => {
  api.equipmentRuleEngine.registerRule({
    id: "no-heavy-armor-for-wizards",
    name: "Wizards cannot wear heavy armor",
    validate: (actor, item, targetSlotId, slotMap) => {
      // return a ValidationResult - see core/equipment-rules.js
    }
  });
});
```

Rules run in registration order; the first failure wins. A rule may also return
success with `autoSwapItems` to request that conflicting items be unequipped.

## Weighty Containers integration

All of it lives in `integrations/weighty-containers.js`; nothing else in the
codebase may touch that module's flags or internals.

The rule is **delegate, never reimplement**. Its validator returns a *code*
(`type`, `subtype`, `property`, `forbiddenProperty`); `validateContainerDrop`
turns it into a localized sentence and keeps the code on `result.code`.
Capacity is not pre-checked here: Weighty Containers enforces it in its own
`preUpdateItem` hook when an item's container changes. Weighty Containers owns the
adjusted load (reduction applied, nested containers walked) and the restriction
matcher (which resolves subtype, base item and weapon-type aliases). Recomputing
either here guarantees the two modules disagree.

| Need | Call |
| --- | --- |
| Container fill state | `getContainerLoad(actor, containerId)` |
| Weight reduction | `getContainerWeightReductionPct(container)` |
| Can this item go in? | `validateContainerDrop(container, item)` |
| Open the rules window | `openWeightyContainersDialog(container)` |
| React to a rules change | `watchContainerRules(callback)` |
| Actor total without a system block | `getActorCarriedLbs(actor)` |

`game.modules.get("weighty-containers").api` is the supported handle (3.4.0+);
`globalThis.weightyCont` is accepted as a fallback for older builds. Every entry
point feature-detects and falls back to a local approximation, so the module
stays fully usable with Weighty Containers absent or outdated.

Its restriction flags are stored as arrays **or** delimited strings — always
normalize with `parseTokenList` before comparing.

See `API.md` in the Weighty Containers repository for the full surface.

## Enforcement

`foundry/enforcement-hooks.js` intercepts `preUpdateItem` so equipping from the
*character sheet* obeys the same rules as equipping from this window. The
`enforcementMode` world setting picks between `block`, `auto_swap` and `warn`.
In `auto_swap` a rule failure caused by another item (a two-handed weapon, a
second body armor or shield) swaps that item out; a failure with no culprit is
still refused. Items with no place on the paperdoll (Ioun stones, trinkets) are
equipped without a slot rather than blocked.

The inventory window validates an equip itself and writes displaced and new
items in one `updateEmbeddedDocuments` call with the `aimEquip` option, which
the hook trusts.

Two-handed locking follows the template: slots flagged `locksOffHandOn2H` are
main hands, slots flagged `isShield` (or named off hand) are off hands
(`getTwoHandLayout`).

## Permissions

`canViewActor` (Observer) gates the sheet button, the hotkey and the window;
Limited users only see a biography in dnd5e. `canEditActor` (Owner or GM) gates
every change. Observers get a read-only window: no drag and drop, no item
controls, and UI preferences are kept locally instead of in actor flags.

Windows are keyed by actor **UUID**, because unlinked token actors share their
base actor's id.

## Refreshing open windows

Settings that change what every window shows (theme, accent colour, custom
templates, portrait backdrop, auto-reconcile, SC rarity colours) call the
`actor-inventory-manager.refresh` hook; open windows re-render on it. Document
hooks are coalesced so a batched change renders once.

## Actor window and theme

Version 2.0 replaces the 1.9 inventory window with the actor window (ADR 0002): one ApplicationV2 window per actor
UUID, opened from the header button of any `ActorSheetV2` and the `I` key. The approved mock
`design/character-sheet/mock.html` and its `mock.notes.json` are the behaviour spec; the window is built slice by
slice from the map #28.

| Part | Where |
| --- | --- |
| Window, its parts and actions | `scripts/ui/actor-window.js` |
| Pure rules: layout by width, motion caps, theme, accents, tabs, rail blocks | `scripts/core/actor-window.js` |
| Templates (rail, main with header and tabs, inspector, settings drawer) | `templates/window/*.hbs` |
| Theme tokens | `styles/theme/tokens.css` |
| Window styles | `styles/window/*.css` |
| Font faces (generated) | `styles/theme/fonts.css` |
| FLIP glide (Web Animations) | `scripts/ui/motion.js` |
| Equipment tab: lists, purse, load, details, inspector, item menu | `scripts/ui/equipment.js`, `templates/window/{equipment,tray,item-row,item-detail}.hbs` |
| Pure inventory rules: sections, sort, filters, list preferences, charges, coin entry, tray folding, drop refusals | `scripts/core/inventory.js` |
| Dragging rows and doll tiles: into slots and sockets, into and out of containers (Weighty Containers checks first), manual order, out of the window | `scripts/ui/inventory-drag.js` |
| Paperdoll: figure, slots, two-handed lock, attunement sockets, slotless strip, hold banner | `scripts/ui/doll.js`, `templates/window/doll.hbs`, `assets/figures.svg` |
| Pure doll layout: slot columns, overflow grid, socket strip, banner | `scripts/core/paperdoll-layout.js` |
| Built-in presets (figure plus slots) and the default per actor type | `scripts/core/paperdoll-templates.js` |
| Preset editor window (GM): figure, slots, attunement limit, save, delete, import, export; `api.openEditor(actor)` | `scripts/ui/preset-editor.js`, `templates/window/preset-*.hbs` |
| Pure editor edits: working copy, slot add/move/remove, unchanged check, preset ids | `scripts/core/preset-editor.js` |
| Theme attributes for any module window root | `scripts/ui/theme-root.js` |
| Spells tab: slot tracks, prepared list, spellbook, innate and at-will, casting, template minimise | `scripts/ui/spells.js`, `templates/window/spells.hbs`, `templates/window/spell-row.hbs` |
| Pure spellbook rules: sections, filters, what can be cast, gem clicks, preparation state | `scripts/core/spellbook.js` |
| Features tab: by origin for a character, «Действия» by action cost for an NPC or vehicle, uses, recharge | `scripts/ui/features.js`, `templates/window/features.hbs`, `templates/window/feature-row.hbs` |
| Pure feature rules: origin and action groups, filters, uses entry, recharge label | `scripts/core/features.js` |
| Favorites in the rail (dnd5e `system.favorites`): groups, use, open, stars, drag and reorder | `scripts/ui/favorites.js`, `templates/window/rail.hbs` |
| Pure favorite rules: action-cost groups, manual order, the tab of an entry | `scripts/core/favorites.js` |
| Effects: the rail's temporary ones, the effects tab with the conditions grid, switches, the effect menu | `scripts/ui/effects.js`, `templates/window/effects.hbs`, `templates/window/effect-row.hbs` |
| Pure effect rules: dnd5e's categories, row kinds (concentration, condition, switch), change text, the grid | `scripts/core/effects.js` |
| Overview (skills, saves, tools, defenses, senses, dnd5e's config dialogs) and biography (dnd5e's own fields, ProseMirror) | `scripts/ui/overview.js`, `templates/window/overview.hbs`, `templates/window/biography.hbs` |
| Pure overview rules: proficiency marks, the dialogs behind each card, the biography fields | `scripts/core/overview.js` |
| Trade panel on the `trade/` service: partner, offers with auto-send, coins or Item Piles currencies, confirmation, cancel, GM recovery, lock banner, offer buttons, «New» | `scripts/ui/trade.js`, `templates/window/trade.hbs` |
| Pure trade-panel rules: what the trade waits for, offer edits, unchanged offers, partners, recovery action, Item Piles totals | `scripts/core/trade-panel.js` |
| Tooltip cards on our own layer (`document.body` of the window's document): triggers, timing, nesting, pinning, dragging | `scripts/ui/tooltips.js`, `templates/window/tooltip-card.hbs`, `styles/window/tooltips.css` |
| Pure card rules: delays, one live card per level, four levels, pin limit and order, closing and sweeping | `scripts/core/tooltips.js` |
| Visual effects engine: sprite particles, Kenney textures and pixi-filters on one shared transparent PIXI renderer (Foundry's PIXI 7) that only grows; each effect copies its corner into its own 2D canvas; one frame loop, paused in a hidden tab | `scripts/ui/vfx.js`, `assets/vfx/`, `scripts/vendor/pixi-filters.js` |
| Damage chips and the damage type card's scene: one scene per dnd5e type; loops, holds or stills by motion level | `scripts/ui/damage-scenes.js` |
| Bursts over one element of the window (HP hit and heal, coming back from 0, temporary HP gained, absorbed and broken, death saves, inspiration, spent slot gems and hit dice, coins, the long rest's night and dawn); plain blending without glow on parchment; none with motion off | `scripts/ui/bursts.js` |
| Pure rail events: what changed between two renders, in the order its effects play | `railEvents` in `scripts/core/vitals.js` |
| Pure scene rules: which type has a scene, multi-type parts, how a motion level plays it | `scripts/core/damage-scenes.js` |

### Theme, accent, density, motion

Tokens are declared on `.aim-root`, the class every AIM window element carries; never on `:root`. «Ночь» is the
default set; `data-theme="parchment"` overrides every colour token. Accents are stored by name
(`brass`, `embers`, `arcane`, `forest`, `frost`, `rose`): each theme defines `--acc-<name>`, and
`data-accent` picks one, so a swatch never writes a colour into `style`. «Авто» follows Foundry's resolved colour
scheme, read from the `theme-light` class Foundry puts on `body`.

The window stamps `data-theme`, `data-accent`, `data-density`, `data-motion`, `data-fonts`, `data-role` and
`data-layout` on its root. Motion levels (#9): «Все» (`full`), «Сдержанно» (`reduced`, ambient loops marked
`.aim-ambient` stop), «Выключены» (`off`, only fades marked `.aim-fade`). Reduced motion in the OS caps the level at
`off`, Foundry's `performance-low` body class at `reduced`; the player's choice is kept under the cap.

`tests/theme-contrast.test.js` reads `tokens.css` and checks that text, meaning, rarity, school and accent colours
reach 4.5:1 on all four surfaces in both themes.

### Window settings

Personal settings live in the window's own drawer, not in Foundry's settings window (#17): `windowTheme`,
`windowAccent`, `windowDensity`, `hiddenRailBlocks` and `hiddenTabs` use scope `user` and follow the player;
`motionLevel` and `useWebFonts` use scope `client`. The 1.x `theme` and `accent` client settings stay registered,
hidden, for the 2.0 migration (ADR 0005).

### Layout

The window picks its layout from its own width (`layoutForWidth`): under 420 px compact (rail only), 420–759 narrow
(the rail becomes a row above the content), 760–1319 standard (rail and content), 1320 and wider (rail, content and
inspector). A `ResizeObserver` watches the window; when the layout changes, every `[data-flip]` block glides to its
new place (`glide`, 420 ms) unless motion is off. The collapse button shrinks the window to 320 px.

### Vendored assets

`npm run vendor` (`tools/vendor.mjs`) copies the Onest, JetBrains Mono and Unbounded variable fonts
(`@fontsource-variable`, subsets latin, latin-ext, cyrillic, cyrillic-ext) into `assets/fonts/` with their licences,
and writes the matching `@font-face` rules into `styles/theme/fonts.css`. `fonts.css` is not listed in
`module.json`: the client setting `useWebFonts` adds it as a `<link>`; with it off the windows use system fonts.
Nothing is fetched from a CDN.

The damage scenes use sprites from Kenney's Particle Pack 1.1 (CC0, `assets/vfx/LICENSE-kenney-particle-pack.txt`),
resized to 256 or 128 px, and pixi-filters 5.3.0 (MIT, `scripts/vendor/LICENSE-pixi-filters.txt`), its browser build
with one change: it keeps to the global `AIMPixiFilters` instead of merging into `PIXI.filters`, so a module that
brings another version keeps its own. The script loads on the first damage card.

### Colour constraints

Rarity colours reach the templates as custom properties (`--rarity-color`,
`--rarity-glow`, built with `color-mix`), never by appending an alpha suffix to
a colour string. Rows name the rarity of uncommon and rarer items from
`CONFIG.DND5E.itemRarity` (`rarityLabel` in `formatItemForDisplay`).

Two constraints, both learned the hard way:

1. **Never transition the `background` shorthand or `all` on an element whose
   background comes from a custom property.** A transition started by a
   custom-property change never settles on the new value, leaving the panel
   painted in the previous theme. The theme swap is wrapped in an
   theme swap runs through a view transition instead.
2. **Do not inline `color:` from rarity or spell-school values.** Those palettes
   are tuned for the dark background and drop to ~2:1 contrast on the light
   theme. Expose the colour as a custom property (`--rarity-color`,
   `--spell-school-color`) and let the stylesheet decide per theme.

## Tests

`npm test` runs the Node test runner over `tests/`. Everything under `core/`
(including the actor window rules) and the pure helpers in `integrations/dnd5e.js` are testable without Foundry;
`theme-contrast.test.js` checks the theme tokens;
new data-model helpers should arrive with a test that pins the dnd5e 5.3.3 data
shape.

## Local development

`npm run deploy` copies the module into Foundry's `Data/modules/actor-inventory-manager`
(`%LOCALAPPDATA%\FoundryVTT\Data` by default; override with `--data <path>` or the
`FOUNDRY_DATA` environment variable, both naming the `Data` folder). Reload Foundry
with F5 afterwards; a stylesheet or language newly added to `module.json` needs a
server restart instead. `npm run check` runs ESLint and the tests; `npm run release`
validates `module.json` and writes `dist/actor-inventory-manager-v<version>.zip`.
