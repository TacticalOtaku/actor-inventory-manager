function matchesDescriptor(descriptor, rule) {
  return rule.systemTypes?.includes(descriptor.systemType) ||
    rule.subTypes?.includes(descriptor.subType) ||
    rule.nameIncludes?.some(token => descriptor.name.includes(token));
}

function firstMatchingCategory(descriptor, rules) {
  return rules.find(rule => matchesDescriptor(descriptor, rule))?.category ?? null;
}

const PRE_ARMOR_RULES = [
  {
    category: "legs",
    systemTypes: ["pants", "legs", "trousers"],
    subTypes: ["pants", "legs"],
    nameIncludes: ["pants", "trousers", "breeches", "leggings", "штаны", "брюки", "порты", "шорты", "рейтузы", "чулки"]
  },
  {
    category: "bracelet",
    systemTypes: ["bracelet", "wrist"],
    subTypes: ["bracelet", "wrist"],
    nameIncludes: ["bracelet", "wrist", "браслет", "браслеты", "запястье", "напульсник"]
  },
  {
    category: "underarmor",
    systemTypes: ["underarmor", "shirt"],
    subTypes: ["underarmor"],
    nameIncludes: ["underarmor", "поддоспешник", "рубаха", "рубашка", "гамбезон", "туника", "жилет"]
  },
  {
    category: "badge",
    systemTypes: ["badge", "medal"],
    subTypes: ["badge"],
    nameIncludes: ["медаль", "орден", "награда", "нашивка", "лента", "значок", "badge", "medal", "ribbon"]
  }
];

const WEARABLE_RULES = [
  {
    category: "head",
    systemTypes: ["helmet", "head"],
    subTypes: ["helmet", "head"],
    nameIncludes: ["helmet", "helm", "circlet", "hood", "crown", "mask", "шлем", "венец", "диадема", "капюшон", "маска", "корона", "шапка"]
  },
  {
    category: "neck",
    systemTypes: ["neck", "amulet", "necklace"],
    subTypes: ["amulet", "necklace"],
    nameIncludes: ["amulet", "necklace", "pendant", "medallion", "periapt", "collar", "амулет", "ожерелье", "кулон", "медальон", "периапт"]
  },
  {
    category: "cloak",
    systemTypes: ["cloak", "cape", "mantle"],
    subTypes: ["cloak", "cape"],
    nameIncludes: ["cloak", "cape", "mantle", "shawl", "плащ", "накидка", "мантия", "пелерина", "верхняя одежда"]
  },
  {
    category: "hands",
    systemTypes: ["hands", "gloves", "gauntlets", "bracers"],
    subTypes: ["gloves", "gauntlets"],
    nameIncludes: ["glove", "gauntlet", "bracer", "handwrap", "перчатки", "наручи", "рукавицы"]
  },
  {
    category: "waist",
    systemTypes: ["waist", "belt", "girdle"],
    subTypes: ["belt"],
    nameIncludes: ["belt", "girdle", "sash", "cinch", "пояс", "кушак", "ремень"]
  },
  {
    category: "feet",
    systemTypes: ["feet", "boots", "shoes", "greaves"],
    subTypes: ["boots", "shoes"],
    nameIncludes: ["boot", "shoe", "greave", "slipper", "sandal", "сапоги", "ботинки", "туфли", "поножи", "обувь"]
  },
  {
    category: "ring",
    systemTypes: ["ring"],
    subTypes: ["ring"],
    nameIncludes: ["ring", "band", "signet", "кольцо", "перстень"]
  }
];

const FOCUS_RULE = {
  systemTypes: ["wand", "rod", "staff", "focus"],
  nameIncludes: ["wand", "rod", "staff", "focus", "палочка", "жезл", "посох", "фокус"]
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
