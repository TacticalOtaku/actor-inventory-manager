// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Item Piles Integration
// ─────────────────────────────────────────────────────────

import { LOG } from "../foundry/logger.js";

/**
 * Check if the Item Piles module is installed and active
 * @returns {boolean}
 */
export function isItemPilesActive() {
  return Boolean(globalThis.game?.modules?.get("item-piles")?.active);
}

/**
 * Get Item Piles currency configuration from game settings
 * @returns {Array<Object>|null}
 */
export function getItemPilesCurrenciesSetting() {
  if (!isItemPilesActive()) return null;
  try {
    const currencies = globalThis.game?.settings?.get("item-piles", "currencies");
    return Array.isArray(currencies) && currencies.length > 0 ? currencies : null;
  } catch {
    return null;
  }
}

/**
 * Compute total actor currency value using Item Piles settings or API
 * @param {Object} actor
 * @returns {Object} { total: number, formatted: string, primaryName: string, pp: number, gp: number, ep: number, sp: number, cp: number }
 */
export function computeActorCurrency(actor) {
  if (!actor) {
    return {
      total: 0,
      totalGold: "0.00",
      primaryName: "GP",
      formatted: "0.00 GP",
      pp: 0,
      gp: 0,
      ep: 0,
      sp: 0,
      cp: 0,
      customCurrencies: []
    };
  }

  const systemCurrency = actor.system?.currency ?? { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  const num = (v, def = 0) => (typeof v === "number" && !isNaN(v) ? v : (parseFloat(v) || def));

  const baseValues = {
    pp: num(systemCurrency.pp, 0),
    gp: num(systemCurrency.gp, 0),
    ep: num(systemCurrency.ep, 0),
    sp: num(systemCurrency.sp, 0),
    cp: num(systemCurrency.cp, 0)
  };

  // If Item Piles is active, try to resolve currencies using Item Piles API or Settings
  if (isItemPilesActive()) {
    try {
      const itemPilesAPI = globalThis.game?.itempiles?.API || globalThis.ItemPiles?.API;

      // 1. Try Item Piles API getActorCurrencies
      if (itemPilesAPI?.getActorCurrencies) {
        const actorCurrencies = itemPilesAPI.getActorCurrencies(actor);
        if (Array.isArray(actorCurrencies) && actorCurrencies.length > 0) {
          let total = 0;
          let primaryName = "GP";

          for (const curr of actorCurrencies) {
            const qty = num(curr.quantity ?? curr.amount ?? curr.value, 0);
            const rate = num(curr.exchangeRate, 1);
            total += qty * rate;
            if (curr.primary) {
              const rawAbbr = curr.abbreviation || curr.name || "GP";
              primaryName = rawAbbr.replace("{#}", "").trim() || "GP";
            }
          }

          const formattedTotal = total.toFixed(2);
          return {
            ...baseValues,
            total,
            totalGold: formattedTotal,
            primaryName,
            formatted: `${formattedTotal} ${primaryName}`,
            customCurrencies: actorCurrencies
          };
        }
      }

      // 2. Try Item Piles configured currencies settings
      const configuredCurrencies = getItemPilesCurrenciesSetting();
      if (configuredCurrencies) {
        let total = 0;
        let primaryName = "GP";

        for (const curr of configuredCurrencies) {
          const rate = num(curr.exchangeRate, 1);
          let qty = 0;

          if (curr.type === "attribute" && curr.data?.path) {
            qty = num(
              globalThis.foundry?.utils?.getProperty
                ? globalThis.foundry.utils.getProperty(actor, curr.data.path)
                : actor.system?.currency?.[curr.data.path.split(".").pop()],
              0
            );
          } else if (curr.type === "item") {
            const items = Array.from(actor.items ? actor.items.values() : []).filter(i => (
              (curr.data?.item && i.name === curr.data.item) ||
              i.flags?.["item-piles"]?.currency === true
            ));
            for (const it of items) {
              qty += num(it.system?.quantity, 1);
            }
          }

          total += qty * rate;
          if (curr.primary) {
            const rawAbbr = curr.abbreviation || curr.name || "GP";
            primaryName = rawAbbr.replace("{#}", "").trim() || "GP";
          }
        }

        const formattedTotal = total.toFixed(2);
        return {
          ...baseValues,
          total,
          totalGold: formattedTotal,
          primaryName,
          formatted: `${formattedTotal} ${primaryName}`,
          customCurrencies: []
        };
      }
    } catch (err) {
      LOG.warn("Item Piles currency computation error, falling back to standard dnd5e calculation", err);
    }
  }

  // Standard dnd5e default calculation (1 pp = 10 gp, 1 gp = 1 gp, 1 ep = 0.5 gp, 1 sp = 0.1 gp, 1 cp = 0.01 gp)
  const defaultTotal = (
    baseValues.pp * 10 +
    baseValues.gp +
    baseValues.ep * 0.5 +
    baseValues.sp * 0.1 +
    baseValues.cp * 0.01
  );
  const formattedTotal = defaultTotal.toFixed(2);

  return {
    ...baseValues,
    total: defaultTotal,
    totalGold: formattedTotal,
    primaryName: "GP",
    formatted: `${formattedTotal} GP`,
    customCurrencies: []
  };
}
