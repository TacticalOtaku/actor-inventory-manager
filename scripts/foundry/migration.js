// ─────────────────────────────────────────────────────────
// AIM: the 1.9 → 2.0 world migration (ADR 0005): adds data, removes nothing, once per world on the active GM
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID } from "../constants.js";
import { accentFromLegacy, themeFromLegacy } from "../core/actor-window.js";
import {
  MIGRATION_VERSION,
  lookFromLegacy,
  needsMigration,
  ownDollPreset,
  ownDollPresetId,
  presetFromTemplate,
  quickSlotFavorites,
  worthReporting
} from "../core/migration.js";
import { activeGM, cancelOpenTrades } from "../trade/service.js";
import { LOG } from "./logger.js";
import { t } from "../ui/html.js";

const VERSION_KEY = "migrationVersion";

/** «Повторить миграцию» in the module settings: a menu that runs it again and closes at once. */
class RetryMigration extends foundry.applications.api.ApplicationV2 {
  async render() {
    await runMigration({ force: true });
    return this;
  }
}

export function registerMigrationSettings() {
  game.settings.register(MODULE_ID, VERSION_KEY, { scope: "world", config: false, type: String, default: "" });
  game.settings.registerMenu(MODULE_ID, "retryMigration", {
    name: "AIM.migration.retry.name",
    label: "AIM.migration.retry.label",
    hint: "AIM.migration.retry.hint",
    icon: "fa-light fa-arrows-rotate",
    type: RetryMigration,
    restricted: true
  });
}

/** World actors and the unlinked token actors on every scene; compendiums are left alone. */
function* actorsToVisit() {
  yield* game.actors;
  for (const scene of game.scenes) {
    for (const token of scene.tokens) if (!token.actorLink && token.actor) yield token.actor;
  }
}

/** One actor: quick slots into favorites, an own doll into a named world preset assigned to it. */
async function migrateActor(actor, templates) {
  let items = 0;
  let presets = 0;
  let changed = false;
  // An unlinked token actor inherits its base actor's flags and items; only what its own delta changed is its own.
  const own = actor.isToken ? actor.token?.delta : actor;
  if (actor.type === "character" && typeof actor.system?.addFavorite === "function") {
    const slots = [...(own?.items ?? [])].map((item) => ({ id: item.id, slot: item.flags?.[MODULE_ID]?.[FLAGS.SLOT] ?? null }));
    for (const favorite of quickSlotFavorites(slots, actor.system.favorites ?? [])) {
      await actor.system.addFavorite(favorite);
      items++;
      changed = true;
    }
  }
  const doll = own?.flags?.[MODULE_ID]?.[FLAGS.CUSTOM_TEMPLATE];
  if (doll && Array.isArray(doll.slots)) {
    // A token actor shares its base actor's id; its own doll is the token's.
    const key = actor.isToken ? actor.token.id : actor.id;
    const id = ownDollPresetId(key);
    if (!templates[id]) {
      templates[id] = ownDollPreset(key, doll, t("AIM.migration.ownDoll", { name: actor.name }));
      presets++;
    }
    if (actor.flags?.[MODULE_ID]?.[FLAGS.TEMPLATE_ID] !== id) {
      await actor.setFlag(MODULE_ID, FLAGS.TEMPLATE_ID, id);
      changed = true;
    }
  }
  return { changed: changed || presets > 0, items, presets };
}

/**
 * Runs the migration on the single active GM, unless this world already finished it. Each document migrates on its
 * own: a failure is logged with its UUID and the rest go on; the version is stored only when nothing failed, so the
 * next GM start (or «Повторить миграцию») tries again.
 * @param {{force?: boolean}} [options]
 */
export async function runMigration({ force = false } = {}) {
  // The trade coordinator, as cancelling the open trades needs it: core's activeGM may be another GM.
  if (!game.user.isGM || activeGM()?.id !== game.user.id) return null;
  if (!force && !needsMigration(game.settings.get(MODULE_ID, VERSION_KEY))) return null;
  const counts = { actors: 0, items: 0, presets: 0, trades: 0, failures: 0 };
  const templates = foundry.utils.deepClone(game.settings.get(MODULE_ID, "customTemplates") ?? {});
  for (const [id, template] of Object.entries(templates)) {
    const next = presetFromTemplate(template);
    if (!next) continue;
    templates[id] = next;
    counts.presets++;
  }
  for (const actor of actorsToVisit()) {
    try {
      const result = await migrateActor(actor, templates);
      if (result.changed) counts.actors++;
      counts.items += result.items;
      counts.presets += result.presets;
    } catch (error) {
      counts.failures++;
      LOG.error(`Migration to 2.0 failed for ${actor.uuid}`, error);
    }
  }
  try {
    if (counts.presets) await game.settings.set(MODULE_ID, "customTemplates", templates);
  } catch (error) {
    counts.failures++;
    LOG.error("Migration to 2.0 failed for the world's doll presets", error);
  }
  try {
    counts.trades = await cancelOpenTrades();
  } catch (error) {
    counts.failures++;
    LOG.error("Migration to 2.0 failed for the open trades", error);
  }
  if (!counts.failures) await game.settings.set(MODULE_ID, VERSION_KEY, MIGRATION_VERSION);
  if (worthReporting(counts)) {
    await ChatMessage.implementation.create({
      content: `<p>${t("AIM.migration.renamed")}</p><p>${t("AIM.migration.report", counts)}</p>`,
      whisper: [game.user.id],
      speaker: { alias: "AIM" }
    });
  }
  LOG.info("Migration to 2.0", counts);
  return counts;
}

/** Reads a 1.9 client setting this device stored, undefined when it never did. */
function legacyClientValue(key) {
  const raw = game.settings.storage.get("client")?.getItem(`${MODULE_ID}.${key}`);
  if (raw === null || raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Whether this user already has a 2.0 value of a user-scope setting (it lives in the world, per user). */
const userHas = (key) => Boolean(game.settings.storage.get("world")?.find((s) => s.key === `${MODULE_ID}.${key}` && s.user === game.user.id));

/** Every client on its first 2.0 load: the device's 1.9 theme and accent become the user's, if the user has none. */
export async function migrateLook() {
  const look = lookFromLegacy(
    { theme: legacyClientValue("theme"), accent: legacyClientValue("accent") },
    { theme: userHas("windowTheme"), accent: userHas("windowAccent") },
    { theme: themeFromLegacy, accent: accentFromLegacy }
  );
  for (const [key, value] of Object.entries(look)) await game.settings.set(MODULE_ID, key, value);
  return look;
}
