import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

describe("vendored GSAP", () => {
  it("ships the ESM entry points and every relative import they need", () => {
    for (const entry of ["index.js", "Flip.js", "CustomEase.js"]) {
      const pending = [entry];
      const seen = new Set();
      while (pending.length) {
        const file = pending.pop();
        if (seen.has(file)) continue;
        seen.add(file);
        const path = join("scripts/vendor/gsap", file);
        assert.ok(existsSync(join(root, path)), `${path} is missing`);
        for (const [, spec] of read(path).matchAll(/from\s+["'](\.[^"']+)["']/g)) {
          pending.push(join(dirname(file), spec).replace(/\\/g, "/"));
        }
      }
    }
    assert.ok(existsSync(join(root, "scripts/vendor/gsap/LICENSE.md")));
  });

  it("never registers plugins into another module's global gsap", () => {
    for (const file of ["Flip.js", "CustomEase.js"]) {
      const source = read(join("scripts/vendor/gsap", file));
      assert.doesNotMatch(source, /window\.gsap\.registerPlugin/, file);
      assert.doesNotMatch(source, /^_getGSAP\(\) && gsap\.registerPlugin/m, file);
    }
  });
});

describe("vendored fonts", () => {
  it("declares the three families and every referenced woff2 exists", () => {
    const css = read("styles/tactile/fonts.css");
    for (const family of ["Onest Variable", "JetBrains Mono Variable", "Unbounded Variable"]) {
      assert.match(css, new RegExp(`font-family: '${family}'`));
    }
    const urls = [...css.matchAll(/url\(([^)]+\.woff2)\)/g)].map(([, u]) => u);
    assert.ok(urls.length >= 12, "latin, latin-ext, cyrillic, cyrillic-ext for three families");
    for (const url of urls) {
      assert.ok(url.startsWith("../../assets/fonts/"), url);
      assert.ok(existsSync(join(root, "styles/tactile", url)), `${url} is missing`);
    }
    assert.doesNotMatch(css, /googleapis|gstatic/);
  });
});
