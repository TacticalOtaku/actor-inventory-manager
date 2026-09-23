// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - SC - Item Rarity Colors Integration
// ─────────────────────────────────────────────────────────

import { ITEM_RARITY_COLORS, SPELL_SCHOOL_COLORS } from "../constants.js";

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
 * @param {Object} [item]
 * @returns {string}
 */
export function getRarityColor(rarity, item = null) {
  const normKey = normalizeRarityKey(rarity);
  // Items only affect the result through the SC API, which is keyed by rarity.
  if (RARITY_COLOR_CACHE.has(normKey)) return RARITY_COLOR_CACHE.get(normKey);
  const color = resolveRarityColor(rarity, item);
  RARITY_COLOR_CACHE.set(normKey, color);
  return color;
}

/**
 * Get the color associated with an item rarity, prioritizing SC - Item Rarity Colors,
 * then CONFIG.DND5E.itemRarity, then CSS variables, and finally default fallbacks.
 * @param {string} rarity
 * @param {Object} [item]
 * @returns {string} Hex or CSS color string
 */
function resolveRarityColor(rarity, item = null) {
  const normKey = normalizeRarityKey(rarity);

  // 1. Check SC - Item Rarity Colors API if exposed
  if (isScRarityColorsActive()) {
    try {
      const scModule = globalThis.game?.modules?.get?.(SC_MODULE_ID);
      if (typeof scModule?.api?.getRarityColor === "function") {
        const scColor = scModule.api.getRarityColor(normKey, item);
        if (scColor) return scColor;
      }
      if (typeof globalThis.scItemRarityColors?.getColor === "function") {
        const scColor = globalThis.scItemRarityColors.getColor(normKey, item);
        if (scColor) return scColor;
      }
    } catch {
      // Ignore errors and fall through
    }

    // Check SC module registered settings
    try {
      const settingsKeys = ["rarity-colors", "rarities", "colors", "custom-rarities"];
      for (const sk of settingsKeys) {
        // game.settings.get throws for unregistered keys - skip those quietly.
        if (!globalThis.game?.settings?.settings?.has?.(`${SC_MODULE_ID}.${sk}`)) continue;
        const val = globalThis.game?.settings?.get?.(SC_MODULE_ID, sk);
        if (val && typeof val === "object") {
          const directMatch = val[normKey] || val[rarity];
          if (typeof directMatch === "string") return directMatch;
          if (typeof directMatch?.color === "string") return directMatch.color;
          if (Array.isArray(val)) {
            const found = val.find(r => (r.id === normKey || r.key === normKey || r.name === normKey || r.label === normKey));
            if (found?.color) return found.color;
          }
        }
      }
    } catch {
      // Fall through
    }
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

  if (isScRarityColorsActive()) {
    try {
      const dndConfigRarity = globalThis.CONFIG?.DND5E?.itemRarity;
      const entry = dndConfigRarity?.[normKey];
      if (entry?.glow === true || entry?.glowColor) return true;
    } catch {
      // Fall through
    }
  }

  return false;
}

/**
 * Get full visual presentation details for an item based on its rarity
 * @param {string} rarity
 * @param {Object} [item]
 * @returns {{ color: string, rgb: string, glowColor: string, hasGlow: boolean, rarityKey: string, cssVars: string }}
 */
export function getItemRarityVisuals(rarity, item = null) {
  const color = getRarityColor(rarity, item);
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
 * Get spell school color with SC - Item Rarity Colors & system config support
 * @param {string} school
 * @param {number} [level=0]
 * @param {Object} [defaultColors={}]
 * @returns {string}
 */
export function getSpellSchoolColor(school, level = 0, defaultColors = {}) {
  if (!school) return "#3498db";
  const s = school.toLowerCase().trim();

  // 1. Check SC module spell settings / CONFIG.DND5E
  if (isScRarityColorsActive()) {
    try {
      const spellConfig = globalThis.CONFIG?.DND5E?.spellSchools;
      if (spellConfig?.[s]?.color) return spellConfig[s].color;

      const scSpellColors = globalThis.game?.settings?.settings?.has?.(`${SC_MODULE_ID}.spell-colors`)
        ? globalThis.game.settings.get(SC_MODULE_ID, "spell-colors")
        : null;
      if (scSpellColors?.[s]) {
        return typeof scSpellColors[s] === "string" ? scSpellColors[s] : scSpellColors[s].color;
      }
    } catch {
      // Fall through
    }
  }

  const dndConfig = globalThis.CONFIG?.DND5E?.spellSchools;
  if (dndConfig?.[s]?.color) return dndConfig[s].color;

  const fallbackMap = defaultColors && Object.keys(defaultColors).length > 0 ? defaultColors : SPELL_SCHOOL_COLORS;
  return fallbackMap[s] ?? "#3498db";
}

/**
 * Get spell school visuals with CSS variables for gradients and styling
 * @param {string} school
 * @param {number} [level=0]
 * @param {Object} [defaultColors={}]
 * @returns {{ color: string, rgb: string, cssVars: string }}
 */
export function getSpellSchoolVisuals(school, level = 0, defaultColors = {}) {
  const color = getSpellSchoolColor(school, level, defaultColors);
  const rgb = hexToRgb(color);
  const cssVars = `--spell-school-color: ${color}; --spell-school-rgb: ${rgb};`;
  return { color, rgb, cssVars };
}
