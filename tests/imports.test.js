// ─────────────────────────────────────────────────────────
// Import Paths Verification Test
// ─────────────────────────────────────────────────────────

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptsDir = path.resolve(__dirname, "../scripts");

function getAllJsFiles(dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getAllJsFiles(full));
    } else if (entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

test("Imports: All relative JS imports resolve to existing files", () => {
  const files = getAllJsFiles(scriptsDir);
  assert.ok(files.length > 0, "Found JS files in scripts directory");

  const importRegex = /import\s+(?:[\s\S]*?from\s+)?['"](.*?)['"]/g;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith(".")) {
        const resolved = path.resolve(path.dirname(file), importPath);
        assert.ok(
          fs.existsSync(resolved),
          `Broken import in ${path.relative(scriptsDir, file)}: "${importPath}" (resolved: ${resolved})`
        );
      }
    }
  }
});

test("Imports: All script files can be imported without syntax or export errors", async () => {
  // Set up mock globals so Foundry ES modules can load cleanly
  globalThis.game = globalThis.game || { settings: { get: () => true, register: () => {} }, i18n: { localize: s => s, format: s => s } };
  globalThis.Hooks = globalThis.Hooks || { once: () => {}, on: () => {}, callAll: () => {} };
  globalThis.foundry = globalThis.foundry || {
    applications: {
      api: {
        ApplicationV2: class {},
        HandlebarsApplicationMixin: Base => class extends Base {}
      }
    }
  };
  globalThis.ui = globalThis.ui || { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

  const files = getAllJsFiles(scriptsDir);
  for (const file of files) {
    const fileUrl = pathToFileURL(file).href;
    try {
      const mod = await import(fileUrl);
      assert.ok(mod !== null, `Module loaded: ${path.basename(file)}`);
    } catch (err) {
      assert.fail(`Failed to import ${path.relative(scriptsDir, file)}: ${err.message}`);
    }
  }
});
