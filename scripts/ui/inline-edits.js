function showInvalid(input, invalid) {
  input.classList.toggle("is-invalid", invalid);
  input.setAttribute("aria-invalid", String(invalid));
}

/** Per-window editing lifecycle; document-specific parsing and writes stay in its adapters. */
export class InlineEdits {
  #adapters;
  #render;
  #onError;
  #sessions = new Map();
  #bindings = new Map();
  #revision = 0;
  #closed = false;
  #replacing = false;

  constructor(adapters, { render, onError }) {
    this.#adapters = adapters;
    this.#render = render;
    this.#onError = onError;
  }

  state(name) {
    const session = this.#sessions.get(name);
    return session ? { target: session.target, text: session.text, invalid: session.invalid }
      : { target: null, text: "", invalid: false };
  }

  begin(name, target = true, text = "") {
    if (this.#closed || !this.#adapters[name].editable(target)) return;
    this.#unbind(name);
    this.#sessions.set(name, { target, text, invalid: false, revision: ++this.#revision });
    this.#refresh(this.#adapters[name].part);
  }

  /** Bind only new rendered inputs; an unrelated part redraw must not move a live caret. */
  mount(root) {
    if (this.#closed) return;
    for (const [name, adapter] of Object.entries(this.#adapters)) {
      const session = this.#sessions.get(name);
      const input = session && root.querySelector(adapter.selector);
      const bound = this.#bindings.get(name);
      if (bound?.input === input && bound?.session === session) {
        if (input) {
          showInvalid(input, session.invalid);
          adapter.preview?.(input);
        }
        continue;
      }
      this.#unbind(name);
      if (!input) continue;
      input.value = session.text;
      showInvalid(input, session.invalid);
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      adapter.preview?.(input);
      const current = () => this.#sessions.get(name) === session && !this.#closed;
      const listeners = {
        input: () => {
          if (!current()) return;
          session.text = input.value;
          session.invalid = false;
          showInvalid(input, false);
          adapter.preview?.(input);
        },
        keydown: event => {
          if (!current()) return;
          if (event.key === "Enter") { event.preventDefault(); void this.#commit(name, session, input); }
          if (event.key === "Escape") {
            event.preventDefault(); event.stopPropagation(); this.#cancel(name);
          }
        },
        blur: () => { if (current() && input.isConnected && !this.#replacing) this.#cancel(name); }
      };
      for (const [event, listener] of Object.entries(listeners)) input.addEventListener(event, listener);
      this.#bindings.set(name, { input, session, listeners });
    }
  }

  /** DOM replacement can blur an input before the browser disconnects it. */
  replace(render) {
    const prior = this.#replacing;
    this.#replacing = true;
    try { return render(); }
    finally { this.#replacing = prior; }
  }

  close() {
    this.#closed = true;
    this.#revision++;
    this.#sessions.clear();
    for (const name of this.#bindings.keys()) this.#unbind(name);
  }

  #unbind(name) {
    const binding = this.#bindings.get(name);
    if (!binding) return;
    for (const [event, listener] of Object.entries(binding.listeners)) binding.input.removeEventListener(event, listener);
    this.#bindings.delete(name);
  }

  #refresh(part) {
    if (this.#closed) return;
    try { Promise.resolve(this.#render(part)).catch(error => { if (!this.#closed) this.#onError(error); }); }
    catch (error) { this.#onError(error); }
  }

  #cancel(name) {
    this.#sessions.delete(name);
    this.#revision++;
    this.#unbind(name);
    this.#refresh(this.#adapters[name].part);
  }

  async #commit(name, session, input) {
    const adapter = this.#adapters[name];
    session.text = input.value;
    const value = adapter.parse(session.target, session.text);
    if (value === null) {
      session.invalid = true;
      showInvalid(input, true);
      return;
    }
    const current = () => !this.#closed && this.#revision === session.revision;
    // Remove listeners/state synchronously: a second Enter cannot submit a relative change twice.
    this.#sessions.delete(name);
    this.#unbind(name);
    let written = false;
    try {
      if (!adapter.editable(session.target)) throw new Error("Inline edit target is unavailable");
      if (adapter.beforeWrite) await this.#render(adapter.part);
      if (this.#closed) return;
      if (!adapter.editable(session.target)) throw new Error("Inline edit target is unavailable");
      await adapter.write(session.target, value);
      written = true;
      if (!adapter.beforeWrite && current()) await this.#render(adapter.part);
    } catch (error) {
      if (!current()) return;
      if (written) {
        this.#onError(error, { saved: true });
        return;
      }
      this.#sessions.set(name, session);
      this.#onError(error);
      try { await this.#render(adapter.part); }
      catch { /* The draft remains available for a subsequent successful render. */ }
    }
  }
}
