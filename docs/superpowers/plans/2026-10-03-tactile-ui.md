# Tactile UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the inventory window, the paperdoll editor, the slot-config dialog and the sheet header button in the Tactile design system, keeping the module's own four-zone structure and every existing feature.

**Architecture:** Tactile lives inside AIM but ready to be lifted out: design tokens and generic primitives in `styles/tactile/`, motion helpers and the accent palette in `scripts/tactile/`. AIM-specific layout lives in `styles/aim/` and the existing Handlebars templates, which are rewritten against the approved mockup. Layout state (drawer, paperdoll strip, window width) moves into a pure, tested `scripts/ui/window-layout.js`. GSAP 3.13 (ESM build, private instance, no globals) and the three fonts are vendored into the package by `tools/vendor.mjs`.

**Tech Stack:** Foundry VTT 14.367 ApplicationV2 + HandlebarsApplicationMixin, dnd5e 5.3.3, GSAP 3.13 (core, CSSPlugin, Flip, CustomEase), @fontsource-variable (Onest, JetBrains Mono, Unbounded), Font Awesome 6 Pro Light (shipped by Foundry), `node --test`, ESLint 10.

**Spec:**
- Approved mockup (visual and behavioural source of truth): `docs/superpowers/specs/2026-10-03-tactile-ui-mockup.html`. Open it in a browser; every class referenced as "mockup `.x`" below is in its `<style>` block (line numbers given), every behaviour in its `<script>`.
- Design system: `docs/superpowers/specs/tactile-design-system.md`.

## Global Constraints

- Platform: Foundry VTT 14.367, dnd5e 5.3.3. Never guess v14 or dnd5e APIs: read `D:\Foundry\Foundry Virtual Tabletop\resources\app` (`client/`, `common/`) and `%LOCALAPPDATA%/FoundryVTT/Data/systems/dnd5e`.
- `npm run check` (ESLint + `node --test`) must be green at the end of every task.
- `scripts/core/` stays importable in plain Node. Tests never import `scripts/tactile/motion.js` or anything under `scripts/vendor/`.
- Theme tokens live on `.actor-inventory-manager-app` (which also carries `tc-root`) and on the injected header button, never on `:root`. Light is the default token set; dark is `.tc-root[data-theme="dark"]` (the module stamps `data-theme` on the window element — it does NOT follow `prefers-color-scheme` in CSS).
- Do not transition `background` or `all` on elements whose background comes from a token. Allowed transition properties: `color`, `box-shadow`, `opacity`, `transform`, `border-color`.
- Rarity and spell-school colours are custom properties (`--rarity-color` from `cssVars`, `--spell-school-color`), never inline `color:`.
- Decorative fonts load only while the client setting `useWebFonts` is on, from the package (`styles/tactile/fonts.css`), never from Google.
- Adding a stylesheet to `module.json` needs a Foundry server restart, not F5.
- Tactile values (copy exactly):
  - Radii: window 22px, blocks 12px, rows 9px, controls 999px. Double kant: shell padding 6px + core.
  - Type: label 10.5px mono caps letter-spacing .08em; meta 12.5px; body 14px; title 15px/600; big number 48px Unbounded 700 line-height .9 letter-spacing −0.05em.
  - Motion: ease `tactile` = `cubic-bezier(0.32,0.72,0,1)`; `settle` = CustomEase path `M0,0 C0.18,0.9 0.3,1.04 0.52,1.02 0.7,1 0.84,1 1,1`; durations micro .16s, short .24s, base .38s, long .7s; window open = scale .965→1, y 10→0, .7s settle, parts staggered 40ms, big number counts last, safety timer forces completion after 2200ms; reduced motion = opacity only, 150ms.
  - Accent palette (id h c): peach 45 .13 (default), amber 78 .12, sage 145 .08, mint 178 .09, azure 235 .10, periwinkle 275 .10, lavender 300 .10, orchid 330 .11, rose 10 .11, steel 250 .035.
- Icons: Font Awesome Light (`fa-light fa-…`), shipped by Foundry v14 (`resources/app/public/fonts/fontawesome/webfonts/fa-light-300.woff2`).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Work on branch `feat/tactile-ui` (already created from `chore/dev-standards`).

## File Structure

| Path | Status | Responsibility |
| --- | --- | --- |
| `tools/vendor.mjs` | create | Copies GSAP ESM files and font woff2 + CSS from `node_modules` into the package. Re-runnable. |
| `scripts/vendor/gsap/` | generated, committed | GSAP 3.13 ESM (`index.js`, `gsap-core.js`, `CSSPlugin.js`, `Flip.js`, `CustomEase.js`, `utils/*.js`) + `LICENSE.md`. |
| `assets/fonts/` | generated, committed | Variable woff2 subsets latin, latin-ext, cyrillic, cyrillic-ext + `OFL-*.txt`. |
| `styles/tactile/fonts.css` | generated, committed | `@font-face` rules for the vendored fonts, loaded by `<link>` only when `useWebFonts` is on. |
| `styles/tactile/tokens.css` | create | Tactile tokens on `.tc-root` (light) and `.tc-root[data-theme="dark"]`. |
| `styles/tactile/components.css` | create | Generic primitives under `.tc-root`: `.tc-shell`, `.tc-core`, `.tc-tray`, `.tc-lbl`, `.tc-sec`, `.tc-band`, `.tc-ticks`, `.tc-ibtn`, `.tc-btn`, `.tc-primary`, `.tc-pill`, `.tc-chip`, `.tc-search`, `.tc-select`, `.tc-segs`, `.tc-dot`. |
| `scripts/tactile/palette.js` | create | Pure: palette list, `resolveAccent(id)`. |
| `scripts/tactile/motion.js` | create | GSAP wrapper: eases, `openWindow`, `countTo`, `pop`, `refuse`, `slideIn`, `captureFlip`, `playFlip`, `bindPress`. |
| `scripts/ui/tactile-theme.js` | create | Runtime: stamps theme (`data-theme`) and accent (`--tc-acc-h/c`) on a Tactile window root. |
| `scripts/ui/window-layout.js` | create | Pure layout state: drawer/doll transitions, preferred and minimum window widths. |
| `styles/aim/window.css` | create | Frame, header (avatar, subtitle, theme button), body grid, rail, read-only. |
| `styles/aim/passport.css` | create | Vitals column. |
| `styles/aim/paperdoll.css` | create | Stage, sockets, attunement tray, strip. |
| `styles/aim/inventory.css` | create | Tabs, filters, rows, containers. |
| `styles/aim/drawers.css` | create | Grimoire and trade drawers. |
| `styles/aim/editors.css` | create | Paperdoll editor, slot-config dialog, sheet header button. |
| `styles/actor-inventory.css` | delete | Replaced by the files above. |
| `templates/inventory-app.hbs`, `templates/parts/*.hbs`, `templates/editor/*.hbs` | rewrite | Markup per mockup. |
| `scripts/ui/inventory-app.js` | modify | Layout via `window-layout.js`, header, accent, motion hooks. |
| `scripts/ui/item-actions.js` | modify | `equipItemToSlot`, `toggleItemEquipped`, `toggleAttunement` return `true` when applied, `false` when refused. |
| `scripts/integrations/dnd5e.js` | modify | `extractActorVitals` adds `hp.tempPct`, `speedWalk`, `speedUnit`. |
| `scripts/ui/inventory-context.js` | modify | Theme icons → Font Awesome Light; `mustCollapsePaperdoll` removed (replaced by `window-layout.js`). |
| `scripts/foundry/settings.js` | modify | Fonts from package; new client setting `accent`. |
| `module.json`, `package.json`, `eslint.config.js`, `lang/en.json`, `lang/ru.json`, `docs/architecture.md`, `CHANGELOG.md` | modify | Wiring, version 1.8.0, docs. |

---

### Task 1: Vendor GSAP and fonts

**Files:**
- Create: `tools/vendor.mjs`, `tests/vendor-assets.test.js`
- Generated: `scripts/vendor/gsap/**`, `assets/fonts/**`, `styles/tactile/fonts.css`
- Modify: `package.json` (devDependencies, script `vendor`), `eslint.config.js` (ignore `scripts/vendor/`)

**Interfaces:**
- Produces: `scripts/vendor/gsap/index.js` exporting `gsap`; `scripts/vendor/gsap/Flip.js` exporting `Flip`; `scripts/vendor/gsap/CustomEase.js` exporting `CustomEase`. Font families `"Onest Variable"`, `"JetBrains Mono Variable"`, `"Unbounded Variable"` declared in `styles/tactile/fonts.css` with `url(../../assets/fonts/<file>.woff2)`.

- [ ] **Step 1: Install the sources as devDependencies**

```bash
npm install --save-dev --save-exact gsap@3.13.0 @fontsource-variable/onest @fontsource-variable/jetbrains-mono @fontsource-variable/unbounded
```

- [ ] **Step 2: Write the failing test** — `tests/vendor-assets.test.js`

```js
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test tests/vendor-assets.test.js`
Expected: FAIL, `scripts/vendor/gsap/index.js is missing`.

- [ ] **Step 4: Write `tools/vendor.mjs`**

```js
/**
 * Copies third-party runtime assets into the package: GSAP's ESM build (a private instance, no window globals)
 * and the Tactile fonts. Run after changing their versions: `npm run vendor`. The output is committed.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { root } from "./package-files.mjs";

const modules = join(root, "node_modules");

// --- GSAP: follow relative imports from the entry points we use.
const gsapSrc = join(modules, "gsap");
const gsapOut = join(root, "scripts/vendor/gsap");
rmSync(gsapOut, { recursive: true, force: true });
const pending = ["index.js", "Flip.js", "CustomEase.js"];
const copied = new Set();
while (pending.length) {
  const file = pending.pop();
  if (copied.has(file)) continue;
  copied.add(file);
  const source = readFileSync(join(gsapSrc, file), "utf8");
  mkdirSync(dirname(join(gsapOut, file)), { recursive: true });
  writeFileSync(join(gsapOut, file), source);
  for (const [, spec] of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    pending.push(join(dirname(file), spec).replace(/\\/g, "/"));
  }
}
const gsapPkg = JSON.parse(readFileSync(join(gsapSrc, "package.json"), "utf8"));
writeFileSync(join(gsapOut, "LICENSE.md"), `# GSAP ${gsapPkg.version}\n\nCopied from the npm package \`gsap\` by tools/vendor.mjs.\nLicense: ${gsapPkg.license ?? "see https://gsap.com/standard-license"} — https://gsap.com/standard-license\n`);

// --- Fonts: keep the subsets the module's languages need.
const FONTS = [
  ["@fontsource-variable/onest", "onest"],
  ["@fontsource-variable/jetbrains-mono", "jetbrains-mono"],
  ["@fontsource-variable/unbounded", "unbounded"],
];
const SUBSETS = ["latin", "latin-ext", "cyrillic", "cyrillic-ext"];
const fontOut = join(root, "assets/fonts");
rmSync(fontOut, { recursive: true, force: true });
mkdirSync(fontOut, { recursive: true });
const rules = [];
for (const [pkg, slug] of FONTS) {
  const dir = join(modules, pkg);
  const css = readFileSync(join(dir, "index.css"), "utf8");
  for (const block of css.split(/(?=\/\*)/)) {
    const subset = SUBSETS.find((s) => block.startsWith(`/* ${slug}-${s}-wght-normal */`));
    if (!subset) continue;
    const [, file] = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/) ?? [];
    if (!file) continue;
    cpSync(join(dir, "files", file), join(fontOut, file));
    rules.push(block.trim()
      .replace(/url\(\.\/files\/([^)]+\.woff2)\)/, "url(../../assets/fonts/$1)")
      .replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/, ""));
  }
  const license = ["LICENSE", "LICENSE.md", "OFL.txt"].map((n) => join(dir, n)).find(existsSync);
  if (license) cpSync(license, join(fontOut, `OFL-${slug}.txt`));
}
mkdirSync(join(root, "styles/tactile"), { recursive: true });
writeFileSync(join(root, "styles/tactile/fonts.css"),
  `/* Generated by tools/vendor.mjs from @fontsource-variable. Loaded only while the "useWebFonts" setting is on. */\n${rules.join("\n\n")}\n`);
console.log(`vendored ${copied.size} GSAP files and ${rules.length} font faces`);
```

Add to `package.json` scripts: `"vendor": "node tools/vendor.mjs"`. Add `"scripts/vendor/"` to the `ignores` array in `eslint.config.js`.

- [ ] **Step 5: Run the vendor script and the test**

Run: `npm run vendor && node --test tests/vendor-assets.test.js`
Expected: `vendored N GSAP files and 12 font faces`, then PASS. If the fontsource CSS comment format differs (e.g. no `-wght-normal`), open `node_modules/@fontsource-variable/onest/index.css`, adjust the `startsWith` pattern, rerun.

- [ ] **Step 6: Full check and commit**

Run: `npm run check` → green.

```bash
git add tools/vendor.mjs tests/vendor-assets.test.js scripts/vendor assets/fonts styles/tactile/fonts.css package.json package-lock.json eslint.config.js
git commit -m "build: vendor GSAP 3.13 and the Tactile fonts into the package"
```

---

### Task 2: Tactile tokens, primitives, palette and the accent setting

**Files:**
- Create: `styles/tactile/tokens.css`, `styles/tactile/components.css`, `scripts/tactile/palette.js`, `tests/tactile-palette.test.js`
- Modify: `scripts/foundry/settings.js`, `lang/en.json`, `lang/ru.json`

**Interfaces:**
- Produces: `PALETTE: {id,h,c}[]`, `DEFAULT_ACCENT = "peach"`, `resolveAccent(id) -> {id,h,c}` (unknown id → peach). Client setting `accent` (String, choices = palette ids, default `"peach"`, `onChange: refreshInventories`). CSS primitives listed in File Structure, all scoped under `.tc-root`.

- [ ] **Step 1: Failing test** — `tests/tactile-palette.test.js`

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_ACCENT, PALETTE, resolveAccent } from "../scripts/tactile/palette.js";

describe("Tactile accent palette", () => {
  it("holds the ten design-system accents with peach first", () => {
    assert.deepEqual(PALETTE.map((p) => p.id), ["peach", "amber", "sage", "mint", "azure", "periwinkle", "lavender", "orchid", "rose", "steel"]);
    assert.deepEqual(resolveAccent("peach"), { id: "peach", h: 45, c: 0.13 });
    assert.deepEqual(resolveAccent("steel"), { id: "steel", h: 250, c: 0.035 });
    assert.equal(DEFAULT_ACCENT, "peach");
  });

  it("falls back to peach for unknown ids", () => {
    assert.equal(resolveAccent("chartreuse").id, "peach");
    assert.equal(resolveAccent(undefined).id, "peach");
  });
});
```

- [ ] **Step 2: Run** `node --test tests/tactile-palette.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement `scripts/tactile/palette.js`**

```js
/** Tactile accent hues. The accent is OKLCH: lightness comes from the theme, hue and chroma from here. */
export const PALETTE = Object.freeze([
  { id: "peach", h: 45, c: 0.13 },
  { id: "amber", h: 78, c: 0.12 },
  { id: "sage", h: 145, c: 0.08 },
  { id: "mint", h: 178, c: 0.09 },
  { id: "azure", h: 235, c: 0.1 },
  { id: "periwinkle", h: 275, c: 0.1 },
  { id: "lavender", h: 300, c: 0.1 },
  { id: "orchid", h: 330, c: 0.11 },
  { id: "rose", h: 10, c: 0.11 },
  { id: "steel", h: 250, c: 0.035 },
].map(Object.freeze));

export const DEFAULT_ACCENT = "peach";

/** @param {string|undefined} id @returns {{id: string, h: number, c: number}} */
export function resolveAccent(id) {
  const found = PALETTE.find((p) => p.id === id) ?? PALETTE[0];
  return { ...found };
}
```

- [ ] **Step 4: Run the test** → PASS.

- [ ] **Step 5: Write `styles/tactile/tokens.css`**

Port mockup lines 51–96 with these changes: the light block's selector is `.tc-root`; the dark block's selector is `.tc-root[data-theme="dark"]` (one block, drop both `prefers-color-scheme` copies); add `--tc-cat-l` (light .62, dark .78); fonts become
`--tc-font-ui: "Onest Variable", "Onest", "Segoe UI", system-ui, sans-serif; --tc-font-mono: "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace; --tc-font-display: "Unbounded Variable", "Unbounded", var(--tc-font-ui);`. Keep the two `@property` rules (lines 9–10) at the top of the file. Keep the `transition` of `--tc-acc-h/--tc-acc-c`.

- [ ] **Step 6: Write `styles/tactile/components.css`**

Port these mockup rules, renaming as shown, every selector prefixed with `.tc-root `:

| mockup | tactile primitive |
| --- | --- |
| `.lbl`, `.lbl svg.lucide`, `.lbl b` (lines 121–123) | `.tc-lbl`, `.tc-lbl i`, `.tc-lbl b` |
| `.shell`, `.core`, `.tray` (139–141) | `.tc-shell`, `.tc-core`, `.tc-tray` |
| `.sec-h`, `::after`, `.lbl` inside (142–144) | `.tc-sec` |
| `.band`, `i`, `i.ghost`, `s` (145–148) | `.tc-band`, `.tc-band-fill`, `.tc-band-ghost`, `.tc-band-stop`; fills use `width` (driven by `data-meter`), `height:100%`, not `inset:0 + scaleX` |
| `.ticks` (149–152) | `.tc-ticks` |
| `.ibtn` family (153–158) | `.tc-ibtn` (`.is-on`, `.is-danger`; `i` instead of `svg.lucide`, font-size 14px) |
| `.btn`, `.btn[disabled]`, `.btn.sq` | `.tc-btn`, `.tc-btn.is-square` |
| `.primary`, `.nest`, `[disabled]` (161–163) | `.tc-primary`, `.tc-primary-nest` |
| `.pill`, `.plain`, `.warn` (164–167) | `.tc-pill`, `.is-plain`, `.is-warn` |
| `.chip` (168–169) | `.tc-chip` |
| `.search` (170–172) | `.tc-search` |
| `.sel` (173–175) | `.tc-select` |
| `.segs` family (176–183) | `.tc-segs` (buttons: `.tc-seg`, `.tc-seg-label`, `.tc-seg-count`, active = `[aria-pressed="true"]`) |
| `.dot`, `.dot.on` (200–201) | `.tc-dot`, `.tc-dot.is-on` |
| `.pip` family (318–323) | `.tc-pip`, `.tc-pip.is-on` |

Foundry's own button/input styles leak in: add at the top
`.tc-root :where(button, input, select) { font: inherit; color: inherit; margin: 0; }` and
`.tc-root :where(button) { background: none; border: 0; min-height: 0; line-height: normal; box-shadow: none; }`
(zero specificity, so primitives win). Add `.tc-root :focus-visible { outline: 2px solid var(--tc-accent); outline-offset: 2px; }` and the reduced-motion rule `@media (prefers-reduced-motion: reduce) { .tc-root * { transition-duration: 0.01ms !important; } }` plus `body.performance-low .tc-root * { transition-duration: 0.01ms !important; }`.

- [ ] **Step 7: Accent setting.** In `scripts/foundry/settings.js` after the `theme` setting:

```js
    game.settings.register(MODULE_ID, "accent", {
      name: "AIM.settings.accent.name",
      hint: "AIM.settings.accent.hint",
      scope: "client",
      config: true,
      type: String,
      choices: Object.fromEntries(PALETTE.map(p => [p.id, `AIM.settings.accent.${p.id}`])),
      default: DEFAULT_ACCENT,
      onChange: refreshInventories
    });
```

with `import { DEFAULT_ACCENT, PALETTE } from "../tactile/palette.js";`. Lang keys (`en` / `ru`): `AIM.settings.accent.name` "Accent colour" / "Акцентный цвет"; `hint` "Colour of highlights, meters and primary buttons in the inventory window." / "Цвет подсветки, шкал и главных кнопок в окне инвентаря."; ids: peach Peach/Персик, amber Amber/Янтарь, sage Sage/Шалфей, mint Mint/Мята, azure Azure/Лазурь, periwinkle Periwinkle/Барвинок, lavender Lavender/Лаванда, orchid Orchid/Орхидея, rose Rose/Роза, steel Steel/Сталь.

- [ ] **Step 8: Fonts from the package.** In `scripts/foundry/settings.js` replace `WEB_FONTS_URL` with
`const WEB_FONTS_URL = \`modules/${MODULE_ID}/styles/tactile/fonts.css\`;` (relative to the Foundry route prefix; `<link href>` without a leading slash resolves against the document base, which Foundry sets). Update the `useWebFonts` hint: en "Load the module's bundled interface fonts (Onest, JetBrains Mono, Unbounded). Turn off to use system fonts." / ru "Загружать шрифты оформления, входящие в модуль (Onest, JetBrains Mono, Unbounded). Отключите, чтобы использовать системные шрифты."

- [ ] **Step 9: Check and commit**

Run: `npm run check` → green.

```bash
git add styles/tactile scripts/tactile/palette.js tests/tactile-palette.test.js scripts/foundry/settings.js lang/en.json lang/ru.json
git commit -m "feat(ui): Tactile tokens, primitives, accent palette and bundled fonts"
```

---

### Task 3: Motion helpers

**Files:**
- Create: `scripts/tactile/motion.js`

**Interfaces:**
- Consumes: `scripts/vendor/gsap/{index,Flip,CustomEase}.js` (Task 1); `shouldReduceMotion(view)` from `scripts/ui/meter-motion.js`.
- Produces (all no-ops returning immediately when `reduce` is true, except where noted):
  - `EASE` (string `"tactile"`), `SETTLE` (string `"settle"`), `DURATION = { micro: 0.16, short: 0.24, base: 0.38, long: 0.7 }`
  - `openWindow(root: HTMLElement, { reduce: boolean }): void` — reduce → opacity 0→1 over .15s.
  - `countTo(el: Element|null, from: number, to: number, { reduce }): void` — reduce → sets text immediately.
  - `pop(el: Element|null, { reduce }): void`
  - `refuse(el: Element|null, { reduce }): void`
  - `slideIn(el: Element|null, { reduce }): void` — reduce → opacity only.
  - `captureFlip(root: ParentNode|null): object|null` — `Flip.getState` of `[data-flip-id]`, `null` when none.
  - `playFlip(state: object|null, { reduce }): void`
  - `bindPress(root: HTMLElement, isReduced: () => boolean): void` — one delegated `pointerdown` listener; call once per element lifetime.

There is no unit test (GSAP needs a DOM); verification is by `npm run check` (lint) and the live checks in Task 12.

- [ ] **Step 1: Implement `scripts/tactile/motion.js`**

```js
// ─────────────────────────────────────────────────────────
// Tactile motion: the design system's eases and gestures on a private GSAP instance.
// ─────────────────────────────────────────────────────────

import { gsap } from "../vendor/gsap/index.js";
import { CustomEase } from "../vendor/gsap/CustomEase.js";
import { Flip } from "../vendor/gsap/Flip.js";

gsap.registerPlugin(CustomEase, Flip);
CustomEase.create("tactile", "0.32, 0.72, 0, 1");
// Settle: a 4 % overshoot that comes to rest — the material "lands".
CustomEase.create("settle", "M0,0 C0.18,0.9 0.3,1.04 0.52,1.02 0.7,1 0.84,1 1,1");

export const EASE = "tactile";
export const SETTLE = "settle";
export const DURATION = Object.freeze({ micro: 0.16, short: 0.24, base: 0.38, long: 0.7 });
const SAFETY_MS = 2200;

/** Window entrance: the shell settles, its zones follow 40 ms apart, the big number counts last. */
export function openWindow(root, { reduce }) {
  if (!root) return;
  if (reduce) {
    gsap.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15, clearProps: "opacity,visibility" });
    return;
  }
  const parts = root.querySelectorAll("[data-part]");
  const hp = root.querySelector('[data-count="hp"]');
  const to = Number(hp?.textContent) || 0;
  const tl = gsap.timeline();
  tl.fromTo(root, { autoAlpha: 0, scale: 0.965, y: 10 },
    { autoAlpha: 1, scale: 1, y: 0, duration: DURATION.long, ease: SETTLE, clearProps: "opacity,visibility,transform" });
  if (parts.length) {
    tl.fromTo(parts, { autoAlpha: 0, y: 8 },
      { autoAlpha: 1, y: 0, duration: 0.45, ease: EASE, stagger: 0.04, clearProps: "opacity,visibility,transform" }, 0.12);
  }
  if (hp) {
    const o = { v: 0 };
    tl.to(o, { v: to, duration: 0.9, ease: EASE, onUpdate: () => { hp.textContent = String(Math.round(o.v)); } }, 0.4);
  }
  // Background tabs throttle frames: finish anyway so the window is never left translucent.
  setTimeout(() => { if (tl.progress() < 1) tl.progress(1); }, SAFETY_MS);
}

/** Count a number from its previous value to the new one. */
export function countTo(el, from, to, { reduce }) {
  if (!el) return;
  if (reduce || from === to || !Number.isFinite(from) || !Number.isFinite(to)) { el.textContent = String(to); return; }
  el.textContent = String(from);
  const o = { v: from };
  gsap.to(o, { v: to, duration: DURATION.long, ease: EASE, onUpdate: () => { el.textContent = String(Math.round(o.v)); } });
}

/** Something landed here: a short settle from slightly smaller. */
export function pop(el, { reduce }) {
  if (!el || reduce) return;
  gsap.fromTo(el, { scale: 0.86 }, { scale: 1, duration: 0.6, ease: SETTLE, clearProps: "transform" });
}

/** A rule said no: a small horizontal shake. */
export function refuse(el, { reduce }) {
  if (!el || reduce) return;
  gsap.fromTo(el, { x: -4 }, { x: 0, duration: 0.5, ease: "elastic.out(1.2, 0.3)", clearProps: "transform" });
}

/** A drawer arrives from the rail side. */
export function slideIn(el, { reduce }) {
  if (!el) return;
  if (reduce) { gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15, clearProps: "opacity,visibility" }); return; }
  gsap.fromTo(el, { autoAlpha: 0, x: 18 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: SETTLE, clearProps: "opacity,visibility,transform" });
}

/** Record where list rows are before a re-render replaces them. */
export function captureFlip(root) {
  const targets = root?.querySelectorAll?.("[data-flip-id]");
  return targets?.length ? Flip.getState(targets) : null;
}

/** Move the new rows from where the old ones were. Matches by data-flip-id. */
export function playFlip(state, { reduce }) {
  if (!state || reduce) return;
  Flip.from(state, {
    duration: DURATION.base, ease: EASE, nested: true, prune: true,
    onEnter: els => gsap.fromTo(els, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: EASE, clearProps: "opacity,visibility,transform" })
  });
}

/** Buttons sink into the material on press and spring back. One delegated listener per element. */
export function bindPress(root, isReduced) {
  root.addEventListener("pointerdown", event => {
    const button = event.target.closest?.("button, .tc-press");
    if (!button || button.disabled || isReduced()) return;
    gsap.to(button, { scale: 0.96, y: 1, duration: 0.12, ease: "power2.out" });
    const release = () => {
      gsap.to(button, { scale: 1, y: 0, duration: 0.45, ease: SETTLE, clearProps: "transform" });
      button.removeEventListener("pointerup", release);
      button.removeEventListener("pointerleave", release);
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointerleave", release);
  });
}
```

Before relying on `Flip.from` matching across a re-render, read `scripts/vendor/gsap/Flip.js` for `getState` / `from` and confirm elements are matched by the `data-flip-id` attribute (the default `toggleClass`/`targets` behaviour). If the option name differs in 3.13, adjust here only.

- [ ] **Step 2: Lint and commit**

Run: `npm run check` → green.

```bash
git add scripts/tactile/motion.js
git commit -m "feat(ui): Tactile motion helpers on a private GSAP instance"
```

---

### Task 4: Window layout state

**Files:**
- Create: `scripts/ui/window-layout.js`, `tests/window-layout.test.js`
- Modify: `scripts/ui/inventory-context.js` (remove `mustCollapsePaperdoll`), `tests/inventory-context.test.js` (remove its describe block)

**Interfaces:**
- Produces:
  - `LAYOUT_WIDTHS = { open: 1080, strip: 824, drawerStrip: 1188, drawerOpen: 1444 }`
  - `LAYOUT_MIN_WIDTHS = { open: 1006, strip: 750, drawerStrip: 1124, drawerOpen: 1380 }`
  - `layoutName({ drawer, dollOpen }) -> "open"|"strip"|"drawerStrip"|"drawerOpen"`
  - `isDollOpen(state) -> boolean` where `state = { drawer: null|"spells"|"trade", dollCollapsed: boolean, dollBesideDrawer: boolean }`
  - `toggleDrawer(state, name) -> state` — same name closes; opening sets `dollBesideDrawer: false`.
  - `toggleDoll(state, viewportWidth) -> { state, closedDrawer: boolean }` — without a drawer flips `dollCollapsed` (the saved preference); with a drawer flips `dollBesideDrawer`, but when the viewport cannot hold `drawerOpen` it closes the drawer instead and opens the doll.
  - `resolveWindowWidth(state, viewportWidth) -> number` — preferred width clamped to `viewportWidth - 40`, never below the minimum.
  - `resolveMinimumWidth(state) -> number`

Column arithmetic (CSS in Task 6 must match): passport 256, doll 312 or strip 56, inventory ≥ 340, drawer 364, rail 40, gaps 10, body padding 14 each side.

- [ ] **Step 1: Failing test** — `tests/window-layout.test.js`

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LAYOUT_MIN_WIDTHS, LAYOUT_WIDTHS, isDollOpen, layoutName, resolveMinimumWidth, resolveWindowWidth, toggleDoll, toggleDrawer
} from "../scripts/ui/window-layout.js";

const base = { drawer: null, dollCollapsed: false, dollBesideDrawer: false };

describe("window layout", () => {
  it("opening a drawer folds the doll into a strip and closing it brings the doll back", () => {
    const open = toggleDrawer(base, "spells");
    assert.equal(open.drawer, "spells");
    assert.equal(isDollOpen(open), false);
    assert.equal(layoutName({ drawer: open.drawer, dollOpen: isDollOpen(open) }), "drawerStrip");
    const closed = toggleDrawer(open, "spells");
    assert.equal(closed.drawer, null);
    assert.equal(isDollOpen(closed), true);
  });

  it("switching drawers keeps one drawer open", () => {
    const trade = toggleDrawer(toggleDrawer(base, "spells"), "trade");
    assert.equal(trade.drawer, "trade");
  });

  it("a collapsed doll preference survives a drawer round trip", () => {
    const collapsed = { ...base, dollCollapsed: true };
    assert.equal(isDollOpen(toggleDrawer(toggleDrawer(collapsed, "trade"), "trade")), false);
  });

  it("expanding the doll beside a drawer needs room, otherwise the drawer closes", () => {
    const drawer = toggleDrawer(base, "spells");
    const wide = toggleDoll(drawer, 1920);
    assert.equal(wide.closedDrawer, false);
    assert.equal(isDollOpen(wide.state), true);
    assert.equal(wide.state.drawer, "spells");
    assert.equal(wide.state.dollCollapsed, false, "the saved preference is untouched");
    const narrow = toggleDoll(drawer, 1280);
    assert.equal(narrow.closedDrawer, true);
    assert.equal(narrow.state.drawer, null);
    assert.equal(isDollOpen(narrow.state), true);
  });

  it("without a drawer the doll toggle flips the saved preference", () => {
    const { state } = toggleDoll(base, 1920);
    assert.equal(state.dollCollapsed, true);
  });

  it("clamps the preferred width to the screen but never below the layout minimum", () => {
    assert.equal(resolveWindowWidth(base, 1920), LAYOUT_WIDTHS.open);
    assert.equal(resolveWindowWidth(base, 1060), 1020);
    assert.equal(resolveWindowWidth(base, 800), LAYOUT_MIN_WIDTHS.open);
    assert.equal(resolveMinimumWidth(toggleDrawer(base, "trade")), LAYOUT_MIN_WIDTHS.drawerStrip);
  });
});
```

- [ ] **Step 2: Run** `node --test tests/window-layout.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement `scripts/ui/window-layout.js`**

```js
// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Window layout state
// ─────────────────────────────────────────────────────────
// Four layouts: the paperdoll open or folded into a strip, with or without a side drawer.
// A drawer takes the paperdoll's place, so the inventory keeps its width.

/** Preferred window widths (px). */
export const LAYOUT_WIDTHS = Object.freeze({ open: 1080, strip: 824, drawerStrip: 1188, drawerOpen: 1444 });

/** Narrowest widths at which the columns still fit (see styles/aim/window.css). */
export const LAYOUT_MIN_WIDTHS = Object.freeze({ open: 1006, strip: 750, drawerStrip: 1124, drawerOpen: 1380 });

const SCREEN_MARGIN = 40;

export function layoutName({ drawer, dollOpen }) {
  if (drawer) return dollOpen ? "drawerOpen" : "drawerStrip";
  return dollOpen ? "open" : "strip";
}

/** The doll shows beside a drawer only when the user asked for it; otherwise it follows the saved preference. */
export function isDollOpen(state) {
  return state.drawer ? Boolean(state.dollBesideDrawer) : !state.dollCollapsed;
}

export function toggleDrawer(state, name) {
  const drawer = state.drawer === name ? null : name;
  return { ...state, drawer, dollBesideDrawer: false };
}

export function toggleDoll(state, viewportWidth) {
  if (!state.drawer) return { state: { ...state, dollCollapsed: !state.dollCollapsed }, closedDrawer: false };
  if (state.dollBesideDrawer) return { state: { ...state, dollBesideDrawer: false }, closedDrawer: false };
  if (viewportWidth - SCREEN_MARGIN < LAYOUT_MIN_WIDTHS.drawerOpen) {
    return { state: { ...state, drawer: null, dollBesideDrawer: false, dollCollapsed: false }, closedDrawer: true };
  }
  return { state: { ...state, dollBesideDrawer: true }, closedDrawer: false };
}

export function resolveMinimumWidth(state) {
  return LAYOUT_MIN_WIDTHS[layoutName({ drawer: state.drawer, dollOpen: isDollOpen(state) })];
}

export function resolveWindowWidth(state, viewportWidth) {
  const name = layoutName({ drawer: state.drawer, dollOpen: isDollOpen(state) });
  const available = viewportWidth - SCREEN_MARGIN;
  return Math.max(LAYOUT_MIN_WIDTHS[name], Math.min(LAYOUT_WIDTHS[name], available));
}
```

Note `toggleDrawer` ignores a third argument; the test passes one for symmetry — drop it from the test calls if ESLint complains about unused parameters (it does not for call sites).

- [ ] **Step 4: Run** `node --test tests/window-layout.test.js` → PASS.

`mustCollapsePaperdoll` stays in `inventory-context.js` for now: `inventory-app.js` still calls it. Task 6 Step 1 deletes it together with its last caller.

- [ ] **Step 5: Check and commit**

Run: `npm run check` → green.

```bash
git add scripts/ui/window-layout.js tests/window-layout.test.js
git commit -m "feat(ui): pure window layout state for drawer and paperdoll strip"
```

---

### Task 5: Vitals data for the passport and refusal results from item actions

**Files:**
- Modify: `scripts/integrations/dnd5e.js` (`extractActorVitals`), `tests/dnd5e-integration.test.js`, `scripts/ui/item-actions.js`

**Interfaces:**
- Produces: `vitals.hp.tempPct` (0–100, `(value + temp) / max`, clamped), `vitals.speedWalk` (number, `movement.walk ?? 30`), `vitals.speedUnit` (abbreviation already computed as `speedUnit`), `vitals.className` (string, e.g. "Паладин"; from `actor.classes` — see step 3). `equipItemToSlot`, `toggleItemEquipped`, `toggleAttunement` resolve to `true` when the change was written and `false` when refused (permission, rules, attunement limit).

- [ ] **Step 1: Failing test.** In `tests/dnd5e-integration.test.js` add, next to the existing `extractActorVitals` tests (reuse the file's actor factory; read the file first):

```js
  it("exposes walking speed, temp-hp share and class for the passport", () => {
    const actor = makeActor({
      system: { attributes: { hp: { value: 58, max: 64, temp: 5 }, movement: { walk: 30, units: "ft" } } },
      classes: { paladin: { name: "Паладин", system: { levels: 7 } } }
    });
    const vitals = extractActorVitals(actor);
    assert.equal(vitals.speedWalk, 30);
    assert.equal(vitals.hp.tempPct, 98);
    assert.equal(vitals.className, "Паладин");
  });
```

If the file has no `makeActor`, build the plain object inline the way its other `extractActorVitals` tests do.

- [ ] **Step 2: Run** `node --test tests/dnd5e-integration.test.js` → FAIL.

- [ ] **Step 3: Implement.** In `extractActorVitals`:
  - `hp.tempPct: hp.max > 0 ? Math.min(100, Math.round(((num(hp.value,0) + num(hp.temp,0)) / num(hp.max,0)) * 100)) : 0`
  - `speedWalk: num(movement.walk, 30)`, `speedUnit`
  - `className`: dnd5e 5.3.3 exposes `actor.classes` as an object keyed by identifier (verify in `%LOCALAPPDATA%/FoundryVTT/Data/systems/dnd5e/dnd5e.mjs`: search `get classes()`). Use the class with the most `system.levels`: `Object.values(actor.classes ?? {}).sort((a, b) => num(b.system?.levels,0) - num(a.system?.levels,0))[0]?.name ?? ""`.
  Add `speedWalk`/`className` to the data-shape table in `docs/architecture.md` only if a field moved between versions (it did not; skip).

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Item action results.** In `scripts/ui/item-actions.js` make every early `return;` in `equipItemToSlot`, `toggleItemEquipped` and `toggleAttunement` return `false`, and every successful path end with `return true;` (after the awaited `update`). `unequipItem` is unchanged. Callers that ignore the value keep working.

- [ ] **Step 6: Check and commit**

```bash
npm run check
git add scripts/integrations/dnd5e.js tests/dnd5e-integration.test.js scripts/ui/item-actions.js
git commit -m "feat(ui): passport vitals and refusal results for equip and attune"
```

---

### Task 6: Window shell — frame, header, layout, rail, accent

**Files:**
- Modify: `scripts/ui/inventory-app.js`, `scripts/ui/inventory-context.js`, `tests/inventory-context.test.js`, `templates/inventory-app.hbs`, `module.json`, `lang/en.json`, `lang/ru.json`
- Create: `styles/aim/window.css`
- Delete: `styles/actor-inventory.css`

**Interfaces:**
- Consumes: `window-layout.js` (Task 4), `resolveAccent` (Task 2), `openWindow`, `bindPress` (Task 3), `shouldReduceMotion` (`meter-motion.js`).
- Produces (context keys used by later templates): `dollOpen: boolean`, `drawer: null|"spells"|"trade"`, `isSpellsPanelOpen`, `isTradePanelOpen` (unchanged names), `occupiedSlots: {id,label,hasItem}[]`, `canEdit`, `isGM`. Body element `.aim-body[data-doll][data-drawer]`. Columns carry `data-part` for the entrance stagger.

- [ ] **Step 1: Swap the layout logic.**
  - Delete `WINDOW_WIDTHS`, `MIN_LAYOUT_WIDTHS`, `NARROW_TRADE_*`, `layoutKey`, `resolveMinimumWidth`, `resolveWindowWidth`, `paperdollMustMakeRoom`, `_makeRoomForSidePanel`, `_paperdollAutoCollapsed` from `inventory-app.js`; delete `mustCollapsePaperdoll` from `inventory-context.js` and its test block.
  - Replace the constructor's layout fields with
    ```js
    this.layout = {
      drawer: actor.getFlag?.(MODULE_ID, FLAGS.SPELLS_PANEL_OPEN) ? "spells" : null,
      dollCollapsed: Boolean(actor.getFlag?.(MODULE_ID, FLAGS.PAPERDOLL_COLLAPSED)),
      dollBesideDrawer: false
    };
    ```
    and getters `get isSpellsPanelOpen() { return this.layout.drawer === "spells"; }`, `get isTradePanelOpen() { return this.layout.drawer === "trade" && isTradeActor(this.actor); }`, `get isPaperdollCollapsed() { return !isDollOpen(this.layout); }`. Search the file and `trade-panel.js` for assignments to these names and route them through `this.layout`.
  - `_minimumWidth()` → `resolveMinimumWidth(this.layout)`; `_syncWindowSize()` uses `resolveWindowWidth(this.layout, window.innerWidth)`; `openActorInventory` uses the same.
  - Actions:
    ```js
    static async _togglePaperdoll() {
      const { state } = toggleDoll(this.layout, window.innerWidth);
      const savedChanged = state.dollCollapsed !== this.layout.dollCollapsed;
      this.layout = state;
      this._syncWindowSize();
      this.render();
      if (savedChanged) await this._savePreference(FLAGS.PAPERDOLL_COLLAPSED, state.dollCollapsed);
    }
    static async _toggleSpellsPanel() { await this._toggleDrawer("spells"); }
    static async _toggleTradePanel() { if (isTradeActor(this.actor)) await this._toggleDrawer("trade"); }
    async _toggleDrawer(name) {
      this._drawerJustOpened = this.layout.drawer !== name;
      this.layout = toggleDrawer(this.layout, name);
      this._syncWindowSize();
      this.render();
      await this._savePreference(FLAGS.SPELLS_PANEL_OPEN, this.layout.drawer === "spells");
    }
    ```
- [ ] **Step 2: Context.** In `_prepareContext` add `dollOpen: isDollOpen(this.layout)`, `drawer: this.isTradePanelOpen ? "trade" : (this.isSpellsPanelOpen ? "spells" : null)`, `occupiedSlots: allSlots.map(s => ({ id: s.id, label: s.label, hasItem: s.hasItem }))`. Keep `isSidePanelOpen` = `Boolean(drawer)`.
- [ ] **Step 3: Frame.**
  - `DEFAULT_OPTIONS.classes` → `["actor-inventory-manager-app", "tc-root"]` (drop `rpg-theme`); `window.icon` → `"fa-light fa-shirt"`.
  - Title: `const title = actor.name;` (the subtitle carries the rest).
  - Frame button:
    ```js
    _getFrameButtons(options) {
      return [...super._getFrameButtons(options), { icon: "fa-light fa-circle-half-stroke", label: "AIM.theme.toggle", action: "toggleTheme" }];
    }
    ```
  - Header identity, injected once and refreshed each render:
    ```js
    async _renderFrame(options) {
      const frame = await super._renderFrame(options);
      const title = frame.querySelector(".window-title");
      if (title) {
        title.insertAdjacentHTML("beforebegin", '<span class="aim-head-avatar" aria-hidden="true"><img alt=""><b></b></span>');
        title.insertAdjacentHTML("afterend", '<span class="aim-head-sub"></span>');
      }
      return frame;
    }
    _refreshHeader(vitals) {
      const header = this.element.querySelector(".window-header");
      if (!header) return;
      const img = header.querySelector(".aim-head-avatar img");
      if (img && img.getAttribute("src") !== vitals.img) img.src = vitals.img;
      const badge = header.querySelector(".aim-head-avatar b");
      if (badge) { badge.textContent = vitals.level ? String(vitals.level) : ""; badge.hidden = !vitals.level; }
      const sub = header.querySelector(".aim-head-sub");
      if (sub) sub.textContent = [vitals.race, vitals.alignment, [vitals.className, vitals.level].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
    }
    ```
    Call `this._refreshHeader(context.vitals)` in `_onRender`.
  - Theme and accent: create `scripts/ui/tactile-theme.js` (runtime, untested; the editors reuse it in Task 12):
    ```js
    import { MODULE_ID } from "../constants.js";
    import { resolveAccent } from "../tactile/palette.js";
    import { resolveThemeContext } from "./inventory-context.js";

    /** Resolved theme for this client: "light" or "dark". */
    export function currentTheme() {
      const prefersLight = Boolean(globalThis.matchMedia?.("(prefers-color-scheme: light)")?.matches);
      return resolveThemeContext(game.settings.get(MODULE_ID, "theme") ?? "dark", prefersLight, key => game.i18n.localize(key)).theme;
    }

    /** Stamp the theme and the accent hue on a Tactile window root. */
    export function applyTactileTheme(element, theme = currentTheme()) {
      if (!element) return;
      element.setAttribute("data-theme", theme);
      const { h, c } = resolveAccent(game.settings.get(MODULE_ID, "accent"));
      element.style.setProperty("--tc-acc-h", String(h));
      element.style.setProperty("--tc-acc-c", String(c));
    }
    ```
    `_applyTheme(theme)` keeps its transition-suppression wrapper but calls `applyTactileTheme(root, theme)` instead of setting the attribute itself.
  - `_applyTheme` keeps its body; remove the `aim-no-transitions` dance only if no rule transitions a token background any more (grep `transition` in `styles/aim/*.css` at the end of Task 10; until then leave it).
  - Motion: in `_onFirstRender` call `bindPress(this.element, () => shouldReduceMotion(window))` and `openWindow(this.element, { reduce: shouldReduceMotion(window) })`.
  - `inventory-context.js` `resolveThemeContext`: icons `fa-light fa-moon` / `fa-light fa-sun`.
  - Lang: `AIM.theme.toggle` en "Toggle light/dark" / ru "Сменить тему"; update `AIM.theme.switchToLight` → "Светлая тема", `switchToDark` → "Тёмная тема" (ru) and "Light theme"/"Dark theme" (en). `AIM.app.title` stays (used in API/README).
- [ ] **Step 4: Template `templates/inventory-app.hbs`** (replace the whole file):

```hbs
<div class="aim-body" data-doll="{{#if dollOpen}}open{{else}}strip{{/if}}" {{#if drawer}}data-drawer="{{drawer}}"{{/if}} {{#unless canEdit}}data-readonly{{/unless}}>
  <aside class="aim-col aim-passport" data-part>
    {{> "modules/actor-inventory-manager/templates/parts/character-vitals.hbs"}}
  </aside>
  <main class="aim-col {{#if dollOpen}}aim-doll{{else}}aim-doll-strip{{/if}}" data-part>
    {{> "modules/actor-inventory-manager/templates/parts/paperdoll.hbs"}}
  </main>
  <section class="aim-col aim-inv" data-part>
    {{> "modules/actor-inventory-manager/templates/parts/inventory-grid.hbs"}}
  </section>
  {{#if isSpellsPanelOpen}}
    <section class="aim-col aim-drawer" data-drawer-panel="spells">
      {{> "modules/actor-inventory-manager/templates/parts/spells-actions.hbs"}}
    </section>
  {{/if}}
  {{#if isTradePanelOpen}}
    <section class="aim-col aim-drawer" data-drawer-panel="trade">
      {{> "modules/actor-inventory-manager/templates/parts/trade.hbs"}}
    </section>
  {{/if}}
  <nav class="aim-rail" aria-label="{{localize 'AIM.app.sidePanels'}}" data-part>
    <button type="button" class="aim-rail-btn" data-action="toggleSpellsPanel"
            data-tooltip="{{localize 'AIM.spells.drawerTab'}}" data-tooltip-direction="LEFT"
            aria-label="{{localize 'AIM.spells.drawerTab'}}" aria-expanded="{{#if isSpellsPanelOpen}}true{{else}}false{{/if}}">
      <i class="fa-light fa-wand-magic-sparkles"></i>
    </button>
    {{#if trade.available}}
      <button type="button" class="aim-rail-btn" data-action="toggleTradePanel"
              data-tooltip="{{localize 'AIM.trade.title'}}" data-tooltip-direction="LEFT"
              aria-label="{{localize 'AIM.trade.title'}}" aria-expanded="{{#if isTradePanelOpen}}true{{else}}false{{/if}}">
        <i class="fa-light fa-handshake"></i>{{#if hasTradeSession}}<span class="aim-rail-live"></span>{{/if}}
      </button>
    {{/if}}
  </nav>
</div>
```

  The other parts still use their old markup until Tasks 7–10; that is expected.
- [ ] **Step 5: `styles/aim/window.css`.** Port mockup lines 110–137 and 377–383 (rail) and 385–388 (read-only), mapped:
  - `.tactile` → `.actor-inventory-manager-app.tc-root` (frame): `background: var(--tc-bg); color: var(--tc-ink); border: 0; border-radius: var(--tc-r-window); box-shadow: var(--tc-window); font: 14px/1.45 var(--tc-font-ui);`. Do not set `width` (Foundry positions it).
  - `.window-header` (Foundry): `background: none; border: 0; padding: 12px 12px 10px 14px; gap: 10px; color: var(--tc-ink);` `.window-title` = mockup `.bar-title b` (Unbounded 14px caps) with `flex: 0 1 auto`; `.aim-head-sub` = mockup `.bar-title small` with `flex: 1`; `.aim-head-avatar` = mockup `.avatar` with the `img` covering the circle (`width:100%;height:100%;object-fit:cover;border-radius:inherit;border:0`) and `b` = level badge; `.header-control` = mockup `.bar-btn`.
  - `.window-content`: `padding: 0; background: none; overflow: hidden; display: flex;`.
  - `.aim-body` = mockup `.body` but `flex: 1; height: auto; min-height: 0;` (the window height is Foundry's). Grid templates per `[data-doll]`/`[data-drawer]` exactly as mockup lines 132–135 with `.tactile[...] .body` → `.aim-body[...]`. Inventory column `minmax(340px, 1fr)`.
  - `.aim-col` = mockup `.col`; `.aim-scroll` = mockup `.scroll`.
  - Rail: `.aim-rail` / `.aim-rail-btn` / `.aim-rail-live` from mockup `.rail` (lines 378–382), active = `[aria-expanded="true"]`.
  - Read-only: `.aim-body[data-readonly] .aim-edit { display: none !important; }`.
- [ ] **Step 6: Manifest.** `module.json` `styles` becomes:
```json
  "styles": [
    "styles/tactile/tokens.css",
    "styles/tactile/components.css",
    "styles/aim/window.css",
    "styles/aim/passport.css",
    "styles/aim/paperdoll.css",
    "styles/aim/inventory.css",
    "styles/aim/drawers.css",
    "styles/aim/editors.css"
  ],
```
  Create the five not-yet-written `styles/aim/*.css` files with a one-line header comment so the manifest test passes. Delete `styles/actor-inventory.css`. Run `node --test tests/manifest.test.js` and fix whatever it asserts about styles.
- [ ] **Step 7: Check and commit**

```bash
npm run check
git add -A scripts/ui templates/inventory-app.hbs styles module.json lang tests
git commit -m "feat(ui): Tactile window frame, header, rail and drawer layout"
```

---

### Task 7: Passport (vitals column)

**Files:**
- Rewrite: `templates/parts/character-vitals.hbs`
- Write: `styles/aim/passport.css`
- Modify: `lang/en.json`, `lang/ru.json`

**Interfaces:**
- Consumes: `vitals.*` (incl. Task 5 fields), `encumbrance.*` (`value`, `max`, `unit`, `pct`, `stops.{encumbered,heavilyEncumbered}`, `thresholds.*`, `showTierStops`, `tierClass`, `tierLabelKey`), `canEdit`.
- Produces: elements `[data-count="hp"]`, `[data-count="ac"]` (Task 11 counts them), meters `data-meter="hp"` / `"encumbrance"` (kept for `meter-motion.js`).

- [ ] **Step 1: Template** (replace the file):

```hbs
<div class="tc-shell aim-passport-shell"><div class="tc-core aim-passport-core">
  <div class="aim-hp">
    <span class="tc-lbl">{{localize "AIM.vitals.hp"}}</span>
    <div class="aim-hp-big"><strong data-count="hp">{{vitals.hp.value}}</strong><span>/ {{vitals.hp.max}}{{#if vitals.hp.temp}}<br>+{{vitals.hp.temp}} {{localize "AIM.vitals.tempShort"}}{{/if}}</span></div>
    <div class="tc-band" role="meter" aria-label="{{localize 'AIM.vitals.hp'}}" aria-valuemin="0" aria-valuemax="{{vitals.hp.max}}" aria-valuenow="{{vitals.hp.value}}">
      {{#if vitals.hp.temp}}<i class="tc-band-ghost" style="width: {{vitals.hp.tempPct}}%;"></i>{{/if}}
      <i class="tc-band-fill" data-meter="hp" style="width: {{vitals.hp.pct}}%;"></i>
    </div>
  </div>

  <div class="aim-readouts">
    <div class="aim-readout"><span class="tc-lbl">{{localize "AIM.vitals.ac"}}</span><b data-count="ac">{{vitals.ac}}</b></div>
    <div class="aim-readout"><span class="tc-lbl">{{localize "AIM.vitals.init"}}</span><b>{{vitals.init}}</b></div>
    <div class="aim-readout" data-tooltip="{{vitals.speed}}"><span class="tc-lbl">{{localize "AIM.vitals.speedShort"}}</span><b>{{vitals.speedWalk}}<small> {{vitals.speedUnit}}</small></b></div>
  </div>

  <div>
    <div class="tc-sec"><span class="tc-lbl">{{localize "AIM.vitals.abilities"}}</span></div>
    <div class="aim-abil">
      {{#each vitals.abilities as |ability key|}}
        <div class="aim-ab" data-tooltip="{{localize 'AIM.vitals.save'}} {{ability.save}}">
          <span class="aim-ab-key">{{localize (concat "AIM.vitals.abilityAbbr." key)}}</span>
          <span class="aim-ab-save {{#if ability.proficient}}is-prof{{/if}}"><span class="tc-dot {{#if ability.proficient}}is-on{{/if}}"></span>{{ability.save}}</span>
          <b>{{ability.value}}</b><span class="aim-ab-mod">{{ability.mod}}</span>
        </div>
      {{/each}}
    </div>
  </div>

  <div>
    <div class="tc-sec"><span class="tc-lbl">{{localize "AIM.vitals.passives"}}</span></div>
    <div class="aim-kv-list">
      <div class="aim-kv"><span><i class="fa-light fa-eye"></i>{{localize "AIM.vitals.perception"}}</span><b>{{vitals.passives.perception}}</b></div>
      <div class="aim-kv"><span><i class="fa-light fa-magnifying-glass"></i>{{localize "AIM.vitals.investigation"}}</span><b>{{vitals.passives.investigation}}</b></div>
      <div class="aim-kv"><span><i class="fa-light fa-brain"></i>{{localize "AIM.vitals.insight"}}</span><b>{{vitals.passives.insight}}</b></div>
    </div>
  </div>

  <div>
    <div class="tc-sec"><span class="tc-lbl">{{localize "AIM.encumbrance.title"}}</span></div>
    <div class="aim-load-head"><b>{{encumbrance.value}} <small>/ {{encumbrance.max}} {{encumbrance.unit}}</small></b><span class="aim-tier {{encumbrance.tierClass}}">{{localize encumbrance.tierLabelKey}}</span></div>
    <div class="tc-band" role="meter" aria-label="{{localize 'AIM.encumbrance.title'}}" aria-valuemin="0" aria-valuemax="{{encumbrance.max}}" aria-valuenow="{{encumbrance.value}}">
      <i class="tc-band-fill" data-meter="encumbrance" style="width: {{encumbrance.pct}}%;"></i>
      {{#if encumbrance.showTierStops}}
        <s class="tc-band-stop" style="left: {{encumbrance.stops.encumbered}}%;"></s>
        <s class="tc-band-stop" style="left: {{encumbrance.stops.heavilyEncumbered}}%;"></s>
      {{/if}}
    </div>
    {{#if encumbrance.showTierStops}}
      <div class="tc-ticks"><span>0</span><span style="left: {{encumbrance.stops.encumbered}}%;">{{encumbrance.thresholds.encumbered}}</span><span style="left: {{encumbrance.stops.heavilyEncumbered}}%;">{{encumbrance.thresholds.heavilyEncumbered}}</span><span>{{encumbrance.max}}</span></div>
    {{/if}}
  </div>

  <div>
    <div class="tc-sec"><span class="tc-lbl">{{localize "AIM.currency.purse"}}</span></div>
    <div class="aim-coins">
      {{#each coinKeys as |coin|}}
        <div class="aim-coin aim-coin-{{coin}}" data-tooltip="{{localize (concat 'AIM.currency.' coin)}}"><span>{{localize (concat "AIM.currency." coin "Abbr")}}</span><b>{{lookup ../vitals.currency coin}}</b></div>
      {{/each}}
    </div>
    <div class="aim-total"><span>{{localize "AIM.currency.totalValue"}}</span><b>{{vitals.currency.formatted}}</b></div>
  </div>

  {{#if canEdit}}
    <div class="aim-rests aim-edit">
      <button type="button" class="tc-btn" data-action="shortRest"><i class="fa-light fa-mug-hot"></i>{{localize "AIM.actions.shortRestShort"}}</button>
      <button type="button" class="tc-btn" data-action="longRest"><i class="fa-light fa-bed"></i>{{localize "AIM.actions.longRestShort"}}</button>
    </div>
  {{/if}}
</div></div>
```

  Foundry v14 registers `concat`, `localize`, `eq`, `not` (`client/applications/handlebars.mjs:121`) and Handlebars has `lookup`; there is no `array` helper. Add `coinKeys: ["pp", "gp", "ep", "sp", "cp"]` to the context in `_prepareContext`.
- [ ] **Step 2: Lang** (en / ru): `AIM.vitals.tempShort` "temp" / "врем."; `speedShort` "Speed" / "Скор."; `passives` "Passive" / "Пассивные"; `abilityAbbr.str|dex|con|int|wis|cha` "STR…CHA" / "СИЛ, ЛОВ, ТЕЛ, ИНТ, МДР, ХАР"; `AIM.currency.purse` "Purse" / "Кошель"; `AIM.actions.shortRestShort` "Short" / "Короткий"; `longRestShort` "Long" / "Долгий"; change ru `AIM.vitals.hp` to "Хиты".
- [ ] **Step 3: CSS `styles/aim/passport.css`.** Port mockup lines 188–227 with renames: `.passport .core` → `.aim-passport-core` (`padding: 14px 14px 12px; gap: 13px; overflow: auto; scrollbar-width: none;`), `.hp .big` → `.aim-hp-big`, `.readouts/.readout` → `.aim-readouts/.aim-readout`, `.abil/.ab` → `.aim-abil/.aim-ab` (`.k` → `.aim-ab-key`, `.sv` → `.aim-ab-save` with `.is-prof`, `.mod` → `.aim-ab-mod`), `.rows-kv/.kv` → `.aim-kv-list/.aim-kv` (icons `i` 13px), `.load-h` → `.aim-load-head`, `.tier` → `.aim-tier` with tier colours keyed by the existing `encumbrance.tierClass` values (`computeActorEncumbrance` emits `is-normal` → `--tc-good`, `is-encumbered` → `--tc-warning`, `is-heavily-encumbered` and `is-overburdened` → `--tc-danger`), `.coins/.coin/.coin.gp` → `.aim-coins/.aim-coin/.aim-coin-gp`, `.total` → `.aim-total`, `.rests` → `.aim-rests`. `.aim-passport-shell` gets `height: 100%`.
- [ ] **Step 4: Check and commit**

```bash
npm run check
git add templates/parts/character-vitals.hbs styles/aim/passport.css lang scripts/ui/inventory-app.js
git commit -m "feat(ui): Tactile passport with the big HP number"
```

---

### Task 8: Paperdoll — stage, sockets, attunement, strip

**Files:**
- Rewrite: `templates/parts/paperdoll.hbs`, `templates/parts/slot.hbs`
- Write: `styles/aim/paperdoll.css`
- Modify: `lang/en.json`, `lang/ru.json`

**Interfaces:**
- Consumes: `dollOpen`, `leftSlots/centerSlots/rightSlots` (each: `id,label,icon,isImageIcon,hasItem,item{id,uuid,name,img,rarityKey,cssVars,isAttuned,hasMultiple,quantity},isLocked,lockReason,canEdit`), `attunementSlots` (`hasItem,item,isOverLimit`), `vitals.attunement`, `occupiedSlots`, `isGM`, `canEdit`, `showActorPortraitBackdrop`, `actorImgCss`.
- Must keep for `DragDropController`: `data-drop-target="slot"`, `data-slot-id`, `data-drag-item`, `data-item-id`, `data-item-uuid` (read `scripts/ui/drag-drop-controller.js` before editing and keep every selector it queries).
- Produces: sockets `.aim-sock` inside `.aim-slot[data-slot-id]` (Task 11 pops them).

- [ ] **Step 1: `templates/parts/slot.hbs`** (replace):

```hbs
<div class="aim-slot {{#if hasItem}}is-full{{/if}} {{#if isLocked}}is-locked{{/if}}" data-drop-target="slot" data-slot-id="{{id}}"
     {{#if hasItem}}data-rarity="{{item.rarityKey}}" style="{{item.cssVars}}"{{/if}}
     data-tooltip="{{#if isLocked}}{{lockReason}}{{else if hasItem}}{{label}}: {{item.name}}{{else}}{{label}}{{/if}}">
  {{#if isLocked}}
    <div class="aim-sock" aria-label="{{label}}: {{lockReason}}"><span class="aim-sock-lock"><i class="fa-light fa-lock"></i>{{localize "AIM.slots.twoHandedShort"}}</span></div>
  {{else if hasItem}}
    <div class="aim-sock" {{#if canEdit}}data-drag-item="true"{{/if}} data-item-id="{{item.id}}" data-item-uuid="{{item.uuid}}" data-slot-id="{{id}}">
      <img src="{{item.img}}" alt="{{item.name}}" data-action="openItem" data-item-id="{{item.id}}">
      {{#if item.hasMultiple}}<span class="aim-sock-qty">{{item.quantity}}</span>{{/if}}
    </div>
    {{#if item.isAttuned}}<span class="aim-sock-att" data-tooltip="{{localize 'AIM.items.attuned'}}"><i class="fa-solid fa-sun"></i></span>{{/if}}
    {{#if canEdit}}<button type="button" class="aim-sock-off aim-edit" data-action="unequipSlot" data-slot-id="{{id}}" aria-label="{{localize 'AIM.actions.unequip'}}: {{item.name}}" data-tooltip="{{localize 'AIM.actions.unequip'}}"><i class="fa-light fa-xmark"></i></button>{{/if}}
  {{else}}
    <div class="aim-sock" aria-label="{{label}}">
      {{#if isImageIcon}}<img class="aim-sock-icon" src="{{icon}}" alt="">{{else}}<i class="{{icon}}"></i>{{/if}}
    </div>
  {{/if}}
  <span class="aim-slot-tag">{{#if hasItem}}{{item.name}}{{else}}{{label}}{{/if}}</span>
</div>
```

  Slot icons come from paperdoll templates as `fa-solid …`; in CSS render empty-socket icons at `font-weight: 300` only if the class is `fa-light`. Change the defaults in `scripts/core/paperdoll-templates.js` from `fa-solid` to `fa-light` and update `tests/paperdoll-templates.test.js` if it asserts icon strings. Custom user templates keep whatever they saved.
- [ ] **Step 2: `templates/parts/paperdoll.hbs`** (replace):

```hbs
{{#if dollOpen}}
  <div class="aim-doll-head">
    <span class="tc-lbl">{{localize "AIM.paperdoll.title"}}</span>
    {{#if isGM}}<button type="button" class="tc-ibtn" data-action="openPaperdollEditor" aria-label="{{localize 'AIM.editor.openTooltip'}}" data-tooltip="{{localize 'AIM.editor.openTooltip'}}"><i class="fa-light fa-sliders"></i></button>{{/if}}
    <button type="button" class="tc-ibtn" data-action="togglePaperdoll" aria-label="{{localize 'AIM.paperdoll.collapseTooltip'}}" data-tooltip="{{localize 'AIM.paperdoll.collapseTooltip'}}"><i class="fa-light fa-chevron-left"></i></button>
  </div>
  <div class="tc-tray aim-stage aim-scroll" {{#if showActorPortraitBackdrop}}style="--aim-portrait: {{{actorImgCss}}};"{{/if}}>
    {{#if showActorPortraitBackdrop}}<div class="aim-stage-portrait" aria-hidden="true"></div>{{/if}}
    <div class="aim-scol is-left">{{#each leftSlots}}{{> "modules/actor-inventory-manager/templates/parts/slot.hbs" this}}{{/each}}</div>
    <div class="aim-scol is-center">{{#each centerSlots}}{{> "modules/actor-inventory-manager/templates/parts/slot.hbs" this}}{{/each}}</div>
    <div class="aim-scol is-right">{{#each rightSlots}}{{> "modules/actor-inventory-manager/templates/parts/slot.hbs" this}}{{/each}}</div>
  </div>
  <div class="tc-tray aim-attune">
    <span class="tc-lbl">{{localize "AIM.attunement.title"}} <b class="{{#if vitals.attunement.isOver}}is-over{{/if}}">{{vitals.attunement.value}}/{{vitals.attunement.max}}</b></span>
    {{#each attunementSlots}}
      {{#if this.hasItem}}
        <span class="aim-asock is-on {{#if this.isOverLimit}}is-over{{/if}}" data-rarity="{{this.item.rarityKey}}" style="{{this.item.cssVars}}" data-tooltip="{{this.item.name}}{{#if this.isOverLimit}} — {{localize 'AIM.attunement.overLimit'}}{{/if}}">
          <img src="{{this.item.img}}" alt="{{this.item.name}}" data-action="openItem" data-item-id="{{this.item.id}}">
          {{#if @root.canEdit}}<button type="button" class="aim-asock-break aim-edit" data-action="toggleAttune" data-item-id="{{this.item.id}}" aria-label="{{localize 'AIM.attunement.break'}}: {{this.item.name}}" data-tooltip="{{localize 'AIM.attunement.break'}}"><i class="fa-light fa-link-slash"></i></button>{{/if}}
        </span>
      {{else}}
        <span class="aim-asock" data-tooltip="{{localize 'AIM.attunement.empty'}}"><i class="fa-light fa-sun"></i></span>
      {{/if}}
    {{/each}}
  </div>
{{else}}
  <div class="tc-tray aim-strip">
    <button type="button" class="tc-ibtn" data-action="togglePaperdoll" aria-label="{{localize 'AIM.paperdoll.expandTooltip'}}" data-tooltip="{{localize 'AIM.paperdoll.expandTooltip'}}" data-tooltip-direction="RIGHT"><i class="fa-light fa-chevron-right"></i></button>
    <span class="aim-strip-title">{{localize "AIM.paperdoll.title"}}</span>
    <div class="aim-strip-map" aria-label="{{localize 'AIM.paperdoll.occupied'}}">
      {{#each occupiedSlots}}<i class="{{#if this.hasItem}}is-on{{/if}}" data-tooltip="{{this.label}}"></i>{{/each}}
    </div>
    <span class="aim-strip-badge" data-tooltip="{{localize 'AIM.attunement.title'}}"><i class="fa-light fa-sun"></i>{{vitals.attunement.value}}/{{vitals.attunement.max}}</span>
  </div>
{{/if}}
```

  Lang: `AIM.paperdoll.occupied` "Occupied slots" / "Занятые слоты". Check that `actorImgCss` is already CSS-escaped by `cssUrl` (it is — `scripts/ui/html.js`); triple-stash keeps the quotes.
- [ ] **Step 3: CSS `styles/aim/paperdoll.css`.** Port mockup lines 228–270:
  - `.doll` → `.aim-doll` (grid rows auto / 1fr / auto), `.doll-h` → `.aim-doll-head`, `.stage` → `.aim-stage` (keep the dashed circle `::after`; the silhouette `::before` only when there is no `.aim-stage-portrait`: `.aim-stage:not(:has(.aim-stage-portrait))::before`), `.aim-stage-portrait` = `position:absolute; inset:0; z-index:-1; background: var(--aim-portrait) center top / cover no-repeat; opacity: .14; filter: grayscale(.4); mask-image: linear-gradient(to bottom, #000 40%, transparent);`.
  - `.scol` → `.aim-scol` (`.is-center` gets the 3-row template), `.slot` → `.aim-slot` (`.full` → `.is-full`, `.locked` → `.is-locked`), `.sock` → `.aim-sock` (item `img` fills it: `width:100%;height:100%;object-fit:cover;border-radius:inherit`), rarity ring uses `var(--rarity-color)` instead of `--rar`: `.aim-slot.is-full:not([data-rarity="common"]):not([data-rarity=""]) .aim-sock { box-shadow: var(--tc-raise), 0 0 0 1.5px var(--rarity-color, transparent), 0 0 14px -4px var(--rarity-color, transparent); }`, `.att` → `.aim-sock-att`, `.off` → `.aim-sock-off`, `.qty` → `.aim-sock-qty`, `.tag` → `.aim-slot-tag`, `.lk` → `.aim-sock-lock`.
  - `.attune` → `.aim-attune`, `.asock` → `.aim-asock` (+ `img` fill, `.is-over` ring `--tc-danger`), `.brk` → `.aim-asock-break`.
  - `.strip` → `.aim-strip` (`.vt` → `.aim-strip-title`, `.mini` → `.aim-strip-map`, `.badge` → `.aim-strip-badge`).
  - Drag-over feedback: whatever class `drag-drop-controller.js` adds on hover (read it) gets `box-shadow: inset 0 0 0 1.5px var(--tc-accent), 0 0 16px -4px var(--tc-glow)` on `.aim-sock`.
- [ ] **Step 4: Check and commit**

```bash
npm run check
git add templates/parts/paperdoll.hbs templates/parts/slot.hbs styles/aim/paperdoll.css scripts/core/paperdoll-templates.js tests lang
git commit -m "feat(ui): Tactile paperdoll rack, attunement tray and strip"
```

---

### Task 9: Inventory — tabs, filters, rows, containers

**Files:**
- Rewrite: `templates/parts/inventory-grid.hbs`, `templates/parts/container-view.hbs`
- Write: `styles/aim/inventory.css`

**Interfaces:**
- Consumes: `currentTab`, `counts`, `appId`, `searchFilter`, `sortBy`, `items[]` (`id,uuid,name,img,rarityKey,cssVars,hasGlow,isEquipped,isAttuned,requiresAttunement,canEquip,canEdit,hasMultiple,quantity,weightDisplay,priceDisplay,properties[]`, plus a rarity label if `formatItemForDisplay` provides one — read it; if absent, omit the rarity word), `containers[]` (Task-unchanged tree from `_buildContainerTree`), `hasContainers`, `weightyContainersActive`.
- Must keep: `data-search-input`, `data-sort-select`, `data-drop-target="inventory"|"container"`, `data-container-id`, `data-drag-item`, `data-item-id`, `data-item-uuid`, all `data-action` names.
- Produces: rows `.aim-row[data-flip-id="{{id}}"]`, containers `.aim-box[data-flip-id="box-{{id}}"]` (Task 11 flips them).

- [ ] **Step 1: `templates/parts/inventory-grid.hbs`** (replace):

```hbs
<nav class="tc-segs aim-tabs" aria-label="{{localize 'AIM.tabs.label'}}">
  {{#each inventoryTabs as |tab|}}
    <button type="button" class="tc-seg" data-action="switchTab" data-tab="{{tab.[0]}}" aria-pressed="{{#if (eq @root.currentTab tab.[0])}}true{{else}}false{{/if}}"
            aria-label="{{localize (concat 'AIM.tabs.' tab.[0])}}" data-tooltip="{{localize (concat 'AIM.tabs.' tab.[0])}}">
      <i class="fa-light {{tab.[1]}}"></i><span class="tc-seg-label">{{localize (concat "AIM.tabs." tab.[0])}}</span><span class="tc-seg-count">{{lookup @root.counts tab.[0]}}</span>
    </button>
  {{/each}}
</nav>
<div class="aim-filters">
  <label class="tc-search"><i class="fa-light fa-magnifying-glass"></i>
    <input type="text" id="{{appId}}-search" name="aim-inv-search" data-search-input="true" autocomplete="off" placeholder="{{localize 'AIM.filters.searchPlaceholder'}}" value="{{searchFilter}}" aria-label="{{localize 'AIM.filters.searchPlaceholder'}}">
  </label>
  <select id="{{appId}}-sort" name="aim-inv-sort" class="tc-select" data-sort-select="true" aria-label="{{localize 'AIM.sort.label'}}">
    <option value="name" {{#if (eq sortBy 'name')}}selected{{/if}}>{{localize "AIM.sort.name"}}</option>
    <option value="weight" {{#if (eq sortBy 'weight')}}selected{{/if}}>{{localize "AIM.sort.weight"}}</option>
    <option value="value" {{#if (eq sortBy 'value')}}selected{{/if}}>{{localize "AIM.sort.value"}}</option>
    <option value="rarity" {{#if (eq sortBy 'rarity')}}selected{{/if}}>{{localize "AIM.sort.rarity"}}</option>
  </select>
</div>
<div class="tc-tray aim-list aim-scroll aim-items-scroll-area" data-drop-target="inventory">
  {{#each items}}
    {{> "modules/actor-inventory-manager/templates/parts/item-row.hbs" this}}
  {{/each}}
  {{#if (or (eq currentTab 'all') (eq currentTab 'containers'))}}
    {{#if hasContainers}}
      <div class="aim-cont">
        <div class="tc-sec"><span class="tc-lbl">{{localize "AIM.containers.title"}}</span></div>
        {{#each containers}}{{> "modules/actor-inventory-manager/templates/parts/container-view.hbs" this}}{{/each}}
      </div>
    {{/if}}
  {{/if}}
  {{#unless items.length}}{{#unless (and hasContainers (or (eq currentTab 'all') (eq currentTab 'containers')))}}
    <div class="aim-empty"><i class="fa-light fa-box-open"></i>{{#if searchFilter}}{{localize "AIM.items.noMatches"}}{{else}}{{localize "AIM.items.emptyList"}}{{/if}}</div>
  {{/unless}}{{/unless}}
</div>
```

  Add to the context (a module-level constant in `inventory-app.js`): `inventoryTabs: [["all", "fa-boxes-stacked"], ["weapons", "fa-sword"], ["armor", "fa-shield-halved"], ["consumables", "fa-flask"], ["containers", "fa-box-archive"], ["loot", "fa-coins"]]` (`tab.[0]` id, `tab.[1]` icon). The current templates already use `or`/`and`, so a loaded package registers them; grep dnd5e for `registerHelper` to confirm before relying on them. `fa-sword` is FA6 Pro (light weight available). Add the new partial path `templates/parts/item-row.hbs` to `AIM_TEMPLATES` in `inventory-app.js`. Lang: `AIM.tabs.label` "Categories"/"Категории", `AIM.sort.label` "Sort"/"Сортировка", `AIM.items.noMatches` "Nothing matches the search." / "По запросу ничего не найдено."
- [ ] **Step 2: Create `templates/parts/item-row.hbs`** (shared by the list and containers; `nested` is true inside containers):

```hbs
<div class="aim-row {{#if isEquipped}}is-equipped{{/if}}" data-flip-id="{{id}}" data-rarity="{{rarityKey}}" style="{{cssVars}}"
     {{#if canEdit}}data-drag-item="true"{{/if}} data-item-id="{{id}}" data-item-uuid="{{uuid}}">
  <span class="aim-thumb" data-action="openItem" data-item-id="{{id}}">
    <img src="{{img}}" alt="{{name}}">
    {{#if hasMultiple}}<span class="aim-thumb-qty">{{quantity}}</span>{{/if}}
  </span>
  <div class="aim-row-text" data-action="openItem" data-item-id="{{id}}">
    <div class="aim-row-l1"><b>{{name}}</b>
      {{#if isAttuned}}<span class="tc-pill"><i class="fa-solid fa-sun"></i>{{localize "AIM.items.attuned"}}</span>
      {{else if requiresAttunement}}<span class="tc-pill is-warn"><i class="fa-light fa-sun"></i>{{localize "AIM.items.requiresAttunementShort"}}</span>{{/if}}
    </div>
    <div class="aim-row-l2">{{#if rarityLabel}}<span class="aim-rar">{{rarityLabel}}</span> · {{/if}}{{weightDisplay}}{{#if priceDisplay}} · {{priceDisplay}}{{/if}}{{#each properties}}<span class="tc-chip">{{this}}</span>{{/each}}</div>
  </div>
  {{#if canEdit}}
    <div class="aim-row-ctrls aim-edit">
      {{#if canEquip}}{{#unless nested}}
        <button type="button" class="tc-ibtn {{#if isEquipped}}is-on{{else}}is-hover{{/if}}" data-action="toggleEquip" data-item-id="{{id}}" aria-label="{{#if isEquipped}}{{localize 'AIM.actions.unequip'}}{{else}}{{localize 'AIM.actions.equip'}}{{/if}}: {{name}}" data-tooltip="{{#if isEquipped}}{{localize 'AIM.actions.unequip'}}{{else}}{{localize 'AIM.actions.equip'}}{{/if}}"><i class="{{#if isEquipped}}fa-solid{{else}}fa-light{{/if}} fa-shield-halved"></i></button>
      {{/unless}}{{/if}}
      {{#if requiresAttunement}}
        <button type="button" class="tc-ibtn {{#if isAttuned}}is-on{{else}}is-hover{{/if}}" data-action="toggleAttune" data-item-id="{{id}}" aria-label="{{#if isAttuned}}{{localize 'AIM.attunement.break'}}{{else}}{{localize 'AIM.attunement.attune'}}{{/if}}: {{name}}" data-tooltip="{{#if isAttuned}}{{localize 'AIM.attunement.break'}}{{else}}{{localize 'AIM.attunement.attune'}}{{/if}}"><i class="{{#if isAttuned}}fa-solid{{else}}fa-light{{/if}} fa-sun"></i></button>
      {{/if}}
      <button type="button" class="tc-ibtn is-hover" data-action="useItem" data-item-id="{{id}}" aria-label="{{localize 'AIM.actions.use'}}: {{name}}" data-tooltip="{{localize 'AIM.actions.use'}}"><i class="fa-light fa-dice-d20"></i></button>
      <button type="button" class="tc-ibtn is-hover is-danger" data-action="deleteItem" data-item-id="{{id}}" aria-label="{{localize 'AIM.actions.delete'}}: {{name}}" data-tooltip="{{localize 'AIM.actions.delete'}}"><i class="fa-light fa-trash-can"></i></button>
    </div>
  {{/if}}
</div>
```

  In `_buildContainerTree` map nested items with `nested: true`. If `formatItemForDisplay` has no `rarityLabel`, add one in `scripts/integrations/dnd5e.js` from `CONFIG.DND5E.itemRarity[rarityKey]` (localize), empty for common/none, with a test in `tests/dnd5e-integration.test.js` using a stub `globalThis.CONFIG`.
- [ ] **Step 3: `templates/parts/container-view.hbs`** (replace):

```hbs
<div class="aim-box {{#if isCollapsed}}is-closed{{/if}}" data-flip-id="box-{{id}}" data-drop-target="container" data-container-id="{{id}}">
  <div class="aim-box-head" data-action="toggleContainer" data-container-id="{{id}}" role="button" tabindex="0" aria-expanded="{{#if isCollapsed}}false{{else}}true{{/if}}"
       {{#if canEdit}}data-drag-item="true"{{/if}} data-item-id="{{id}}">
    <span class="aim-box-chev"><i class="fa-light fa-chevron-down"></i></span>
    <span class="aim-thumb is-small"><img src="{{img}}" alt="{{name}}"></span>
    <b>{{name}}<small>{{itemCount}}</small></b>
    <span class="aim-box-badges">
      {{#if hasLoad}}<span class="tc-pill is-plain {{#if load.isOver}}is-over{{/if}}" data-tooltip="{{localize 'AIM.containers.loadTooltip'}}"><i class="fa-light fa-weight-hanging"></i>{{loadDisplay}}</span>{{/if}}
      {{#if hasReduction}}<span class="tc-pill" data-tooltip="{{localize 'AIM.containers.reductionTooltip'}}"><i class="fa-light fa-feather"></i>−{{reductionPct}}%</span>{{/if}}
      {{#if weightyContainersActive}}<button type="button" class="tc-ibtn aim-edit" data-action="openContainerRules" data-container-id="{{id}}" aria-label="{{localize 'AIM.containers.rulesConfig'}}: {{name}}" data-tooltip="{{localize 'AIM.containers.rulesConfig'}}"><i class="fa-light fa-sliders"></i></button>{{/if}}
    </span>
  </div>
  {{#if hasCapacity}}<div class="tc-band aim-box-band {{#if load.isOver}}is-over{{/if}}" aria-hidden="true"><i class="tc-band-fill" data-meter="container-{{id}}" style="width: {{load.pct}}%;"></i></div>{{/if}}
  {{#unless isCollapsed}}
    <div class="aim-box-in">
      {{#each items}}{{> "modules/actor-inventory-manager/templates/parts/item-row.hbs" this}}{{/each}}
      {{#each children}}{{> "modules/actor-inventory-manager/templates/parts/container-view.hbs" this}}{{/each}}
      {{#unless itemCount}}<div class="aim-empty is-small"><i class="fa-light fa-folder-open"></i>{{localize "AIM.containers.empty"}}</div>{{/unless}}
    </div>
  {{/unless}}
</div>
```

  The `openContainerRules` button sits inside the `toggleContainer` head: ApplicationV2 dispatches the closest `[data-action]`, so the button wins — verify in `application.mjs` (`#onClickAction` uses `event.target.closest("[data-action]")`). Keyboard: in `_onRender` add a `keydown` listener on `.aim-box-head` that triggers `click()` on Enter/Space.
- [ ] **Step 4: CSS `styles/aim/inventory.css`.** Port mockup lines 271–308: `.inv` → `.aim-inv` (rows auto auto 1fr, gap 8), `.filters` → `.aim-filters`, `.list` → `.aim-list`, `.irow` → `.aim-row` (`.eq` → `.is-equipped`, `::before` hover plate, `::after` accent tick), `.thumb` → `.aim-thumb` (img fill; rarity underline `inset 0 -2px 0 var(--rarity-color, transparent)`; `.q` → `.aim-thumb-qty`; `.is-small` 32px), `.nm .l1/.l2` → `.aim-row-l1/.aim-row-l2`, `.rar` → `.aim-rar` (`color: var(--rarity-color, inherit)`), `.ctrls` → `.aim-row-ctrls` with `.tc-ibtn.is-hover { opacity: 0 }` revealed on `.aim-row:hover, .aim-row:focus-within`, `.cont` → `.aim-cont`, `.box` family → `.aim-box`/`.aim-box-head`/`.aim-box-chev`/`.aim-box-badges`/`.aim-box-band`/`.aim-box-in` (`.closed` → `.is-closed`), `.empty` → `.aim-empty` (`.is-small` padding 10px). Tabs: `.aim-tabs .tc-seg` labels hidden except the pressed one (mockup lines 180–183, using `[aria-pressed="true"]`). Over-capacity: `.is-over` uses `--tc-danger` for pill text and band fill.
- [ ] **Step 5: Check and commit**

```bash
npm run check
git add templates/parts styles/aim/inventory.css scripts lang tests
git commit -m "feat(ui): Tactile inventory list and container trays"
```

---

### Task 10: Drawers — grimoire and trade

**Files:**
- Rewrite: `templates/parts/spells-actions.hbs`, `templates/parts/trade.hbs`
- Write: `styles/aim/drawers.css`

**Interfaces:**
- Consumes (grimoire): `spellsTab`, `spellsCounts`, `appId`, `spellsSearchFilter`, `spellSlots[]` (`key,label,value,max,pips[{filled}]`), `spellGroups[]` (`title,count,isPreparedGroup,spells[]`), spell fields (`id,uuid,name,img,school,schoolLabel,schoolColor,level,levelLabel,isAlwaysPrepared,isPrepared,canTogglePrep,activationType,activationLabel,rangeDisplay,components{v,s,m,concentration,ritual}`), `actionsData.{actions,bonus,reactions,passives}[]` (`id,uuid,name,img,sourceLabel,activationType,activationLabel,hasUses,usesDisplay,hasRecharge,rechargeDisplay`), `canEdit`. Read the current `spells-actions.hbs` lines 200–302 for the reactions and passives blocks and keep every field they use.
- Consumes (trade): everything the current `templates/parts/trade.hbs` uses (`trade.*`). Keep `data-trade-money`, `data-trade-item`, `data-trade-target`, `data-trade-unsaved`, `data-trade-op` exactly — `scripts/ui/trade-panel.js` binds them (read it first).
- Must keep: `data-spells-search`, `data-action` names `switchSpellsTab`, `updateSpellSlot` (+ `data-slot-key`, `data-delta`), `toggleSpellPrep`, `useItem`, `openItem`, `toggleSpellsPanel`, `toggleTradePanel`, `tradeAction`; scroll areas `.aim-spells-scroll-area` and `.aim-trade-scroll-area` (listed in `PARTS.main.scrollable`).

- [ ] **Step 1: Grimoire template.** Structure (mockup `spellsHTML()`, lines 665–684):
  - `<div class="tc-shell aim-drawer-shell"><div class="tc-core">`
  - header `.aim-dh`: `.aim-dh-ic` (`fa-light fa-wand-magic-sparkles`), title `{{localize "AIM.spells.drawerTitle"}}`, close `tc-ibtn` `data-action="toggleSpellsPanel"`.
  - tools `.aim-dtools`: `tc-segs` with four `tc-seg` buttons (`data-action="switchSpellsTab" data-tab="all|spells|actions|passives"`, icons `fa-layer-group`, `fa-book-sparkles`, `fa-bolt`, `fa-shield-heart`, counts from `spellsCounts`, `aria-pressed` from `spellsTab`), then `tc-search` with the `data-spells-search` input (`id="{{appId}}-spells-search"`, keep `name`, `value`, `placeholder`).
  - body `.aim-dbody.aim-scroll.aim-spells-scroll-area`:
    - slots `.aim-slots` (when tab all/spells and `spellSlots.length`): per slot `.aim-srow` = `tc-lbl` label, `.aim-pips` with `tc-pip` buttons (`is-on` when filled, `data-action="updateSpellSlot" data-slot-key data-delta="-1|1"`, `aria-label` as today) or `<span class="tc-pip">` when `!canEdit`, count `value / max`.
    - spell groups: `.aim-grp` → `tc-sec` (`isPreparedGroup` gets `fa-light fa-book-bookmark`) with `{{title}} <b>{{count}}</b>`; each spell `.aim-spell` with `style="--spell-school-color: {{schoolColor}};"` `data-school="{{school}}"`, `data-flip-id="spell-{{id}}"`, drag attrs as today; children: `.aim-sthumb` (img + level badge `.aim-sthumb-lv` in the prepared group), text (`.aim-spell-l1` name + prep control: lock span when `isAlwaysPrepared`, button `.aim-prep` `data-action="toggleSpellPrep"` with `is-on` when `isPrepared` if `canTogglePrep && canEdit`, read-only span otherwise; `.aim-spell-l2`: `.aim-school` = `schoolLabel`, `tc-pill is-plain` = `activationLabel`, range, `tc-chip` per component V/S/M, `fa-light fa-brain` chip for concentration, `fa-light fa-scroll` chip for ritual), cast button `tc-ibtn aim-edit` `data-action="useItem"` (`fa-light fa-wand-magic-sparkles`).
    - actions groups (tab all/actions): `actions`, `bonus`, `reactions` each `.aim-grp` titled with `AIM.spells.actionTypes.action|bonus|reaction` and count; rows `.aim-spell` with `data-school="feat"` (thumb ring = accent), l2: `sourceLabel`, activation pill, `.aim-uses` = `usesDisplay`, recharge chip `fa-light fa-arrows-rotate` + `rechargeDisplay`; use button `fa-light fa-dice-d20`.
    - passives (tab all/passives): group titled `AIM.spells.actionTypes.passive`, rows without a button.
    - empty states as today (`aim-empty`).
- [ ] **Step 2: Trade template.** Same shell and header (`fa-light fa-handshake`, `AIM.trade.title`, close `toggleTradePanel`). Body `.aim-dbody.aim-scroll.aim-trade-scroll-area` (mockup `tradeHTML()`, lines 685–721): `.aim-tmeta` (`trade.provider` left, `<b role="status">{{trade.status}}</b>` right); notices as `.aim-unsaved` blocks with `fa-light fa-triangle-exclamation` (`role="alert"`); when `trade.session`: `.aim-partner` (`{{localize "AIM.trade.with"}} <b>{{trade.partner}}</b>`), `.aim-conf` with two `.aim-cf` (`is-ok` when confirmed; icons `fa-light fa-check` / `fa-light fa-hourglass-half`), "their offer" and "your offer" as `.aim-offer` dashed lists, then `<fieldset class="aim-tfields aim-edit" {{#unless trade.canEdit}}disabled{{/unless}}>` with an `.aim-sr` legend, `tc-sec` "Currencies", `.aim-money` grid of labels `<label><span>{{label}} <small>{{quantity}}</small></span><input type="number" … data-trade-money="{{key}}"></label>`, `tc-sec` "Items", `.aim-titem` rows (img thumb, name + available, number input `data-trade-item` styled as `.aim-qty` — keep the native number input, no +/- buttons, because `trade-panel.js` reads input events), `.aim-unsaved` with `data-trade-unsaved` and `hidden` as today; recover button as `tc-btn`. Without a session: intro hint, target `tc-select` with `data-trade-target`, start `tc-primary` (`data-action="tradeAction" data-trade-op="start"`).
  Footer `.aim-dfoot.aim-edit` (when `trade.participant`): cancel `tc-btn is-square` (`fa-light fa-xmark`, `aria-label` = `AIM.trade.cancel`), save `tc-btn` (`fa-light fa-floppy-disk` + label), confirm `tc-primary` with `.tc-primary-nest` `fa-light fa-check`; `disabled` conditions copied from the current template.
- [ ] **Step 3: CSS `styles/aim/drawers.css`.** Port mockup lines 309–376: `.drawer .core` → `.aim-drawer-shell .tc-core` (`overflow:hidden; height:100%`), `.dh` → `.aim-dh` (`.ic` → `.aim-dh-ic`), `.dtools` → `.aim-dtools`, `.dbody` → `.aim-dbody`, `.slots/.srow/.pips` → `.aim-slots/.aim-srow/.aim-pips`, `.grp` → `.aim-grp`, `.spell` → `.aim-spell` (`::before` hover plate), `.sthumb` → `.aim-sthumb` using `var(--spell-school-color, var(--tc-muted))` for colour and ring (`[data-school="feat"]` → `--tc-accent-text`), `.lv` → `.aim-sthumb-lv`, `.l1/.l2/.school` → `.aim-spell-l1/.aim-spell-l2/.aim-school`, `.prep` → `.aim-prep`, `.uses` → `.aim-uses`, `.tmeta` → `.aim-tmeta`, `.partner` → `.aim-partner`, `.conf/.cf` → `.aim-conf/.aim-cf` (`.ok` → `.is-ok`), `.offer` → `.aim-offer`, `.tfields` → `.aim-tfields`, `.money` → `.aim-money`, `.titem` → `.aim-titem`, `.qty` → `.aim-qty` (style the number input: `width:56px; height:26px; border-radius:99px; background:var(--tc-sunken); box-shadow:var(--tc-press); text-align:center; font: 600 12px var(--tc-font-mono); border:0`), `.unsaved` → `.aim-unsaved`, `.dfoot` → `.aim-dfoot`, `.sr` → `.aim-sr`. `fieldset[disabled]` inputs at `opacity:.6`.
- [ ] **Step 4: Remove the theme-swap transition hack if safe.** `grep -n "transition" styles/aim/*.css styles/tactile/*.css` — if no rule transitions `background`/`all`, delete the `aim-no-transitions` handling in `_applyTheme` (keep the attribute stamp) and any `.aim-no-transitions` CSS.
- [ ] **Step 5: Check and commit**

```bash
npm run check
git add templates/parts/spells-actions.hbs templates/parts/trade.hbs styles/aim/drawers.css scripts/ui/inventory-app.js
git commit -m "feat(ui): Tactile grimoire and trade drawers"
```

---

### Task 11: Motion in the window

**Files:**
- Modify: `scripts/ui/inventory-app.js`

**Interfaces:**
- Consumes: `countTo`, `pop`, `refuse`, `slideIn`, `captureFlip`, `playFlip` (Task 3); boolean results of item actions (Task 5); `[data-count]`, `.aim-sock`, `.aim-row[data-flip-id]`, `.aim-box[data-flip-id]`, `.aim-drawer` (Tasks 7–10).

- [ ] **Step 1: Capture before render, play after.** In `_preRender` (old DOM still present):
  ```js
  this._motionBefore = {
    hp: Number(this.element?.querySelector('[data-count="hp"]')?.textContent),
    ac: Number(this.element?.querySelector('[data-count="ac"]')?.textContent),
    slots: new Map([...(this.element?.querySelectorAll(".aim-slot[data-slot-id]") ?? [])].map(s => [s.dataset.slotId, s.querySelector("[data-item-id]")?.dataset.itemId ?? ""])),
    flip: this._flipNext ? captureFlip(this.element?.querySelector(".aim-list")) : null
  };
  this._flipNext = false;
  ```
  In `_onRender` (after `animateMeterChanges`), with `const reduce = shouldReduceMotion(window);` and `const before = this._motionBefore;` — skip everything on the first render (`options.isFirstRender`):
  - `countTo(this.element.querySelector('[data-count="hp"]'), before.hp, context.vitals.hp.value, { reduce })`; same for `ac` with `context.vitals.ac`.
  - For every `.aim-slot[data-slot-id]` whose item id differs from `before.slots`, `pop(slot.querySelector(".aim-sock"), { reduce })`.
  - `playFlip(before.flip, { reduce })`.
  - If `this._drawerJustOpened`, `slideIn(this.element.querySelector(".aim-drawer"), { reduce })` and clear the flag.
- [ ] **Step 2: Flip triggers.** Set `this._flipNext = true` in `_switchTab`, in the debounced search apply for `[data-search-input]`, and in the sort `change` handler, before `render()`.
- [ ] **Step 3: Refusals.** In `_toggleEquip` and `_toggleAttune`: `const ok = await toggleItemEquipped(...)` / `toggleAttunement(...)`; `if (ok === false) refuse(target.closest(".aim-row, .aim-asock, .aim-slot"), { reduce: shouldReduceMotion(window) });`. In `drag-drop-controller.js`, where a slot drop calls `equipItemToSlot`, do the same on the drop target's `.aim-slot` (read the file; pass `refuse` in through the app to keep the controller free of GSAP imports: `this.app._refuse?.(el)`, with `_refuse(el) { refuse(el, { reduce: shouldReduceMotion(window) }); }` on the app).
- [ ] **Step 4: Check and commit**

```bash
npm run check
git add scripts/ui/inventory-app.js scripts/ui/drag-drop-controller.js
git commit -m "feat(ui): Tactile motion — counting numbers, settling slots, flipping rows"
```

---

### Task 12: Editors and the sheet header button

**Files:**
- Rewrite: `templates/editor/paperdoll-editor.hbs`, `templates/editor/slot-config-dialog.hbs` (markup only; keep every `data-action`, `name`, `id`, form field and `data-*` the JS reads)
- Write: `styles/aim/editors.css`
- Modify: `scripts/ui/paperdoll-editor.js`, `scripts/ui/slot-config-dialog.js` (classes `tc-root`, theme + accent stamping), `scripts/foundry/sheet-injection.js` (icon)

**Interfaces:**
- Consumes: tokens/primitives (Task 2), `resolveAccent`, the `theme` setting resolution used by the main window (`resolveThemeContext` in `inventory-context.js`).

- [ ] **Step 1: Read both editor JS files and templates fully.** List every selector/`data-*`/`name` the JS uses; the new markup must keep them.
- [ ] **Step 2: Frame and theme.** Add `"tc-root"` to both apps' `DEFAULT_OPTIONS.classes`. In each `_onRender`, stamp `data-theme` from `resolveThemeContext(game.settings.get(MODULE_ID, "theme"), matchMedia("(prefers-color-scheme: light)").matches, k => game.i18n.localize(k)).theme` and set `--tc-acc-h/--tc-acc-c` from `resolveAccent(game.settings.get(MODULE_ID, "accent"))`. Use `applyTactileTheme(element)` from `scripts/ui/tactile-theme.js` (created in Task 6).
- [ ] **Step 3: Markup mapping.** Editor columns → `tc-tray` per column with a `tc-sec` header; slot cards → rows styled like `.aim-row` (icon in `.aim-thumb is-small`, title, id as `tc-chip`, actions as `tc-ibtn`s, delete `is-danger`); "add slot" → `tc-btn` full width; toolbar: template `tc-select`, action buttons `tc-btn`, apply `tc-primary`. Slot dialog: form groups as `.aim-field` (`tc-lbl` label + input styled like `.tc-search` without icon), checkboxes in a `tc-tray` list, footer `tc-btn` cancel + `tc-primary` save. All icons `fa-light`.
- [ ] **Step 4: CSS `styles/aim/editors.css`.** Frame rules for `.actor-inventory-manager-editor.tc-root` / the dialog class (read their actual `classes`) identical to the main window frame in `window.css` (extract the shared frame block into a selector list rather than duplicating). Field styles: `.aim-field input, .aim-field select, .aim-field textarea { height: 32px; padding: 0 12px; border: 0; border-radius: var(--tc-r-ctl); background: var(--tc-sunken); box-shadow: var(--tc-press); color: var(--tc-ink); }` (textarea radius 12px, auto height). Sheet header button `.aim-window-header-btn`: icon `fa-light fa-shirt`; no token-dependent styles needed beyond Foundry's `header-control`.
- [ ] **Step 5: Check and commit**

```bash
npm run check
git add templates/editor styles/aim/editors.css scripts/ui scripts/foundry/sheet-injection.js
git commit -m "feat(ui): Tactile paperdoll editor, slot dialog and header button"
```

---

### Task 13: Docs, version, live verification, release archive

**Files:**
- Modify: `docs/architecture.md`, `CHANGELOG.md`, `README.md` (only if it documents the UI or the fonts setting), `module.json`, `package.json`

- [ ] **Step 1: Docs.** `docs/architecture.md`: add a "UI and Tactile" section — where tokens/primitives/motion live (`styles/tactile/`, `scripts/tactile/`), the rule that tokens sit on `.tc-root` (window element) with `data-theme`, the four layouts from `window-layout.js` with their widths, the vendored assets and `npm run vendor`. Remove the sentence about the trade drawer using "the existing spells-column layout and theme variables" if it no longer holds. `CHANGELOG.md`: new `## 1.8.0` entry (Tactile redesign, drawer folds the paperdoll, accent setting, bundled fonts — no Google Fonts, GSAP motion, Font Awesome Light icons).
- [ ] **Step 2: Version.** `module.json` `version` → `1.8.0` and `download` URL → `v1.8.0/actor-inventory-manager-v1.8.0.zip`; `package.json` `version` → `1.8.0`. `npm run check` (manifest test validates the pair).
- [ ] **Step 3: Live verification** (world `test`, dnd5e 5.3.3). Ask the user before restarting the Foundry server (CLAUDE.md: they may be playing). Then: `npm run deploy`; restart the server (new stylesheets in `module.json`); use the Foundry QA pilot (`mcp__foundry-qa__foundry`, users "Claude" = GM, "Claude 2" = player, `as=both` where useful) to open the window for actors "Test" (paladin, spells), "Test player" (trade), "WC Test Rig" (nested Weighty Containers) and screenshot, in both themes and in Russian:
  1. default layout; 2. paperdoll strip; 3. grimoire open (doll folds), each sub-tab; 4. trade open with a session; 5. doll expanded beside a drawer on a wide and on a 1280px viewport; 6. observer (player without ownership) — no edit controls; 7. equip a two-handed weapon: off hand locks, AC counts; 8. try to equip a shield with the two-handed weapon held: refusal shake + notification; 9. attune beyond the limit: refusal; 10. tabs/search/sort: rows flip; 11. container collapse, nested container, WC rules dialog opens; 12. drag item → slot and slot → container; 13. paperdoll editor and slot dialog in both themes; 14. accent setting change re-tints open windows; 15. `useWebFonts` off → system fonts, no network requests to Google (`read_network_requests`); 16. reduced motion (OS) and Foundry performance-low → opacity-only.
  Fix every defect found (each fix: reproduce, change, `npm run check`, redeploy, re-screenshot), committing per fix.
- [ ] **Step 4: Release archive.** `npm run release` → `dist/actor-inventory-manager-v1.8.0.zip`. Confirm the zip contains `assets/fonts/*.woff2`, `scripts/vendor/gsap/*.js`, `styles/tactile/*.css`, `styles/aim/*.css` and no `styles/actor-inventory.css`.

```bash
git add -A docs CHANGELOG.md README.md module.json package.json
git commit -m "chore(release): 1.8.0"
```
