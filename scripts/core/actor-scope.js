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

export function isTradeActor(actor) {
  return isSupportedActor(actor) && !actor.isToken && hasPlayerOwner(actor);
}
