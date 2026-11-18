import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { activityMenuEntries, closeItemMenu, itemMenuEntries, openItemMenu } from "../scripts/ui/equipment.js";

let hooked;

beforeEach(() => {
  hooked = [];
  globalThis.dnd5e = { applications: { item: { ItemSheet5e: { MODES: { PLAY: 1, EDIT: 2 } } } } };
  globalThis.CONFIG = {
    DND5E: { spellcasting: { spell: { prepares: true }, innate: {} }, spellPreparationStates: { always: { value: 2 } } },
    Item: { dataModels: { loot: { schema: { has: (key) => key === "quantity" } } } }
  };
  globalThis.Hooks = { callAll: (name, ...args) => hooked.push([name, ...args]) };
});

afterEach(() => {
  delete globalThis.dnd5e;
  delete globalThis.CONFIG;
  delete globalThis.Hooks;
});

const actions = { equip() {}, attune() {}, prepare() {}, favorite() {}, isFavorite: false };
const character = { isOwner: true, system: {}, concentration: { items: new Set() } };
const item = (data) => ({ actor: character, isOwner: true, getFlag: () => undefined, ...data, system: { properties: new Set(), ...data.system } });
const shown = (it, acts = actions) => itemMenuEntries(it, acts).filter((e) => e.condition?.() ?? true).map((e) => e.name);

describe("item row menu", () => {
  it("gives an owner dnd5e's entries, with Identify only for an unidentified item", () => {
    const it = item({ type: "loot", system: { identified: true } });
    assert.deepEqual(shown(it), ["DND5E.ItemView", "DND5E.ContextMenuActionEdit", "DND5E.ContextMenuActionDuplicate",
      "DND5E.ContextMenuActionDelete", "DND5E.DisplayCard", "DND5E.Favorite"]);
    it.system.identified = false;
    assert.ok(shown(it).includes("DND5E.Identify"));
  });

  it("leaves an observer only viewing and showing in chat", () => {
    assert.deepEqual(shown(item({ type: "loot", isOwner: false, system: { identified: false } })), ["DND5E.ItemView", "DND5E.DisplayCard"]);
  });

  it("keeps dnd5e's delete id and adds the scroll entry for an owned spell", () => {
    const entries = itemMenuEntries(item({ type: "spell", system: { method: "spell", prepared: 0 } }), actions);
    assert.equal(entries.find((e) => e.name === "DND5E.ContextMenuActionDelete").id, "delete");
    assert.ok(entries.some((e) => e.name === "DND5E.Scroll.CreateScroll" && e.group === "action"));
  });

  it("names the state entries by the item's state, as dnd5e does", () => {
    const sword = item({ type: "weapon", system: { equipped: true, attunement: "required", attuned: false } });
    assert.deepEqual(shown(sword, { ...actions, isFavorite: true }).slice(5), ["DND5E.ContextMenuActionAttune", "DND5E.ContextMenuActionUnequip", "DND5E.FavoriteRemove"]);
    const spell = item({ type: "spell", system: { method: "spell", level: 1, prepared: 1 } });
    assert.ok(shown(spell).includes("DND5E.ContextMenuActionUnprepare"));
    assert.ok(!shown(item({ type: "spell", system: { method: "spell", level: 1, prepared: 2 } })).some((n) => n.endsWith("prepare")), "an always-prepared spell has no toggle");
    assert.ok(!shown(item({ type: "spell", system: { method: "innate", level: 1, prepared: 0 } })).some((n) => n.endsWith("Prepare")));
  });

  it("offers preparation by the spells tab's rule: no toggle for a cantrip or a class that knows its spells", () => {
    const toggles = (it) => shown(it).some((n) => /Prepare$/i.test(n));
    assert.equal(toggles(item({ type: "spell", system: { method: "spell", level: 0, prepared: 0 } })), false, "a cantrip is always ready");
    const sorcerer = { ...character, spellcastingClasses: { sorcerer: { system: { spellcasting: { preparation: { max: 0 } } } } } };
    assert.equal(toggles(item({ type: "spell", actor: sorcerer, system: { method: "spell", level: 1, prepared: 0, classIdentifier: "sorcerer" } })), false);
    const wizard = { ...character, spellcastingClasses: { wizard: { system: { spellcasting: { preparation: { max: 8 } } } } } };
    assert.equal(toggles(item({ type: "spell", actor: wizard, system: { method: "spell", level: 1, prepared: 0, classIdentifier: "wizard" } })), true);
  });

  it("offers ending concentration, recharge and an NPC's gear where they apply", () => {
    const concentrating = { ...character, concentration: { items: new Set() } };
    const bless = item({ type: "spell", actor: concentrating, system: { method: "spell", prepared: 1 } });
    concentrating.concentration.items.add(bless);
    assert.ok(shown(bless).includes("DND5E.ConcentrationBreak"));
    const breath = item({ type: "feat", hasRecharge: true, isOnCooldown: true, system: { uses: { spent: 1 } } });
    assert.ok(shown(breath).includes("DND5E.ContextMenuActionCharge"));
    const npc = { isOwner: true, system: { isNPC: true }, concentration: { items: new Set() } };
    assert.ok(shown(item({ type: "loot", actor: npc }), { ...actions, favorite: null }).includes("DND5E.Gear.Action.Add"));
  });

  it("routes state entries through the window and lets other modules add entries", () => {
    const calls = [];
    const sword = item({ type: "weapon", system: { equipped: false } });
    const entries = itemMenuEntries(sword, { ...actions, equip: () => calls.push("equip") });
    entries.find((e) => e.name === "DND5E.ContextMenuActionEquip").callback();
    assert.deepEqual(calls, ["equip"]);
    assert.deepEqual(hooked.map(([name, it, list]) => [name, it, list]), [["dnd5e.getItemContextOptions", sword, entries]]);
  });
});

describe("drop on the ground", () => {
  afterEach(() => { delete globalThis.game; });

  function world(sessions = []) {
    globalThis.game = { modules: new Map([["item-piles", { active: true }]]), settings: { get: () => ({ sessions, receipts: {} }) } };
  }
  const onScene = { ...character, id: "hero", getActiveTokens: () => [{ x: 100, y: 200 }] };

  it("is offered with Item Piles for a physical item of an actor on the scene, and not while its exchange runs", () => {
    world();
    assert.ok(shown(item({ type: "loot", actor: onScene })).includes("AIM.window.inv.dropGround"));
    assert.ok(!shown(item({ type: "loot", actor: { ...onScene, getActiveTokens: () => [] } })).includes("AIM.window.inv.dropGround"));
    assert.ok(!shown(item({ type: "feat", actor: onScene })).includes("AIM.window.inv.dropGround"));
    world([{ status: "executing", actors: ["hero"] }]);
    assert.ok(!shown(item({ type: "loot", actor: onScene })).includes("AIM.window.inv.dropGround"));
  });

  it("stays for a token actor while its base actor trades", () => {
    world([{ status: "executing", actors: ["hero"] }]);
    assert.ok(shown(item({ type: "loot", actor: { ...onScene, isToken: true } })).includes("AIM.window.inv.dropGround"));
  });
});

describe("activity menu", () => {
  it("is dnd5e's own, after dnd5e.getItemActivityContext", () => {
    const own = [{ name: "DND5E.ContextMenuActionEdit" }];
    const activity = { getContextMenuOptions: () => own };
    const target = { dataset: { activityId: "a" } };
    assert.equal(activityMenuEntries(activity, target), own);
    assert.deepEqual(hooked, [["dnd5e.getItemActivityContext", activity, target, own]]);
  });
});

describe("popmenu DOM safety and keyboard navigation", () => {
  it("strips unsafe HTML icons, navigates with arrow/Home/End keys, and restores focus to trigger on Escape", () => {
    const doc = {
      activeElement: null,
      listeners: new Map(),
      addEventListener(type, fn) { this.listeners.set(type, fn); },
      removeEventListener(type, fn) { if (this.listeners.get(type) === fn) this.listeners.delete(type); },
      createDocumentFragment() {
        const children = [];
        return { isFrag: true, childNodes: children, append(...n) { children.push(...n); } };
      },
      createElement(tag) {
        const el = new EventTarget();
        el.tagName = tag.toUpperCase();
        el.nodeType = 1;
        el.ownerDocument = doc;
        el.dataset = {};
        el.style = {};
        el.className = "";
        el.attributes = new Map();
        el.children = [];
        el.isConnected = true;
        el.setAttribute = (k, v) => { el.attributes.set(k, String(v)); };
        el.getAttribute = (k) => el.attributes.get(k) ?? null;
        el.append = (...nodes) => {
          for (const n of nodes) {
            if (n.isFrag) el.append(...n.childNodes);
            else {
              n.parentNode = el;
              el.children.push(n);
            }
          }
        };
        el.focus = () => { el.focused = true; doc.activeElement = el; };
        el.remove = () => { el.isConnected = false; root.children = root.children.filter((c) => c !== el); };
        el.contains = (target) => el === target || el.children.some((c) => c.contains?.(target));
        el.querySelectorAll = (sel) => {
          const out = [];
          const walk = (n) => {
            for (const c of n.children ?? []) {
              if (sel.includes('[role="menuitem"]') && c.getAttribute?.("role") === "menuitem") out.push(c);
              walk(c);
            }
          };
          walk(el);
          return out;
        };
        el.querySelector = (sel) => (sel === ".aim-popmenu" ? el.children.find((c) => c.className.includes("aim-popmenu")) ?? null : el.querySelectorAll(sel)[0] ?? null);
        el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 });
        Object.defineProperty(el, "offsetWidth", { get: () => 140 });
        Object.defineProperty(el, "offsetHeight", { get: () => 80 });
        Object.defineProperty(el, "innerHTML", {
          set() { throw new Error("openItemMenu must never assign innerHTML"); }
        });
        return el;
      }
    };
    const root = doc.createElement("div");
    const anchor = doc.createElement("button");
    root.append(anchor);
    globalThis.game = { i18n: { localize: (k) => k } };
    try {
      openItemMenu(root, anchor, [
        { name: "Safe", icon: '<i class="fa-light fa-eye"></i>', callback() {} },
        { name: "UnsafeImg", icon: '<img src="x" onerror="alert(1)">', callback() {} },
        { name: "UnsafeAttr", icon: '<i onclick="alert(1)" class="fa-light fa-pen"></i>', callback() {} }
      ], null);

      const menu = root.querySelector(".aim-popmenu");
      assert.ok(menu);
      const items = menu.querySelectorAll('[role="menuitem"]');
      assert.equal(items.length, 3);
      assert.equal(items[0].children[0].className, "fa-light fa-eye");
      assert.equal(items[1].children.length, 1, "<img> payload is dropped");
      assert.equal(items[2].children[0].className, "fa-light fa-pen");
      assert.equal(doc.activeElement, items[0]);

      const press = (key) => {
        const ev = new Event("keydown", { cancelable: true });
        Object.defineProperty(ev, "key", { value: key });
        menu.dispatchEvent(ev);
      };
      press("ArrowDown");
      assert.equal(doc.activeElement, items[1]);
      press("End");
      assert.equal(doc.activeElement, items[2]);
      press("ArrowDown");
      assert.equal(doc.activeElement, items[0]);
      press("ArrowUp");
      assert.equal(doc.activeElement, items[2]);
      press("Home");
      assert.equal(doc.activeElement, items[0]);
      press("Escape");
      assert.equal(root.querySelector(".aim-popmenu"), null);
      assert.equal(doc.activeElement, anchor);
      closeItemMenu(root);
    } finally {
      delete globalThis.game;
    }
  });
});
