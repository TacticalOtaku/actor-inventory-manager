import { MODULE_ID } from "../constants.js";
import { isPhysicalItem } from "../core/item-classifier.js";
import { currencyProfile, tradeError, validateMoney } from "./currencies.js";
import { documentFingerprint } from "./document-data.js";

export const emptyOffer = () => ({ items: [], money: {} });

export function transferableItems(actor) {
  const currencyIds = new Set(currencyProfile(actor).rows.map(r => r.itemId).filter(Boolean));
  const items = Array.from(actor.items.values());
  const filled = new Set(items.map(child => child.system?.container).filter(Boolean));
  return items.filter(item => isPhysicalItem(item) && !currencyIds.has(item.id) && !filled.has(item.id));
}

/**
 * A digest of what the recipient gets. The fields a transfer resets anyway (equipped, attuned, AIM's flags) stay out,
 * so wearing or opening an offered item does not void the offer. A digest, not the data: the session is a world
 * setting every client reads, and the data holds an unidentified item's real name and description.
 * @param {object} data  the item's source data
 * @returns {Promise<string>}
 */
export async function itemFingerprint(data) {
  const copy = structuredClone(data);
  delete copy.flags?.[MODULE_ID];
  if (copy.system) {
    delete copy.system.equipped;
    delete copy.system.attuned;
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(documentFingerprint(copy)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function normalizeOffer(actor, offer, signature) {
  if (!offer || !Array.isArray(offer.items) || offer.items.length > 200) throw tradeError("item");
  const allowed = new Set(transferableItems(actor).map(i => i.id));
  const seen = new Set();
  const items = await Promise.all(offer.items.map(async entry => {
    const item = actor.items.get(entry.id);
    const quantity = entry.quantity;
    if (!item || !allowed.has(item.id) || seen.has(item.id) || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > Number(item.system?.quantity ?? 1)) throw tradeError("item");
    seen.add(item.id);
    return { id: item.id, quantity, name: item.name, img: item.img, fingerprint: await itemFingerprint(item.toObject()) };
  }));
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

export async function validateStoredOffer(actor, offer, signature) {
  const current = await normalizeOffer(actor, offer, signature);
  // Offers saved before 2.0.6 hold the item's JSON instead of its digest.
  const stored = await Promise.all(offer.items.map(({ fingerprint }) =>
    String(fingerprint).startsWith("{") ? itemFingerprint(JSON.parse(fingerprint)) : fingerprint));
  if (current.items.some((item, i) => item.fingerprint !== stored[i])) throw tradeError("changed");
  return current;
}
