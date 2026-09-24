import { isPhysicalItem } from "../core/item-classifier.js";
import { currencyProfile, tradeError, validateMoney } from "./currencies.js";
import { canonicalJSON, documentFingerprint } from "./document-data.js";

export const emptyOffer = () => ({ items: [], money: {} });

export function transferableItems(actor) {
  const currencyIds = new Set(currencyProfile(actor).rows.map(r => r.itemId).filter(Boolean));
  return Array.from(actor.items.values()).filter(item => isPhysicalItem(item) && !currencyIds.has(item.id)
    && !Array.from(actor.items.values()).some(child => child.system?.container === item.id));
}

export function itemFingerprint(item) {
  return documentFingerprint(item.toObject());
}

export function normalizeOffer(actor, offer, signature) {
  if (!offer || !Array.isArray(offer.items) || offer.items.length > 200) throw tradeError("item");
  const allowed = new Set(transferableItems(actor).map(i => i.id));
  const seen = new Set();
  const items = offer.items.map(entry => {
    const item = actor.items.get(entry.id);
    const quantity = entry.quantity;
    if (!item || !allowed.has(item.id) || seen.has(item.id) || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > Number(item.system?.quantity ?? 1)) throw tradeError("item");
    seen.add(item.id);
    return { id: item.id, quantity, name: item.name, img: item.img, fingerprint: itemFingerprint(item) };
  });
  const { money, profile } = validateMoney(actor, offer.money, signature);
  return { items, money, signature: profile.signature };
}

export function changeOffer(session, side, offer) {
  session.offers[side] = offer;
  session.revision++;
  session.confirmed = [false, false];
}

export function confirmOffer(session, side, revision) {
  if (revision !== session.revision) throw tradeError("stale");
  session.confirmed[side] = true;
  return session.confirmed.every(Boolean);
}

export function validateStoredOffer(actor, offer, signature) {
  const current = normalizeOffer(actor, offer, signature);
  // Accept pending offers written before canonical property ordering was introduced.
  if (current.items.some((item, i) => item.fingerprint !== canonicalJSON(JSON.parse(offer.items[i].fingerprint)))) throw tradeError("changed");
  return current;
}
