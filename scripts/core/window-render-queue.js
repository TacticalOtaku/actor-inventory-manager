// The actor window's pending redraws, effect hold and biography catch-up share one lifecycle.
const COALESCE_MS = 40;

export class WindowRenderQueue {
  #parts;
  #render;
  #editing;
  #active;
  #now;
  #onError;
  #pending = new Set();
  #coalescing = new Set();
  #debounce;
  #railTimer;
  #bioTimer;
  #railUntil = 0;
  #rendering = false;
  #due = false;
  #closed = false;

  constructor({ parts, render, editing, active, onError, now = () => performance.now() }) {
    this.#parts = [...parts];
    this.#render = render;
    this.#editing = editing;
    this.#active = active;
    this.#now = now;
    this.#onError = onError;
  }

  /** A burst of document changes leaves after a quiet 40 ms. */
  enqueue(parts = null) {
    if (this.#closed) return;
    for (const part of parts ?? this.#parts) this.#coalescing.add(part);
    clearTimeout(this.#debounce);
    this.#debounce = setTimeout(() => {
      this.#debounce = undefined;
      this.#releaseBurst();
      this.#flush();
    }, COALESCE_MS);
  }

  /** A saved trade state is ready now, subject to the same effect and biography holds. */
  request(parts = null) {
    if (this.#closed) return;
    this.#releaseBurst();
    this.#add(parts);
    clearTimeout(this.#debounce);
    this.#debounce = undefined;
    this.#flush();
  }

  /** The last rail render either started an effect or interrupted the previous one (0). */
  holdRail(ms) {
    if (this.#closed) return;
    this.#railUntil = this.#now() + ms;
    this.#scheduleRail();
  }

  /** Let focus settle before checking whether a biography edit really ended. */
  resume() {
    if (this.#closed) return;
    clearTimeout(this.#bioTimer);
    this.#bioTimer = setTimeout(() => { this.#bioTimer = undefined; this.#flush(); }, 0);
  }

  close() {
    this.#closed = true;
    clearTimeout(this.#debounce);
    clearTimeout(this.#railTimer);
    clearTimeout(this.#bioTimer);
    this.#pending.clear();
    this.#coalescing.clear();
    this.#due = false;
  }

  #releaseBurst() {
    this.#add(this.#coalescing);
    this.#coalescing.clear();
  }

  #add(parts) {
    for (const part of parts ?? this.#parts) this.#pending.add(part);
  }

  #scheduleRail() {
    clearTimeout(this.#railTimer);
    this.#railTimer = undefined;
    if (!this.#closed && this.#pending.has("rail")) {
      this.#railTimer = setTimeout(() => {
        this.#railTimer = undefined;
        this.#flush();
      }, Math.max(0, this.#railUntil - this.#now()));
    }
  }

  #flush() {
    if (this.#closed) return;
    this.#due = true;
    if (this.#rendering) return;
    if (!this.#active()) return;
    const editing = this.#editing();
    const parts = this.#parts.filter((part) => this.#pending.has(part)
      && !(part === "main" && editing)
      && !(part === "rail" && this.#now() < this.#railUntil));
    for (const part of parts) this.#pending.delete(part);
    this.#scheduleRail();
    if (!parts.length) return;
    this.#due = false;
    this.#rendering = true;
    let rendered;
    try { rendered = this.#render(parts); } catch (error) { rendered = Promise.reject(error); }
    Promise.resolve(rendered).catch((error) => {
      if (!this.#closed) for (const part of parts) this.#pending.add(part);
      this.#onError(error);
    }).finally(() => {
      this.#rendering = false;
      if (!this.#closed && this.#due) this.#flush();
    });
  }
}
