// ─────────────────────────────────────────────────────────
// AIM: Actor Window - the spells tab: slot tracks, prepared spells, the spellbook, innate and at-will spells
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";
import { VIEWS, listPrefsFor } from "../core/inventory.js";
import { SPELL_FILTERS, castable, groupSpellbook, preparationState, ready as isReady } from "../core/spellbook.js";
import { extractSpellSlots, readSpellPreparation, readSpellbook } from "../integrations/dnd5e.js";
import { getSpellSchoolColor, isScRarityColorsActive } from "../integrations/sc-rarity-colors.js";
import { playBurst } from "./bursts.js";

const PARTIALS = `modules/${MODULE_ID}/templates/window`;
export const SPELL_TEMPLATES = ["spells", "spell-row"].map((name) => `${PARTIALS}/${name}.hbs`);

/** More uses than this show as a counter instead of pips. */
const MAX_USE_PIPS = 8;
const VIEW_ICONS = { list: "fa-list", grid: "fa-grid-2", icons: "fa-grid" };

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Slot tracks per circle, then the warlock's pact track. */
export function spellSlotTracks(actor) {
  const slots = extractSpellSlots(actor);
  const track = (slot, label) => ({
    key: slot.key,
    label,
    value: slot.value,
    max: slot.max,
    pips: slot.pips.map((pip) => ({ index: pip.index, lit: pip.filled, label: t("AIM.window.spells.gem", { n: pip.index + 1, track: label }) }))
  });
  return [
    ...slots.filter((s) => s.key !== "pact").map((s) => track(s, t("AIM.window.spells.circle", { level: s.level }))),
    ...slots.filter((s) => s.key === "pact").map((s) => ({ ...track(s, t("AIM.window.spells.pact", { level: s.level })), pact: true }))
  ];
}

/** The preparation warning dnd5e gives past a class limit, or null. */
export function preparationWarning(actor) {
  if (actor.type !== "character") return null;
  const { over } = preparationState(readSpellPreparation(actor));
  return over && t("AIM.window.spells.warning", over);
}

/**
 * Everything the spells tab draws.
 * @param {Actor} actor
 * @param {{prefs: object, query: string, selectedKey: string|null, detail: object|null, canEdit: boolean, collapsed: Set<string>}} state
 */
export function buildSpellsContext(actor, state) {
  const prefs = listPrefsFor(state.prefs, "spells", SPELL_FILTERS);
  const tracks = spellSlotTracks(actor);
  const slotLevels = [...new Set(extractSpellSlots(actor).filter((s) => s.key !== "pact").map((s) => s.level))];
  const book = groupSpellbook(readSpellbook(actor), { slotLevels, filters: prefs.filters, query: state.query, locale: game.i18n.lang });
  const prep = preparationState(readSpellPreparation(actor));
  const sc = isScRarityColorsActive();

  const row = (section) => (s) => {
    const key = `${section}:${s.id}`;
    const ready = isReady(s);
    const uses = s.uses && ["innate", "atwill"].includes(s.method) ? s.uses : null;
    return {
      ...s,
      key,
      favorite: Boolean(state.favIds?.has(s.id)),
      selected: key === state.selectedKey,
      detail: key === state.selectedKey ? state.detail : null,
      // SC Rarity Colors decides school colours when active (its per-level variants too), else the --school-* tokens.
      toneStyle: sc ? `--tone: ${getSpellSchoolColor(s.school, s.level)}` : "",
      castable: castable(s),
      ritualOnly: !ready && s.ritual,
      castLabel: t(!ready && s.ritual ? "AIM.window.spells.castRitual" : "AIM.window.spells.cast"),
      unprepared: section !== "prep" && s.level > 0 && !ready && !["innate", "atwill"].includes(s.method),
      showPrepare: state.canEdit && s.canPrepare && s.prepared < 2,
      prepareLabel: t(s.prepared >= 1 ? "AIM.window.spells.unprepare" : "AIM.window.spells.prepare"),
      always: s.prepared >= 2,
      materialsTip: s.materials ? (s.materials.cost ? t("AIM.window.spells.materialsCost", { text: s.materials.text, cost: s.materials.cost }) : s.materials.text) : "",
      uses,
      usePips: uses && uses.max <= MAX_USE_PIPS
        ? Array.from({ length: uses.max }, (_, i) => ({ index: i, lit: i < uses.value, label: t("AIM.window.spells.use", { n: i + 1 }) }))
        : null,
      useLabel: t("AIM.window.inv.use", { name: s.name })
    };
  };

  const counter = prep.classes.length
    ? {
      text: prep.classes.map((c) => (prep.classes.length > 1 ? `${c.name} ${c.value} / ${c.max}` : `${c.value} / ${c.max}`)).join(" · "),
      state: prep.over ? "over" : prep.classes.some((c) => c.state === "full") ? "full" : "ok",
      hint: t(prep.over ? "AIM.window.spells.overHint" : "AIM.window.spells.limitHint")
    }
    : null;
  const slotsOf = (level) => tracks.find((track) => track.key === `spell${level}`);

  return {
    prefs,
    query: state.query,
    emptyText: t(state.query || prefs.filters.length ? "AIM.window.inv.notFound" : "AIM.window.inv.empty"),
    views: VIEWS.map((id) => ({ id, icon: VIEW_ICONS[id], label: t(`AIM.window.inv.views.${id}`), active: id === prefs.view })),
    filters: SPELL_FILTERS.map((id) => ({ id, label: t(`AIM.window.spells.filters.${id}`), on: prefs.filters.includes(id) })),
    tracks,
    prepared: { entries: book.prepared.map(row("prep")), counter, show: Boolean(counter) || book.prepared.length > 0, collapsed: state.collapsed.has("prepared") },
    circles: book.circles.map((circle) => ({
      id: `circle${circle.level}`,
      label: circle.level ? t("AIM.window.spells.circle", { level: circle.level }) : t("AIM.window.spells.cantrips"),
      meta: circle.level ? (slotsOf(circle.level) ? `${slotsOf(circle.level).value} / ${slotsOf(circle.level).max}` : "") : t("AIM.window.spells.noSlots"),
      collapsed: state.collapsed.has(`circle${circle.level}`),
      entries: circle.entries.map(row("book"))
    })),
    extras: [
      book.hasInnate && { id: "innate", label: t("AIM.window.spells.innate"), meta: t("AIM.window.spells.noSlots"), collapsed: state.collapsed.has("innate"), entries: book.innate.map(row("innate")) },
      book.hasAtwill && { id: "atwill", label: t("AIM.window.spells.atwill"), meta: t("AIM.window.spells.noSlots"), collapsed: state.collapsed.has("atwill"), entries: book.atwill.map(row("atwill")) }
    ].filter(Boolean)
  };
}

/** Which gems of the spells tab are lit, to animate the ones that change. */
export function slotSnapshot(element) {
  return new Map([...element?.querySelectorAll("[data-panel=spells] [data-slot-key][data-index]") ?? []]
    .map((pip) => [`${pip.dataset.slotKey}:${pip.dataset.index}`, pip.classList.contains("is-lit")]));
}

/** A spent gem bursts with sparks in the school's colour, a restored one pops in. */
export function playSlotChanges(element, before, school, motion) {
  if (!before?.size || motion === "off") return;
  for (const pip of element.querySelectorAll("[data-panel=spells] [data-slot-key][data-index]")) {
    const was = before.get(`${pip.dataset.slotKey}:${pip.dataset.index}`);
    const lit = pip.classList.contains("is-lit");
    if (was === undefined || was === lit) continue;
    const cls = lit ? "is-pop" : "is-burst";
    if (!lit) playBurst(element, pip, "gem", { token: school ? `--school-${school}` : undefined });
    pip.classList.add(cls);
    pip.addEventListener("animationend", () => pip.classList.remove(cls), { once: true });
  }
}
