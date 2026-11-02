// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Trade State Machine
// ─────────────────────────────────────────────────────────

/**
 * Trade state transitions:
 *
 *   open ──────────────────────────→ cancelled
 *     │                                   ↑
 *     │ (both confirm)                    │
 *     ↓                                   │
 *   executing ─────→ complete             │
 *     │                                   │
 *     │ (transfer fails)                  │
 *     ├──────────────→ failed ────────────┘
 *     │
 *     │ (rollback fails)
 *     └──────────────→ recovery
 *                          │
 *                          │ (GM restores)
 *                          ↓
 *                        failed
 */

const ACTIVE_STATES = new Set(["open", "executing", "recovery"]);
const TERMINAL_STATES = new Set(["complete", "failed", "cancelled"]);

/**
 * Trade state machine: validates and executes state transitions.
 */
export class TradeStateMachine {
  /**
   * Check if a transition is valid from the current session status.
   * @param {Object} session
   * @param {string} targetStatus
   * @returns {boolean}
   */
  static canTransition(session, targetStatus) {
    const current = session.status;

    // Reclaiming an executing recovery does not change its state.
    if (current === targetStatus) return ACTIVE_STATES.has(current);
    if (TERMINAL_STATES.has(current)) return false;
    // No debit can have occurred before the journal pointer/transfer phase was persisted.
    if (current === "recovery" && targetStatus === "cancelled") return session.phase === "preparing" && !session.recoveryId;

    // Valid transitions by status
    const transitions = {
      open: ["executing", "cancelled"],
      executing: ["complete", "failed", "recovery", "cancelled"],
      recovery: ["executing", "failed"]
    };

    return transitions[current]?.includes(targetStatus) ?? false;
  }

  /**
   * Transition a session to a new status, throwing if invalid.
   * @param {Object} session
   * @param {string} newStatus
   * @throws {Error} if transition is invalid
   */
  static transition(session, newStatus) {
    if (!this.canTransition(session, newStatus)) {
      throw new Error(`Invalid transition from ${session.status} to ${newStatus}`);
    }
    session.status = newStatus;
  }

  /**
   * Check if a session is active (not terminal).
   * @param {Object} session
   * @returns {boolean}
   */
  static isActive(session) {
    return ACTIVE_STATES.has(session.status);
  }

  /**
   * Check if a session is terminal (complete, failed, cancelled).
   * @param {Object} session
   * @returns {boolean}
   */
  static isTerminal(session) {
    return TERMINAL_STATES.has(session.status);
  }
}
