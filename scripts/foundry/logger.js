// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Logger
// ─────────────────────────────────────────────────────────

import { LOG_LEVELS, MODULE_ID } from "../constants.js";

const LEVEL_WEIGHTS = {
  none: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5
};

export class Logger {
  constructor(moduleId = MODULE_ID) {
    this.prefix = `[${moduleId}]`;
    this.level = "info";
  }

  setLevel(newLevel) {
    if (LOG_LEVELS.includes(newLevel)) {
      this.level = newLevel;
    }
  }

  _shouldLog(targetLevel) {
    const currentWeight = LEVEL_WEIGHTS[this.level] ?? LEVEL_WEIGHTS.info;
    const targetWeight = LEVEL_WEIGHTS[targetLevel] ?? LEVEL_WEIGHTS.info;
    return currentWeight >= targetWeight && currentWeight > 0;
  }

  error(...args) {
    if (this._shouldLog("error")) {
      console.error(this.prefix, ...args);
    }
  }

  warn(...args) {
    if (this._shouldLog("warn")) {
      console.warn(this.prefix, ...args);
    }
  }

  info(...args) {
    if (this._shouldLog("info")) {
      console.info(this.prefix, ...args);
    }
  }

  debug(...args) {
    if (this._shouldLog("debug")) {
      console.debug(this.prefix, ...args);
    }
  }

  trace(...args) {
    if (this._shouldLog("trace")) {
      console.trace(this.prefix, ...args);
    }
  }
}

export const LOG = new Logger();
