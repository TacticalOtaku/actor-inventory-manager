/** GM-only NPCs are outside this module, even when opened by the GM. */
export function isSupportedActor(actor) {
  return Boolean(actor && actor.type !== "group" && (actor.type !== "npc" || hasPlayerOwner(actor)));
}

export function hasPlayerOwner(actor) {
  // Foundry's Actor getter already accounts for non-GM users and default ownership.
  return actor?.hasPlayerOwner === true;
}

export function ownsActor(actor, user) {
  if (!actor || !user) return false;
  return Boolean(actor.testUserPermission?.(user, "OWNER"));
}

/**
 * May this user see the full inventory? Limited permission only shows a
 * character's biography in dnd5e, so the inventory needs Observer.
 * @param {Object} actor
 * @param {Object} user
 * @returns {boolean}
 */
export function canViewActor(actor, user) {
  if (!isSupportedActor(actor)) return false;
  if (!user || user.isGM) return Boolean(user?.isGM);
  if (typeof actor.testUserPermission !== "function") return false;
  return Boolean(actor.testUserPermission(user, "OBSERVER"));
}

/**
 * May this user change the actor and its items?
 * @param {Object} actor
 * @param {Object} user
 * @returns {boolean}
 */
export function canEditActor(actor, user) {
  if (!isSupportedActor(actor) || !user) return false;
  return Boolean(user.isGM) || ownsActor(actor, user);
}

export function isTradeActor(actor) {
  return isSupportedActor(actor) && !actor.isToken && hasPlayerOwner(actor);
}
