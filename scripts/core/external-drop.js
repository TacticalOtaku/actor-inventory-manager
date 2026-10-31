// ─────────────────────────────────────────────────────────
// Actor window - what a drop from outside the actor does: copy, move or refuse (ADR 0004, pure)
// ─────────────────────────────────────────────────────────

/**
 * Copy or move, the window's call (dnd5e itself always gets "copy"). From the sidebar, a compendium, chat, a journal
 * or a bastion card: copy. From another actor the user owns: move. From an actor the user does not own, an Item Piles
 * pile included: refused. The GM copies, and moves with Shift. A drop from the window's own actor is not this one's.
 * @param {{fromActor: boolean, sameActor: boolean, isPile: boolean, ownsSource: boolean, isGM: boolean, shift: boolean}} source
 * @returns {{behavior: "copy"|"move"|null, refusal: "pile"|"notOwner"|null}}
 */
export function dropBehavior({ fromActor, sameActor, isPile, ownsSource, isGM, shift }) {
  if (!fromActor) return { behavior: "copy", refusal: null };
  if (sameActor) return { behavior: null, refusal: null };
  if (isPile && !isGM) return { behavior: null, refusal: "pile" };
  if (isGM) return { behavior: shift ? "move" : "copy", refusal: null };
  if (!ownsSource) return { behavior: null, refusal: "notOwner" };
  return { behavior: "move", refusal: null };
}

/** The first dropped type the actor's sheet does not take (a vehicle takes no class, species, background or spell). */
export const refusedType = (types, unsupported) => types.find((type) => unsupported?.has?.(type)) ?? null;

/** Spells follow the window's tab: on the equipment tab a spell becomes a scroll, elsewhere it stays a spell. */
export const spellBecomes = (tab) => (tab === "equipment" ? "scroll" : "spell");

/**
 * Whether a drop onto a container left something outside it: a sheet that cannot put items into one (Tidy's new
 * sheet) creates them in the inventory root, the window says so (ADR 0004).
 * @param {(string|null|undefined)[]} containers  the `system.container` of each created item
 * @param {string} containerId
 */
export const landedOutside = (containers, containerId) => containers.some((id) => (id ?? null) !== containerId);

/**
 * Whether the row menu offers «Drop on the ground» (Item Piles active is checked first): an owner or the GM, a physical
 * item, the actor's token on the viewed scene, no running exchange. A container stays: its contents would not follow.
 * @param {{owner: boolean, physical: boolean, container: boolean, onScene: boolean, trading: boolean}} state
 */
export const canDropOnGround = ({ owner, physical, container, onScene, trading }) => owner && physical && !container && onScene && !trading;
