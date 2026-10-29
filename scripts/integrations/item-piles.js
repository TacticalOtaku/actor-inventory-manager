// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Item Piles Integration
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";
import { LOG } from "../foundry/logger.js";

/** dnd5e's default rates, for a world without CONFIG. */
const COINS_PER_GOLD = { pp: 0.1, gp: 1, ep: 2, sp: 10, cp: 100 };

/**
 * Check if the Item Piles module is installed and active
 * @returns {boolean}
 */
export function isItemPilesActive() {
  return Boolean(globalThis.game?.modules?.get("item-piles")?.active);
}

/** Whether an actor is an Item Piles pile (its items are taken through the Item Piles window, not dragged out). */
export function isItemPile(actor) {
  if (!isItemPilesActive()) return false;
  try {
    return Boolean(globalThis.game.itempiles?.API?.isValidItemPile?.(actor));
  } catch {
    return false;
  }
}

/** The actor's token on the scene the user views, where a dropped item lands; null without one. */
export function groundToken(actor) {
  return actor?.getActiveTokens?.(false, true)?.[0] ?? null;
}

/**
 * Lays the item on the ground as an Item Piles pile at the actor's token, then takes it from the actor. A stack goes
 * whole. Item Piles makes the pile through a GM; it warns and returns false without one, and the item stays.
 * @param {Item} item
 * @returns {Promise<boolean>}
 */
export async function dropOnGround(item) {
  const token = groundToken(item.actor);
  if (!token || !isItemPilesActive()) return false;
  const data = item.toObject();
  if ("equipped" in data.system) data.system.equipped = false;
  if ("attuned" in data.system) data.system.attuned = false;
  data.system.container = null;
  // The slot and «Новое» belong to this actor.
  delete data.flags?.[MODULE_ID];
  try {
    const pile = await globalThis.game.itempiles.API.createItemPile({
      sceneId: token.parent.id, position: { x: token.x, y: token.y }, tokenOverrides: { elevation: token.elevation }, items: [data]
    });
    if (!pile) return false;
  } catch (err) {
    LOG.warn("Item Piles could not create a pile", err);
    return false;
  }
  await item.delete();
  return true;
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
          // Secondary currencies (Item Piles' SECONDARY_CURRENCIES) have no exchange rate and no gold value.
          if (curr.secondary) continue;
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

  // dnd5e's own rates, as the item prices use them: `conversion` is coins per gold piece (5.3.3).
  const currencies = globalThis.CONFIG?.DND5E?.currencies ?? {};
  const defaultTotal = Object.entries(baseValues)
    .reduce((sum, [key, value]) => sum + value / (Number(currencies[key]?.conversion) || COINS_PER_GOLD[key]), 0);
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

/**
 * Every currency Item Piles defines for the actor, zero amounts included (the purse shows them all).
 * @param {Object} actor
 * @returns {Object[]} empty when Item Piles is inactive or fails
 */
export function readPilesCurrencies(actor) {
  if (!isItemPilesActive()) return [];
  try {
    return globalThis.game?.itempiles?.API?.getActorCurrencies(actor, { getAll: true }) ?? [];
  } catch (err) {
    LOG.warn("Item Piles currencies could not be read", err);
    return [];
  }
}
