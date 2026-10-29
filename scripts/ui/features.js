// ─────────────────────────────────────────────────────────
// AIM: Actor Window - the features tab: by origin for a character, «Действия» by action cost otherwise
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";
import { FEATURE_FILTERS, groupByAction, groupByOrigin, rechargeLabel } from "../core/features.js";
import { VIEWS, VIEW_ICONS, listPrefsFor } from "../core/inventory.js";
import { readFeatures, readIdentity } from "../integrations/dnd5e.js";
import { t } from "./html.js";

const PARTIALS = `modules/${MODULE_ID}/templates/window`;
export const FEATURE_TEMPLATES = ["features", "feature-row"].map((name) => `${PARTIALS}/${name}.hbs`);

/** More uses than this show as a counter instead of pips. */
const MAX_USE_PIPS = 8;
const ACTIVATION_KEYS = { action: "action", bonus: "bonus", reaction: "reaction" };


/** A character groups features by origin; an NPC or a vehicle shows «Действия» by action cost, attacks included. */
export const featureMode = (actor) => (actor.type === "character" ? "origin" : "action");

/** Whether the tab has anything to show: a vehicle shows it only with features or siege weapons. */
export function hasFeatures(actor) {
  return readFeatures(actor, { attacks: featureMode(actor) === "action" }).length > 0;
}

/**
 * Everything the features tab draws.
 * @param {Actor} actor
 * @param {{prefs: object, query: string, selectedKey: string|null, detail: object|null, canEdit: boolean,
 *   collapsed: Set<string>, usesEditing: string|null, usesDraft: string}} state
 */
export function buildFeaturesContext(actor, state) {
  const mode = featureMode(actor);
  const prefs = listPrefsFor(state.prefs, "features", FEATURE_FILTERS);
  const entries = readFeatures(actor, { attacks: mode === "action" });
  const options = { query: state.query, filters: prefs.filters, locale: game.i18n.lang };

  const row = (e) => {
    const key = `feat:${e.id}`;
    const uses = e.uses;
    return {
      ...e,
      key,
      favorite: Boolean(state.favIds?.has(e.id)),
      selected: key === state.selectedKey,
      detail: key === state.selectedKey ? state.detail : null,
      // In «Действия» the section already names the action cost, so the row leaves it out.
      activationLabel: mode !== "origin" ? ""
        : e.passive ? t("AIM.window.features.passive")
          : ACTIVATION_KEYS[e.activation] ? t(`AIM.window.features.activation.${e.activation}`) : "",
      rechargeText: e.recharge ? t("AIM.window.features.recharge", { range: rechargeLabel(e.recharge.formula) }) : "",
      canRecharge: Boolean(e.recharge && uses && uses.value < uses.max),
      usePips: uses && uses.max <= MAX_USE_PIPS
        ? Array.from({ length: uses.max }, (_, i) => ({ index: i, lit: i < uses.value, label: t("AIM.window.spells.use", { n: i + 1 }) }))
        : null,
      usesEditing: e.id === state.usesEditing,
      useLabel: t("AIM.window.inv.use", { name: e.name })
    };
  };

  let groups;
  if (mode === "origin") {
    const identity = readIdentity(actor);
    const classes = identity.classes.map((cls) => ({ ...cls, key: actor.items.get(cls.id)?.identifier ?? cls.id }));
    groups = groupByOrigin(entries, { classes: classes.map((c) => c.key), ...options }).map((group) => {
      const cls = classes.find((c) => c.key === group.key);
      const links = cls ? [{ id: cls.id, label: cls.name }, cls.subclass && { id: cls.subclass.id, label: cls.subclass.name }].filter(Boolean)
        : group.key === "species" && identity.species ? [{ id: identity.species.id, label: identity.species.name }]
          : group.key === "background" && identity.background ? [{ id: identity.background.id, label: identity.background.name }] : [];
      return {
        id: `origin-${group.key}`,
        label: cls ? cls.name : t(`AIM.window.features.origins.${group.key}`),
        meta: cls ? t("AIM.window.features.level", { level: cls.levels }) : "",
        links: cls ? links.slice(1) : links,
        classLink: cls ? cls.id : null,
        entries: group.entries.map(row)
      };
    });
  } else {
    groups = groupByAction(entries, options).map((group) => ({
      id: `act-${group.key}`,
      label: t(`AIM.window.features.groups.${group.key}`),
      entries: group.entries.map(row)
    }));
  }

  return {
    mode,
    prefs,
    query: state.query,
    usesDraft: state.usesDraft,
    emptyText: t(state.query || prefs.filters.length ? "AIM.window.inv.notFound" : "AIM.window.inv.empty"),
    noneText: t(mode === "origin" ? "AIM.window.features.none" : "AIM.window.features.noActions"),
    views: VIEWS.map((id) => ({ id, icon: VIEW_ICONS[id], label: t(`AIM.window.inv.views.${id}`), active: id === prefs.view })),
    filters: FEATURE_FILTERS.map((id) => ({ id, label: t(`AIM.window.features.filters.${id}`), on: prefs.filters.includes(id) })),
    groups: groups.map((group) => ({ ...group, collapsed: state.collapsed.has(group.id) })),
    addLabel: t("AIM.window.features.add")
  };
}
