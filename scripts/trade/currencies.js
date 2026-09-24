import { isItemPilesActive } from "../integrations/item-piles.js";

export const COINS = ["pp", "gp", "ep", "sp", "cp"];
export const tradeError = key => new Error(`AIM.trade.errors.${key}`);
export function pilesAPI() {
  return globalThis.game?.itempiles?.API;
}

/** The signature excludes balances but includes all conversion definitions. */
export function currencyProfile(actor) {
  if (!isItemPilesActive()) {
    return { mode: "dnd5e", signature: "dnd5e", rows: COINS.map(key => ({
      key, label: key.toUpperCase(), quantity: Number(actor.system?.currency?.[key] ?? 0), path: `system.currency.${key}`
    })) };
  }
  const api = pilesAPI();
  if (!api?.getActorCurrencies || !api?.getPaymentData || !api?.transferCurrencies) throw tradeError("provider");
  const currencies = api.getActorCurrencies(actor, { getAll: true, secondary: true });
  if (!Array.isArray(currencies) || !currencies.length) throw tradeError("provider");
  const rows = currencies.map((c, index) => {
    const definition = structuredClone(c.data?.uuid ?? c.data?.path ?? c.path ?? c.data?.item);
    if (definition && typeof definition === "object") { delete definition._id; delete definition._stats; }
    return ({
    key: String(index), label: globalThis.game?.i18n?.localize(c.name) ?? c.name,
    abbreviation: c.abbreviation, quantity: Number(c.quantity ?? 0),
    path: (!c.type || c.type === "attribute") ? c.data?.path ?? c.path : null,
    itemId: c.item?.id ?? c.item?._id, type: c.type ?? "attribute",
    definition, primary: Boolean(c.primary),
    secondary: Boolean(c.secondary), rate: c.exchangeRate
  }); });
  if (rows.some(r => typeof r.abbreviation !== "string" || !r.abbreviation.trim())) throw tradeError("provider");
  return { mode: "item-piles", rows, signature: JSON.stringify(rows.map(({ abbreviation, type, definition, secondary, primary, rate }) => ({ abbreviation, type, definition, secondary, primary, rate }))) };
}

export function validateMoney(actor, money = {}, signature) {
  const profile = currencyProfile(actor);
  if (signature !== undefined && signature !== profile.signature) throw tradeError("providerChanged");
  if (!money || typeof money !== "object" || Array.isArray(money)) throw tradeError("amount");
  const normalized = {};
  for (const [key, amount] of Object.entries(money)) {
    const row = profile.rows.find(r => r.key === key);
    if (!row || typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) throw tradeError("amount");
    if (profile.mode === "dnd5e" && (!Number.isSafeInteger(amount) || amount > row.quantity)) throw tradeError("funds");
    if (amount > 0) normalized[key] = amount;
  }
  const price = profile.rows.filter(r => normalized[r.key]).map(r => {
    const amount = normalized[r.key];
    return r.abbreviation?.includes("{#}") ? r.abbreviation.replaceAll("{#}", String(amount)) : `${amount}${r.abbreviation}`;
  }).join(" ");
  if (profile.mode === "item-piles" && price && pilesAPI().getPaymentData(price, { target: actor })?.canBuy !== true) throw tradeError("funds");
  return { profile, money: normalized, price };
}

export async function transferMoney(source, target, money, signature, interactionId, guard = () => {}) {
  guard();
  const checked = validateMoney(source, money, signature);
  if (!Object.keys(checked.money).length) return;
  if (currencyProfile(target).signature !== signature) throw tradeError("providerChanged");
  if (checked.profile.mode === "item-piles") {
    const result = await pilesAPI().transferCurrencies(source, target, checked.price, { interactionId, change: true });
    guard();
    if (!result) throw tradeError("transfer");
    return;
  }
  const debit = {}, credit = {};
  for (const [key, amount] of Object.entries(checked.money)) {
    const balance = Number(target.system?.currency?.[key] ?? 0);
    if (!Number.isSafeInteger(balance) || balance < 0 || !Number.isSafeInteger(balance + amount)) throw tradeError("amount");
    debit[`system.currency.${key}`] = Number(source.system?.currency?.[key] ?? 0) - amount;
    credit[`system.currency.${key}`] = balance + amount;
  }
  await source.update(debit);
  guard();
  if (Object.entries(debit).some(([path, value]) => Number(source.system?.currency?.[path.split(".").at(-1)] ?? 0) !== value)) throw tradeError("transfer");
  await target.update(credit);
  guard();
  if (Object.entries(credit).some(([path, value]) => Number(target.system?.currency?.[path.split(".").at(-1)] ?? 0) !== value)) throw tradeError("transfer");
}
