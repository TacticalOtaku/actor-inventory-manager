import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PACKAGE_ENTRIES, root as packageRoot } from "../tools/package-files.mjs";
import { releaseUrls } from "../tools/release-manifest.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));

/** The keys Foundry's PackageRelationships schema keeps; anything else is dropped without a warning. */
const RELATIONSHIP_KEYS = ["systems", "requires", "recommends", "conflicts", "flags"];

test("package.json and module.json carry one version", async () => {
  const [manifest, pkg] = await Promise.all([readJson("module.json"), readJson("package.json")]);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.version, manifest.version);
});

test("compatibility is bounded to the verified core generation", async () => {
  const { compatibility } = await readJson("module.json");
  assert.ok(compatibility.minimum, "compatibility.minimum");
  assert.ok(compatibility.verified, "compatibility.verified");
  assert.equal(compatibility.maximum, String(compatibility.verified).split(".")[0]);
});

test("relationships use only keys Foundry understands", async () => {
  const { relationships = {} } = await readJson("module.json");
  for (const key of Object.keys(relationships)) assert.ok(RELATIONSHIP_KEYS.includes(key), `relationships.${key}`);
});

test("recommends includes lib-wrapper", async () => {
  const { relationships = {} } = await readJson("module.json");
  const ids = (relationships.recommends ?? []).map((entry) => entry.id);
  assert.ok(ids.includes("lib-wrapper"), "lib-wrapper should be in relationships.recommends");
});

test("every listed file exists and both languages ship", async () => {
  const manifest = await readJson("module.json");
  const files = [...manifest.esmodules, ...(manifest.styles ?? []), ...manifest.languages.map((language) => language.path)];
  for (const file of files) assert.ok(existsSync(new URL(file, root)), file);
  assert.deepEqual(manifest.languages.map((language) => language.lang).sort(), ["en", "ru"]);
  assert.ok(manifest.languages.every((language) => language.path.startsWith("lang/")), "languages live in lang/");
});

test("release URLs, owner metadata, and packaged documentation entries match", async () => {
  const manifest = await readJson("module.json");
  const expected = releaseUrls(manifest.url ?? "", manifest.id, manifest.version);
  assert.equal(manifest.manifest, expected.manifest);
  assert.equal(manifest.download, expected.download);
  assert.deepEqual(manifest.authors, [{ name: "TacticalOtaku", url: "https://github.com/TacticalOtaku" }]);
  assert.ok(PACKAGE_ENTRIES.includes("README.md"));
  assert.ok(PACKAGE_ENTRIES.includes("README.ru.md"));
  for (const entry of PACKAGE_ENTRIES) {
    assert.ok(existsSync(join(packageRoot, entry)), `package entry exists: ${entry}`);
  }
});
