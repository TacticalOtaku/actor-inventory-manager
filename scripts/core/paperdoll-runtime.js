// Runtime port used by paperdoll domain/application logic.
// The Foundry adapter is registered from the composition root in scripts/main.js.

/**
 * Substitute `{name}` placeholders, mirroring Foundry's i18n.format.
 * @param {string} template
 * @param {Object} [data]
 * @returns {string}
 */
export function formatTemplate(template, data = {}) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (match, key) => (key in data ? String(data[key]) : match));
}

const DEFAULT_RUNTIME = Object.freeze({
  getCustomTemplates: () => ({}),
  setCustomTemplates: async () => {
    throw new Error("Paperdoll runtime is not configured");
  },
  isGM: () => false,
  localize: (key, fallback) => fallback ?? key,
  format: (key, data, fallback) => formatTemplate(fallback ?? key, data),
  notifyWarning: () => {},
  logInfo: () => {},
  logWarn: () => {},
  autoReconcileSlots: () => true
});

let runtime = { ...DEFAULT_RUNTIME };

/**
 * Configure the platform operations required by paperdoll templates.
 * @param {Partial<typeof DEFAULT_RUNTIME>} adapter
 */
export function configurePaperdollRuntime(adapter = {}) {
  runtime = { ...DEFAULT_RUNTIME, ...adapter };
}

/** Reset the runtime port, primarily to keep tests isolated. */
export function resetPaperdollRuntime() {
  runtime = { ...DEFAULT_RUNTIME };
}

/** @returns {typeof DEFAULT_RUNTIME} */
export function getPaperdollRuntime() {
  return runtime;
}
