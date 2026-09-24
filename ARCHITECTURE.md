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

`ui/trade-panel.js` keeps local unsaved quantities separate from the accepted offer revision. Its drawer uses the existing spells-column layout and theme variables. `actor-inventory-manager.tradeState` updates open drawers when the saved session changes.

## Data-model adapter rule

dnd5e reshapes its data model between major versions. Every place that reads a
field dnd5e has moved before goes through a named helper so there is exactly
one place to update when it moves again. Never inline these reads at a call site.

| Concern | Helper | Where |
| --- | --- | --- |
| Attunement state | `isItemAttuned`, `itemRequiresAttunement`, `getAttunementStatus` | `core/attunement.js` |
| Spell preparation | `resolveSpellPreparation` | `integrations/dnd5e.js` |
| Spell slot maximum | `resolveSpellSlotMax` | `integrations/dnd5e.js` |
| Item activation | `resolveItemActivation` | `integrations/dnd5e.js` |
| Limited uses / recharge | `resolveItemUses` | `integrations/dnd5e.js` |
| Carrying capacity | `getSystemEncumbrance`, `computeActorCapacity` | `core/weight-calculator.js` |

Shapes handled (dnd5e 5.3.3):

- **Attunement** — `system.attunement` is the *requirement*
  (`"" | "required" | "optional"`) and `system.attuned` is the boolean state.
  Writing `"attuned"` into `system.attunement` corrupts the item.
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

Settings that change what every window shows (theme, custom templates, portrait
backdrop, auto-reconcile, SC rarity colours) call the
`actor-inventory-manager.refresh` hook; open windows re-render on it. Document
hooks are coalesced so a batched change renders once.

## Styling and theming

Theme colours are CSS custom properties defined on `[data-theme="dark"]` and
`[data-theme="light"]` in `styles/actor-inventory.css`.

The decorative fonts come from Google Fonts and are injected at runtime only
while the client setting *Decorative Web Fonts* is on, so offline worlds and
players who opt out never contact Google. Rarity colours reach the templates as
custom properties (`--rarity-color`, `--rarity-glow`, built with `color-mix`),
never by appending an alpha suffix to a colour string.

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

`npm test` runs the Node test runner over `tests/`. Everything under `core/`
and the pure helpers in `integrations/dnd5e.js` are testable without Foundry;
new data-model helpers should arrive with a test that pins the dnd5e 5.3.3 data
shape.

## Local development

`npm run sync` copies the module into the local Foundry data directory
(`%LOCALAPPDATA%\FoundryVTT` by default; override with `--data <path>` or the
`FOUNDRY_DATA` environment variable). Reload Foundry with F5 afterwards.
