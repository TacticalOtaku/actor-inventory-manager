// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Weighty Containers Integration Adapter
// ─────────────────────────────────────────────────────────

import { num } from "../core/weight-calculator.js";

export const WEIGHTY_CONTAINERS_MODULE_ID = "weighty-containers";

/**
 * Check if the Weighty Containers module is installed and active
 * @returns {boolean}
 */
export function isWeightyContainersActive() {
  return Boolean(globalThis.game?.modules?.get(WEIGHTY_CONTAINERS_MODULE_ID)?.active);
}

/**
 * Get weight reduction percentage for a container
 * @param {Object} containerItem
 * @returns {number} 0 to 100
 */
export function getContainerWeightReductionPct(containerItem) {
  if (!containerItem) return 0;
  const flags = containerItem.flags?.[WEIGHTY_CONTAINERS_MODULE_ID] ?? {};
  const reduction = num(flags.reductionPct, 0);
  return Math.min(100, Math.max(0, reduction));
}

/**
 * Get container rules configuration if set
 * @param {Object} containerItem
 * @returns {Object|null}
 */
export function getContainerRulesConfig(containerItem) {
  if (!containerItem) return null;
  const flags = containerItem.flags?.[WEIGHTY_CONTAINERS_MODULE_ID];
  if (!flags) return null;

  return {
    reductionPct: num(flags.reductionPct, 0),
    allowedTypes: Array.isArray(flags.allowedTypes) ? flags.allowedTypes : [],
    allowedSubtypes: Array.isArray(flags.allowedSubtypes) ? flags.allowedSubtypes : [],
    requiredProperties: Array.isArray(flags.requiredProperties) ? flags.requiredProperties : [],
    forbiddenProperties: Array.isArray(flags.forbiddenProperties) ? flags.forbiddenProperties : [],
    propertyMatchMode: flags.propertyMatchMode ?? "all"
  };
}

/**
 * Validate moving an item into a container against Weighty Containers rules
 * @param {Object} containerItem
 * @param {Object} droppedItem
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateContainerDrop(containerItem, droppedItem) {
  if (!containerItem || !droppedItem) return { ok: true };
  if (!isWeightyContainersActive()) return { ok: true };

  const config = getContainerRulesConfig(containerItem);
  if (!config) return { ok: true };

  const itemType = droppedItem.type ?? "";
  const subType = droppedItem.system?.type?.value ?? droppedItem.system?.armor?.type ?? "";

  // Check allowedTypes
  if (config.allowedTypes.length > 0 && !config.allowedTypes.includes(itemType)) {
    return {
      ok: false,
      reason: `Container '${containerItem.name}' does not allow item type '${itemType}'`
    };
  }

  // Check allowedSubtypes
  if (config.allowedSubtypes.length > 0 && subType && !config.allowedSubtypes.includes(subType)) {
    return {
      ok: false,
      reason: `Container '${containerItem.name}' does not allow subtype '${subType}'`
    };
  }

  // Check forbiddenProperties
  const props = droppedItem.system?.properties;
  if (props && config.forbiddenProperties.length > 0) {
    const propList = props instanceof Set ? Array.from(props) : Array.isArray(props) ? props : Object.keys(props).filter(k => props[k]);
    for (const forbidden of config.forbiddenProperties) {
      if (propList.includes(forbidden)) {
        return {
          ok: false,
          reason: `Item '${droppedItem.name}' has forbidden property '${forbidden}' for container '${containerItem.name}'`
        };
      }
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
    ui.notifications?.warn("Weighty Containers module is not active.");
    return;
  }

  // Try to use weighty-containers public API / export if available
  const wc = globalThis.WeightyContainers;
  if (wc && typeof wc.openReductionDialog === "function") {
    return wc.openReductionDialog(containerItem);
  }

  // Or click the container's inline gear or open sheet
  if (typeof containerItem.sheet?.render === "function") {
    containerItem.sheet.render(true);
  }
}
