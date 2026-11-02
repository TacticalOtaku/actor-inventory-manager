// Trade lifecycle: one owner for request ordering, authority, state, receipts and recovery.
import { MODULE_ID } from "../constants.js";
import { isTradeActor, ownsActor } from "../core/actor-scope.js";
import { tradesToCancel } from "../core/migration.js";
import { currencyProfile, tradeError } from "./currencies.js";
import { changeOffer, confirmOffer, emptyOffer, normalizeOffer, validateStoredOffer } from "./offers.js";
import { executeTransfer, inventoryChanges } from "./transfer.js";
import { TradeStateMachine } from "./state-machine.js";
import { TradeRecovery } from "./recovery.js";
import { LOG } from "../foundry/logger.js";

export const TRADE_STATE = "tradeState";
const REQUEST_FLAG = "tradeRequest";
const ACTIVE_STATES = ["open", "executing", "recovery"];
let queue = Promise.resolve();

export function tradeState() {
  return game.settings.get(MODULE_ID, TRADE_STATE) ?? { sessions: [], receipts: {} };
}

export function activeGM() {
  const incumbent = game.users.get(tradeState().coordinatorId);
  if (incumbent?.active && incumbent.isGM) return incumbent;
  return Array.from(game.users.values()).filter(u => u.active && u.isGM).sort((a, b) => a.id.localeCompare(b.id))[0];
}

function isCoordinator() {
  return activeGM()?.id === game.user.id && game.socket?.connected !== false;
}

function assertCoordinator() {
  if (!isCoordinator()) throw tradeError("coordinator");
}

export function sessionFor(actorId) {
  return tradeState().sessions.find(s => TradeStateMachine.isActive(s) && s.actors.includes(actorId));
}

/** The actor's items and coins are frozen while its trade is carried out or recovered (GLOSSARY: Trade lock). */
export function isTradeLocked(actor) {
  // Token actors share their base actor's id but never take part in a trade.
  return Boolean(actor) && !actor.isToken && ["executing", "recovery"].includes(sessionFor(actor.id)?.status);
}

export function authorizedSide(session, actorId, user) {
  const side = session.actors.indexOf(actorId);
  const actor = game.actors.get(actorId);
  if (side < 0 || !isTradeActor(actor) || !ownsActor(actor, user) || session.users[side] !== user.id) throw tradeError("permission");
  return side;
}

// Store a cleaned copy: a failed terminal write must not destroy the active recovery baseline.
async function save(state) {
  assertCoordinator();
  const durable = structuredClone(state);
  const finished = durable.sessions.filter(session => !TradeStateMachine.isActive(session));
  const expired = new Set(finished.slice(0, -30));
  durable.sessions = durable.sessions.filter(session => !expired.has(session));
  for (const session of finished) {
    for (const offer of session.offers ?? []) for (const item of offer.items ?? []) delete item.fingerprint;
  }
  await game.settings.set(MODULE_ID, TRADE_STATE, durable);
}

function enqueue(work) {
  const next = queue.then(work);
  queue = next.catch(() => {});
  return next;
}

/** Same command interface for Foundry User hooks and in-memory document tests. */
export function processTradeRequest(request, userId) {
  return enqueue(() => processRequest(request, userId));
}

async function processRequest(request, userId) {
  if (!isCoordinator()) return;
  if (!request || typeof request.id !== "string" || !/^[a-zA-Z0-9]{16}$/.test(request.id)) return;
  const state = structuredClone(tradeState());
  const user = game.users.get(userId);
  if (!user?.active || state.receipts?.[userId]?.id === request.id) return;
  if (state.coordinatorId !== game.user.id) {
    state.coordinatorId = game.user.id;
    await save(state);
  }
  let error;
  let decision;
  try {
    decision = await dispatch(state, request, userId, user);
    error = decision?.receiptError ?? null;
  } catch (failure) {
    if (!isCoordinator()) return;
    LOG.warn("Trade request rejected", failure);
    error = failure.message?.startsWith("AIM.trade.errors.") ? failure.message : "AIM.trade.errors.transfer";
    const session = state.sessions.find(entry => entry.id === request.sessionId);
    if (session?.status === "open" && session.users.includes(userId)
      && (request.action === "confirm" || ["AIM.trade.errors.changed", "AIM.trade.errors.funds", "AIM.trade.errors.providerChanged", "AIM.trade.errors.empty"].includes(error))) session.confirmed = [false, false];
    if (session?.status === "open" && error === "AIM.trade.errors.changed") await refreshChangedOffers(session);
  }
  // Terminal state and its receipt are one durable outcome. Keep the active state until acknowledgement.
  const published = structuredClone(state);
  if (decision) {
    const session = published.sessions.find(entry => entry.id === decision.sessionId);
    TradeStateMachine.transition(session, decision.status);
    Object.assign(session, decision.patch);
  }
  published.receipts ??= {};
  published.receipts[userId] = { id: request.id, error };
  try {
    await save(published);
  } catch (failure) {
    if (!isCoordinator()) return;
    const session = state.sessions.find(entry => entry.id === request.sessionId);
    if (!session || !(decision?.recoverable || session.status === "executing" && session.phase === "transferring")) throw failure;
    // The final write may have reached storage before rejecting. Never retry the transfer or discard its journal.
    TradeStateMachine.transition(session, "recovery");
    session.error = "AIM.trade.errors.recovery";
    state.receipts ??= {};
    state.receipts[userId] = { id: request.id, error: "AIM.trade.errors.recovery" };
    await save(state);
    LOG.error("Trade outcome persistence was uncertain; GM recovery required", failure);
    return;
  }
  if (!isCoordinator()) return;
  if (decision?.cleanupJournal) await TradeRecovery.cleanup(decision.cleanupJournal);
  if (decision?.cleanupPreparation) await TradeRecovery.cleanupBySessionId(decision.sessionId);
}

async function dispatch(state, request, userId, user) {
  if (request.action === "start") return startTrade(state, userId, request);
  if (request.action === "recover") return recoverTrade(state, userId, request);
  if (request.action === "cancel" && user.isGM) return gmCancelTrade(state, userId, request);
  const session = state.sessions.find(entry => entry.id === request.sessionId);
  if (!session) throw tradeError("stale");
  const side = authorizedSide(session, request.actorId, user);
  if (request.action === "offer") return updateOffer(state, userId, request, side);
  if (request.action === "confirm") return confirmTradeOffer(state, userId, request, side);
  if (request.action === "unconfirm") return unconfirmTradeOffer(state, userId, request, side);
  if (request.action === "cancel") return cancelTrade(state, userId, request, side);
  throw tradeError("request");
}

/** Migration cancellation enters the same queue as user requests. */
export function cancelOpenTrades() {
  return enqueue(async () => {
    assertCoordinator();
    const state = structuredClone(tradeState());
    const cancelled = tradesToCancel(state.sessions);
    if (!cancelled.length) return 0;
    for (const session of cancelled) {
      TradeStateMachine.transition(session, "cancelled");
      delete session.cancelledBy;
    }
    await save(state);
    for (const session of cancelled) {
      assertCoordinator();
      for (const user of session.users.map(id => game.users.get(id)).filter(Boolean)) {
        if (user.getFlag(MODULE_ID, REQUEST_FLAG) !== undefined) await user.unsetFlag(MODULE_ID, REQUEST_FLAG);
      }
      assertCoordinator();
      await ChatMessage.implementation.create({ content: `<p>${game.i18n.localize("AIM.migration.tradeCancelled")}</p>`, whisper: session.users, speaker: { alias: "AIM" } });
    }
    return cancelled.length;
  });
}

async function startTrade(state, userId, request) {
  if (state.sessions.some(s => s.id === request.id)) return;

  const actor = game.actors.get(request.actorId);
  const target = game.actors.get(request.targetId);
  const user = game.users.get(userId);
  const partner = game.users.get(request.targetUserId);

  if (!isTradeActor(actor) || !ownsActor(actor, user)) throw tradeError("permission");
  if (!isTradeActor(target) || target.id === actor.id) throw tradeError("partner");
  if (!partner?.active || partner.isGM || partner.id === userId || !ownsActor(target, partner)) throw tradeError("partner");

  // Check if either actor is already in an active trade
  if (state.sessions.some(s => ACTIVE_STATES.includes(s.status) && s.actors.some(id => [actor.id, target.id].includes(id)))) {
    throw tradeError("busy");
  }

  const profile = currencyProfile(actor);
  if (currencyProfile(target).signature !== profile.signature) throw tradeError("providerChanged");

  state.sessions.push({
    id: request.id,
    actors: [actor.id, target.id],
    users: [userId, partner.id],
    names: [actor.name, target.name],
    status: "open",
    revision: 0,
    confirmed: [false, false],
    ...(request.kind === "gift" && { kind: "gift" }),
    signature: profile.signature,
    mode: profile.mode,
    currencies: profile.rows.map(({ key, label }) => ({ key, label })),
    offers: [emptyOffer(), emptyOffer()]
  });
}

/**
 * Update an actor's offer in a trade.
 * @param {Object} state
 * @param {string} userId
 * @param {Object} request - {sessionId, actorId, revision, offer}
 * @param {number} side - actor's side (0 or 1)
 */
async function updateOffer(state, userId, request, side) {
  const session = state.sessions.find(s => s.id === request.sessionId);
  if (!session) throw tradeError("stale");
  if (session.status !== "open") throw tradeError("stale");
  if (request.revision !== session.revision) throw tradeError("stale");
  if (session.kind === "gift" && side === 1) throw tradeError("oneWay");

  const actor = game.actors.get(request.actorId);
  changeOffer(session, side, await normalizeOffer(actor, request.offer, session.signature));
}

/**
 * Confirm an actor's offer in a trade. Settles if both sides confirm.
 * @param {Object} state
 * @param {string} userId
 * @param {Object} request - {sessionId, actorId, revision}
 * @param {number} side
 * @param {Function} assertCoordinator
 * @param {Function} save - function to save state
 */
async function confirmTradeOffer(state, userId, request, side) {
  const session = state.sessions.find(s => s.id === request.sessionId);
  if (!session) throw tradeError("stale");
  if (session.status !== "open") throw tradeError("stale");

  const actor = game.actors.get(request.actorId);
  await validateStoredOffer(actor, session.offers[side], session.signature);

  if (confirmOffer(session, side, request.revision)) {
    return settleTrade(state, session);
  }
}

/**
 * Unconfirm an actor's offer in a trade.
 * @param {Object} state
 * @param {string} userId
 * @param {Object} request - {sessionId}
 * @param {number} side
 */
async function unconfirmTradeOffer(state, userId, request, side) {
  const session = state.sessions.find(s => s.id === request.sessionId);
  if (!session) throw tradeError("stale");
  if (session.status !== "open") throw tradeError("stale");

  session.confirmed[side] = false;
}

/**
 * Cancel a trade (player cancels their own trade).
 * @param {Object} state
 * @param {string} userId
 * @param {Object} request - {sessionId}
 * @param {number} side
 */
async function cancelTrade(state, userId, request, side) {
  const session = state.sessions.find(s => s.id === request.sessionId);
  if (!session) throw tradeError("stale");
  if (session.status !== "open") throw tradeError("stale");

  return { sessionId: session.id, status: "cancelled", patch: { cancelledBy: side } };
}

/**
 * GM cancels an open trade (when a player left).
 * @param {Object} state
 * @param {string} userId
 * @param {Object} request - {sessionId, actorId}
 */
async function gmCancelTrade(state, userId, request) {
  const user = game.users.get(userId);
  if (!user?.isGM) throw tradeError("permission");

  const session = state.sessions.find(s => s.id === request.sessionId);
  if (!session) throw tradeError("stale");
  if (session.status !== "open") throw tradeError("stale");

  const actor = game.actors.get(request.actorId);
  if (!session.actors.includes(actor?.id)) throw tradeError("permission");

  return { sessionId: session.id, status: "cancelled" };
}

// A decision remains internal: adapters never decide whether a receipt or save is due.
async function recoverTrade(state, userId, request) {
  if (!game.users.get(userId)?.isGM) throw tradeError("permission");
  const session = state.sessions.find(entry => entry.id === request.sessionId);
  if (!session || !["recovery", "executing"].includes(session.status)) throw tradeError("stale");
  if (session.phase === "preparing" && !session.recoveryId) {
    return { sessionId: session.id, status: "cancelled", cleanupPreparation: true };
  }
  const lost = () => ({ sessionId: session.id, status: "recovery", patch: { error: "AIM.trade.errors.recoveryLost" }, receiptError: "AIM.trade.errors.recoveryLost", recoverable: true });
  if (!session.recoveryId) return lost();
  TradeStateMachine.transition(session, "executing");
  session.gmId = game.user.id;
  await save(state);
  try {
    await TradeRecovery.restore(session.recoveryId, session.id, assertCoordinator, session.actors);
    return { sessionId: session.id, status: "failed", patch: { error: "AIM.trade.errors.rolledBack" }, cleanupJournal: session.recoveryId, recoverable: true };
  } catch (failure) {
    assertCoordinator();
    if (failure.message === "AIM.trade.errors.recoveryLost") return lost();
    return { sessionId: session.id, status: "recovery", patch: { error: "AIM.trade.errors.recovery" }, receiptError: failure.message?.startsWith("AIM.trade.errors.") ? failure.message : "AIM.trade.errors.transfer", recoverable: true };
  }
}

async function settleTrade(state, session) {
  const actors = session.actors.map(id => game.actors.get(id));
  for (const [side, actor] of actors.entries()) {
    const user = game.users.get(session.users[side]);
    if (!user?.active || !isTradeActor(actor) || !ownsActor(actor, user)) throw tradeError("permission");
    await validateStoredOffer(actor, session.offers[side], session.signature);
  }
  if (session.offers.every(offer => !offer.items.length && !Object.keys(offer.money).length)) throw tradeError("empty");
  TradeStateMachine.transition(session, "executing");
  session.phase = "preparing";
  session.gmId = game.user.id;
  await save(state);
  let recovery;
  try {
    recovery = await TradeRecovery.capture(session.id, actors, assertCoordinator);
    assertCoordinator();
    session.recoveryId = recovery.journal.id;
    session.phase = "transferring";
    await save(state);
  } catch (failure) {
    assertCoordinator();
    session.confirmed = [false, false];
    return { sessionId: session.id, status: "cancelled", receiptError: failure.message?.startsWith("AIM.trade.errors.") ? failure.message : "AIM.trade.errors.transfer", cleanupJournal: recovery?.journal.id, cleanupPreparation: !recovery };
  }
  let transferStarted = false;
  try {
    assertCoordinator();
    const changes = actors.map((actor, side) => ({ actorId: actor.id, ...inventoryChanges(actor, recovery.snapshots[side]) }));
    if (changes.some(({ actorId, ...fields }) => Object.values(fields).some(entries => entries.length))) {
      LOG.warn("Trade snapshot differs before transfer", { tradeId: session.id, changes });
      throw tradeError("changed");
    }
    for (const [side, actor] of actors.entries()) await validateStoredOffer(actor, session.offers[side], session.signature);
    transferStarted = true;
    await executeTransfer(actors, session, assertCoordinator);
    return { sessionId: session.id, status: "complete", cleanupJournal: session.recoveryId, recoverable: true };
  } catch (failure) {
    assertCoordinator();
    if (!transferStarted) {
      return { sessionId: session.id, status: "cancelled", patch: { error: "AIM.trade.errors.changed" }, receiptError: failure.message?.startsWith("AIM.trade.errors.") ? failure.message : "AIM.trade.errors.changed", cleanupJournal: session.recoveryId };
    }
    LOG.error("Trade transfer failed; restoring saved inventories", failure);
    try {
      await TradeRecovery.restore(session.recoveryId, session.id, assertCoordinator, session.actors);
      return { sessionId: session.id, status: "failed", patch: { error: "AIM.trade.errors.rolledBack" }, cleanupJournal: session.recoveryId, recoverable: true };
    } catch (restoreError) {
      assertCoordinator();
      LOG.error("Trade recovery needs GM intervention", restoreError);
      return { sessionId: session.id, status: "recovery", patch: { error: "AIM.trade.errors.recovery" }, recoverable: true };
    }
  }
}

async function refreshChangedOffers(session) {
  for (const [side, actorId] of session.actors.entries()) {
    const actor = game.actors.get(actorId);
    try {
      await validateStoredOffer(actor, session.offers[side], session.signature);
    } catch (error) {
      if (error?.message !== "AIM.trade.errors.changed") continue;
      try {
        changeOffer(session, side, await normalizeOffer(actor, session.offers[side], session.signature));
      } catch {
        // Left for its owner to edit
      }
    }
  }
}
