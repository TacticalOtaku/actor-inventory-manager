import { MODULE_ID } from "../constants.js";
import { isSupportedActor, isTradeActor, ownsActor } from "../core/actor-scope.js";
import { currencyProfile, tradeError } from "./currencies.js";
import { changeOffer, confirmOffer, emptyOffer, normalizeOffer, validateStoredOffer } from "./offers.js";
import { captureInventory, executeTransfer, inventoryChanges, restoreInventory } from "./transfer.js";
import { LOG } from "../foundry/logger.js";

export const TRADE_STATE = "tradeState";
const REQUEST_FLAG = "tradeRequest";
export const TRADE_HOOK = `${MODULE_ID}.tradeState`;
let queue = Promise.resolve();
let registered = false;
const notified = new Set();
const ACTIVE = new Set(["open", "executing", "recovery"]);

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
  return tradeState().sessions.find(s => ACTIVE.has(s.status) && s.actors.includes(actorId));
}

function changed(state) {
  Hooks.callAll(TRADE_HOOK, state);
  for (const session of state.sessions ?? []) {
    if (session.status !== "open" || notified.has(session.id)) continue;
    // Only the invited player is told; the initiator and GMs already know.
    if (session.users?.[1] !== game.user.id) continue;
    if (!ownsActor(game.actors.get(session.actors[1]), game.user)) continue;
    notified.add(session.id);
    ui.notifications?.info(game.i18n.localize("AIM.trade.invitation"));
  }
}

export function registerTradeSettings() {
  game.settings.register(MODULE_ID, TRADE_STATE, {
    scope: "world", config: false, restricted: true, type: Object,
    default: { sessions: [], receipts: {} }, onChange: changed
  });
}

/** Requests travel through User updates so userId is supplied by Foundry itself. */
export async function requestTrade(actor, action, data = {}) {
  if (!activeGM()) throw tradeError("noGM");
  if (!isTradeActor(actor) || !ownsActor(actor, game.user)) throw tradeError("permission");
  const request = { ...data, action, actorId: actor.id, id: foundry.utils.randomID() };
  let hookId, timer;
  const response = new Promise((resolve, reject) => {
    hookId = Hooks.on(TRADE_HOOK, state => {
      const receipt = state.receipts?.[game.user.id];
      if (receipt?.id !== request.id) return;
      receipt.error ? reject(new Error(receipt.error)) : resolve(receipt);
    });
    timer = setTimeout(() => reject(tradeError("timeout")), 20000);
  });
  // Attach rejection handling immediately, including when the document write fails.
  response.catch(() => {});
  try {
    await game.user.setFlag(MODULE_ID, REQUEST_FLAG, JSON.stringify(request));
    return await response;
  } finally {
    clearTimeout(timer);
    Hooks.off(TRADE_HOOK, hookId);
  }
}

export function authorizedSide(session, actorId, user) {
  const side = session.actors.indexOf(actorId);
  const actor = game.actors.get(actorId);
  if (side < 0 || !isTradeActor(actor) || !ownsActor(actor, user) || session.users[side] !== user.id) throw tradeError("permission");
  return side;
}

async function save(state) {
  assertCoordinator();
  const terminal = state.sessions.filter(s => !ACTIVE.has(s.status)).slice(-30);
  state.sessions = [...state.sessions.filter(s => ACTIVE.has(s.status)), ...terminal];
  await game.settings.set(MODULE_ID, TRADE_STATE, state);
}

async function settle(state, session) {
  const actors = session.actors.map(id => game.actors.get(id));
  actors.forEach((actor, side) => {
    const user = game.users.get(session.users[side]);
    if (!user?.active || !isTradeActor(actor) || !ownsActor(actor, user)) throw tradeError("permission");
    validateStoredOffer(actor, session.offers[side], session.signature);
  });
  if (session.offers.every(o => !o.items.length && !Object.keys(o.money).length)) throw tradeError("empty");
  // Publish the lock before capturing the baseline. A stopped preparation has no debits.
  session.status = "executing";
  session.phase = "preparing";
  session.gmId = game.user.id;
  await save(state);
  let snapshots, journal;
  try {
    assertCoordinator();
    snapshots = actors.map(captureInventory);
    // This journal is deliberately private: never put full inventories in a world setting.
    journal = await JournalEntry.create({
      name: `AIM recovery ${session.id}`, ownership: { default: 0 },
      // Encode the payload to isolate snapshots from Document cleaning/expansion and
      // preserve literal currency paths (e.g. "system.currency.gp") in journal flags.
      flags: { [MODULE_ID]: { tradeRecovery: JSON.stringify({ sessionId: session.id, snapshots }) } }
    });
    assertCoordinator();
    session.recoveryId = journal.id;
    session.phase = "transferring";
    await save(state);
  } catch (error) {
    if (!isCoordinator()) throw error;
    session.status = "cancelled";
    session.confirmed = [false, false];
    await save(state);
    if (journal) await journal.delete();
    throw error;
  }
  let transferStarted = false;
  try {
    // Revalidate after the persistence boundary and before any debit.
    assertCoordinator();
    const changes = actors.map((actor, side) => ({ actorId: actor.id, ...inventoryChanges(actor, snapshots[side]) }));
    if (changes.some(({ actorId, ...fields }) => Object.values(fields).some(entries => entries.length))) {
      LOG.warn("Trade snapshot differs before transfer", { tradeId: session.id, changes });
      throw tradeError("changed");
    }
    actors.forEach((actor, side) => validateStoredOffer(actor, session.offers[side], session.signature));
    transferStarted = true;
    await executeTransfer(actors, session, assertCoordinator);
    session.status = "complete";
    await save(state);
  } catch (error) {
    // An old coordinator must never undo work while its successor is recovering it.
    if (!isCoordinator()) throw error;
    if (!transferStarted) {
      LOG.warn("Trade cancelled before transfer; no assets moved or restored", error);
      session.status = "cancelled";
      session.error = "AIM.trade.errors.changed";
      await save(state);
      await journal.delete();
      // Report the cancellation to the requesting client instead of a silent success.
      throw error?.message?.startsWith("AIM.trade.errors.") ? error : tradeError("changed");
    }
    LOG.error("Trade transfer failed; restoring saved inventories", error);
    try {
      for (let side = 0; side < 2; side++) await restoreInventory(actors[side], snapshots[side], assertCoordinator);
      session.status = "failed";
      session.error = "AIM.trade.errors.rolledBack";
    } catch (recoveryError) {
      LOG.error("Trade recovery needs GM intervention", recoveryError);
      session.status = "recovery";
      session.error = "AIM.trade.errors.recovery";
    }
    await save(state);
  }
  if (session.status === "complete" || session.status === "failed") {
    try { await journal.delete(); } catch (error) { LOG.warn("Could not remove completed trade recovery journal", error); }
  }
}

/** The hook's userId is the only trusted identity; payload user IDs are ignored. */
export async function processTradeRequest(request, userId) {
  if (!isCoordinator()) return;
  if (!request || typeof request.id !== "string" || !/^[a-zA-Z0-9]{16}$/.test(request.id)) return;
  const state = structuredClone(tradeState());
  const user = game.users.get(userId);
  if (!user?.active || state.receipts?.[userId]?.id === request.id) return;
  state.coordinatorId = game.user.id;
  // Persist incumbency before any awaited operation that may touch actor documents.
  await save(state);
  let error = null;
  try {
    const actor = game.actors.get(request.actorId);
    if (!isTradeActor(actor) || !ownsActor(actor, user)) throw tradeError("permission");
    if (request.action === "start") {
      if (state.sessions.some(s => s.id === request.id)) return;
      const target = game.actors.get(request.targetId);
      const partner = game.users.get(request.targetUserId);
      if (!isTradeActor(target) || target.id === actor.id || !partner?.active || partner.isGM || partner.id === userId || !ownsActor(target, partner)) throw tradeError("partner");
      if (state.sessions.some(s => ACTIVE.has(s.status) && s.actors.some(id => [actor.id, target.id].includes(id)))) throw tradeError("busy");
      const profile = currencyProfile(actor);
      if (currencyProfile(target).signature !== profile.signature) throw tradeError("providerChanged");
      state.sessions.push({ id: request.id, actors: [actor.id, target.id], users: [userId, partner.id],
        names: [actor.name, target.name], status: "open", revision: 0, confirmed: [false, false],
        signature: profile.signature, mode: profile.mode,
        currencies: profile.rows.map(({ key, label }) => ({ key, label })),
        offers: [emptyOffer(), emptyOffer()] });
    } else {
      const session = state.sessions.find(s => s.id === request.sessionId);
      if (!session) throw tradeError("stale");
      // Recovery is a separate GM-only, explicitly confirmed operation.
      if (request.action === "recover" && user.isGM && ["recovery", "executing"].includes(session.status)) {
        if (session.phase === "preparing" && !session.recoveryId) {
          // Preparation never debits assets; interrupted preparation needs only unlocking.
          session.status = "cancelled";
          state.receipts[userId] = { id: request.id, error: null };
          await save(state);
          return;
        }
        const journal = game.journal.get(session.recoveryId);
        const storedRecovery = journal?.getFlag(MODULE_ID, "tradeRecovery");
        const recovery = typeof storedRecovery === "string" ? JSON.parse(storedRecovery) : storedRecovery;
        if (!recovery || recovery.sessionId !== session.id || !Array.isArray(recovery.snapshots)) throw tradeError("recovery");
        session.status = "executing";
        session.gmId = game.user.id;
        await save(state);
        for (const snapshot of recovery.snapshots) {
          const participant = game.actors.get(snapshot.actorId);
          if (!isTradeActor(participant)) throw tradeError("permission");
          await restoreInventory(participant, snapshot, assertCoordinator);
        }
        session.status = "failed";
        session.error = "AIM.trade.errors.rolledBack";
        await save(state);
        await journal.delete();
      } else {
        const side = authorizedSide(session, actor.id, user);
        if (session.status !== "open") throw tradeError("stale");
        if (request.action === "cancel") session.status = "cancelled";
        else if (request.action === "offer") {
          if (request.revision !== session.revision) throw tradeError("stale");
          changeOffer(session, side, normalizeOffer(actor, request.offer, session.signature));
        } else if (request.action === "confirm") {
          validateStoredOffer(actor, session.offers[side], session.signature);
          if (confirmOffer(session, side, request.revision)) await settle(state, session);
        } else throw tradeError("request");
      }
    }
  } catch (e) {
    if (!isCoordinator()) return;
    LOG.warn("Trade request rejected", e);
    error = e.message?.startsWith("AIM.trade.errors.") ? e.message : "AIM.trade.errors.transfer";
    const session = state.sessions.find(s => s.id === request.sessionId);
    if (session?.status === "open" && session.users.includes(userId)
      && ["AIM.trade.errors.changed", "AIM.trade.errors.funds", "AIM.trade.errors.providerChanged", "AIM.trade.errors.empty"].includes(error)) session.confirmed = [false, false];
  }
  state.receipts ??= {};
  state.receipts[userId] = { id: request.id, error };
  await save(state);
}

export function registerTradeService() {
  if (registered) return;
  registered = true;
  Hooks.on("updateUser", (user, changes, options, userId) => {
    if (user.id !== userId || activeGM()?.id !== game.user.id) return;
    const path = `flags.${MODULE_ID}.${REQUEST_FLAG}`;
    const value = changes[path] ?? foundry.utils.getProperty(changes, path);
    if (typeof value !== "string" || value.length > 50000) return;
    let request;
    try { request = JSON.parse(value); } catch { return; }
    queue = queue.then(() => processTradeRequest(request, userId)).catch(error => LOG.error("Trade coordinator error", error));
  });
  // Prevent ordinary client edits while a saved exchange is being committed.
  const allowEdit = actor => {
    // Token actors share their base actor's id but never take part in a trade.
    if (!isSupportedActor(actor) || actor.isToken) return true;
    const session = sessionFor(actor?.id);
    if (!session || !["executing", "recovery"].includes(session.status)) return true;
    if (session.status === "executing" && game.user.isGM && session.gmId === game.user.id) return true;
    ui.notifications?.warn(game.i18n.localize("AIM.trade.errors.busy"));
    return false;
  };
  for (const hook of ["preCreateItem", "preUpdateItem", "preDeleteItem"]) Hooks.on(hook, item => allowEdit(item.parent));
  Hooks.on("preUpdateActor", (actor, changes) => {
    if (Object.keys(changes).some(key => key === "system" || key.startsWith("system.") || key === "items")) return allowEdit(actor);
    return true;
  });
}
