// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - SC - Item Rarity Colors Integration
// ─────────────────────────────────────────────────────────

import { ITEM_RARITY_COLORS } from "../constants.js";

export const SC_MODULE_ID = "sc-item-rarity-colors";

/**
 * Check if SC - Item Rarity Colors module is active in the world
 * @returns {boolean}
 */
export function isScRarityColorsActive() {
  return Boolean(globalThis.game?.modules?.get?.(SC_MODULE_ID)?.active);
}

/**
 * Convert a CSS colour (hex or rgb()/rgba()) to comma-separated RGB values
 * @param {string} color
 * @returns {string} e.g. "211, 84, 0"
 */
export function hexToRgb(color) {
  const fallback = "127, 140, 141";
  if (!color || typeof color !== "string") return fallback;
  const value = color.trim();

  const rgbMatch = value.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i);
  if (rgbMatch) return rgbMatch.slice(1, 4).map(n => Math.min(255, Number(n))).join(", ");

  let c = value.replace(/^#/, "");
  if (!/^[0-9a-f]+$/i.test(c)) return fallback;
  if (c.length === 3 || c.length === 4) {
    c = c.slice(0, 3).split("").map(x => x + x).join("");
  } else if (c.length === 8) {
    c = c.slice(0, 6);
  }
  if (c.length !== 6) return fallback;
  return [0, 2, 4].map(i => parseInt(c.substring(i, i + 2), 16)).join(", ");
}

/**
 * Normalize rarity identifier to handle camelCase, hyphenated, or localized custom names
 * @param {string} rarity
 * @returns {string}
 */
export function normalizeRarityKey(rarity) {
  if (!rarity || typeof rarity !== "string") return "common";
  const trimmed = rarity.trim().toLowerCase();

  // Standard D&D 5e rarities (English & Russian aliases)
  if (trimmed === "veryrare" || trimmed === "very-rare" || trimmed === "very_rare" || trimmed === "очень редкий" || trimmed === "очень_редкий") return "veryRare";
  if (trimmed === "common" || trimmed === "обычный") return "common";
  if (trimmed === "uncommon" || trimmed === "необычный") return "uncommon";
  if (trimmed === "rare" || trimmed === "редкий") return "rare";
  if (trimmed === "legendary" || trimmed === "легендарный") return "legendary";
  if (trimmed === "artifact" || trimmed === "артефакт") return "artifact";
  if (trimmed === "poor" || trimmed === "скудный" || trimmed === "хлам") return "poor";
  if (trimmed === "mythic" || trimmed === "мифический") return "mythic";
  if (trimmed === "fabled" || trimmed === "баснословный") return "fabled";
  if (trimmed === "unique" || trimmed === "уникальный") return "unique";

  return rarity.trim();
}

/**
 * SC keeps one world setting per rarity field, keyed "<rarity>-<field>" (its core/settingsManager.js
 * getRaritySetting), trying the normalized rarity, then the raw one, then the raw one lowercased.
 * @param {string} rarity
 * @param {string} field e.g. "item-color", "enable-item-color"
 * @returns {*} the setting value, or undefined when SC has no such setting
 */
function readScRaritySetting(rarity, field) {
  const settings = globalThis.game?.settings;
  const raw = String(rarity ?? "").trim();
  for (const key of new Set([normalizeRarityKey(rarity), raw, raw.toLowerCase()])) {
    const id = `${SC_MODULE_ID}.${key}-${field}`;
    if (key && settings?.settings?.has?.(id)) return settings.get(SC_MODULE_ID, `${key}-${field}`);
  }
  return undefined;
}

// The colour SC shows for a rarity or school: the first of its colours the GM has switched on.
const SC_COLOR_FIELDS = [["enable-item-color", "item-color"], ["enable-inventory-border-color", "inventory-border-color"], ["enable-inventory-title-color", "inventory-title-color"]];
function pickScColor(read) {
  for (const [toggle, field] of SC_COLOR_FIELDS) {
    const color = read(toggle) === true ? read(field) : null;
    if (typeof color === "string" && color) return color;
  }
  return null;
}

/**
 * SC's spell school styles live in one world setting, "spell-school-styles":
 * { useLevelVariants, profiles: { school_<school>: fields, school_<school>_lvl_<level>: fields } }
 * (its core/spellSchoolConfig.js). A level profile falls back to the school profile.
 * @param {string} school dnd5e school key (abj, con, div, enc, evo, ill, nec, trs)
 * @param {number} level
 * @returns {object|null} the profile's fields
 */
function readScSpellProfile(school, level) {
  const settings = globalThis.game?.settings;
  if (!settings?.settings?.has?.(`${SC_MODULE_ID}.spell-school-styles`)) return null;
  const styles = settings.get(SC_MODULE_ID, "spell-school-styles");
  const profiles = styles?.profiles ?? {};
  const levelKey = styles?.useLevelVariants === true && Number.isInteger(level) ? `school_${school}_lvl_${level}` : null;
  return (levelKey && profiles[levelKey]) || profiles[`school_${school}`] || null;
}

/**
 * Resolved colours are stable for the lifetime of a render pass but must not
 * outlive a settings change, so the cache is versioned and cleared on demand.
 */
const RARITY_COLOR_CACHE = new Map();

/** Drop memoized rarity/school colours (call when SC settings or the theme change). */
export function invalidateRarityColorCache() {
  RARITY_COLOR_CACHE.clear();
}

/**
 * Memoized wrapper around {@link resolveRarityColor}.
 * Resolution walks module settings and computed CSS variables, which is far too
 * expensive to repeat for every item on every re-render.
 * @param {string} rarity
 * @returns {string}
 */
export function getRarityColor(rarity) {
  const normKey = normalizeRarityKey(rarity);
  // SC colours are per rarity, never per item.
  if (RARITY_COLOR_CACHE.has(normKey)) return RARITY_COLOR_CACHE.get(normKey);
  const color = resolveRarityColor(rarity);
  RARITY_COLOR_CACHE.set(normKey, color);
  return color;
}

/**
 * Get the color associated with an item rarity, prioritizing SC - Item Rarity Colors,
 * then CONFIG.DND5E.itemRarity, then CSS variables, and finally default fallbacks.
 * @param {string} rarity
 * @returns {string} Hex or CSS color string
 */
function resolveRarityColor(rarity) {
  const normKey = normalizeRarityKey(rarity);

  // 1. SC - Item Rarity Colors, when the GM has switched a colour on for this rarity
  if (isScRarityColorsActive()) {
    const scColor = pickScColor(field => readScRaritySetting(rarity, field));
    if (scColor) return scColor;
  }

  // 2. Check CONFIG.DND5E.itemRarity (populated by dnd5e, Custom DND5E, or SC)
  const dndConfigRarity = globalThis.CONFIG?.DND5E?.itemRarity;
  if (dndConfigRarity) {
    const entry = dndConfigRarity[normKey] || dndConfigRarity[rarity];
    if (typeof entry === "object" && entry !== null && typeof entry.color === "string") {
      return entry.color;
    }
  }

  // 3. Check CSS Variables defined on document
  if (typeof globalThis.document !== "undefined" && typeof globalThis.getComputedStyle === "function") {
    try {
      const rootStyle = globalThis.getComputedStyle(globalThis.document.documentElement);
      const varNames = [
        `--sc-rarity-${normKey}`,
        `--sc-rarity-${rarity}`,
        `--rarity-${normKey}`,
        `--color-rarity-${normKey}`
      ];
      for (const vn of varNames) {
        const cssVal = rootStyle.getPropertyValue(vn)?.trim();
        if (cssVal && cssVal.length > 0) return cssVal;
      }
    } catch {
      // Fall through
    }
  }

  // 4. Fallback dictionary
  return ITEM_RARITY_COLORS[normKey] ?? ITEM_RARITY_COLORS[rarity] ?? ITEM_RARITY_COLORS.common;
}

/**
 * Determine if a rarity should have a glow effect (e.g. Legendary, Artifact, or SC enabled)
 * @param {string} rarity
 * @returns {boolean}
 */
export function hasRarityGlow(rarity) {
  const normKey = normalizeRarityKey(rarity);
  if (normKey === "legendary" || normKey === "artifact" || normKey === "mythic") return true;

  if (isScRarityColorsActive() && readScRaritySetting(rarity, "glow-option") === true) return true;

  return false;
}

/**
 * Get full visual presentation details for an item based on its rarity
 * @param {string} rarity
 * @returns {{ color: string, rgb: string, glowColor: string, hasGlow: boolean, rarityKey: string, cssVars: string }}
 */
export function getItemRarityVisuals(rarity) {
  const color = getRarityColor(rarity);
  const rgb = hexToRgb(color);
  const glow = hasRarityGlow(rarity);
  const normKey = normalizeRarityKey(rarity);

  // color-mix works for every CSS colour format, unlike appending an alpha to a hex.
  const cssVars = [
    `--rarity-color: ${color}`,
    `--rarity-rgb: ${rgb}`,
    `--rarity-glow: color-mix(in srgb, ${color} 50%, transparent)`,
    `--rarity-glow-soft: color-mix(in srgb, ${color} 35%, transparent)`
  ].join("; ") + ";";

  return {
    color,
    rgb,
    glowColor: color,
    hasGlow: glow,
    rarityKey: normKey,
    cssVars
  };
}

/**
 * The colour SC - Item Rarity Colors itself gives a rarity, or null when it is off or the GM left that rarity's
 * colours switched off; the window then keeps its own palette (`--rarity-*` tokens) instead of a fallback.
 * @param {string} rarity
 * @returns {string|null}
 */
export function scRarityColor(rarity) {
  if (!isScRarityColorsActive() || !rarity) return null;
  return pickScColor((field) => readScRaritySetting(rarity, field)) || null;
}

/**
 * The colour SC gives a spell school (per level with its level variants), or null when it gives none; the window
 * then keeps its own school palette (`--school-*` tokens).
 * @param {string} school
 * @param {number} [level=0]
 * @returns {string|null}
 */
export function scSchoolColor(school, level = 0) {
  if (!isScRarityColorsActive() || !school) return null;
  const profile = readScSpellProfile(school.toLowerCase().trim(), Number(level));
  return (profile && pickScColor((field) => profile[field])) || null;
}
