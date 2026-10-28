// ─────────────────────────────────────────────────────────
// AIM: Actor Window - the overview (skills, saves, tools, defenses, senses) and the biography in dnd5e's own fields
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";
import { CARD_CONFIGS, CHARACTERISTICS, DEFENSES, PERSONALITY, profMark, signed } from "../core/overview.js";
import { readAbilities, readBiography, readDefenses, readSenses, readSkills, readTools } from "../integrations/dnd5e.js";
import { unwrapSecrets } from "./html.js";
import { damageChip } from "./tooltips.js";

const PARTIALS = `modules/${MODULE_ID}/templates/window`;
export const OVERVIEW_TEMPLATES = ["overview", "biography"].map((name) => `${PARTIALS}/${name}.hbs`);

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Skills, tools and saves open on characters and NPCs; a vehicle has neither. */
export const hasOverview = (actor) => actor.type !== "vehicle";

/** Characteristics and personality exist on characters only; NPCs and vehicles keep the description. */
const hasCharacteristics = (actor) => actor.type === "character";

const list = (values) => (values.length ? { text: values.join(", ") } : { text: t("AIM.window.overview.none"), none: true });

/**
 * The overview cards.
 * @param {Actor} actor
 * @param {{canFavorite: boolean}} state
 */
export function buildOverviewContext(actor, { canFavorite }) {
  const check = (kind) => (e) => ({ ...e, mark: profMark(e.prof), totalText: signed(e.total), kind, draggable: canFavorite });
  const defenses = readDefenses(actor);
  const senses = readSenses(actor);
  return {
    skills: readSkills(actor).map(check("skill")),
    saves: readAbilities(actor).map((a) => ({ ...a, mark: a.proficient ? "prof" : "none", totalText: signed(a.save) })),
    tools: actor.type === "character" ? readTools(actor).map(check("tool")) : null,
    defenses: DEFENSES.map((id) => {
      // Damage types are chips in their colour; custom entries and the modification amounts stay text.
      const chips = id === "dm" ? [] : (defenses.types[id] ?? []).map(damageChip).filter(Boolean);
      const rest = defenses[id].slice(chips.length);
      return { id, label: t(`AIM.window.overview.defenses.${id}`), chips, ...(chips.length && !rest.length ? { text: "" } : list(rest)) };
    }),
    senses: [
      ...["prc", "inv", "ins"].map((id) => ({ id, label: t(`AIM.window.overview.passive.${id}`), text: String(senses.passive[id]) })),
      ...["senses", "armor", "weapon", "languages"].map((id) => ({ id, label: t(`AIM.window.overview.senses.${id}`), ...list(senses[id]) }))
    ]
  };
}

/** The biography tab: characteristics and personality for a character, the description for everyone. */
export async function buildBiographyContext(actor) {
  const full = hasCharacteristics(actor);
  const { fields, biography } = readBiography(actor, full ? [...CHARACTERISTICS, ...PERSONALITY] : []);
  const field = (key) => ({ key, name: `system.details.${key}`, label: t(`AIM.window.bio.fields.${key}`), value: fields[key] });
  return {
    characteristics: full ? CHARACTERISTICS.map(field) : null,
    personality: full ? PERSONALITY.map((key) => ({ ...field(key), wide: key === "appearance" })) : null,
    biography,
    enriched: unwrapSecrets(await foundry.applications.ux.TextEditor.implementation.enrichHTML(biography, {
      relativeTo: actor, secrets: actor.isOwner, rollData: actor.getRollData?.()
    }))
  };
}

/** dnd5e's dialogs, by the kind the card configs name; 5.3.3 keeps MovementSensesConfig among the shared ones. */
function dialogFor(actor, { kind, trait, type, key }) {
  const apps = dnd5e.applications.actor;
  const Cls = { skills: apps.SkillsConfig, tools: apps.ToolsConfig, damages: apps.DamagesConfig, traits: apps.TraitsConfig,
    senses: dnd5e.applications.shared?.MovementSensesConfig ?? apps.MovementSensesConfig, languages: apps.LanguagesConfig,
    weapons: apps.WeaponsConfig, ability: apps.AbilityConfig }[kind];
  if (!Cls) return null;
  return new Cls({ document: actor, ...(trait && { trait }), ...(type && { type }), ...(key && { key }) });
}

/**
 * The entries behind a card's gear: one dialog opens at once, several make a menu. The saves card offers
 * dnd5e's AbilityConfig per ability.
 * @returns {{label: string, open: Function}[]}
 */
export function cardDialogs(actor, card) {
  const configs = card === "saves"
    ? readAbilities(actor).map((a) => ({ id: a.key, kind: "ability", key: a.key, label: a.label }))
    : CARD_CONFIGS[card] ?? [];
  return configs.map((config) => ({
    label: config.label ?? t(`AIM.window.overview.config.${config.id}`),
    open: () => dialogFor(actor, config)?.render({ force: true })
  }));
}
