import { MODULE_ID } from "../constants.js";
import { configurePaperdollRuntime } from "../core/paperdoll-runtime.js";
import { LOG } from "./logger.js";

/** Bind paperdoll operations to the active Foundry runtime. */
export function registerFoundryPaperdollRuntime() {
  configurePaperdollRuntime({
    getCustomTemplates: () => globalThis.game?.settings?.get?.(MODULE_ID, "customTemplates") ?? {},
    setCustomTemplates: custom => globalThis.game.settings.set(MODULE_ID, "customTemplates", custom),
    isGM: () => Boolean(globalThis.game?.user?.isGM),
    localize: (key, fallback) => globalThis.game?.i18n?.localize?.(key) || fallback || key,
    notifyWarning: message => globalThis.ui?.notifications?.warn?.(message),
    logInfo: (message, data) => LOG.info(message, data)
  });
}
