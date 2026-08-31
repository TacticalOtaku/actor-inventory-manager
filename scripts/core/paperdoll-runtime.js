// Runtime port used by paperdoll domain/application logic.
// The Foundry adapter is registered from the composition root in scripts/main.js.

const DEFAULT_RUNTIME = Object.freeze({
  getCustomTemplates: () => ({}),
  setCustomTemplates: async () => {
    throw new Error("Paperdoll runtime is not configured");
  },
  isGM: () => false,
  localize: (key, fallback) => fallback ?? key,
  notifyWarning: () => {},
  logInfo: () => {}
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
