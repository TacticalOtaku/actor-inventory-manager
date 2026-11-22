import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { setImmediate as turn } from "node:timers/promises";

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {
        constructor(options = {}) {
          this.options = options;
          this.rendered = true;
          this.renderCalls = 0;
        }
        async _prepareContext() {
          return {};
        }
        render() {
          this.renderCalls += 1;
          return Promise.resolve(this);
        }
        _onFirstRender() {}
        _onClose() {
          this.rendered = false;
        }
      },
      HandlebarsApplicationMixin: (Base) => Base,
    },
  },
};

const { PresetEditor } = await import("../scripts/ui/preset-editor.js");

function classList(initial = []) {
  const set = new Set(initial);
  return {
    add: (...names) => names.forEach((n) => set.add(n)),
    remove: (...names) => names.forEach((n) => set.delete(n)),
    toggle: (name, force) => {
      if (force === undefined) {
        if (set.has(name)) set.delete(name);
        else set.add(name);
      } else if (force) set.add(name);
      else set.delete(name);
    },
    contains: (name) => set.has(name),
  };
}

function makeEditorDOM(slotIds, { motion = "full", cardHeight = 160, scrollerHeight = 400, scrollBehavior } = {}) {
  const listeners = new Map();
  const scroller = {
    clientHeight: scrollerHeight,
    listeners: new Map(),
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      this.listeners.get(type)?.delete(fn);
    },
    dispatch(type) {
      for (const fn of [...(this.listeners.get(type) ?? [])]) fn({ type });
    },
  };

  const doc = { activeElement: null };
  const previewSlots = slotIds.map((id) => ({
    dataset: { slot: id },
    classList: classList(["aim-slot"]),
  }));

  const cards = slotIds.map((id) => {
    const labelInput = {
      dataset: { field: "label" },
      focusCalls: [],
      focus(opts) {
        this.focusCalls.push(opts);
        doc.activeElement = this;
      },
    };
    const card = {
      dataset: { slotId: id },
      offsetHeight: cardHeight,
      offsetWidth: 300,
      isConnected: true,
      ownerDocument: doc,
      classList: classList(["aim-editor-slot"]),
      scrollCalls: [],
      contains: (node) => node === card || node === labelInput,
      querySelector: (sel) => (sel === '[data-field="label"]' ? labelInput : null),
      addEventListener() {},
      scrollIntoView(opts) {
        this.scrollCalls.push(opts);
        return scrollBehavior ? scrollBehavior(id, opts) : undefined;
      },
    };
    card.labelInput = labelInput;
    return card;
  });

  scroller.contains = (node) => cards.some((card) => card.contains(node));

  const root = {
    dataset: { motion },
    style: { setProperty() {}, removeProperty() {} },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    querySelector(sel) {
      if (sel === ".aim-editor-slots") return scroller;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === ".aim-editor-preview .aim-slot[data-slot]") return previewSlots;
      if (sel === ".aim-editor-slots .aim-editor-slot[data-slot-id]") return cards;
      return [];
    },
  };

  return { root, scroller, previewSlots, cards, doc };
}

function makeActor() {
  return {
    id: "actor-1",
    uuid: "Actor.actor-1",
    name: "Hero",
    type: "character",
    hasPlayerOwner: true,
    flags: {},
    items: [],
    system: { attributes: { attunement: { max: 3 } } },
    _source: { system: { attributes: { attunement: { max: 3 } } } },
  };
}

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout"] });
  globalThis.CONFIG = { Item: { typeLabels: {} } };
  globalThis.Hooks = { on: () => 1, off: () => {} };
  globalThis.game = {
    user: { id: "gm", isGM: true },
    i18n: { localize: (k) => k, format: (k) => k },
    settings: { get: () => [] },
  };
});

afterEach(() => {
  mock.timers.reset();
  delete globalThis.CONFIG;
  delete globalThis.Hooks;
  delete globalThis.game;
});

describe("PresetEditor slot selection and scroll-to-settings", () => {
  it("highlights the selected slot in both context preview and form slots", async () => {
    const editor = new PresetEditor(makeActor());
    editor.selectedSlotId = "feet";
    const ctx = await editor._prepareContext({});
    const formFeet = ctx.slots.find((s) => s.id === "feet");
    const previewFeet = ctx.doll.slots.find((s) => s.id === "feet");
    const formHead = ctx.slots.find((s) => s.id === "head");

    assert.equal(formFeet.selected, true);
    assert.equal(previewFeet.selected, true);
    assert.equal(formHead.selected, false);
  });

  it("scrolls to the slot settings, flashes it, and moves focus after scroll promise resolves", async () => {
    const editor = new PresetEditor(makeActor());
    let resolveScroll;
    const dom = makeEditorDOM(
      editor.working.slots.map((s) => s.id),
      {
        motion: "full",
        scrollBehavior: () => new Promise((resolve) => { resolveScroll = resolve; }),
      },
    );
    editor.element = dom.root;

    const pending = PresetEditor.DEFAULT_OPTIONS.actions.slotClick.call(editor, {}, { dataset: { slot: "feet" } });

    assert.equal(editor.selectedSlotId, "feet");
    const feetPreview = dom.previewSlots.find((s) => s.dataset.slot === "feet");
    const feetCard = dom.cards.find((c) => c.dataset.slotId === "feet");
    assert.equal(feetPreview.classList.contains("is-selected"), true);
    assert.equal(feetCard.classList.contains("is-selected"), true);
    assert.deepEqual(feetCard.scrollCalls, [{ block: "nearest", inline: "nearest", behavior: "smooth" }]);

    // Focus and landing flash wait until the scroll finishes.
    assert.equal(feetCard.classList.contains("is-found"), false);
    assert.equal(feetCard.labelInput.focusCalls.length, 0);

    resolveScroll();
    await pending;

    assert.equal(feetCard.classList.contains("is-found"), true);
    assert.deepEqual(feetCard.labelInput.focusCalls, [{ preventScroll: true }]);
  });

  it("cancels stale post-scroll effects when another preview slot is clicked mid-scroll", async () => {
    const editor = new PresetEditor(makeActor());
    const resolvers = new Map();
    const dom = makeEditorDOM(
      editor.working.slots.map((s) => s.id),
      {
        motion: "full",
        scrollBehavior: (id) => new Promise((resolve) => resolvers.set(id, resolve)),
      },
    );
    editor.element = dom.root;

    const first = PresetEditor.DEFAULT_OPTIONS.actions.slotClick.call(editor, {}, { dataset: { slot: "head" } });
    const second = PresetEditor.DEFAULT_OPTIONS.actions.slotClick.call(editor, {}, { dataset: { slot: "ring2" } });

    resolvers.get("head")();
    await first;

    const headCard = dom.cards.find((c) => c.dataset.slotId === "head");
    const ring2Card = dom.cards.find((c) => c.dataset.slotId === "ring2");
    assert.equal(headCard.classList.contains("is-found"), false);
    assert.equal(headCard.labelInput.focusCalls.length, 0);

    resolvers.get("ring2")();
    await second;

    assert.equal(ring2Card.classList.contains("is-selected"), true);
    assert.equal(ring2Card.classList.contains("is-found"), true);
    assert.deepEqual(ring2Card.labelInput.focusCalls, [{ preventScroll: true }]);
  });

  it("supports scrollend fallback when scrollIntoView returns undefined", async () => {
    const editor = new PresetEditor(makeActor());
    const dom = makeEditorDOM(editor.working.slots.map((s) => s.id), { motion: "full" });
    editor.element = dom.root;

    const pending = PresetEditor.DEFAULT_OPTIONS.actions.slotClick.call(editor, {}, { dataset: { slot: "waist" } });
    const waistCard = dom.cards.find((c) => c.dataset.slotId === "waist");
    assert.equal(waistCard.labelInput.focusCalls.length, 0);

    dom.scroller.dispatch("scrollend");
    await pending;

    assert.equal(waistCard.classList.contains("is-found"), true);
    assert.deepEqual(waistCard.labelInput.focusCalls, [{ preventScroll: true }]);
  });

  it("jumps immediately without smooth scroll or flash when motion is off, and aligns tall cards to start", async () => {
    const editor = new PresetEditor(makeActor());
    const dom = makeEditorDOM(editor.working.slots.map((s) => s.id), {
      motion: "off",
      cardHeight: 220,
      scrollerHeight: 160,
    });
    editor.element = dom.root;

    await PresetEditor.DEFAULT_OPTIONS.actions.slotClick.call(editor, {}, { dataset: { slot: "armor" } });

    const armorCard = dom.cards.find((c) => c.dataset.slotId === "armor");
    assert.deepEqual(armorCard.scrollCalls, [{ block: "start", inline: "nearest", behavior: "auto" }]);
    assert.equal(armorCard.classList.contains("is-found"), false);
    assert.deepEqual(armorCard.labelInput.focusCalls, [{ preventScroll: true }]);
  });

  it("selects newly added slots, clears selection on remove, and aborts pending scroll on close", async () => {
    const editor = new PresetEditor(makeActor());
    const dom = makeEditorDOM(editor.working.slots.map((s) => s.id), { motion: "full" });
    editor.element = dom.root;

    const pending = PresetEditor.DEFAULT_OPTIONS.actions.slotClick.call(editor, {}, { dataset: { slot: "head" } });
    editor._onClose({});
    mock.timers.tick(200);
    await pending;
    await turn();

    const headCard = dom.cards.find((c) => c.dataset.slotId === "head");
    assert.equal(headCard.labelInput.focusCalls.length, 0);

    editor.rendered = true;
    const adding = PresetEditor.DEFAULT_OPTIONS.actions.addSlot.call(editor);
    await turn();
    mock.timers.tick(100);
    await adding;
    assert.equal(editor.selectedSlotId, "slot1");
    assert.deepEqual(dom.cards.find((c) => c.dataset.slotId === "head").labelInput.focusCalls, []);

    PresetEditor.DEFAULT_OPTIONS.actions.removeSlot.call(editor, {}, {
      closest: () => ({ dataset: { slotId: "slot1" } }),
    });
    assert.equal(editor.selectedSlotId, null);
  });

  it("syncs selection when focusing a slot settings card and preserves selection when moving a slot", async () => {
    const editor = new PresetEditor(makeActor());
    const listeners = new Map();
    const dom = makeEditorDOM(editor.working.slots.map((s) => s.id), { motion: "off" });
    dom.root.addEventListener = (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    };
    editor.element = dom.root;

    const prevHooks = globalThis.Hooks;
    const prevDoc = globalThis.document;
    const prevObs = globalThis.MutationObserver;
    const prevGet = globalThis.game.settings.get;
    globalThis.Hooks = { on: () => 1, off: () => {} };
    globalThis.document = { body: { classList: classList() } };
    globalThis.game.settings.get = (_mod, key) => (key === "motionLevel" ? "off" : key === "customTemplates" ? [] : "");
    globalThis.MutationObserver = class {
      observe() {}
      disconnect() {}
    };
    try {
      editor._onFirstRender({}, {});
    } finally {
      globalThis.Hooks = prevHooks;
      globalThis.document = prevDoc;
      globalThis.game.settings.get = prevGet;
      globalThis.MutationObserver = prevObs;
    }

    for (const fn of listeners.get("focusin") ?? []) {
      fn({ target: { closest: (sel) => (sel === ".aim-editor-slot[data-slot-id]" ? { dataset: { slotId: "neck" } } : null) } });
    }
    assert.equal(editor.selectedSlotId, "neck");
    assert.equal(dom.previewSlots.find((s) => s.dataset.slot === "neck").classList.contains("is-selected"), true);
    assert.equal(dom.cards.find((c) => c.dataset.slotId === "neck").classList.contains("is-selected"), true);

    await PresetEditor.DEFAULT_OPTIONS.actions.moveSlot.call(editor, {}, {
      dataset: { delta: "-1" },
      closest: () => ({ dataset: { slotId: "neck" } }),
    });
    assert.equal(editor.selectedSlotId, "neck");
    assert.equal(editor.working.slots[0].id, "neck");
    assert.ok(dom.cards.find((c) => c.dataset.slotId === "neck").scrollCalls.length > 0);

    editor._onClose({});
  });
});
