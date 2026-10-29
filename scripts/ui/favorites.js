// ─────────────────────────────────────────────────────────
// AIM: Actor Window - favorites in the rail, stored in dnd5e's system.favorites
// ─────────────────────────────────────────────────────────

import { groupFavorites } from "../core/favorites.js";
import { readFavorites } from "../integrations/dnd5e.js";
import { automationOnly } from "../integrations/midi-qol.js";
import { t } from "./html.js";
import { signed } from "../core/overview.js";

/** More uses than this show as a number. */
const MAX_PIPS = 8;


/** dnd5e keeps favorites on characters only. */
export const hasFavorites = (actor) => actor.type === "character";

/** The relative UUID dnd5e stores an item favorite under. */
export const favoriteIdFor = (actor, item) => item.getRelativeUUID(actor);

/** Item ids among the actor's favorites, for the stars on the rows. */
export function favoriteItemIds(actor) {
  if (!hasFavorites(actor)) return new Set();
  return new Set((actor.system.favorites ?? []).filter((f) => f.type === "item").map((f) => f.id.split(".").pop()));
}

/** The line under a favorite's name and what sits on its right. */
function describe(entry) {
  const subtitle = Array.isArray(entry.subtitle) ? entry.subtitle.filter(Boolean).join(" · ") : entry.subtitle ?? "";
  let line = subtitle;
  if (entry.type === "skill" || entry.type === "tool") line = t("AIM.window.favorites.check", { bonus: signed(entry.modifier) });
  else if (entry.type === "slots") line = t("AIM.window.favorites.slotsLeft", { value: entry.uses.value, max: entry.uses.max });
  else if (entry.type === "effect") line = entry.suppressed ? t("AIM.window.favorites.suppressed") : t(entry.toggle === false ? "AIM.window.favorites.off" : "AIM.window.favorites.on");
  else if (entry.modifier !== undefined && entry.modifier !== "") {
    // dnd5e gives the to-hit as a number or a formula; a bare number gets its sign.
    const bonus = Number.isFinite(Number(entry.modifier)) ? signed(entry.modifier) : entry.modifier;
    line = [t("AIM.window.favorites.toHit", { bonus }), subtitle].filter(Boolean).join(" · ");
  }
  else if (entry.saveDc) line = [t("AIM.window.favorites.save", { dc: entry.saveDc }), subtitle].filter(Boolean).join(" · ");
  const uses = entry.uses?.max ? { value: Math.round(entry.uses.value ?? 0), max: entry.uses.max } : null;
  return {
    line,
    runes: entry.level ? Array.from({ length: entry.level }) : null,
    quantity: entry.quantity > 1 ? entry.quantity : null,
    usePips: uses && uses.max <= MAX_PIPS ? Array.from({ length: uses.max }, (_, i) => ({ lit: i < uses.value })) : null,
    usesText: uses && uses.max > MAX_PIPS ? `${uses.value}/${uses.max}` : null
  };
}

/** The rail's favorites block: groups by action cost, the manual order inside each. */
export async function buildFavoritesContext(actor, { canEdit }) {
  if (!hasFavorites(actor)) return { show: false };
  // An activity midi-qol keeps for its automation is no favorite to use by hand (ADR 0003).
  const shown = (await readFavorites(actor)).filter((entry) => entry.type !== "activity" || !automationOnly(fromUuidSync(entry.id, { relative: actor })));
  const entries = shown.map((entry) => {
    const quick = entry.itemType === "spell" ? "cast" : (entry.type === "item" || entry.type === "activity") ? "use" : null;
    return {
      ...entry,
      ...describe(entry),
      key: `fav:${entry.id}`,
      title: entry.type === "slots"
        ? (entry.id === "pact" ? t("AIM.window.favorites.pactSlots") : t("AIM.window.favorites.slots", { level: entry.level }))
        : entry.title,
      quick: canEdit && quick ? { kind: quick, label: t(quick === "cast" ? "AIM.window.spells.cast" : "AIM.window.inv.useShort") } : null,
      tileLabel: t("AIM.window.favorites.use", { name: entry.title ?? entry.id })
    };
  });
  return {
    show: true,
    canEdit,
    groups: groupFavorites(entries).map((group) => ({ ...group, label: t(`AIM.window.favorites.groups.${group.key}`) }))
  };
}
