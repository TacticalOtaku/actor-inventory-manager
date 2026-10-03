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
  tactile/          Tactile design system: accent palette and GSAP motion
  ui/               ApplicationV2 windows and their controllers
  vendor/gsap/      vendored GSAP 3.13 ESM build (generated, see "Vendored assets")
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

`ui/trade-panel.js` keeps local unsaved quantities separate from the accepted offer revision. Its drawer shares the side-drawer layout with the grimoire (see "Window layout" below). `actor-inventory-manager.tradeState` updates open drawers when the saved session changes.

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

## UI and Tactile

The windows use Tactile, a small design system that lives inside this module:

| Part | Where |
| --- | --- |
| Tokens (colours, shadows, radii, fonts) | `styles/tactile/tokens.css` |
| Primitives (blocks, trays, chips, buttons) | `styles/tactile/components.css` |
| Font faces (generated) | `styles/tactile/fonts.css` |
| Accent palette | `scripts/tactile/palette.js` |
| Motion | `scripts/tactile/motion.js` |
| Theme and accent stamping | `scripts/ui/tactile-theme.js` |
| AIM window, passport, paperdoll, inventory, drawers, editors | `styles/aim/*.css` |
| Window layout | `scripts/ui/window-layout.js` |

### Theme and accent

Tokens are declared on `.tc-root`, the class every AIM window element carries
(the inventory window, the paperdoll editor and the slot dialog). They are never
declared on `:root`, so they cannot leak into Foundry or other modules. The
light set is the default; `applyTactileTheme` stamps the resolved theme
(`data-theme="dark"` or `"light"`, from the *Interface Theme* setting) on the
window element, and the accent hue and chroma as `--tc-acc-h` / `--tc-acc-c`.
The accent comes from the client setting *Accent colour* (ten choices from
`PALETTE`, default `peach`); its lightness comes from the theme, since the
accent tokens are OKLCH. Both settings fire the refresh hook. The inventory
window re-renders on it; the editors re-stamp themselves through
`watchEditorTheme` / `stampEditorTheme`.

The primitives reset buttons and inputs inside `:where(.tc-root)`, so the
resets have zero specificity and never override a component's own colours. The
font reset skips buttons that are themselves Font Awesome icons (a class with
`fa-`), which would otherwise lose the icon font. Icons are Font Awesome Light
(`fa-light`); the default paperdoll slots use it too, while user templates saved
earlier keep the icons stored in them.

The header button injected into character sheets (`.aim-window-header-btn`) sits
outside any Tactile root and keeps Foundry's `header-control` styling.

### Window layout

`window-layout.js` is pure: it takes the layout state (open drawer, the saved
paperdoll preference, whether the doll was expanded beside a drawer) and the
viewport width, and returns the layout and the window width. The column widths
in `styles/aim/window.css` must match its arithmetic.

| Layout | Preferred width | Minimum |
| --- | --- | --- |
| `open` - paperdoll open, no drawer | 1080 | 1006 |
| `strip` - paperdoll folded, no drawer | 824 | 750 |
| `drawerStrip` - drawer, paperdoll folded | 1188 | 1124 |
| `drawerOpen` - drawer, paperdoll open | 1444 | 1380 |
| `drawerCompact` - drawer, paperdoll folded, no passport | up to 1124 | 858 |

A drawer (grimoire or trade) takes the paperdoll's place and folds it into its
strip, so the inventory column keeps its width. Closing the drawer brings the
paperdoll back as the saved preference has it. Expanding the paperdoll beside a
drawer works when the screen holds `drawerOpen`; otherwise it closes the drawer
and opens the paperdoll. On a screen too narrow for `drawerStrip`, the passport
column hides (`isCompact`). The paperdoll preference and an open grimoire are
saved per actor.

### Motion

`motion.js` runs on a private GSAP instance imported from `scripts/vendor/gsap/`
with the `CustomEase` and `Flip` plugins registered on it explicitly. It never
uses or overwrites a global `gsap` exposed by another module. It provides
the window entrance (`openWindow`), counting numbers (`countTo`), a settle for a
newly filled slot (`pop`), a shake for a refused change (`refuse`), the drawer
entrance (`slideIn`), row moves across re-renders (`captureFlip` / `playFlip`,
which takes the freshly rendered scope as `root`) and the press feedback on
buttons (`bindPress`). A refused equip, attunement past the limit or an invalid
drop shakes its target.

ApplicationV2 replaces the window's DOM on every render, so the window records
what it needs before rendering (numbers, slot contents, row positions, meter
widths) and plays the change on the new elements afterwards. Reduced motion
(`shouldReduceMotion`: the operating system's preference or Foundry's
`performance-low` body class) leaves only a 150 ms opacity fade.

### Vendored assets

`npm run vendor` (`tools/vendor.mjs`) copies third-party runtime files from
`node_modules` into the package; its output is committed. Run it after changing
the versions in `package.json`.

- GSAP 3.13 ESM into `scripts/vendor/gsap/`. The plugins' self-registration into
  a foreign `window.gsap` is stripped from the copies.
- The Onest, JetBrains Mono and Unbounded variable fonts (`@fontsource-variable`,
  subsets latin, latin-ext, cyrillic, cyrillic-ext) into `assets/fonts/` as
  woff2, with their licences, and the matching `@font-face` rules into
  `styles/tactile/fonts.css`.

`fonts.css` is not listed in `module.json`. The client setting *Interface Fonts*
(`useWebFonts`) adds it as a `<link>` from the module's own folder; with the
setting off the windows use system fonts. Nothing is fetched from Google or any
other CDN.

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
   `.aim-no-transitions` class for this reason (`ActorInventoryApp#_applyTheme`).
2. **Do not inline `color:` from rarity or spell-school values.** Those palettes
   are tuned for the dark background and drop to ~2:1 contrast on the light
   theme. Expose the colour as a custom property (`--rarity-color`,
   `--spell-school-color`) and let the stylesheet decide per theme.

## Tests

`npm test` runs the Node test runner over `tests/`. Everything under `core/`,
the pure helpers in `integrations/dnd5e.js`, the window layout and the accent
palette are testable without Foundry; `vendor-assets.test.js` checks that the
vendored GSAP files and fonts are complete and that the GSAP plugins do not
register into a foreign global;
new data-model helpers should arrive with a test that pins the dnd5e 5.3.3 data
shape.

## Local development

`npm run deploy` copies the module into Foundry's `Data/modules/actor-inventory-manager`
(`%LOCALAPPDATA%\FoundryVTT\Data` by default; override with `--data <path>` or the
`FOUNDRY_DATA` environment variable, both naming the `Data` folder). Reload Foundry
with F5 afterwards; a stylesheet or language newly added to `module.json` needs a
server restart instead. `npm run check` runs ESLint and the tests; `npm run release`
validates `module.json` and writes `dist/actor-inventory-manager-v<version>.zip`.
