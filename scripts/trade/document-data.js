/** Compare serialized document data by value, not object property insertion order. */
export function canonicalJSON(value) {
  return JSON.stringify(value, (key, current) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return current;
    return Object.fromEntries(Object.keys(current).sort().map(name => [name, current[name]]));
  });
}

export function documentFingerprint(data) {
  const { _stats, sort, ...assets } = data;
  return canonicalJSON(assets);
}

/** Older recovery journals may contain expanded dot-notation attribute paths. */
export function recoveryAttributes(attributes, prefix = "") {
  return Object.fromEntries(Object.entries(attributes).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(recoveryAttributes(value, path)) : [[path, value]];
  }));
}
