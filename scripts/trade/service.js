import { MODULE_ID } from "../constants.js";
import { isSupportedActor, isTradeActor, ownsActor } from "../core/actor-scope.js";
import { tradeError } from "./currencies.js";
import { TRADE_STATE, activeGM, isTradeLocked, processTradeRequest, sessionFor } from "./commands.js";
import { LOG } from "../foundry/logger.js";

// Compatibility exports: callers keep the existing request/query surface.
export { TRADE_STATE, activeGM, authorizedSide, cancelOpenTrades, isTradeLocked, processTradeRequest, sessionFor, tradeState } from "./commands.js";
export const TRADE_HOOK = `${MODULE_ID}.tradeState`;
const REQUEST_FLAG = "tradeRequest";
let registered = false;
const notified = new Set();

function changed(state) {
  Hooks.callAll(TRADE_HOOK, state);
  for (const session of state.sessions ?? []) {
    if (session.status !== "open" || notified.has(session.id)) continue;
    // Only the invited player is told; the initiator and GMs already know.
    if (session.users?.[1] !== game.user.id) continue;
    if (!ownsActor(game.actors.get(session.actors[1]), game.user)) continue;
    notified.add(session.id);
    ui.notifications?.info(game.i18n.localize(session.kind === "gift" ? "AIM.trade.gift.invitation" : "AIM.trade.invitation"));
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
  const sessionId = request.sessionId ?? request.id;
  let hookId, timer;
  const response = new Promise((resolve, reject) => {
    const wait = () => {
      clearTimeout(timer);
      timer = setTimeout(() => reject(tradeError("timeout")), 20000);
    };
    hookId = Hooks.on(TRADE_HOOK, state => {
      const receipt = state.receipts?.[game.user.id];
      if (receipt?.id === request.id) return receipt.error ? reject(new Error(receipt.error)) : resolve(receipt);
      // The coordinator is at work on this trade (a big settle takes long): only its silence times out.
      const session = state.sessions?.find(s => s.id === sessionId);
      if (session?.status === "executing") clearTimeout(timer);
      else if (session) wait();
    });
    wait();
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
    processTradeRequest(request, userId).catch(error => LOG.error("Trade coordinator error", error));
  });
  // Prevent ordinary client edits of what the snapshot holds (items and coins) while a saved exchange is being committed;
  // the rest of the actor (hit points, slots, experience) stays playable.
  const allowEdit = actor => {
    if (!isSupportedActor(actor) || !isTradeLocked(actor)) return true;
    const session = sessionFor(actor.id);
    if (session.status === "executing" && game.user.isGM && session.gmId === game.user.id) return true;
    ui.notifications?.warn(game.i18n.localize("AIM.trade.errors.busy"));
    return false;
  };
  for (const hook of ["preCreateItem", "preUpdateItem", "preDeleteItem"]) Hooks.on(hook, item => allowEdit(item.parent));
  Hooks.on("preUpdateActor", (actor, changes) => {
    const paths = Object.entries(changes).flatMap(([key, value]) =>
      key === "system" && value && typeof value === "object" ? Object.keys(value).map(name => `system.${name}`) : [key]);
    if (paths.some(path => path === "items" || path === "system.currency" || path.startsWith("system.currency."))) return allowEdit(actor);
    return true;
  });
}
