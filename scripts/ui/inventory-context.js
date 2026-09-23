import { isItemAttuned } from "../core/attunement.js";
import { isBodyArmor, isShield } from "../core/item-classifier.js";
import { getItemWeightLbs, num } from "../core/weight-calculator.js";
import { normalizeRarityKey } from "../integrations/sc-rarity-colors.js";

/** Rarity rank for sorting, rarest first. Unknown and mundane items sort last. */
const RARITY_RANK = {
  poor: 0, common: 1, uncommon: 2, rare: 3, veryRare: 4, legendary: 5, artifact: 6, mythic: 7, fabled: 7, unique: 8
};

/** Coins per gold piece when CONFIG.DND5E.currencies is unavailable. */
const DEFAULT_COIN_CONVERSION = { pp: 0.1, gp: 1, ep: 2, sp: 10, cp: 100 };

function rarityRank(item) {
  const rarity = item.system?.rarity;
  if (!rarity) return -1;
  return RARITY_RANK[normalizeRarityKey(rarity)] ?? -1;
}

/** Unit price in gold pieces, so 1 pp outranks 5 gp. */
function priceInGold(item) {
  const price = item.system?.price;
  const value = num(price?.value ?? price, 0);
  const denomination = price?.denomination ?? "gp";
  const conversion = num(globalThis.CONFIG?.DND5E?.currencies?.[denomination]?.conversion, DEFAULT_COIN_CONVERSION[denomination] ?? 1);
  return conversion > 0 ? value / conversion : value;
}

export function isArmorInventoryItem(item) {
  return item.type === "equipment" && (
    isBodyArmor(item) ||
    isShield(item) ||
    !["trinket", "vehicle"].includes(item.system?.type?.value)
  );
}

export function isLootInventoryItem(item) {
  return item.type === "loot" ||
    item.type === "tool" ||
    (item.type === "equipment" && item.system?.type?.value === "trinket");
}

function matchesInventoryTab(item, tab) {
  if (tab === "weapons") return item.type === "weapon";
  if (tab === "armor") return isArmorInventoryItem(item);
  if (tab === "consumables") return item.type === "consumable";
  if (tab === "containers") {
    return item.type === "container" || item.type === "backpack" || item.system?.type?.value === "container";
  }
  if (tab === "loot") return isLootInventoryItem(item);
  return true;
}

export function filterAndSortInventoryItems(items, { tab = "all", search = "", sortBy = "name" } = {}) {
  const query = search.toLowerCase();
  return items
    .filter(item => matchesInventoryTab(item, tab))
    .filter(item => !query || item.name.toLowerCase().includes(query))
    .sort((a, b) => {
      let order = 0;
      if (sortBy === "weight") order = getItemWeightLbs(b) - getItemWeightLbs(a);
      else if (sortBy === "value") order = priceInGold(b) - priceInGold(a);
      else if (sortBy === "rarity") order = rarityRank(b) - rarityRank(a);
      return order || a.name.localeCompare(b.name);
    });
}

export function buildInventoryCounts(items, containers) {
  return {
    all: items.length,
    weapons: items.filter(item => item.type === "weapon").length,
    armor: items.filter(isArmorInventoryItem).length,
    consumables: items.filter(item => item.type === "consumable").length,
    containers: containers.length,
    loot: items.filter(isLootInventoryItem).length
  };
}

/**
 * Attunement sockets: one per allowed attunement, plus one per item attuned
 * beyond the limit so no attuned item is ever hidden.
 */
export function buildAttunementSlots(items, count, formatItem) {
  const attunedItems = items.filter(isItemAttuned);
  const length = Math.max(Math.max(0, count), attunedItems.length);

  return Array.from({ length }, (_, index) => {
    const item = attunedItems[index] ?? null;
    return {
      index: index + 1,
      slotId: `attunement${index + 1}`,
      item: item ? formatItem(item) : null,
      hasItem: Boolean(item),
      isOverLimit: index >= count
    };
  });
}

export function buildSpellsCounts(spellGroups, actionsData) {
  const spells = spellGroups.reduce((total, group) => total + group.count, 0);
  const actions = actionsData.actions.length + actionsData.bonus.length + actionsData.reactions.length;
  const passives = actionsData.passives.length;
  return { all: spells + actions + passives, spells, actions, passives };
}

export function resolveThemeContext(settingTheme, prefersLight, localize) {
  const theme = settingTheme === "auto" ? (prefersLight ? "light" : "dark") : settingTheme;
  const isDark = theme === "dark";
  return {
    theme,
    isDark,
    isLight: theme === "light",
    themeIcon: isDark ? "fa-solid fa-moon" : "fa-solid fa-sun",
    themeTooltip: localize(isDark ? "AIM.theme.switchToLight" : "AIM.theme.switchToDark")
  };
}
