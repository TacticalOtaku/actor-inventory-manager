import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { morph } from "../scripts/ui/morph.js";

beforeEach(() => { globalThis.Node = { ELEMENT_NODE: 1 }; });
afterEach(() => { delete globalThis.Node; });

const FORM_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "OPTION"]);

function makeDoc() {
  return { activeElement: null };
}

function makeNode(doc, nodeName, { attrs = {}, checked, selected, value, type, children = [] } = {}) {
  const attributes = Object.entries(attrs).map(([name, val]) => ({ name, value: val }));
  const node = {
    nodeType: 1,
    nodeName,
    localName: nodeName.toLowerCase(),
    ownerDocument: doc,
    parentNode: null,
    attributes,
    childNodes: [],
    matches: (sel) => sel.split(",").map((s) => s.trim().toUpperCase()).includes(nodeName),
    querySelectorAll: (sel) => {
      const want = new Set(sel.split(",").map((s) => s.trim().toUpperCase()));
      const out = [];
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (want.has(c.nodeName)) out.push(c);
          walk(c);
        }
      };
      walk(node);
      return out;
    },
    getAttribute: (name) => attributes.find((a) => a.name === name)?.value ?? null,
    setAttribute: (name, val) => {
      const existing = attributes.find((a) => a.name === name);
      if (existing) existing.value = String(val);
      else attributes.push({ name, value: String(val) });
    },
    removeAttribute: (name) => {
      const idx = attributes.findIndex((a) => a.name === name);
      if (idx >= 0) attributes.splice(idx, 1);
    },
    // Standard DOM isEqualNode compares markup/attributes only, ignoring live .checked/.selected/.value properties.
    isEqualNode: (other) => {
      if (!other || node.nodeName !== other.nodeName) return false;
      if (attributes.length !== other.attributes.length) return false;
      for (const a of attributes) {
        if (other.getAttribute(a.name) !== a.value) return false;
      }
      if (node.childNodes.length !== other.childNodes.length) return false;
      return node.childNodes.every((c, i) => c.isEqualNode(other.childNodes[i]));
    },
    contains: (target) => {
      for (let cur = target; cur; cur = cur.parentNode) if (cur === node) return true;
      return false;
    },
    append: (...nodes) => {
      for (const c of nodes) {
        c.parentNode = node;
        node.childNodes.push(c);
      }
    },
    replaceWith: () => {}
  };
  if (checked !== undefined || nodeName === "INPUT") node.checked = Boolean(checked);
  if (selected !== undefined || nodeName === "OPTION") node.selected = Boolean(selected);
  if (value !== undefined || FORM_TAGS.has(nodeName)) node.value = value ?? "";
  if (type !== undefined) node.type = type;
  node.append(...children);
  return node;
}

describe("morph live form state", () => {
  it("reverts locally flipped checkbox and input values even when attributes match (isEqualNode)", () => {
    const doc = makeDoc();
    const fromCheck = makeNode(doc, "INPUT", { attrs: { type: "checkbox" }, type: "checkbox", checked: false });
    const fromInput = makeNode(doc, "INPUT", { attrs: { type: "text", value: "10" }, type: "text", value: "10" });
    const from = makeNode(doc, "DIV", { children: [fromCheck, fromInput] });

    // Local user changes rejected by server (attributes remain untouched)
    fromCheck.checked = true;
    fromInput.value = "999";

    const toCheck = makeNode(doc, "INPUT", { attrs: { type: "checkbox" }, type: "checkbox", checked: false });
    const toInput = makeNode(doc, "INPUT", { attrs: { type: "text", value: "10" }, type: "text", value: "10" });
    const to = makeNode(doc, "DIV", { children: [toCheck, toInput] });

    assert.equal(from.isEqualNode(to), true);
    morph(from, to);
    assert.equal(fromCheck.checked, false);
    assert.equal(fromInput.value, "10");
  });

  it("syncs select/option selection when reverted, while preserving an actively focused select", () => {
    const doc = makeDoc();
    const optA1 = makeNode(doc, "OPTION", { attrs: { value: "a" }, value: "a", selected: true });
    const optB1 = makeNode(doc, "OPTION", { attrs: { value: "b" }, value: "b", selected: false });
    const selectFrom = makeNode(doc, "SELECT", { value: "a", children: [optA1, optB1] });

    // User selected "b" before losing focus
    optA1.selected = false;
    optB1.selected = true;
    selectFrom.value = "b";

    const optA2 = makeNode(doc, "OPTION", { attrs: { value: "a" }, value: "a", selected: true });
    const optB2 = makeNode(doc, "OPTION", { attrs: { value: "b" }, value: "b", selected: false });
    const selectTo = makeNode(doc, "SELECT", { value: "a", children: [optA2, optB2] });

    // When select is focused, leave live selection untouched
    doc.activeElement = selectFrom;
    morph(selectFrom, selectTo);
    assert.equal(optB1.selected, true);

    // Once blurred, morph restores authoritative state despite equal DOM markup
    doc.activeElement = null;
    morph(selectFrom, selectTo);
    assert.equal(optA1.selected, true);
    assert.equal(optB1.selected, false);
    assert.equal(selectFrom.value, "a");
  });
});
