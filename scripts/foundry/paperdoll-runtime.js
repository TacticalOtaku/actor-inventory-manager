import { MODULE_ID } from "../constants.js";
import { configurePaperdollRuntime, formatTemplate } from "../core/paperdoll-runtime.js";
import { LOG } from "./logger.js";

/** Localized string, or the fallback when the key has no translation. */
function localize(key, fallback) {
  const i18n = globalThis.game?.i18n;
  if (i18n?.has?.(key)) return i18n.localize(key);
  const value = i18n?.localize?.(key);
  return value && value !== key ? value : (fallback ?? key);
}

/** Bind paperdoll operations to the active Foundry runtime. */
export function registerFoundryPaperdollRuntime() {
  configurePaperdollRuntime({
    getCustomTemplates: () => globalThis.game?.settings?.get?.(MODULE_ID, "customTemplates") ?? {},
    setCustomTemplates: custom => globalThis.game.settings.set(MODULE_ID, "customTemplates", custom),
    isGM: () => Boolean(globalThis.game?.user?.isGM),
    localize,
    format: (key, data, fallback) => formatTemplate(localize(key, fallback), data),
    notifyWarning: message => globalThis.ui?.notifications?.warn?.(message),
    logInfo: (message, data) => LOG.info(message, data),
    logWarn: (message, data) => LOG.warn(message, data),
    autoReconcileSlots: () => {
      try {
        return globalThis.game?.settings?.get?.(MODULE_ID, "autoReconcileSlots") !== false;
      } catch {
        return true;
      }
    }
  });
}
