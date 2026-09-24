// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Weighty Containers Integration Adapter
// ─────────────────────────────────────────────────────────

import { num } from "../core/weight-calculator.js";
import { LOG } from "../foundry/logger.js";

export const WEIGHTY_CONTAINERS_MODULE_ID = "weighty-containers";

/**
 * Check if the Weighty Containers module is installed and active
 * @returns {boolean}
 */
export function isWeightyContainersActive() {
  return Boolean(globalThis.game?.modules?.get(WEIGHTY_CONTAINERS_MODULE_ID)?.active);
}

/**
 * Resolve the Weighty Containers public API.
 *
 * `game.modules.get(...).api` is the supported handle (Weighty Containers 3.4+).
 * `globalThis.weightyCont` is the console handle and is accepted as a fallback
 * for older builds, which published only that.
 *
 * @returns {Object|null}
 */
export function getWeightyContainersApi() {
  if (!isWeightyContainersActive()) return null;
  return globalThis.game?.modules?.get(WEIGHTY_CONTAINERS_MODULE_ID)?.api
    ?? globalThis.weightyCont
    ?? null;
}

/**
 * Total weight the actor carries with every container reduction applied,
 * in the unit dnd5e displays. Used only when the system encumbrance block is
 * unavailable - that block already includes Weighty Containers' reductions.
 * @param {Object} actor
 * @returns {number|null} pounds, or null without the module
 */
export function getActorCarriedLbs(actor) {
  const api = getWeightyContainersApi();
  if (typeof api?.computeActorCarriedLbs !== "function") return null;
  try {
    const lbs = Number(api.computeActorCarriedLbs(actor));
    return Number.isFinite(lbs) ? lbs : null;
  } catch (err) {
    LOG.debug("Weighty Containers computeActorCarriedLbs failed", err);
    return null;
  }
}

/**
 * Load and capacity for a container, straight from Weighty Containers.
 *
 * Only that module knows the adjusted load: it applies each container's weight
 * reduction and walks nested containers. Recomputing it here would drift.
 *
 * @param {Object} actor
 * @param {string} containerId
 * @returns {Object|null} see the module's `getContainerLoad`
 */
export function getContainerLoad(actor, containerId) {
  const api = getWeightyContainersApi();
  if (typeof api?.getContainerLoad !== "function") return null;
  try {
    return api.getContainerLoad(actor, containerId);
  } catch (err) {
    LOG.debug("Weighty Containers getContainerLoad failed", err);
    return null;
  }
}

/**
 * Get weight reduction percentage for a container
 * @param {Object} containerItem
 * @returns {number} 0 to 100
 */
export function getContainerWeightReductionPct(containerItem) {
  if (!containerItem) return 0;
  const api = getWeightyContainersApi();
  if (typeof api?.getReductionPct === "function") {
    try {
      return Math.min(100, Math.max(0, num(api.getReductionPct(containerItem), 0)));
    } catch (err) {
      LOG.debug("Weighty Containers getReductionPct failed, using flags", err);
    }
  }
  const flags = containerItem.flags?.[WEIGHTY_CONTAINERS_MODULE_ID] ?? {};
  const reduction = num(flags.reductionPct, 0);
  return Math.min(100, Math.max(0, Math.round(reduction)));
}

/**
 * Normalize a restriction flag into a token list.
 * Weighty Containers stores these either as arrays or as delimited strings,
 * so both shapes have to be accepted.
 * @param {unknown} value
 * @returns {Array<string>}
 */
export function parseTokenList(value) {
  if (Array.isArray(value)) {
    return value.map(v => String(v ?? "").trim().toLowerCase()).filter(Boolean);
  }
  return String(value ?? "")
    .split(/[,\n;]/)
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Get container rules configuration if set
 * @param {Object} containerItem
 * @returns {Object|null}
 */
export function getContainerRulesConfig(containerItem) {
  if (!containerItem) return null;

  const api = getWeightyContainersApi();
  if (typeof api?.getContainerRestrictions === "function") {
    try {
      const restrictions = api.getContainerRestrictions(containerItem);
      if (restrictions) {
        return {
          reductionPct: getContainerWeightReductionPct(containerItem),
          ...restrictions
        };
      }
    } catch (err) {
      LOG.debug("Weighty Containers getContainerRestrictions failed, using flags", err);
    }
  }

  const flags = containerItem.flags?.[WEIGHTY_CONTAINERS_MODULE_ID];
  if (!flags) return null;

  return {
    reductionPct: num(flags.reductionPct, 0),
    allowedTypes: parseTokenList(flags.allowedTypes),
    allowedSubtypes: parseTokenList(flags.allowedSubtypes),
    requiredProperties: parseTokenList(flags.requiredProperties),
    forbiddenProperties: parseTokenList(flags.forbiddenProperties),
    propertyMatchMode: flags.propertyMatchMode === "any" ? "any" : "all"
  };
}

/**
 * Collect the lowercase property tokens of an item, mirroring Weighty Containers.
 * @param {Object} item
 * @returns {Set<string>}
 */
function getItemPropertyTokens(item) {
  const tokens = new Set();
  for (const property of item?.system?.properties ?? []) tokens.add(String(property ?? "").trim().toLowerCase());
  tokens.delete("");
  return tokens;
}

/**
 * Tokens a subtype restriction is matched against: type, subtype, base item,
 * identifier, weapon-type alias and properties - the same set Weighty
 * Containers uses.
 * @param {Object} item
 * @returns {Set<string>}
 */
function getItemMatchTokens(item) {
  const tokens = new Set();
  const add = value => {
    const token = String(value ?? "").trim().toLowerCase();
    if (token) tokens.add(token);
  };
  add(item?.type);
  const typeData = item?.system?.type;
  if (typeData && typeof typeData === "object") {
    add(typeData.value);
    add(typeData.subtype);
    add(typeData.baseItem);
    add(typeData.identifier);
    add(globalThis.CONFIG?.DND5E?.weaponTypeMap?.[typeData.value]);
  }
  const attackType = item?.system?.attackType;
  if (typeof attackType === "string") add(attackType);
  for (const property of getItemPropertyTokens(item)) add(property);
  return tokens;
}

function localizeReason(key, data) {
  return globalThis.game?.i18n?.format?.(key, data) ?? key;
}

/**
 * Human-readable text for a Weighty Containers rejection code.
 * The module's validator returns a code ("type" | "subtype" | "property" |
 * "forbiddenProperty") together with the container's restrictions.
 * @param {string} code
 * @param {Object} containerItem
 * @param {Object} droppedItem
 * @param {Object} [restrictions]
 * @returns {string}
 */
function describeRejection(code, containerItem, droppedItem, restrictions = {}) {
  const container = containerItem?.name;
  const item = droppedItem?.name;
  const list = values => (Array.isArray(values) ? values.join(", ") : "");
  switch (code) {
    case "type":
      return localizeReason("AIM.containers.typeNotAllowed", { container, item, type: droppedItem?.type, allowed: list(restrictions.allowedTypes) });
    case "subtype":
      return localizeReason("AIM.containers.subtypeNotAllowed", { container, item, subtype: droppedItem?.system?.type?.value ?? "", allowed: list(restrictions.allowedSubtypes) });
    case "property":
      return localizeReason("AIM.containers.missingRequiredProperty", { container, item, property: list(restrictions.requiredProperties) });
    case "forbiddenProperty":
      return localizeReason("AIM.containers.forbiddenProperty", { container, item, property: list(restrictions.forbiddenProperties) });
    default:
      return localizeReason("AIM.containers.dropRejected", { container, item });
  }
}

/**
 * Validate moving an item into a container against Weighty Containers rules.
 * Delegates to the module's own validator when available so the two modules
 * cannot drift apart; otherwise applies an equivalent local check.
 * Capacity is not checked here: Weighty Containers enforces it itself when the
 * item's container changes, and reports the overflow in its own words.
 * @param {Object} containerItem
 * @param {Object} droppedItem
 * @returns {{ ok: boolean, code?: string, reason?: string }}
 */
export function validateContainerDrop(containerItem, droppedItem) {
  if (!containerItem || !droppedItem) return { ok: true };
  if (!isWeightyContainersActive()) return { ok: true };

  const api = getWeightyContainersApi();
  if (typeof api?.validateContainerRestrictions === "function") {
    try {
      const result = api.validateContainerRestrictions(containerItem, droppedItem);
      if (result && typeof result.ok === "boolean") {
        if (result.ok) return { ok: true };
        return {
          ok: false,
          code: result.reason ?? null,
          reason: describeRejection(result.reason, containerItem, droppedItem, result.restrictions)
        };
      }
    } catch (err) {
      LOG.debug("Weighty Containers validation failed, using local rules", err);
    }
  }

  const config = getContainerRulesConfig(containerItem);
  if (!config) return { ok: true };

  const reject = code => ({ ok: false, code, reason: describeRejection(code, containerItem, droppedItem, config) });
  const itemType = String(droppedItem.type ?? "").toLowerCase();
  const propTokens = getItemPropertyTokens(droppedItem);

  // Same order as Weighty Containers: type, subtype, required, forbidden.
  if (config.allowedTypes.length > 0 && !config.allowedTypes.includes(itemType)) return reject("type");

  if (config.allowedSubtypes.length > 0) {
    const matchTokens = getItemMatchTokens(droppedItem);
    if (!config.allowedSubtypes.some(token => matchTokens.has(token))) return reject("subtype");
  }

  if (config.requiredProperties.length > 0) {
    const satisfied = config.propertyMatchMode === "any"
      ? config.requiredProperties.some(p => propTokens.has(p))
      : config.requiredProperties.every(p => propTokens.has(p));
    if (!satisfied) return reject("property");
  }

  if (config.forbiddenProperties.some(forbidden => propTokens.has(forbidden))) return reject("forbiddenProperty");

  return { ok: true };
}

/**
 * Open Weighty Containers configuration dialog for a container item
 * @param {Object} containerItem
 */
export async function openWeightyContainersDialog(containerItem) {
  if (!containerItem) return;
  if (!isWeightyContainersActive()) {
    ui.notifications?.warn(game.i18n.localize("AIM.containers.weightyInactive"));
    return;
  }

  const api = getWeightyContainersApi();
  const apiOpen = api?.openRulesDialog ?? api?.openReductionDialog;
  if (typeof apiOpen === "function") {
    return apiOpen(containerItem);
  }

  LOG.warn("Weighty Containers exposes no rules dialog; opening the item sheet instead", {
    apiVersion: api?.apiVersion ?? null
  });
  if (typeof containerItem.sheet?.render === "function") {
    containerItem.sheet.render({ force: true });
  }
}

/**
 * Re-render open inventory windows when a container's rules change.
 * Weighty Containers announces saves on its own hook; without it the reduction
 * badge and the load meter would only refresh on the next unrelated update.
 * @param {() => void} onChange
 * @returns {number|null} hook id
 */
export function watchContainerRules(onChange) {
  if (typeof globalThis.Hooks?.on !== "function") return null;
  return globalThis.Hooks.on(`${WEIGHTY_CONTAINERS_MODULE_ID}.updateContainerRules`, onChange);
}
