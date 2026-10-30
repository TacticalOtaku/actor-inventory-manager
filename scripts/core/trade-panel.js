// ─────────────────────────────────────────────────────────
// Actor window - the trade panel: what the trade waits for, offer edits, partners, recovery (pure)
// The rules themselves live in trade/ (offers, coordinator); this only reads a session for the panel.
// ─────────────────────────────────────────────────────────

import { coinWeight, computeActorEncumbrance, getItemWeightInUnit, getSystemEncumbrance } from "./weight-calculator.js";

/** Offers leave by themselves this long after the last edit. */
export const OFFER_SEND_DELAY = 500;

/** Neither side offers an item or a coin. */
export function offersEmpty(session) {
  return session.offers.every((o) => !o.items.length && !Object.values(o.money ?? {}).some((n) => n > 0));
}

/**
 * What the trade waits for, as the viewer on `side` sees it.
 * @returns {"executing"|"recovery"|"sending"|"both"|"waitPartner"|"waitOffer"|"partnerConfirmed"|"review"}
 */
export function tradeStatus(session, side, { sending = false } = {}) {
  if (session.status === "executing" || session.status === "recovery") return session.status;
  if (sending) return "sending";
  const [mine, theirs] = side === 1 ? [session.confirmed[1], session.confirmed[0]] : session.confirmed;
  if (mine && theirs) return "both";
  if (mine) return "waitPartner";
  if (offersEmpty(session)) return "waitOffer";
  return theirs ? "partnerConfirmed" : "review";
}

/** The draft with one item at `quantity`, kept between 0 and the stack; 0 takes it out. */
export function offerWithQuantity(draft, id, quantity, max) {
  const n = Math.max(0, Math.min(max, Math.floor(Number(quantity) || 0)));
  const items = draft.items.some((e) => e.id === id)
    ? draft.items.map((e) => (e.id === id ? { ...e, quantity: n } : e))
    : [...draft.items, { id, quantity: n }];
  return { ...draft, items: items.filter((e) => e.quantity > 0) };
}

/**
 * What the GM can do for a stuck trade: restore both inventories from the snapshot, or only lift the lock when the
 * preparation stopped before any debit (no snapshot was taken).
 * @returns {"restore"|"unlock"|null}
 */
export function recoveryAction(session) {
  if (!["recovery", "executing"].includes(session?.status)) return null;
  return session.phase === "preparing" && !session.recoveryId ? "unlock" : "restore";
}

/**
 * Other players' characters whose owner is online (never a GM), by name; one already in a trade is busy.
 * @param {{actors: {id, name, owners: string[]}[], users: {id, name, active, isGM}[], actorId: string,
 *   userId: string, busy: Set<string>, locale?: string}} data
 */
export function partnerChoices({ actors, users, actorId, userId, busy, locale }) {
  const online = new Map(users.filter((u) => u.active && !u.isGM && u.id !== userId).map((u) => [u.id, u]));
  return actors
    .filter((a) => a.id !== actorId)
    .map((a) => ({ actor: a, owner: a.owners.map((id) => online.get(id)).find(Boolean) }))
    .filter(({ owner }) => owner)
    .map(({ actor, owner }) => ({ actorId: actor.id, userId: owner.id, name: actor.name, owner: owner.name, busy: busy.has(actor.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** Two offers with the same items, quantities and coins (in any order). */
export function sameOffer(a, b) {
  const items = (o) => o.items.map((e) => `${e.id}:${e.quantity}`).sort().join();
  const money = (o) => Object.entries(o.money ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).sort().join();
  return items(a) === items(b) && money(a) === money(b);
}

/** Item Piles pays by value: the offer and the purse summed by exchange rate, for the hint beside the fields. */
export function pilesTotals(rows, money) {
  const round = (n) => Math.round(n * 100) / 100;
  return {
    offered: round(rows.reduce((sum, r) => sum + (Number(money[r.key]) || 0) * (Number(r.rate) || 0), 0)),
    purse: round(rows.reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.rate) || 0), 0))
  };
}

/** The weight of `quantity` of an item in the world's unit; a container weighs once, whatever its count. */
export function offeredWeight(item, quantity) {
  return item ? getItemWeightInUnit({ type: item.type, system: { weight: item.system?.weight, quantity } }) : 0;
}

/**
 * The load once the trade is done: dnd5e's derived load (Weighty Containers' reductions and coins included), less
 * what leaves from where it lies, plus what arrives loose and the coins, through the tiers of the load meter.
 * Null without dnd5e's encumbrance or under the «none» rule.
 * @param {Object} actor
 * @param {{leaving?: Array<{item: Object, quantity: number}>, arriving?: Array<{item: Object, quantity: number}>,
 *   coins?: number}} trade  coins: the count arriving less the count leaving
 * @param {(actor: Object, item: Object) => number} [share]  how much of an item's weight the actor carries, 0 to 1
 * @returns {{value: number, max: number, tier: string, tierChanged: boolean}|null}
 */
export function loadAfterTrade(actor, { leaving = [], arriving = [], coins = 0 }, share = () => 1) {
  const enc = getSystemEncumbrance(actor);
  const now = enc && computeActorEncumbrance(actor);
  if (!now || now.rule === "none") return null;
  const weigh = (entries, part) => entries.reduce((sum, { item, quantity }) => sum + offeredWeight(item, quantity) * part(item), 0);
  const change = weigh(arriving, () => 1) - weigh(leaving, (item) => share(actor, item)) + coinWeight(coins);
  const value = Math.max(0, Number(enc.value) + change);
  const after = computeActorEncumbrance({ system: { attributes: { encumbrance: { ...enc, value } } } });
  return { value: after.value, max: after.max, tier: after.tier, tierChanged: after.tier !== now.tier };
}
