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
