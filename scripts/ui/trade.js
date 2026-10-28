// ─────────────────────────────────────────────────────────
// AIM: Actor Window - the trade panel on the trade/ service: partner, two offers, status, confirmation, recovery
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID } from "../constants.js";
import { isTradeActor, ownsActor } from "../core/actor-scope.js";
import { isPhysicalItem } from "../core/item-classifier.js";
import { OFFER_SEND_DELAY, offerWithQuantity, offersEmpty, partnerChoices, pilesTotals, recoveryAction, sameOffer, tradeStatus } from "../core/trade-panel.js";
import { readCoins } from "../integrations/dnd5e.js";
import { currencyProfile } from "../trade/currencies.js";
import { emptyOffer, transferableItems } from "../trade/offers.js";
import { activeGM, requestTrade, sessionFor, tradeState } from "../trade/service.js";

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const errorText = (error) => {
  const key = String(error?.message ?? error ?? "");
  return key.startsWith("AIM.trade.errors.") ? t(key) : t("AIM.trade.errors.transfer");
};
const FINISHED = new Set(["complete", "cancelled", "failed"]);

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

  close() {
    clearTimeout(this.timer);
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
 *   seen: Set<string>, error: string|null}} state
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
    const busy = new Set(tradeState().sessions.filter((s) => ["open", "executing", "recovery"].includes(s.status)).flatMap((s) => s.actors));
    const partners = partnerChoices({ actors, users: [...game.users], actorId: actor.id, userId: game.user.id, busy, locale: game.i18n.lang })
      .map((p) => ({ ...p, label: `${p.name} · ${p.owner}${p.busy ? ` — ${t("AIM.trade.panel.busy")}` : ""}` }));
    return { ...base, view: "idle", partners, canStart: gmOnline && partners.some((p) => !p.busy) };
  }

  const side = Math.max(0, session.actors.indexOf(actor.id));
  const other = 1 - side;
  const partner = session.names[other];
  const money = moneyRows(session, actor);
  const coinList = (values) => money.map((m) => ({ ...m, value: Number(values?.[m.key]) || 0 }));
  const listed = (offer) => offer.items.map((e) => ({ ...e, quantityText: `×${e.quantity}` }));

  if (FINISHED.has(session.status)) {
    const done = session.status === "complete" ? "complete" : session.status === "cancelled" ? "cancelled" : "failed";
    const title = done === "complete" ? t("AIM.trade.panel.done")
      // A trade the GM unlocked was cancelled by neither side.
      : done === "cancelled" ? (session.cancelledBy === undefined ? t("AIM.trade.status.cancelled")
        : session.cancelledBy === side ? t("AIM.trade.panel.youCancelled") : t("AIM.trade.panel.partnerCancelled", { partner }))
        : t("AIM.trade.status.failed");
    return {
      // A refusal from before the trade ended (an exhausted item, say) no longer applies to its result.
      ...base, error: null, view: "done", done, title, partner,
      note: done === "complete" ? t("AIM.trade.panel.doneNote") : done === "failed" ? t(session.error ?? "AIM.trade.errors.transfer") : t("AIM.trade.panel.nothingMoved"),
      cols: [[t("AIM.trade.panel.gave"), session.offers[side]], [t("AIM.trade.panel.got"), session.offers[other]]].map(([title, offer]) => ({
        title, list: { items: listed(offer), coins: coinList(offer.money).filter((c) => c.value) }
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
    return { id: e.id, quantity: e.quantity, max: Number(item?.system?.quantity ?? e.quantity), name: item?.name ?? stored?.name ?? e.id, img: item?.img ?? stored?.img };
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
  return {
    ...base, view: "trade", session, partner, side, editable,
    statusKey: status,
    statusText: t(`AIM.trade.panel.status.${status}`, { partner }),
    mineTitle: isGM ? t("AIM.trade.panel.gives", { name: session.names[side] }) : t("AIM.trade.panel.youGive"),
    theirsTitle: isGM ? t("AIM.trade.panel.gives", { name: partner }) : t("AIM.trade.panel.youGet"),
    confirmed: [confirmed, session.confirmed[other]],
    mine, mineCoins: coinList(draft.money), piles,
    theirs: listed(session.offers[other]), theirsCoins: coinList(session.offers[other].money),
    confirmLabel: t(confirmed ? "AIM.trade.panel.unconfirm" : "AIM.trade.confirm"),
    canConfirm: editable && gmOnline && !state.draft.pending && (confirmed || !offersEmpty({ offers: [draft, session.offers[other]] })),
    canCancel: editable,
    recovery, askRestore: Boolean(recovery && state.askRestore),
    gmNote: isGM && session.status === "open",
    // Inventory rows: what may go into the offer and how many are left.
    offer: editable ? { allowed, reasons, remaining: Object.fromEntries(draft.items.map((e) => [e.id, e.quantity])) } : null
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
