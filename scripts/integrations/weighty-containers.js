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

/** Minimum Weighty Containers API version this adapter understands. */
export const REQUIRED_WC_API_VERSION = 1;

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
 * Collect the lowercase tokens describing an item, mirroring how
 * Weighty Containers matches restrictions.
 * @param {Object} item
 * @returns {Set<string>}
 */
function getItemPropertyTokens(item) {
  const properties = item?.system?.properties;
  const tokens = new Set();
  if (properties instanceof Set || Array.isArray(properties)) {
    for (const property of properties) tokens.add(String(property ?? "").trim().toLowerCase());
  } else if (properties && typeof properties === "object") {
    for (const [key, value] of Object.entries(properties)) {
      if (value) tokens.add(key.trim().toLowerCase());
    }
  }
  tokens.delete("");
  return tokens;
}

function localizeReason(key, data) {
  return globalThis.game?.i18n?.format?.(key, data) ?? key;
}

/**
 * Validate moving an item into a container against Weighty Containers rules.
 * Delegates to the module's own validator when available so the two modules
 * cannot drift apart; otherwise applies an equivalent local check.
 * @param {Object} containerItem
 * @param {Object} droppedItem
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateContainerDrop(containerItem, droppedItem) {
  if (!containerItem || !droppedItem) return { ok: true };
  if (!isWeightyContainersActive()) return { ok: true };

  const api = getWeightyContainersApi();
  if (typeof api?.validateContainerRestrictions === "function") {
    try {
      const result = api.validateContainerRestrictions(containerItem, droppedItem);
      if (result && typeof result.ok === "boolean") {
        return {
          ok: result.ok,
          reason: result.ok ? undefined : (result.reason || localizeReason("AIM.containers.dropRejected", {
            item: droppedItem.name,
            container: containerItem.name
          }))
        };
      }
    } catch (err) {
      LOG.debug("Weighty Containers validation failed, using local rules", err);
    }
  }

  const config = getContainerRulesConfig(containerItem);
  if (!config) return { ok: true };

  const itemType = String(droppedItem.type ?? "").toLowerCase();
  const subType = String(
    droppedItem.system?.type?.value ?? droppedItem.system?.armor?.type ?? ""
  ).toLowerCase();
  const propTokens = getItemPropertyTokens(droppedItem);

  const reject = (key, data) => ({ ok: false, reason: localizeReason(key, data) });

  if (config.allowedTypes.length > 0 && !config.allowedTypes.includes(itemType)) {
    return reject("AIM.containers.typeNotAllowed", { container: containerItem.name, type: itemType });
  }

  if (config.allowedSubtypes.length > 0 && subType && !config.allowedSubtypes.includes(subType)) {
    return reject("AIM.containers.subtypeNotAllowed", { container: containerItem.name, subtype: subType });
  }

  for (const forbidden of config.forbiddenProperties) {
    if (propTokens.has(forbidden)) {
      return reject("AIM.containers.forbiddenProperty", {
        item: droppedItem.name,
        container: containerItem.name,
        property: forbidden
      });
    }
  }

  if (config.requiredProperties.length > 0) {
    const satisfied = config.propertyMatchMode === "any"
      ? config.requiredProperties.some(p => propTokens.has(p))
      : config.requiredProperties.every(p => propTokens.has(p));
    if (!satisfied) {
      return reject("AIM.containers.missingRequiredProperty", {
        item: droppedItem.name,
        container: containerItem.name,
        property: config.requiredProperties.join(", ")
      });
    }
  }

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
    containerItem.sheet.render(true);
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
