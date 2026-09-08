// Render actual Handlebars templates with fictional fixture data, without a Foundry world.
// node tools/preview-trade.mjs <handlebars.cjs> <output-directory> <playwright-directory>
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const H = require(resolve(process.argv[2]));
const out = resolve(process.argv[3]);
const { chromium } = require(resolve(process.argv[4]));
await mkdir(out, { recursive: true });
const root = resolve(import.meta.dirname, "..");
const lang = JSON.parse(await readFile(join(root, "lang/ru.json"), "utf8"));
H.registerHelper("localize", key => typeof key === "string" ? key.split(".").reduce((o, k) => o?.[k], lang) ?? key : "");
for (const [key, fn] of Object.entries({ eq: (a, b) => a === b, ne: (a, b) => a !== b, gt: (a, b) => a > b, lt: (a, b) => a < b })) H.registerHelper(key, fn);
H.registerHelper("or", (...args) => args.slice(0, -1).some(Boolean));
H.registerHelper("and", (...args) => args.slice(0, -1).every(Boolean));
for (const file of await readdir(join(root, "templates/parts"))) {
  if (file.endsWith(".hbs")) H.registerPartial(`modules/actor-inventory-manager/templates/parts/${file}`, await readFile(join(root, "templates/parts", file), "utf8"));
}
const template = H.compile(await readFile(join(root, "templates/inventory-app.hbs"), "utf8"));
const css = (await readFile(join(root, "styles/actor-inventory.css"), "utf8")).replace(/^@import.*$/gm, "");
const icon = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="8" fill="#243246"/><path d="M26 14h12v10l8 20q2 7-5 7H23q-7 0-5-7l8-20z" fill="#bc9861"/></svg>');
const context = {
  actor: { name: "Элиана", img: icon }, vitals: { name: "Элиана", img: icon, race: "Полуэльф", classSummary: "Плут · 5 уровень", hp: { value: 32, max: 38, pct: 84 }, ac: 16, init: "+4", speed: 30, attunement: { value: 0, max: 3 }, currency: { gp: 24, sp: 8, formatted: "24.80 GP" } },
  counts: { all: 3, weapons: 1, armor: 1, consumables: 1, containers: 0, loot: 0 },
  items: [{ id: "potion", name: "Зелье лечения", quantity: 4, hasMultiple: true, img: icon, type: "consumable", rarity: "common", rarityColor: "#bc9861", weightDisplay: "0.5", priceDisplay: "50 GP" }],
  currentTab: "all", sortBy: "name", isPaperdollCollapsed: true, isSidePanelOpen: true, isTradePanelOpen: true,
  trade: { available: true, provider: "Item Piles", hasGM: true, session: {}, participant: true, partner: "Торвин", status: "Согласование", mineConfirmed: false, theirsConfirmed: true,
    myItems: [{ name: "Зелье лечения", quantity: 2 }], otherItems: [], otherMoney: [{ label: "Кроны", amount: 40 }],
    items: [{ id: "potion", name: "Зелье лечения", img: icon, available: 4, quantity: 2 }, { id: "dagger", name: "Кинжал из серебра", img: icon, available: 1, quantity: 0 }],
    money: [{ key: "0", label: "Кроны", quantity: 24, amount: 0, step: "any" }, { key: "1", label: "Медные марки", quantity: 8, amount: 0, step: "any" }], canEdit: true, canConfirm: true, canSave: false }
};
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  for (const theme of ["dark", "light"]) {
    const content = template(context);
    assert(!content.includes("AIM.trade."), "All trade copy must be localized");
    const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Trade panel fixture</title><style>*{box-sizing:border-box}body{margin:0;background:#262930;padding:26px;font-family:Georgia,serif}button,input,select{font:inherit}button{min-height:28px} ${css} .preview{height:720px;width:1160px;max-width:calc(100vw - 80px)}.preview .window-content{height:100%;max-height:100%}</style><body><div class="preview application actor-inventory-manager-app" data-theme="${theme}"><div class="window-content">${content}</div></div></body></html>`;
    const path = join(out, `trade-${theme}.html`);
    await writeFile(path, html);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(pathToFileURL(path).href);
    const overflow = await page.locator(".aim-trade-column").evaluate(el => el.scrollWidth > el.clientWidth);
    assert.equal(overflow, false, "Trade panel must not overflow horizontally");
    assert(await page.locator('[data-trade-op="confirm"]').isEnabled());
    assert(await page.locator('[data-trade-op="offer"]').isDisabled());
    await page.screenshot({ path: join(out, `trade-${theme}.png`), fullPage: true });
    await page.setViewportSize({ width: 1024, height: 800 });
    const fitsNarrow = await page.locator(".aim-trade-column").evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.right <= innerWidth && el.scrollWidth <= el.clientWidth;
    });
    assert(fitsNarrow, "Trade drawer must fit on a narrow screen");
    await page.screenshot({ path: join(out, `trade-${theme}-narrow.png`), fullPage: true });
    await page.close();
  }
} finally { await browser.close(); }
console.log(`Rendered both themes and checked panel overflow and confirmation controls: ${out}`);
