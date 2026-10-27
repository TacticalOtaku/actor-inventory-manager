// ─────────────────────────────────────────────────────────
// Actor window - hit point entry and vital state (pure)
// ─────────────────────────────────────────────────────────

/**
 * Read the HP field: −7 deals damage, +5 heals, a bare number sets HP, в8 (or t8) grants temporary HP.
 * @param {string} text
 * @returns {{kind: "damage"|"heal"|"set"|"temp", amount: number}|null}
 */
export function parseHpEntry(text) {
  const match = /^([−\-+вВtT]?)\s*(\d+)$/.exec(String(text ?? "").trim());
  if (!match) return null;
  const amount = Number(match[2]);
  const sign = match[1];
  if (sign === "−" || sign === "-") return { kind: "damage", amount };
  if (sign === "+") return { kind: "heal", amount };
  if (sign) return { kind: "temp", amount };
  return { kind: "set", amount };
}

/**
 * What an entry would leave, as dnd5e applies it: damage takes temporary HP first, healing stops at max,
 * temporary HP never stack (the higher value stays).
 * @param {{value: number, max: number, temp: number}} hp
 * @param {{kind: string, amount: number}} entry
 * @returns {{value: number, temp: number, lostTemp: number}}
 */
export function previewHp({ value, max, temp }, { kind, amount }) {
  if (kind === "damage") {
    const lostTemp = Math.min(temp, amount);
    return { value: Math.max(0, value - (amount - lostTemp)), temp: temp - lostTemp, lostTemp };
  }
  if (kind === "heal") return { value: Math.min(max, value + amount), temp, lostTemp: 0 };
  if (kind === "set") return { value: Math.max(0, Math.min(max, amount)), temp, lostTemp: 0 };
  return { value, temp: Math.max(temp, amount), lostTemp: 0 };
}

/** ok above half, hurt at half or below, critical at a quarter or below, down at 0. */
export function vitalState(value, max) {
  if (max <= 0) return "ok";
  if (value <= 0) return "down";
  const ratio = value / max;
  if (ratio <= 0.25) return "critical";
  if (ratio <= 0.5) return "hurt";
  return "ok";
}

/** The HP bar's heartbeat quickens as HP fall. */
export function heartbeatFor(value, max) {
  const state = vitalState(value, max);
  if (state === "critical" || state === "down") return "0.85s";
  if (state === "hurt") return "1.7s";
  return "2.8s";
}
