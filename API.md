# AIM: Actor Window — Public API Reference

The module exposes its frozen public API (`Object.freeze`) once Foundry reaches `ready` in two places:

- `game.modules.get("actor-inventory-manager").api`
- `globalThis.ActorInventoryManager`

All top-level properties on the API object as well as the constant enums (`SLOTS`, `FLAGS`, `ENFORCEMENT_MODES`) are frozen and cannot be overwritten or mutated.

---

## Quick Examples

### Register a custom equipment rule

```js
Hooks.once("actor-inventory-manager.ready", (api) => {
  api.equipmentRuleEngine.registerRule({
    id: "no-heavy-armor-for-wizards",
    name: "Wizards cannot wear heavy armor",
    validate: (actor, item, targetSlotId, _slotMap) => {
      const isWizard = Boolean(actor.classes?.wizard);
      const isHeavy = item.system?.type?.value === "heavy";
      if (isWizard && isHeavy) {
        return {
          valid: false,
          code: "WIZARD_HEAVY_ARMOR",
          error: `${actor.name} cannot wear heavy armor.`
        };
      }
      return { valid: true };
    }
  });
});
```

### Switch an actor's equipment loadout from a macro

```js
const aim = game.modules.get("actor-inventory-manager")?.api;
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (aim && actor) {
  await aim.applyActorLoadout(actor, "Bow");
}
```

### Open the Actor Window for the selected token

```js
const aim = ActorInventoryManager;
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (actor) aim.openWindow(actor);
```

---

## Windows & Editor

| Method | Signature | Description |
| --- | --- | --- |
| `openWindow` | `(actor: Actor) => ActorWindow \| null` | Opens (or focuses/maximizes) the Actor Window for a supported actor (`character`, `vehicle`, or player-owned `npc`) when the user has at least `OBSERVER` permission. |
| `toggleWindow` | `(actor: Actor) => ActorWindow \| Promise \| null` | Toggles the Actor Window open/closed (restores if minimized). |
| `openInventory` | `(actor: Actor) => ActorWindow \| null` | Alias for `openWindow` kept for 1.x callers. |
| `toggleInventory` | `(actor: Actor) => ActorWindow \| Promise \| null` | Alias for `toggleWindow` kept for 1.x callers. |
| `openEditor` | `(actor: Actor) => PresetEditor \| null` | GM-only. Opens the paperdoll Preset Editor window for a supported actor. |

---

## Equipment Loadouts

Loadouts are saved per actor under `flags["actor-inventory-manager"].loadouts` (up to 12 sets per actor). Applying a loadout validates all slots together through `equipmentRuleEngine` under the world's `enforcementMode` and performs a single serialized `EquipService` batch update while preserving containers, natural weapons, and ammunition.

| Method | Signature | Description |
| --- | --- | --- |
| `getActorLoadouts` | `(actor: Actor) => Loadout[]` | Returns the normalized list of saved equipment loadouts for the actor. |
| `saveActorLoadout` | `(actor: Actor, options?: { id?: string, name?: string, icon?: string }) => Promise<Loadout \| null>` | Snapshots currently equipped doll slots and managed slotless gear. Pass `id` to overwrite an existing loadout. |
| `renameActorLoadout` | `(actor: Actor, id: string, patch?: { name?: string, icon?: string }) => Promise<Loadout \| null>` | Updates the name and/or icon of an existing loadout without altering its captured items. |
| `deleteActorLoadout` | `(actor: Actor, id: string) => Promise<boolean>` | Removes a saved loadout by ID. Returns `true` if deleted. |
| `applyActorLoadout` | `(actor: Actor, idOrName: string) => Promise<boolean>` | Equips the matching loadout (by ID or case-insensitive name) and unequips displaced gear atomically on this client. |

---

## Item Actions

`equipItem`, `unequipItem`, `toggleItemEquipped`, and `toggleAttunement` serialize per actor UUID via `EquipService` and resolve to `true` when the change was committed or `false` when refused (missing permission, slot rules, attunement cap, or `preUpdateItem` hook veto).

| Method | Signature | Description |
| --- | --- | --- |
| `equipItem` | `(actor: Actor, item: Item, targetSlotId: string) => Promise<boolean>` | Equips `item` into `targetSlotId` under the active enforcement mode. |
| `unequipItem` | `(actor: Actor, item: Item) => Promise<boolean>` | Unequips `item` and clears its assigned slot flag. |
| `toggleItemEquipped` | `(actor: Actor, item: Item) => Promise<boolean>` | Unequips if equipped, otherwise equips into the slot selected by `findBestSlotForEquipping`. |
| `useItem` | `(item: Item, event?: Event) => Promise<unknown>` | Uses/rolls `item` via dnd5e (`item.use({ event })`), falling back to `roll()` or opening its sheet. |
| `toggleAttunement` | `(item: Item) => Promise<boolean>` | Attunes or ends attunement on `item`, checking the actor's derived attunement cap. |

---

## Equipment Rules, Slots & Comparison

| Symbol | Signature / Type | Description |
| --- | --- | --- |
| `getEquippedMap` | `(actor: Actor) => Map<string, Item>` | Builds a `slotId -> Item` map of currently equipped items, auto-reconciling unassigned items when enabled. |
| `isOffHandLockedBy2H` | `(slotMap: Map<string, Item>, actor?: Actor) => boolean` | Returns `true` when any main-hand slot holds a two-handed weapon. |
| `classifyItem` | `(item: Item) => string` | Classifies an item (`"weapon"`, `"weapon_two_handed"`, `"shield"`, `"armor"`, `"head"`, `"neck"`, `"cloak"`, `"hands"`, `"waist"`, `"feet"`, `"ring"`, etc.). |
| `getValidSlotsForItem` | `(item: Item, actor?: Actor \| null) => string[]` | Lists compatible slot IDs for `item` on the actor's active paperdoll template. |
| `findBestSlotForEquipping` | `(actor: Actor, item: Item, slotMap?: Map<string, Item>) => string \| null` | Selects the best free (or swappable) compatible slot for `item`, or `null` if none fits. |
| `getItemAssignedSlot` | `(item: Item) => string \| null` | Reads the item's stored `flags["actor-inventory-manager"].slot`. |
| `isItemCompatibleWithSlot` | `(item: Item, slotId: string, actor?: Actor \| null) => boolean` | Returns `true` if `item` can be placed in `slotId`. |
| `isTwoHandedWeapon` | `(item: Item) => boolean` | Returns `true` if `item` is a weapon with the `two` / `two-handed` property. |
| `isShield` | `(item: Item) => boolean` | Returns `true` if `item.system?.type?.value === "shield"`. |
| `isBodyArmor` | `(item: Item) => boolean` | Returns `true` if `item` represents wearable body armor. |
| `findCompareTargets` | `(actor: Actor, hoveredItem: Item, options?: { slotMap?: Map<string, Item>, max?: number }) => Array<{ slotId: string, slotLabel: string, item: Item }>` | Finds currently equipped item(s) occupying the target slot(s) for an unequipped backpack item (including a 2H weapon locking the off hand). |
| `equipmentRuleEngine` | `EquipmentRuleEngine` | Rule engine instance (`registerRule({ id, name, validate })`, `validateEquip(actor, item, targetSlotId, options)`). |

---

## Paperdoll Templates

| Method | Signature | Description |
| --- | --- | --- |
| `getActorPaperdollTemplate` | `(actor: Actor) => Object` | Resolves the active template (actor custom, explicit preset ID, or actor-type default). |
| `getActorSlots` | `(actor: Actor) => Object[]` | Returns the slot definitions from the actor's active paperdoll template. |
| `setActorPaperdollTemplate` | `(actor: Actor, templateId: string \| null, customTemplateData?: Object \| null, options?: { applyAttunement?: boolean }) => Promise<void>` | Assigns a preset or custom template to an actor and optionally updates base attunement cap. |
| `saveWorldCustomTemplate` | `(templateData: Object) => Promise<Object>` | Normalizes and saves a custom template to world settings. |
| `deleteWorldCustomTemplate` | `(templateId: string) => Promise<boolean>` | Removes a world custom template by ID. |
| `getAllTemplates` | `() => Object[]` | Returns all built-in and world custom templates. |
| `getTemplateById` | `(templateId: string, fallbackId?: string) => Object` | Looks up a built-in or custom template by ID. |
| `exportTemplateJSON` | `(templateId: string) => string` | Serializes a template definition to formatted JSON. |
| `importTemplateJSON` | `(jsonString: string) => Promise<Object>` | Validates and imports a template JSON string into world templates. |

---

## Encumbrance, Vitals & Display

| Method | Signature | Description |
| --- | --- | --- |
| `computeActorEncumbrance` | `(actor: Actor, options?: { unit?: string, rule?: string }) => Object` | Computes carried weight, capacity, tier (`"normal"`, `"encumbered"`, `"heavily_encumbered"`, `"overburdened"`), and meter thresholds. |
| `computeActorCapacity` | `(actor: Actor, unit?: string) => Object` | Computes carrying capacity thresholds (`encumbered`, `heavilyEncumbered`, `max`, `unit`). |
| `extractActorVitals` | `(actor: Actor) => Object` | Extracts HP, AC, initiative, speeds, passives, abilities, currency, and attunement counters for an actor. |
| `formatItemForDisplay` | `(item: Item) => Object \| null` | Formats item rarity visuals, weight, price, properties, and attunement while respecting unidentified item concealment for players. |

---

## Constants

| Export | Values |
| --- | --- |
| `SLOTS` | `HEAD`, `NECK`, `CLOAK`, `ARMOR`, `HANDS`, `WAIST`, `FEET`, `RING_1`, `RING_2`, `MAIN_HAND`, `OFF_HAND` |
| `FLAGS` | `SLOT`, `LOCKED_BY_2H`, `EQUIPPED_AT`, `QUICK_SLOT`, `TEMPLATE_ID`, `CUSTOM_TEMPLATE`, `TRADE_NEW`, `LOADOUTS` |
| `ENFORCEMENT_MODES` | `BLOCK` (`"block"`), `AUTO_SWAP` (`"auto_swap"`), `WARN` (`"warn"`) |

---

## Optional Module Integrations

| Method | Signature | Description |
| --- | --- | --- |
| `isWeightyContainersActive` | `() => boolean` | Returns `true` when Weighty Containers is installed and active. |
| `getContainerWeightReductionPct` | `(containerItem: Item) => number` | Returns the container's weight-reduction percentage (`0–100`). |
| `validateContainerDrop` | `(containerItem: Item, droppedItem: Item) => { ok: boolean, code?: string, reason?: string }` | Validates whether `droppedItem` satisfies Weighty Containers rules for `containerItem`. |
| `openWeightyContainersDialog` | `(containerItem: Item) => Promise<unknown>` | Opens Weighty Containers' container-rules configuration dialog. |
| `isItemPilesActive` | `() => boolean` | Returns `true` when Item Piles (and its active currency configuration) is enabled. |
| `computeActorCurrency` | `(actor: Actor) => Object` | Computes actor coin/currency breakdown via Item Piles if active, else standard D&D 5e currencies. |

---

## Hooks

| Hook | Arguments | Description |
| --- | --- | --- |
| `actor-inventory-manager.ready` | `(api)` | Fired once on `ready` after the frozen `api` is attached. Register custom equipment rules here. |
| `actor-inventory-manager.refresh` | `()` | Triggers all open Actor Windows to re-render (e.g., after changing visual or template settings). |
| `actor-inventory-manager.tradeState` | `(state)` | Fired when the persisted player-to-player trade state changes. |
