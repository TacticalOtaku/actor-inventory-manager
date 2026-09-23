const TOKEN_PATTERNS = new Map();

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does `name` contain `token` as a whole word?
 *
 * Plain substring matching misfires constantly on item names ("band" in
 * "Bandage", "hat" in "Chatelaine", "rod" in "Prodigy"). A token must start at a
 * word boundary and may only carry an inflection: an English plural (`s`/`es`)
 * or a short Russian case ending (Russian tokens are written as stems).
 * @param {string} name
 * @param {string} token
 * @returns {boolean}
 */
export function nameHasToken(name, token) {
  if (!name || !token) return false;
  let pattern = TOKEN_PATTERNS.get(token);
  if (!pattern) {
    const isCyrillic = /[Ѐ-ӿ]/.test(token);
    const suffix = isCyrillic ? "\\p{L}{0,4}" : "(?:s|es)?";
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(token.toLowerCase())}${suffix}(?![\\p{L}\\p{N}])`, "iu");
    TOKEN_PATTERNS.set(token, pattern);
  }
  return pattern.test(name);
}

/**
 * @param {string} name
 * @param {Array<string>} tokens
 * @returns {boolean}
 */
export function nameHasAnyToken(name, tokens) {
  return tokens.some(token => nameHasToken(name, token));
}

function matchesDescriptor(descriptor, rule) {
  return rule.systemTypes?.includes(descriptor.systemType) ||
    rule.subTypes?.includes(descriptor.subType) ||
    nameHasAnyToken(descriptor.name, rule.nameIncludes ?? []);
}

function firstMatchingCategory(descriptor, rules) {
  return rules.find(rule => matchesDescriptor(descriptor, rule))?.category ?? null;
}

const PRE_ARMOR_RULES = [
  {
    category: "legs",
    systemTypes: ["pants", "legs", "trousers"],
    subTypes: ["pants", "legs"],
    nameIncludes: ["pants", "trousers", "breeches", "leggings", "штан", "брюк", "порты", "шорт", "рейтуз", "чулк"]
  },
  {
    category: "bracelet",
    systemTypes: ["bracelet", "wrist"],
    subTypes: ["bracelet", "wrist"],
    nameIncludes: ["bracelet", "wristband", "браслет", "запясть", "напульсник"]
  },
  {
    category: "underarmor",
    systemTypes: ["underarmor", "shirt"],
    subTypes: ["underarmor"],
    nameIncludes: ["underarmor", "shirt", "tunic", "gambeson", "поддоспешник", "рубах", "рубашк", "гамбезон", "туник", "жилет"]
  },
  {
    category: "badge",
    systemTypes: ["badge", "medal"],
    subTypes: ["badge"],
    nameIncludes: ["медал", "орден", "наград", "нашивк", "лент", "значок", "значк", "badge", "medal", "ribbon"]
  }
];

const WEARABLE_RULES = [
  {
    category: "head",
    systemTypes: ["helmet", "head"],
    subTypes: ["helmet", "head"],
    nameIncludes: ["helmet", "helm", "circlet", "headband", "hat", "hood", "crown", "mask", "шлем", "венец", "венц", "диадем", "капюшон", "маск", "корон", "шапк", "шляп"]
  },
  {
    category: "neck",
    systemTypes: ["neck", "amulet", "necklace"],
    subTypes: ["amulet", "necklace"],
    nameIncludes: ["amulet", "necklace", "pendant", "medallion", "periapt", "collar", "амулет", "ожерель", "кулон", "медальон", "периапт"]
  },
  {
    category: "cloak",
    systemTypes: ["cloak", "cape", "mantle"],
    subTypes: ["cloak", "cape"],
    nameIncludes: ["cloak", "cape", "mantle", "shawl", "плащ", "накидк", "манти", "пелерин", "верхняя одежда"]
  },
  {
    category: "hands",
    systemTypes: ["hands", "gloves", "gauntlets", "bracers"],
    subTypes: ["gloves", "gauntlets"],
    nameIncludes: ["glove", "gauntlet", "bracer", "handwrap", "перчатк", "наруч", "рукавиц"]
  },
  {
    category: "waist",
    systemTypes: ["waist", "belt", "girdle"],
    subTypes: ["belt"],
    nameIncludes: ["belt", "girdle", "sash", "cinch", "пояс", "кушак", "ремень", "ремн"]
  },
  {
    category: "feet",
    systemTypes: ["feet", "boots", "shoes", "greaves"],
    subTypes: ["boots", "shoes"],
    nameIncludes: ["boot", "shoe", "greave", "slipper", "sandal", "сапог", "ботин", "туфл", "понож", "обув"]
  },
  {
    category: "ring",
    systemTypes: ["ring"],
    subTypes: ["ring"],
    nameIncludes: ["ring", "band", "signet", "кольц", "перстень", "перстн"]
  }
];

const FOCUS_RULE = {
  systemTypes: ["wand", "rod", "staff", "focus"],
  nameIncludes: ["wand", "rod", "staff", "focus", "палочк", "жезл", "посох", "фокус"]
};

export function matchPreArmorClassification(descriptor) {
  return firstMatchingCategory(descriptor, PRE_ARMOR_RULES);
}

export function matchWearableClassification(descriptor) {
  return firstMatchingCategory(descriptor, WEARABLE_RULES);
}

export function matchesFocusClassification(descriptor) {
  return Boolean(matchesDescriptor(descriptor, FOCUS_RULE));
}
