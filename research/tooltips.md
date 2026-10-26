# What Foundry 14 and dnd5e 5.3.3 give us for nested tooltip cards and links

Research for issue #21 (map #3), input to ticket #22 ("Подсказки окна актора: поведение и вид"). The **actor window**
is a separate ApplicationV2 window, not a registered sheet (ADR 0002), and every action goes through the dnd5e API
(ADR 0001). Ticket #22 wants CK3-style cards: hover an item, spell, feature or effect and a card appears; links in a
card open nested cards on hover; a long hover pins a card, which can be dragged and outlives the actor window until
closed by hand; cards tinted by rarity; damage-type links get a small animation. This note lists facts and makes no
decision.

Prior note, not repeated: `research/window-compat.md` (branch `research/window-compat`).

Sources and short names:

- `tm:N` = `client/helpers/interaction/tooltip-manager.mjs`, `te:N` = `client/applications/ux/text-editor.mjs`,
  `core:path:N` = any other file under `/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/`. Build
  14.367 (`app/package.json:90`, `"version": "14.367.0"`).
- `mjs:N` = `Data/systems/dnd5e/dnd5e.mjs`, `css:N` = `Data/systems/dnd5e/dnd5e.css`, dnd5e 5.3.3
  (`system.json:5`).
- `aim:path:N` = this repo at `501dd03` (v1.9.1).
- `sc:path` = SC - Item Rarity Colors, GitHub `Shattered-Codex/sc-item-rarity-colors` at tag `v3.0.17`
  (2026-10-23). **[web]**: not installed locally, read on GitHub only.

## 1. Core `TooltipManager` (`game.tooltip`)

### Facts

- One shared element. `game.tooltip` is a singleton (`tm:26-28`) wrapping `<div id="tooltip">` (`tm:34`). Only one
  non-locked tooltip exists at a time; `activate()` first calls `deactivate()` (`tm:241-242`).
- Built right after the `init` hook from `CONFIG.ux.TooltipManager` (`core:client/game.mjs:651-657`,
  `tm:556-563`; default `core:client/config.mjs:2957`). A module can swap the class only from its own `init`
  listener, and the swap is global (every module and dnd5e get it).
- Triggers. Listeners sit on `document.body` in the **capture** phase: `pointerenter`, `pointerleave`, `pointerup`
  (lock), `pointermove` (locked proximity) (`tm:117-125`). An element opts in with `data-tooltip`,
  `data-tooltip-text` or `data-tooltip-html`; `data-tooltip=""` falls back to `aria-label` (`tm:137-139`,
  `tm:257-265`). Direction and extra classes come from `data-tooltip-direction` / `data-tooltip-class` on the element
  or any ancestor (`tm:273-278`). No per-element opt-out exists except not carrying those attributes; tooltips are
  skipped only inside `.editor-content.ProseMirror` and during a Tour (`tm:134-136`).
- Timing. Hover delay `TOOLTIP_ACTIVATION_MS = 500` (`tm:52`, `tm:158-163`); the same delay is used before hiding
  (`tm:184-195`). While one tooltip is shown, hovering another tooltipped element switches instantly (`tm:150-153`).
  Leaving a nested `[data-tooltip]` re-activates the nearest tooltipped ancestor (`tm:172-177`).
- Content. `options.html` / `data-tooltip-html` strings pass through `foundry.utils.cleanHTML`; an `HTMLElement` is
  appended as is (`tm:249-256`). `data-tooltip` is localized if it is an i18n key, otherwise cleaned HTML
  (`tm:261-264`). `text` and `html` together throw (`tm:240`).
- **Locking.** Middle-click (`event.button === 1`) on `pointerup` while a tooltip is active locks it (`tm:350-354`);
  `data-locked` on the element or `activate(el, {locked: true})` locks on show (`tm:281`). `lockTooltip()` makes a
  shallow clone, **moves** (not copies) the children so listeners survive, appends it to `document.body`, shows it as
  a popover, and returns it (`tm:324-341`). `createLockedTooltip(position, text, {cssClass})` builds one at a fixed
  position (`tm:445-456`).
- Locked tooltips get `pointer-events: all` and a border; the live `#tooltip` has `pointer-events: none`
  (`core:public/css/foundry2.css:5928-5948`, `:5993-5996`). Max width 320px (`:5932`).
- **Nesting** works only in one form: lock tooltip A, hover a tooltipped element inside A, the shared `#tooltip`
  shows B; middle-click locks B too. All locked tooltips live in one private set (`tm:98-101`).
- **Dismissal.** Right-click on a locked tooltip removes that one (`tm:333`, `tm:363-379`). Moving the pointer away
  from the union box of **all** locked tooltips (50px buffer, `tm:70`) removes **all** of them at once
  (`tm:403-428`). There is no "stay until closed" mode and the proximity test is a `#private` method, so a subclass
  cannot switch off just that part.
- Locked tooltips are not draggable and have no z-order management; they are plain `div[popover]`.
- **No events.** The file fires no hooks (its only import is `Tour`, `tm:1`). dnd5e learns about activation with a
  `MutationObserver` on `#tooltip`'s `class` attribute (section 2).
- Detached windows (new in 14): `activate()` adopts `#tooltip` into the hovered element's document
  (`tm:269`, `core:client/applications/detached/window-manager.mjs:119-122`), and a detached window runs
  `game.activateListeners(document)` (`window-manager.mjs:225`), which binds the tooltip and content-link listeners
  there (`core:client/game.mjs:2155-2158`).
- Drag building blocks in core: ApplicationV2 drags by its frame header (`core:client/applications/api/application.mjs:1884`,
  `:2049-2078`); `foundry.applications.ux.Draggable` needs an app to call `setPosition` on
  (`core:client/applications/ux/draggable.mjs:19-27`).

### Reuse vs build

- Reuse as is: hover delay, direction logic, `data-tooltip-*` markup for **one level** of plain or dnd5e rich
  tooltips, middle-click locking, right-click dismissal.
- Must build for #22: long-hover-to-pin (core only has middle-click), cards that stay until closed by hand
  (core auto-dismisses all locked tooltips on move-away), dragging, more than one live (non-locked) card at a time,
  per-card close control, any event stream.

### Risks

- Core and our cards would both react to the same hover: core listens in capture phase on `body`, so a card's own
  listener cannot stop it. Our cards must keep `data-tooltip*` and `aria-label`-with-empty-`data-tooltip` off the
  elements they handle, or strip them from enriched HTML (see section 3 for which anchors carry them).
- Replacing `CONFIG.ux.TooltipManager` changes behaviour for every module and dnd5e; it cannot be scoped to our
  window.

## 2. dnd5e rich tooltips

### Facts

- `Tooltips5e` (`mjs:82063-82334`) is created in `init` as `game.dnd5e.tooltips` (`mjs:82433`) and starts in `setup`
  (`mjs:82771-82772`). It watches the core `#tooltip` class list; when `active` is added it fills the tooltip
  (`mjs:82091-82113`, `:82122-82149`):
  - the hovered element has class `content-link` → `fromUuid(element.dataset.uuid)` → rich tooltip (`mjs:82124-82127`);
  - the tooltip content contains `<section class="loading" data-uuid="…">` → Actor: attribution tooltip
    (`_onHoverActor`, needs `data-attribution` on the element, `mjs:82157-82163`); anything else: rich tooltip
    (`mjs:82130-82137`);
  - `.loading[data-passive]` → party passive check/language (`mjs:82140-82148`).
- This is **not tied to dnd5e sheets**: any element in any window with
  `data-tooltip='<section class="loading" data-uuid="UUID"><i class="fas fa-spinner fa-spin-pulse"></i></section>'`
  and `data-tooltip-class="dnd5e2 dnd5e-tooltip item-tooltip themed theme-light"` gets the dnd5e card. dnd5e's own
  sheet does exactly this in `PrimarySheet5e._applyItemTooltips` for `.item-tooltip` elements under `[data-item-id]`,
  `[data-effect-id]` or `[data-uuid]` (`mjs:53368`, `:53406-53424`); the compendium browser (`mjs:33165-33172`) and
  chat cards (`mjs:71088-71097`) reuse it.
- `_onHoverContentLink(doc)` calls `doc.richTooltip?.() ?? doc.system?.richTooltip?.()`, writes `content` into the
  tooltip, swaps `theme-dark` for the returned classes and repositions (default `LEFT`) (`mjs:82172-82181`,
  `:82285-82317`).
- `richTooltip()` exists on exactly four places (only matches in the file):

  | Owner | Line | Returns |
  | --- | --- | --- |
  | `ItemDataModel#richTooltip(enrichmentOptions)` (all item types) | `mjs:10539-10546` | `item-tooltip.hbs` rendered from `getCardData()`; classes `dnd5e2 dnd5e-tooltip item-tooltip themed theme-light` |
  | `Item5e#richTooltip()` | `mjs:23569-23571` | delegates to `system.richTooltip()` but **drops** `enrichmentOptions` |
  | `ActiveEffect5e#richTooltip(enrichmentOptions)` | `mjs:25468-25493` | `effect-tooltip.hbs` (statuses, duration, enriched description); classes `… effect-tooltip …` |
  | `RuleJournalPageData#richTooltip(enrichmentOptions)` (journal pages of type `rule`) | `mjs:77276-77290` | `page-rule-tooltip.hbs` with `page.system.tooltip` or the page text, enriched; classes `… rule-tooltip …` |

  Activities have no `richTooltip`; chat activity rows show the **item** card via `data-item-uuid`
  (`templates/chat/parts/card-activities.hbs:5`, `mjs:71089-71096`).
- What the item card contains (`templates/items/parts/item-tooltip.hbs`): school icon, image, name, subtitle
  (`tooltipSubtitle`: type label, spell level + school, weapon mastery; `mjs:10501-10503`, `:22170-22172`,
  `:76888-76890`), price, charges, weight, spell block for spells, **enriched** description, property pills, and a
  "Middle-click to lock" hint when the `controlHints` setting is on (`lang/en.json:1467`). It carries **no rarity
  marker**.
- `getCardData()` already applies visibility rules: unidentified items show the unidentified description and hide
  uses and price for non-GMs; GM-only "concealed" flag (`mjs:10560-10596`).
- **Taking the content without a sheet**: `await item.system.richTooltip(opts)` / `await effect.richTooltip(opts)` /
  `await page.system.richTooltip(opts)` return `{content: string, classes: string[]}`; nothing reads a sheet.
  `item.system.getCardData(opts)` returns the raw context if we want our own template.
- dnd5e's tooltip CSS is scoped to `:is(#tooltip, .locked-tooltip)` (`css:14264-14470`). Content placed in another
  element is unstyled unless that element carries `.locked-tooltip` (which also pulls in core's locked-tooltip box
  styles) or we style it ourselves.
- `Tooltips5e.activateListeners()` only stops middle-click autoscroll inside `.locked-tooltip`, on the main
  `document` (`mjs:82326-82333`).

### Reuse vs build

- Reuse: the four `richTooltip()` producers (or `getCardData()` + our template), their enrichment and visibility
  rules; zero-code one-level rich tooltips through the `.loading[data-uuid]` markup.
- Build: rarity tint, our own layout if we do not want dnd5e's look, any activity-level card, card chrome
  (close, pin, drag).

### Risks

- Any `content-link` that core tooltips anywhere (including inside our cards) gets dnd5e's rich tooltip on top
  (`mjs:82124-82127`), so leaving the attributes on links inside our cards yields a second, competing tooltip.
- `Item5e#richTooltip` ignores options (`mjs:23570`); call `item.system.richTooltip` directly when passing
  `rollData`/`relativeTo`.
- The rendered HTML is a dnd5e template; its classes are not a public contract and may change between dnd5e versions
  (project rule: route such reads through a named helper with a 5.3.3 test).

## 3. Enrichers: what links look like in enriched HTML

### Facts

- Entry point `TextEditor.implementation.enrichHTML(content, {relativeTo, rollData, secrets, …})` (`te:123-163`).
  Order: content links, hyperlinks, inline rolls, embeds, then every `CONFIG.TextEditor.enrichers` entry
  (`te:136-147`).
- Custom enrichers with both `id` and `onRender` are wrapped in `<enriched-content enricher="ID">`
  (`te:264-280`). That element calls the enricher's `onRender(el)` in `connectedCallback`, i.e. whenever the HTML is
  inserted into **any** DOM (`core:client/applications/elements/enriched-content.mjs:33-37`). dnd5e's `onRender`
  binds the roll / apply-status / request buttons (`mjs:21706-21711`). So enriched strings stay clickable inside our
  own cards with no extra wiring.
- **`@UUID[...]{label}`** → `doc.toAnchor()` (`te:461-500`, `core:client/documents/abstract/client-document.mjs:1141-1171`):
  `<a class="content-link" draggable="true" data-link data-uuid data-id data-type="<DocumentName>" data-pack
  data-tooltip="<DocumentName>"><i class="<icon>"></i>Name</a>`. For a typed document (Item, JournalEntryPage, …)
  `data-tooltip=""` and `aria-label="<Type> <Document>"` instead (`client-document.mjs:1159-1167`). Broken links get
  `class="content-link broken"`, no `data-link` (`te:491-497`).
- Global listeners on `document.body`: click on `a[data-link]` → `doc._onClickDocumentLink` (opens the sheet);
  dragstart on it → drag data `{type, uuid}` (`te:775-797`, `te:843-870`). These work for links inside our cards
  for free.
- dnd5e registers three enrichers (`mjs:20146-20167`, called from `init` at `mjs:82560`):
  `dnd5e-enricher` for `[[/attack|award|check|concentration|damage|heal|healing|item|save|skill|tool …]]`,
  `dnd5e-lookup` for `[[lookup …]]` / `[[language …]]` (no `onRender`), `dnd5e-reference` for `&Reference[…]`.
- **`&Reference[key]`, `&Reference[type=key]`** (`mjs:21315-21356`): looks the key up in the table named by
  `CONFIG.DND5E.ruleTypes[type].references` (`mjs:48149-48197`: rule, ability, areaOfEffect, condition,
  creatureType, damage, skill, spellComponent, spellSchool, spellTag, weaponMastery), takes its `reference` UUID and
  returns `<span class="reference-link">` + `doc.toAnchor()` of the **rule journal page**. For conditions it appends
  `<a class="enricher-action" data-action="applyStatus" data-status="KEY" data-tooltip="" aria-label="…">`. The
  anchor carries only the page UUID, **not** the rule type or key.
- **`[[/check]]`, `[[/skill]]`, `[[/tool]]`** (`mjs:20582-20760`) and **`[[/save]]`, `[[/concentration]]`**
  (`mjs:20817-21019`): `<span class="roll-link-group" data-type="check|save|concentration" data-ability data-skill
  data-tool data-dc data-activity-uuid …>` containing `<a class="roll-link" data-action="roll">` and, for GMs,
  `<a class="enricher-action" data-action="postRequest" data-tooltip="EDITOR.DND5E.Inline.RequestRoll">`
  (`mjs:21644-21666`, `:21676-21684`). Passive checks become `<span class="passive-check" data-tooltip='<section
  class="loading" data-passive>…'>` (`mjs:21559-21570`). Note: the JSDoc examples say `class="roll-action"`
  (`mjs:20491-20577`, `:20768-20812`); the code writes `roll-link` (`mjs:21676-21678`).
- **`[[/damage …]]`, `[[/heal …]]`** (`mjs:21020-21143`): `<a class="roll-link-group" data-action="roll"
  data-type="damage" data-roll-type="damage|healing" data-formulas="2d6&1d4" data-damage-types="fire|cold&radiant"
  [data-activity-uuid] [data-average] …>` with inner `<span class="roll-link">` per formula. `&` separates parts,
  `|` separates alternative types within a part. With a `{label}` it is a single `<a class="roll-link-group
  roll-link">` with the same data (`mjs:21090-21092`). `format=extended` wraps it in `<span class="damage-extended">`
  (`mjs:21134-21139`). Dataset keys come from `_addDataset` (skips `_`-keys, `values` and falsy values,
  `mjs:21838-21842`).
- Core inline rolls carry their formula as a tooltip: immediate `[[1d6]]` results get `data-tooltip=<formula>`
  (`te:729`), deferred `[[/r 1d6]]` links get `data-tooltip-text=<formula>` (`te:759`), so core tooltips them.

### How to recognise a link (from the markup above)

| Link | Selector | Identity |
| --- | --- | --- |
| Document | `a.content-link[data-uuid]` | `data-uuid`, `data-type` |
| Rule / condition / damage-type reference | `span.reference-link > a.content-link` | page `data-uuid` only; reverse-map through `CONFIG.DND5E.<table>[k].reference` |
| Damage / healing roll | `.roll-link-group[data-type="damage"]` | `data-damage-types`, `data-roll-type` |
| Check / save | `.roll-link-group[data-type="check"|"save"|"concentration"]` | `data-ability`, `data-skill`, `data-tool`, `data-dc` |
| Apply condition | `a.enricher-action[data-action="applyStatus"]` | `data-status` |

### Reuse vs build

- Reuse: `enrichHTML` with `relativeTo` (resolves `[[/damage]]` without a formula to the item's activity,
  `mjs:21055-21075`), every click/drag behaviour, and the self-binding `<enriched-content>`.
- Build: hover handling for nested cards on `content-link` / `reference-link` / `roll-link-group`; a reverse map from
  rule-page UUID to (rule type, key) if a card must know a reference is "fire" or "poisoned".

### Risks

- Typed-document anchors and `applyStatus`/`postRequest` buttons carry `data-tooltip` (empty or a key) plus
  `aria-label`, so core tooltips them (`tm:139`). Stripping `data-tooltip` would also lose that accessible hover text
  unless the card provides its own.
- `&Reference` pages live in compendiums (`Compendium.dnd5e.rules…`, `Compendium.dnd5e.content24…`); `enrichHTML`
  primes them in batches (`te:173-189`), and a first hover may still need an async load.

## 4. Damage types (`CONFIG.DND5E.damageTypes`)

### Facts

- 13 keys (`mjs:45771-45852`): `acid, bludgeoning, cold, fire, force, lightning, necrotic, piercing, poison, psychic,
  radiant, slashing, thunder`. Each entry: `label` (i18n key, pre-localized and sorted, `mjs:45853`),
  `icon` (`systems/dnd5e/icons/svg/damage/<key>.svg`), `reference` (rule page UUID in `Compendium.dnd5e.rules`),
  `color` (a core `Color`, e.g. `new Color(0xFF4500)` for fire; `.css` gives the CSS string,
  `core:common/utils/color.mjs:28`), and `isPhysical: true` on bludgeoning, piercing, slashing.
- `CONFIG.DND5E.healingTypes` (`mjs:45870-45889`): `healing, temphp, maximum`, same shape plus `labelShort`, no
  `reference`. Icons in the same folder (`healing.svg`, `temphp.svg`, `maxhp.svg`).
- The legacy-rules switch rewrites `reference` for several tables (`mjs:50296-50300`, table `REFERENCES` at
  `mjs:49222`) but has no `damageTypes` entry, so damage references are the same in both rule sets.
- Where a damage type can be read reliably:
  1. `[[/damage]]` links: `data-damage-types` (section 3). Bare words become types only if they are keys of
     `damageTypes`/`healingTypes` (`mjs:21029-21037`); an explicit `type=` value is taken unchecked (`mjs:21029`).
  2. `&Reference[fire]` / `&Reference[damage=fire]`: only via reverse lookup of the anchor's `data-uuid` against
     `damageTypes[k].reference`.
  3. An item's own damage, no HTML needed: `item.labels.damages[] = {formula, label, damageType, firstDamage}`
     (`Item5e#_prepareLabels`, `mjs:23528-23549`), built from `activity.labels.damage`, where `damageType` is set
     only when a part has exactly one type, else `null` (`mjs:12443-12479`).
  4. Plain description text ("2d6 fire damage") has no markup; no reliable detection.

### Reuse vs build

- Reuse: keys, labels, icons, colours, `isPhysical`; `labels.damages` for an item's own damage line.
- Build: the per-type animation; the UUID→key reverse map for `&Reference`; handling of multi-type parts (`fire|cold`)
  and healing types.

### Risks

- Worlds and modules may add damage types without `icon`, `color` or `reference`; a per-key animation table needs a
  fallback.
- `labels.damages[].damageType` is `null` for multi-type parts; `data-damage-types` keeps them as `a|b`.

## 5. SC - Item Rarity Colors

### Facts: this module

- Single adapter `aim:scripts/integrations/sc-rarity-colors.js`, id `sc-item-rarity-colors` (`:7`). Used by
  `aim:scripts/integrations/dnd5e.js:11`, `:185` (`formatItemForDisplay` → `getItemRarityVisuals`) and `:416`
  (`getSpellSchoolVisuals`); `aim:scripts/main.js:46-55` clears the colour cache on any `sc-item-rarity-colors.*`
  setting change; `aim:scripts/ui/inventory-context.js:4` uses `normalizeRarityKey`.
- `resolveRarityColor` order (`:101-171`): (1) when SC is active: `module.api.getRarityColor(key, item)`
  (`:107-110`), then `globalThis.scItemRarityColors.getColor` (`:111-114`), then SC settings named
  `rarity-colors`, `rarities`, `colors`, `custom-rarities` (`:121-136`); (2) `CONFIG.DND5E.itemRarity[key].color`
  (`:141-148`); (3) CSS variables `--sc-rarity-<key>`, `--rarity-<key>`, `--color-rarity-<key>` on
  `document.documentElement` (`:151-166`); (4) `ITEM_RARITY_COLORS` (`aim:scripts/constants.js:66-73`).
- Output: `{color, rgb, glowColor, hasGlow, rarityKey, cssVars}` where `cssVars` is a style string with
  `--rarity-color`, `--rarity-rgb`, `--rarity-glow`, `--rarity-glow-soft` (`:201-225`); results are cached per
  normalized key (`:68-91`).
- Spell schools: `CONFIG.DND5E.spellSchools[s].color`, then SC setting `spell-colors`, then fallback map
  (`:232-260`). dnd5e 5.3.3 spell schools have `label, icon, fullKey, reference`, no `color` (`mjs:46819-46825`).
- dnd5e's own `CONFIG.DND5E.itemRarity` values are plain i18n strings (`mjs:44946-44954`), not objects.

### Facts: SC itself **[web]**

- Latest release `v3.0.17` (2026-10-23), Foundry 13+ / verified 14, dnd5e only (Foundry package page).
- Public API since that release (commit 2026-10-23, `sc:scripts/PublicApi.js`), set in `init`
  (`sc:scripts/lifecycleHandlers.js:24-34`): `game.modules.get("sc-item-rarity-colors").api = {version: 1,
  styleItemRow(row, item, {imageSelector = "img"})}`. `styleItemRow` styles a row the way SC styles an actor
  inventory row: rarity/spell gradient on the row, text colours on `.item-name`/`.item-type`/`.item-detail`/
  `.item-quantity`, border and effects on the image, unidentified cover; safe to call on every render. There is
  **no colour getter**.
- SC writes `CONFIG.DND5E.itemRarity = {key: label string}` in `init`, `setup`, `ready` and on list changes
  (`sc:core/rarityListConfig.js:289-314`); entries are strings, no `.color`.
- Colours are per-rarity world settings `sc-item-rarity-colors.<rarityKey>-<field>` (`sc:settings/settingsRegistration.js`
  `registerRaritySettings`, `sc:core/settingsManager.js:37-58`). Fields include `enable-item-color`, `item-color`,
  `secondary-item-color`, `gradient-option`, `glow-option`, `enable-text-color`, `text-color`,
  `enable-inventory-border-color`, `inventory-border-color`, `inventory-border-secondary-color`,
  `enable-inventory-title-color`, `inventory-title-color`, particle/aura/wave options (`sc:core/rarityFieldSchema.js`).
  The rarity list itself is the object setting `rarity-list-config` with toggle `rarity-list-enabled`
  (`sc:core/rarityListConfig.js:4-5`).
- Styling is class-based: `scirc-rarity-<key>` (`sc:core/constants.js:9`) plus a runtime `<style
  id="scirc-runtime-rarity-styles">` (`sc:core/runtimeRarityStyles.js:12`, `:122`), and per-element custom
  properties `--scirc-inv-bg-primary`, `--scirc-inv-bg-secondary`, `--scirc-inv-border-primary`,
  `--scirc-inv-title-color`, … set on the styled row (`sc:core/styleAppliers.js:17-24`), not on `:root`.
- Spell styles live in the object setting `spell-school-styles`, keyed `school_<abj>` or `school_<abj>_lvl_<n>`
  (`sc:core/spellSchoolConfig.js:6`, `:154-165`, `:336-342`).

### Consequence (by reading, not checked live)

With SC 3.0.17 none of the adapter's SC branches can match: no `api.getRarityColor`, no `scItemRarityColors` global,
no setting with those four names, no object entries in `itemRarity`, no `--sc-rarity-*` on `:root`, no
`spell-colors` setting. The adapter therefore returns its own fallback colours even when SC is active, and custom SC
rarities (e.g. `mythic`) fall back to `common`.

### Reuse vs build

- Reuse for a card: either `api.styleItemRow(cardRoot, item)` (gives SC's look and effects, row-shaped selectors), or
  read `<rarity>-item-color` / `-secondary-item-color` / `-inventory-border-color` settings directly into our own
  `--rarity-*` custom properties.
- Build: whichever read path #22 picks, plus a fix of the current adapter if it should honour SC (separate work).

### Risks

- `styleItemRow` is one release old and versioned (`api.version`); feature-detect it. Its selectors target an
  inventory row, so on a card only the root gradient and an `img` border are certain to apply.
- Reading SC settings directly ties us to SC's private key scheme (`<key>-<field>`), which the public API was meant to
  replace. Many fields are opt-in (`enable-*` default `false`).
- SC paints via classes and per-element variables; the project rule puts our tokens on `.tc-root`, while a card
  living on `document.body` sits outside every `.tc-root`.

## Unknowns

- Not checked live: whether `Tooltips5e` fills tooltips inside a detached (popped-out) window, and whether
  middle-click locking behaves there (its autoscroll guard is bound to the main `document` only).
- Not checked live: whether SC 3.0.17 is what the GM runs, and whether `styleItemRow` looks right on a non-row
  element.
- Not checked: other modules that override `CONFIG.ux.TooltipManager` or patch `Tooltips5e` in the GM's module set.
- Not read: `item-tooltip.hbs` spell block partial (`dnd5e.spell-block`) and `effect-tooltip.hbs` markup in detail.
