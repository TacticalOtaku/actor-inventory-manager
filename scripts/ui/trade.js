// ─────────────────────────────────────────────────────────
// AIM: Actor Window - the trade panel on the trade/ service: partner, two offers, status, confirmation, recovery
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID } from "../constants.js";
import { isTradeActor, ownsActor } from "../core/actor-scope.js";
import { isPhysicalItem } from "../core/item-classifier.js";
import { OFFER_SEND_DELAY, loadAfterTrade, offerWithQuantity, offersEmpty, partnerChoices, pilesTotals, recoveryAction, sameOffer, tradeStatus } from "../core/trade-panel.js";
import { getSystemWeightUnit } from "../core/weight-calculator.js";
import { concealsDetails, readCoins, unitAbbreviation } from "../integrations/dnd5e.js";
import { carriedShare } from "../integrations/weighty-containers.js";
import { currencyProfile } from "../trade/currencies.js";
import { emptyOffer, transferableItems } from "../trade/offers.js";
import { activeGM, requestTrade, sessionFor, tradeState } from "../trade/service.js";
import { t } from "./html.js";

const errorText = (error) => {
  const key = String(error?.message ?? error ?? "");
  return key.startsWith("AIM.trade.errors.") ? t(key) : t("AIM.trade.errors.transfer");
};
const FINISHED = new Set(["complete", "cancelled", "failed"]);
// What a gift waits for reads differently for its giver and its receiver; the rest is said as for a trade.
const GIFT_STATUS = new Set(["waitOffer", "review", "partnerConfirmed", "waitPartner"]);

/** The actor's trade the panel shows: an active one, or the last finished one until it is dismissed. */
function shownSession(actor, dismissed) {
  const active = sessionFor(actor.id);
  if (active) return active;
  const last = tradeState().sessions.filter((s) => s.actors.includes(actor.id)).at(-1);
  return last && FINISHED.has(last.status) && !dismissed.has(last.id) ? last : null;
}

/** Owners see the button; the GM only while this actor has an active trade; observers never. */
export function tradeButtonState(actor, { canEdit, seen }) {
  if (!isTradeActor(actor) || !canEdit) return null;
  const session = sessionFor(actor.id);
  if (game.user.isGM && !session) return null;
  // The invited side gets a glowing dot until it opens the panel.
  const invited = session?.status === "open" && session.actors[1] === actor.id && session.users[1] === game.user.id && !seen.has(session.id);
  return { invited };
}

/**
 * The offer being edited here and its sending: an edit leaves by itself after a pause, as the same `offer` request;
 * a stale revision is sent again with the new one.
 */
export class OfferDraft {
  constructor(app) {
    this.app = app;
    this.sessionId = null;
    this.revision = null;
    this.offer = emptyOffer();
    this.dirty = false;
    this.sending = false;
    this.timer = null;
    this.error = null;
  }

  /** Follows the session while nothing local is waiting to be sent. */
  sync(session, side) {
    if (session?.id !== this.sessionId) {
      clearTimeout(this.timer);
      Object.assign(this, { sessionId: session?.id ?? null, dirty: false, sending: false, error: null });
    }
    if (session && !this.dirty && !this.sending && this.revision !== session.revision) {
      const stored = session.offers[side];
      this.offer = { items: stored.items.map(({ id, quantity }) => ({ id, quantity })), money: { ...stored.money } };
      this.revision = session.revision;
    }
  }

  get pending() {
    return this.dirty || this.sending;
  }

  change(offer) {
    this.offer = offer;
    this.dirty = true;
    this.error = null;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.send(), OFFER_SEND_DELAY);
  }

  async send(retry = true) {
    const session = sessionFor(this.app.actor.id);
    if (!session || session.id !== this.sessionId || session.status !== "open") return;
    this.dirty = false;
    // An edit that ends where the stored offer is (a coin typed and cleared) is not sent: it would reset both confirmations.
    if (sameOffer(this.offer, session.offers[session.actors.indexOf(this.app.actor.id)])) return this.app.renderTrade();
    this.sending = true;
    this.app.renderTrade();
    try {
      await requestTrade(this.app.actor, "offer", { sessionId: session.id, revision: session.revision, offer: this.offer });
    } catch (error) {
      if (retry && String(error?.message).endsWith(".stale") && sessionFor(this.app.actor.id)?.id === this.sessionId) {
        this.sending = false;
        return this.send(false);
      }
      this.error = errorText(error);
    } finally {
      this.sending = false;
    }
    this.revision = null;
    this.app.renderTrade();
  }

  /** The window closes: an edit still waiting for its pause leaves now instead of being lost. */
  close() {
    clearTimeout(this.timer);
    if (this.dirty) this.send();
  }
}

/** Ids of the items the actor may offer, and why the others may not. */
function offerability(actor) {
  const allowed = new Set(transferableItems(actor).map((i) => i.id));
  const reasons = {};
  for (const item of actor.items) {
    if (!isPhysicalItem(item) || allowed.has(item.id)) continue;
    reasons[item.id] = item.type === "container" ? t("AIM.trade.panel.emptyFirst") : t("AIM.trade.panel.currencyItem");
  }
  return { allowed, reasons };
}

/** The viewer's load after the trade: what leaves from its places, what arrives loose, and the coins. */
function weightAfter(actor, session, side, draft) {
  const partner = game.actors.get(session.actors[1 - side]);
  const theirs = session.offers[1 - side];
  const coins = (money) => Object.values(money ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const load = loadAfterTrade(actor, {
    leaving: draft.items.map((e) => ({ item: actor.items.get(e.id), quantity: e.quantity })),
    // Every world actor reaches every client, so the partner's offered items are read where they lie.
    arriving: theirs.items.map((e) => ({ item: partner?.items.get(e.id), quantity: e.quantity })),
    // shortcut: Item Piles pays with change, so its coins are left out; count them if its payment becomes predictable.
    coins: session.mode === "item-piles" ? 0 : coins(theirs.money) - coins(draft.money)
  }, carriedShare);
  if (!load) return null;
  const format = (n) => n.toLocaleString(game.i18n.lang);
  return {
    text: t("AIM.trade.panel.weightAfter", { value: format(load.value), max: format(load.max), unit: unitAbbreviation("weightUnits", getSystemWeightUnit()) }),
    tier: load.tierChanged ? load.tier : null
  };
}

function moneyRows(session, actor) {
  if (session.mode !== "item-piles") {
    const coins = new Map(readCoins(actor).map((c) => [c.key, c]));
    return session.currencies.map(({ key }) => ({ key, label: coins.get(key)?.abbr ?? key, max: coins.get(key)?.value ?? 0 }));
  }
  return session.currencies.map(({ key, label }) => ({ key, label, max: null }));
}

/**
 * Everything the trade panel and the inventory rows need.
 * @param {Actor} actor
 * @param {{canEdit: boolean, open: boolean, draft: OfferDraft, askRestore: boolean, dismissed: Set<string>,
 *   seen: Set<string>, error: string|null, partner: string|null}} state
 */
export function buildTradeContext(actor, state) {
  const button = tradeButtonState(actor, state);
  if (!button) return { button: null };
  const isGM = game.user.isGM;
  const gmOnline = Boolean(activeGM());
  const session = shownSession(actor, state.dismissed);
  const base = { button, open: state.open, gmOnline, isGM, error: state.draft.error ?? state.error };

  if (!session) {
    const actors = game.actors.filter((a) => isTradeActor(a)).map((a) => ({
      id: a.id, name: a.name, owners: game.users.filter((u) => !u.isGM && ownsActor(a, u)).map((u) => u.id)
    }));
    const busy = new Set(actors.filter((a) => sessionFor(a.id)).map((a) => a.id));
    const partners = partnerChoices({ actors, users: [...game.users], actorId: actor.id, userId: game.user.id, busy, locale: game.i18n.lang })
      .map((p) => ({ ...p, selected: !p.busy && p.actorId === state.partner, label: `${p.name} · ${p.owner}${p.busy ? ` — ${t("AIM.trade.panel.busy")}` : ""}` }));
    return { ...base, view: "idle", partners, canStart: gmOnline && partners.some((p) => !p.busy) };
  }

  const side = Math.max(0, session.actors.indexOf(actor.id));
  const other = 1 - side;
  const partner = session.names[other];
  const gift = session.kind === "gift";
  const role = side === 0 ? "giver" : "receiver";
  const heading = t(gift ? "AIM.trade.gift.title" : "AIM.trade.panel.title");
  const money = moneyRows(session, actor);
  const coinList = (values) => money.map((m) => ({ ...m, value: Number(values?.[m.key]) || 0 }));
  // An offered item shows in its rarity's frame, read from its owner (offers store no rarity); never an unidentified one's.
  const rarityOf = (owner, id) => {
    const item = owner?.items.get(id);
    return item && !concealsDetails(item) ? item.system.rarity ?? "" : "";
  };
  const listed = (offer, ownerId) => offer.items.map((e) => ({ ...e, rarity: rarityOf(game.actors.get(ownerId), e.id), quantityText: `×${e.quantity}` }));

  if (FINISHED.has(session.status)) {
    const done = session.status === "complete" ? "complete" : session.status === "cancelled" ? "cancelled" : "failed";
    const said = gift ? `AIM.trade.gift.${role}` : "AIM.trade.panel";
    const title = done === "complete" ? t(gift ? `AIM.trade.gift.${role}.done` : "AIM.trade.panel.done")
      // A trade the GM unlocked was cancelled by neither side.
      : done === "cancelled" ? (session.cancelledBy === undefined ? t("AIM.trade.status.cancelled")
        : session.cancelledBy === side ? t(`${said}.youCancelled`) : t(`${said}.partnerCancelled`, { partner }))
        : t("AIM.trade.status.failed");
    return {
      // A refusal from before the trade ended (an exhausted item, say) no longer applies to its result.
      ...base, error: null, view: "done", done, title, partner, heading,
      note: done === "complete" ? t("AIM.trade.panel.doneNote") : done === "failed" ? t(session.error ?? "AIM.trade.errors.transfer") : t("AIM.trade.panel.nothingMoved"),
      cols: [[t("AIM.trade.panel.gave"), session.offers[side]], [t("AIM.trade.panel.got"), session.offers[other]]].map(([title, offer]) => ({
        title, list: { items: listed(offer, session.actors[offer === session.offers[side] ? side : other]), coins: coinList(offer.money).filter((c) => c.value) }
      }))
    };
  }

  state.draft.sync(session, side);
  // A co-owner of the actor sees the trade, but only the player who joined it with this actor acts in it.
  const editable = !isGM && session.status === "open" && ownsActor(actor, game.user) && session.users[side] === game.user.id;
  const draft = editable ? state.draft.offer : session.offers[side];
  const status = tradeStatus(session, side, { sending: editable && state.draft.pending });
  const { allowed, reasons } = offerability(actor);
  const mine = draft.items.map((e) => {
    const item = actor.items.get(e.id);
    const stored = session.offers[side].items.find((s) => s.id === e.id);
    return { id: e.id, quantity: e.quantity, max: Number(item?.system?.quantity ?? e.quantity), name: item?.name ?? stored?.name ?? e.id, img: item?.img ?? stored?.img, rarity: rarityOf(actor, e.id) };
  });
  let piles = null;
  if (editable && session.mode === "item-piles") {
    try {
      const totals = pilesTotals(currencyProfile(actor).rows, draft.money);
      piles = { ...totals, over: totals.offered > totals.purse };
    } catch { piles = null; }
  }
  const recovery = isGM ? recoveryAction(session) : null;
  const confirmed = session.confirmed[side];
  // In a gift only the giver offers; the receiver sees the gift alone and accepts or declines it.
  const canOffer = editable && (!gift || side === 0);
  return {
    ...base, view: "trade", session, partner, side, editable, heading,
    showMine: !gift || side === 0, showTheirs: !gift || side === 1,
    statusKey: status,
    statusText: gift && GIFT_STATUS.has(status) ? t(`AIM.trade.gift.${role}.${status}`, { partner })
      : t(gift && status === "executing" ? "AIM.trade.gift.executing" : `AIM.trade.panel.status.${status}`, { partner }),
    mineTitle: isGM ? t("AIM.trade.panel.gives", { name: session.names[side] }) : t(gift ? "AIM.trade.gift.yourGift" : "AIM.trade.panel.youGive"),
    theirsTitle: isGM ? t("AIM.trade.panel.gives", { name: partner }) : t(gift ? "AIM.trade.gift.givesYou" : "AIM.trade.panel.youGet", { partner }),
    confirmed: [confirmed, session.confirmed[other]],
    mine, mineCoins: coinList(draft.money), piles,
    theirs: listed(session.offers[other], session.actors[other]), theirsCoins: coinList(session.offers[other].money),
    weight: weightAfter(actor, session, side, draft),
    confirmLabel: t(confirmed ? "AIM.trade.panel.unconfirm" : !gift ? "AIM.trade.confirm" : side === 0 ? "AIM.trade.gift.send" : "AIM.trade.gift.accept"),
    cancelLabel: t(gift && side === 1 ? "AIM.trade.gift.decline" : "AIM.trade.cancel"),
    canConfirm: editable && gmOnline && !state.draft.pending && (confirmed || !offersEmpty({ offers: [draft, session.offers[other]] })),
    // The GM may close an open trade too, for when a player left it.
    canCancel: editable || (isGM && session.status === "open"),
    recovery, askRestore: Boolean(recovery && state.askRestore),
    gmNote: isGM && session.status === "open",
    // Inventory rows: what may go into the offer and how many are left.
    offer: canOffer ? { allowed, reasons, remaining: Object.fromEntries(draft.items.map((e) => [e.id, e.quantity])) } : null
  };
}

/** The per-row offer button state for the inventory: shown while a trade is open and editable here. */
export function offerButton(trade, item) {
  const offer = trade?.offer;
  if (!offer || !isPhysicalItem(item)) return null;
  if (!offer.allowed.has(item.id)) return { disabled: true, reason: offer.reasons[item.id] ?? t("AIM.trade.errors.item") };
  const left = Number(item.system?.quantity ?? 1) - (offer.remaining[item.id] ?? 0);
  return left > 0 ? { disabled: false, reason: t("AIM.trade.panel.offerOne") } : null;
}

/** The trade request for an action of the panel; errors come back as text for the red line. */
export async function sendTradeRequest(actor, action, data) {
  try {
    await requestTrade(actor, action, data);
    return null;
  } catch (error) {
    return errorText(error);
  }
}

/** A received item keeps its «Новое» mark until its owner opens it. */
export const isNewItem = (item) => Boolean(item?.getFlag?.(MODULE_ID, FLAGS.TRADE_NEW));

export { offerWithQuantity };
