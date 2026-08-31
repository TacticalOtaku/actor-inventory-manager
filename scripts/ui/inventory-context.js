import { isBodyArmor, isShield } from "../core/item-classifier.js";
import { num } from "../core/weight-calculator.js";

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
      if (sortBy === "weight") {
        return num(b.system?.weight?.value ?? b.system?.weight, 0) - num(a.system?.weight?.value ?? a.system?.weight, 0);
      }
      if (sortBy === "value") {
        return num(b.system?.price?.value ?? b.system?.price, 0) - num(a.system?.price?.value ?? a.system?.price, 0);
      }
      if (sortBy === "rarity") {
        return (a.system?.rarity ?? "").localeCompare(b.system?.rarity ?? "");
      }
      return a.name.localeCompare(b.name);
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

export function buildAttunementSlots(items, count, formatItem) {
  const attunedItems = items.filter(item => {
    const attunement = item.system?.attunement;
    return item.system?.attuned === true ||
      attunement === 2 ||
      String(attunement).toLowerCase() === "attuned";
  });

  return Array.from({ length: count }, (_, index) => {
    const item = attunedItems[index] ?? null;
    return {
      index: index + 1,
      slotId: `attunement${index + 1}`,
      item: item ? formatItem(item) : null,
      hasItem: Boolean(item)
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
