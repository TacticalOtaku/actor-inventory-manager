import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// WCAG AA for text: every colour used as text reaches 4.5:1 on all four surfaces, in both themes (#26).
const css = readFileSync(new URL("../styles/theme/tokens.css", import.meta.url), "utf8");

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} is missing`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map(([, k, v]) => [k, v]));
}

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TEXT_TOKENS = [
  "text", "text-2", "text-3", "hp", "heal", "temp", "arcane", "warn",
  "rarity-common", "rarity-uncommon", "rarity-rare", "rarity-veryRare", "rarity-legendary", "rarity-artifact",
  "school-abj", "school-con", "school-div", "school-enc", "school-evo", "school-ill", "school-nec", "school-trs",
  "acc-brass", "acc-embers", "acc-arcane", "acc-forest", "acc-frost", "acc-rose"
];

const night = block(".aim-root");
const themes = { night, parchment: { ...night, ...block('.aim-root[data-theme="parchment"]') } };

describe("theme contrast", () => {
  for (const [name, tokens] of Object.entries(themes)) {
    it(`«${name}»: text colours reach 4.5:1 on every surface`, () => {
      const surfaces = [0, 1, 2, 3].map((i) => tokens[`surface-${i}`]);
      for (const token of TEXT_TOKENS) {
        assert.ok(tokens[token], `${name}: --${token} is not a hex colour`);
        const worst = Math.min(...surfaces.map((s) => contrast(tokens[token], s)));
        assert.ok(worst >= 4.5, `${name}: --${token} ${tokens[token]} is ${worst.toFixed(2)}:1`);
      }
    });
  }
});
