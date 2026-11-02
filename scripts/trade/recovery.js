// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Trade Recovery
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";
import { captureInventory, restoreInventory } from "./transfer.js";
import { LOG } from "../foundry/logger.js";
import { canonicalJSON, documentFingerprint, recoveryAttributes } from "./document-data.js";

/**
 * Trade recovery: captures inventory snapshots, persists to journal, restores on failure.
 * Hides JournalEntry details from commands.
 */
export class TradeRecovery {
  /**
   * Capture inventory snapshots and save to a private journal.
   * @param {string} sessionId
   * @param {Array<Object>} actors - array of actor documents
   * @param {Function} assertCoordinator - throws if coordinator lost incumbency
   * @returns {Promise<{journal: Object, snapshots: Array}>}
   */
  static async capture(sessionId, actors, assertCoordinator) {
    assertCoordinator();
    const snapshots = actors.map(captureInventory);

    // Deliberately private journal: never put full inventories in a world setting.
    // Encode the payload to isolate snapshots from Document cleaning/expansion and
    // preserve literal currency paths (e.g. "system.currency.gp") in journal flags.
    const journal = await JournalEntry.create({
      name: `AIM recovery ${sessionId}`,
      ownership: { default: 0 },
      flags: {
        [MODULE_ID]: {
          tradeRecovery: JSON.stringify({ sessionId, snapshots })
        }
      }
    });

    assertCoordinator();
    return { journal, snapshots };
  }

  /**
   * Restore inventories from a saved recovery journal.
   * @param {string} journalId
   * @param {string} expectedSessionId
   * @param {Function} assertCoordinator
   * @returns {Promise<void>}
   * @throws {Error} if journal not found, data invalid, or restore fails
   */
  static async restore(journalId, expectedSessionId, assertCoordinator, actorIds) {
    const journal = game.journal.get(journalId);
    const storedRecovery = journal?.getFlag(MODULE_ID, "tradeRecovery");
    const recovery = typeof storedRecovery === "string" ? JSON.parse(storedRecovery) : storedRecovery;

    if (!recovery) {
      throw new Error("AIM.trade.errors.recoveryLost");
    }

    if (recovery.sessionId !== expectedSessionId || !Array.isArray(recovery.snapshots)
      || recovery.snapshots.length !== actorIds.length
      || new Set(recovery.snapshots.map(snapshot => snapshot?.actorId)).size !== actorIds.length
      || recovery.snapshots.some(snapshot => !actorIds.includes(snapshot?.actorId) || !Array.isArray(snapshot.items))) {
      throw new Error("AIM.trade.errors.recovery");
    }

    // GM confirmed the restore: an actor deleted since is skipped, one no longer player-owned is restored too.
    for (const snapshot of recovery.snapshots) {
      const participant = game.actors.get(snapshot.actorId);
      if (participant) {
        await restoreInventory(participant, snapshot, assertCoordinator);
        // A veto can leave a name/flag/system field untouched even when quantities match.
        if (!matchesSnapshot(participant, snapshot)) {
          throw new Error("AIM.trade.errors.recovery");
        }
      }
    }
  }

  /**
   * Delete a recovery journal.
   * @param {string} journalId
   * @returns {Promise<void>}
   */
  static async cleanup(journalId) {
    try {
      const journal = game.journal.get(journalId);
      if (journal) await journal.delete();
    } catch (error) {
      LOG.warn("Could not remove trade recovery journal", error);
    }
  }

  /**
   * Delete a recovery journal by session id (for interrupted preparation).
   * @param {string} sessionId
   * @returns {Promise<void>}
   */
  static async cleanupBySessionId(sessionId) {
    try {
      const journal = game.journal.getName?.(`AIM recovery ${sessionId}`);
      if (journal) await journal.delete();
    } catch (error) {
      LOG.warn("Could not remove unnamed trade recovery journal", error);
    }
  }
}


/** Recovery is defined by its saved baseline, never by today's currency provider configuration. */
function matchesSnapshot(actor, snapshot) {
  const expected = new Map(snapshot.items.map(data => [data._id, documentFingerprint(data)]));
  if (actor.items.size !== expected.size) return false;
  for (const item of actor.items.values()) {
    const data = item.toObject();
    if (expected.get(data._id) !== documentFingerprint(data)) return false;
  }
  return Object.entries(recoveryAttributes(snapshot.attributes)).every(([path, value]) =>
    canonicalJSON(foundry.utils.getProperty(actor, path)) === canonicalJSON(value));
}
