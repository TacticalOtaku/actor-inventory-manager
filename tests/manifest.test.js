import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

test("Manifest: module.json structure and compatibility", () => {
  const manifestPath = path.join(rootDir, "module.json");
  assert.ok(fs.existsSync(manifestPath), "module.json must exist");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  assert.equal(manifest.id, "actor-inventory-manager");
  assert.equal(manifest.compatibility?.verified, "14.367");

  // Check system compatibility
  const dnd5eSystem = manifest.relationships?.systems?.find(s => s.id === "dnd5e");
  assert.ok(dnd5eSystem, "Must have dnd5e system relationship");
  assert.equal(dnd5eSystem.compatibility?.verified, "5.3.3");

  // Check files exist
  for (const script of manifest.esmodules || []) {
    const p = path.join(rootDir, script);
    assert.ok(fs.existsSync(p), `ESModule file must exist: ${script}`);
  }

  for (const style of manifest.styles || []) {
    const p = path.join(rootDir, style);
    assert.ok(fs.existsSync(p), `Stylesheet file must exist: ${style}`);
  }

  for (const lang of manifest.languages || []) {
    const p = path.join(rootDir, lang.path);
    assert.ok(fs.existsSync(p), `Language file must exist: ${lang.path}`);
  }
});
