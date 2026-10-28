// ─────────────────────────────────────────────────────────
// AIM: Actor Window - effects: the rail's temporary ones, the effects tab with the conditions grid, the effect menu
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";
import { categorizeEffects, changeText, conditionGrid } from "../core/effects.js";
import { readEffectChanges, readEffects, readStatusEffects } from "../integrations/dnd5e.js";
import { unwrapSecrets } from "./html.js";

const PARTIALS = `modules/${MODULE_ID}/templates/window`;
export const EFFECT_TEMPLATES = ["effects", "effect-row"].map((name) => `${PARTIALS}/${name}.hbs`);

/** dnd5e's default image for an effect made on the actor. */
const NEW_EFFECT_IMG = "icons/svg/aura.svg";

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/**
 * The effects of the rail and the tab, the conditions grid and the open row's description.
 * @param {Actor} actor
 * @param {{open: string|null, canFavorite: boolean}} state  open: «where:uuid» of the row whose details show
 */
export async function buildEffectsContext(actor, { open, canFavorite }) {
  const options = { statusIds: new Set((CONFIG.statusEffects ?? []).map((s) => s.id)), concentrating: CONFIG.specialStatusEffects?.CONCENTRATING };
  const groups = categorizeEffects(readEffects(actor, { isGM: game.user.isGM }), options);
  const openUuid = open?.split(":").slice(1).join(":");
  const detail = groups.flatMap((g) => g.entries).some((e) => e.uuid === openUuid) ? await effectDetail(actor, openUuid) : null;

  const row = (where) => (e) => {
    const why = e.suppressedBy ? t(`AIM.window.effects.why.${e.suppressedBy}`) : "";
    const isOpen = open === `${where}:${e.uuid}`;
    return {
      ...e,
      where,
      line: [e.source && t("AIM.window.effects.from", { source: e.source }), why].filter(Boolean).join(" · "),
      on: !e.disabled && !e.suppressed,
      switchLabel: t(e.disabled ? "AIM.window.effects.enable" : "AIM.window.effects.disable", { name: e.name }),
      lockedLabel: why && t("AIM.window.effects.locked", { why }),
      status: e.kind === "condition" ? e.statuses[0] : null,
      draggable: canFavorite && e.kind === "effect",
      open: isOpen,
      detail: isOpen ? detail : null
    };
  };
  const temporary = groups.find((g) => g.key === "temporary")?.entries ?? [];
  return {
    // Exhaustion keeps its own chip in the rail.
    rail: temporary.filter((e) => !e.statuses.includes("exhaustion")).map(row("rail")),
    categories: groups.map((g) => ({ key: g.key, label: t(`AIM.window.effects.categories.${g.key}`), entries: g.entries.map(row("tab")) })),
    grid: conditionGrid(readStatusEffects(actor), actor.statuses ?? new Set(), game.i18n.lang)
  };
}

/** The open row: its description, enriched as dnd5e does, and its changes. */
async function effectDetail(actor, uuid) {
  const effect = await fromUuid(uuid);
  if (!effect) return null;
  const description = effect.description
    ? unwrapSecrets(await foundry.applications.ux.TextEditor.implementation.enrichHTML(effect.description, { relativeTo: effect, secrets: effect.isOwner }))
    : "";
  return { description, changes: readEffectChanges(effect, actor).map((c) => changeText(c, c.label)) };
}

/** «Новый эффект»: an effect on the actor, its sheet opened. */
export async function createActorEffect(actor) {
  const effect = await ActiveEffect.implementation.create({ name: t("AIM.window.effects.newName"), img: NEW_EFFECT_IMG }, { parent: actor });
  effect?.sheet?.render({ force: true });
}

/**
 * dnd5e's effect menu: edit, duplicate, delete, enable or disable (break concentration for its effect) and the
 * favorite; `dnd5e.getActiveEffectContextOptions` may change it before it shows.
 */
export function effectMenuEntries(actor, effect, { concentration }) {
  const owner = effect.isOwner;
  const entries = [
    { name: "DND5E.ContextMenuActionEdit", icon: '<i class="fa-light fa-pen"></i>', condition: () => owner, callback: () => effect.sheet.render({ force: true }) },
    {
      name: "DND5E.ContextMenuActionDuplicate", icon: '<i class="fa-light fa-copy"></i>', condition: () => owner,
      callback: () => effect.clone({ name: game.i18n.format("DOCUMENT.CopyOf", { name: effect.name }) }, { save: true })
    },
    { name: "DND5E.ContextMenuActionDelete", icon: '<i class="fa-light fa-trash"></i>', condition: () => owner && !concentration, callback: () => effect.deleteDialog() },
    {
      name: effect.disabled ? "DND5E.ContextMenuActionEnable" : "DND5E.ContextMenuActionDisable",
      icon: `<i class="fa-light ${effect.disabled ? "fa-check" : "fa-xmark"}"></i>`,
      condition: () => owner && !concentration && !effect.isSuppressed, callback: () => effect.update({ disabled: !effect.disabled })
    },
    { name: "DND5E.ConcentrationBreak", icon: '<i class="fa-light fa-eye-slash"></i>', condition: () => owner && concentration, callback: () => actor.endConcentration(effect) }
  ];
  if (actor.type === "character" && "favorites" in actor.system) {
    const id = effect.getRelativeUUID(actor);
    const favorite = actor.system.hasFavorite(id);
    entries.push({
      name: favorite ? "DND5E.FavoriteRemove" : "DND5E.Favorite", icon: '<i class="fa-light fa-star"></i>', condition: () => owner,
      callback: () => (favorite ? actor.system.removeFavorite(id) : actor.system.addFavorite({ type: "effect", id }))
    });
  }
  Hooks.call("dnd5e.getActiveEffectContextOptions", effect, entries);
  return entries;
}
