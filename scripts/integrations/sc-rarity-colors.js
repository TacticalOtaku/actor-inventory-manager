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
 * Convert HEX color string to RGB comma-separated values
 * @param {string} hex
 * @returns {string} e.g. "211, 84, 0"
 */
export function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return "127, 140, 141";
  let c = hex.replace("#", "").trim();
  if (c.length === 3) {
    c = c.split("").map(x => x + x).join("");
  }
  if (c.length === 6) {
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return `${r}, ${g}, ${b}`;
    }
  }
  return "127, 140, 141";
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
 * Get the color associated with an item rarity, prioritizing SC - Item Rarity Colors,
 * then CONFIG.DND5E.itemRarity, then CSS variables, and finally default fallbacks.
 * @param {string} rarity
 * @param {Object} [item]
 * @returns {string} Hex or CSS color string
 */
export function getRarityColor(rarity, item = null) {
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

  const cssVars = [
    `--rarity-color: ${color}`,
    `--rarity-rgb: ${rgb}`,
    `--rarity-glow: rgba(${rgb}, 0.5)`
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

      const scSpellColors = globalThis.game?.settings?.get?.(SC_MODULE_ID, "spell-colors");
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
