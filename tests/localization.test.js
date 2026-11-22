import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const en = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
const ru = JSON.parse(readFileSync(new URL("../lang/ru.json", import.meta.url), "utf8"));

function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("localization files", () => {
  it("keep identical key sets and interpolation placeholders between en and ru", () => {
    const enFlat = flatten(en);
    const ruFlat = flatten(ru);
    assert.deepEqual(Object.keys(ruFlat).sort(), Object.keys(enFlat).sort());
    for (const key of Object.keys(enFlat)) {
      assert.deepEqual(placeholders(ruFlat[key]), placeholders(enFlat[key]), key);
    }
  });

  it("separates dialog Save buttons from ability Saving Throw labels in Russian", () => {
    assert.equal(ru.AIM.window.save, "Сохранить");
    assert.equal(ru.AIM.window.abilitySave, "Спас");
    assert.equal(en.AIM.window.save, "Save");
    assert.equal(en.AIM.window.abilitySave, "Save");

    const mainTemplate = readFileSync(new URL("../templates/window/main.hbs", import.meta.url), "utf8");
    assert.match(mainTemplate, /AIM\.window\.abilitySave/);
    assert.doesNotMatch(mainTemplate, /AIM\.window\.save\b/);

    const presetEditorJs = readFileSync(new URL("../scripts/ui/preset-editor.js", import.meta.url), "utf8");
    const equipmentControllerJs = readFileSync(
      new URL("../scripts/ui/window/equipment-controller.js", import.meta.url),
      "utf8",
    );
    assert.match(presetEditorJs, /AIM\.window\.save/);
    assert.match(equipmentControllerJs, /AIM\.window\.save/);
  });

  it("uses Russian terminology in editor messages without untranslated English roles", () => {
    assert.doesNotMatch(ru.AIM.editor.gmOnly, /Game Master/);
    assert.match(ru.AIM.editor.appliedSuccess, /применён/);
    assert.match(ru.AIM.editor.rules.locksOffHandOn2H, /основной руке/);
  });
});
