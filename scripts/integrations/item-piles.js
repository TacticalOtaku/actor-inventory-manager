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
 * Compute total actor currency value using the Item Piles API
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

  // With Item Piles active, its API resolves the configured currencies.
  if (isItemPilesActive()) {
    try {
      const actorCurrencies = globalThis.game?.itempiles?.API?.getActorCurrencies(actor);
      if (Array.isArray(actorCurrencies) && actorCurrencies.length > 0) {
        let total = 0;
        let primaryName = "GP";

        for (const curr of actorCurrencies) {
          total += num(curr.quantity, 0) * num(curr.exchangeRate, 1);
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
  const goldLabel = globalThis.game?.i18n?.localize?.("AIM.currency.gpAbbr");
  const primaryName = goldLabel && goldLabel !== "AIM.currency.gpAbbr" ? goldLabel : "GP";

  return {
    ...baseValues,
    total: defaultTotal,
    totalGold: formattedTotal,
    primaryName,
    formatted: `${formattedTotal} ${primaryName}`,
    customCurrencies: []
  };
}
