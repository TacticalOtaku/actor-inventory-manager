import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { unwrapSecrets } from "../scripts/ui/html.js";

describe("secrets in enriched HTML", () => {
  it("drops the secret-block wrapper, keeps the secret section", () => {
    const html = '<p>Heal.</p><secret-block><section class="secret" id="secret-a"><p>Foundry Note</p></section></secret-block>';
    assert.equal(unwrapSecrets(html), '<p>Heal.</p><section class="secret" id="secret-a"><p>Foundry Note</p></section>');
  });

  it("leaves other HTML and escaped text alone", () => {
    assert.equal(unwrapSecrets("<p>&lt;secret-block&gt;</p>"), "<p>&lt;secret-block&gt;</p>");
    assert.equal(unwrapSecrets(undefined), "");
  });
});
