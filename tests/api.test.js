import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {},
      HandlebarsApplicationMixin: (Base) => Base
    }
  }
};

const { createPublicApi } = await import("../scripts/api.js");
const apiDoc = readFileSync(new URL("../API.md", import.meta.url), "utf8");

describe("public API surface", () => {
  it("freezes the top-level API object and exported enum constants", () => {
    const api = createPublicApi();
    assert.equal(Object.isFrozen(api), true);
    assert.equal(Object.isFrozen(api.SLOTS), true);
    assert.equal(Object.isFrozen(api.FLAGS), true);
    assert.equal(Object.isFrozen(api.ENFORCEMENT_MODES), true);
    assert.throws(() => {
      api.openWindow = () => {};
    }, TypeError);
  });

  it("documents every exported API key in API.md", () => {
    const api = createPublicApi();
    for (const key of Object.keys(api)) {
      assert.ok(api[key] !== undefined, `API key '${key}' should be defined`);
      assert.ok(
        apiDoc.includes(`\`${key}\``) || apiDoc.includes(`.${key}`),
        `API.md should document '${key}'`
      );
    }
  });
});
