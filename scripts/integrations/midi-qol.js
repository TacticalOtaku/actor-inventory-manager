// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - midi-qol Integration Adapter
// ─────────────────────────────────────────────────────────

export const MIDI_QOL_MODULE_ID = "midi-qol";

/** @returns {boolean} */
export function isMidiQolActive() {
  return Boolean(globalThis.game?.modules?.get(MIDI_QOL_MODULE_ID)?.active);
}

/**
 * The activities a player picks from: those dnd5e lets them use (`activity.canUse`), without the ones midi-qol
 * marks «only for automation» (`midiProperties.automationOnly`, midi-qol 14), which midi runs itself.
 * @param {Object} item
 * @returns {Object[]}
 */
export function usableActivities(item) {
  const midi = isMidiQolActive();
  return [...(item?.system?.activities ?? [])].filter((activity) => activity.canUse !== false
    && !(midi && activity.midiProperties?.automationOnly));
}
