import { AIM_EQUIP_OPTION, ENFORCEMENT_MODES } from "../constants.js";
import { canEditActor } from "../core/actor-scope.js";
import { planEquipSync, takeOffChanges } from "../core/equipment-rules.js";
import { LOG } from "./logger.js";

const pending = new Map();
const read = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const plain = value => value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const normalize = value => value instanceof Set ? [...value].map(normalize).sort()
  : Array.isArray(value) ? value.map(normalize)
    : plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
const failed = (partial = false) => ({ ok: false, partial,
  message: game.i18n.localize(`AIM.notifications.${partial ? "equipPartial" : "equipWriteRefused"}`) });

function flatten(object, prefix = "", result = {}) {
  for (const [key, value] of Object.entries(object ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (plain(value) && Object.keys(value).length) flatten(value, path, result);
    else result[path] = value;
  }
  return result;
}
function fieldPath(path) { return path.replace(/(^|\.)-=/, "$1"); }
function matches(item, changes) {
  return Boolean(item) && Object.entries(changes).every(([key, value]) => key === "_id"
    || same(read(item, fieldPath(key)), key !== fieldPath(key) ? undefined : value));
}
function canWrite(actor, item) {
  return item?.parent === actor && actor?.items?.get(item.id) === item && canEditActor(actor, game.user);
}
function serial(actor, run) {
  const key = actor?.uuid ?? actor;
  const operation = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
  pending.set(key, operation);
  const clean = () => { if (pending.get(key) === operation) pending.delete(key); };
  operation.then(clean, clean);
  return operation;
}

/** Keep an item outside its own container ancestry. */
export function wouldCreateContainerCycle(actor, item, containerId) {
  const visited = new Set();
  let current = containerId;
  while (current && !visited.has(current)) {
    if (current === item.id) return true;
    visited.add(current);
    current = actor.items.get(current)?.system?.container ?? null;
  }
  return false;
}

/** Write and verify every planned item; roll back only a recognizable, unchanged partial application. */
async function apply(actor, updates) {
  const snapshots = updates.map(update => ({ update, id: update._id,
    before: Object.fromEntries(Object.keys(update).filter(key => key !== "_id")
      .map(key => [fieldPath(key), structuredClone(read(actor.items.get(update._id), fieldPath(key)))])) }));
  let written;
  try { written = await actor.updateEmbeddedDocuments("Item", updates, { [AIM_EQUIP_OPTION]: true, diff: false }); }
  catch (error) { LOG.error("Equipment write failed", error); }
  const ids = new Set(written?.map(item => item.id) ?? []);
  if (snapshots.every(({ id, update }) => ids.has(id) && matches(actor.items.get(id), update))) return { ok: true };

  // Unknown fields or a deleted document may represent a concurrent edit. Never overwrite them to undo this write.
  if (snapshots.some(({ id, before, update }) => !matches(actor.items.get(id), before) && !matches(actor.items.get(id), update))) return failed(true);
  const changed = snapshots.filter(({ id, before }) => !matches(actor.items.get(id), before));
  if (changed.length) {
    const undo = changed.map(({ id, before }) => Object.fromEntries([ ["_id", id],
      ...Object.entries(before).map(([key, value]) => {
        if (value !== undefined) return [key, value];
        const parts = key.split(".");
        parts[parts.length - 1] = `-=${parts.at(-1)}`;
        return [parts.join("."), null];
      }) ]));
    try { await actor.updateEmbeddedDocuments("Item", undo, { [AIM_EQUIP_OPTION]: true, diff: false }); }
    catch (error) { LOG.error("Equipment compensation failed", error); }
  }
  return failed(snapshots.some(({ id, before }) => !matches(actor.items.get(id), before)));
}

/** Application owner shared by Actor window actions and redirected synchronous native hooks. */
export class EquipService {
  static equip(actor, item, slotId = null, { mode = ENFORCEMENT_MODES.BLOCK, changes = {} } = {}) {
    return serial(actor, async () => {
      if (!canWrite(actor, item)) return failed();
      const plan = planEquipSync(actor, item, slotId, mode);
      if (plan.refusal) return { ok: false, message: plan.refusal.message };
      const last = plan.updates.length - 1;
      plan.updates[last] = { ...flatten(changes), ...plan.updates[last], "system.container": null };
      const result = await apply(actor, plan.updates);
      return result.ok ? { ...result, warning: plan.warning } : result;
    });
  }

  static unequip(actor, item) {
    return serial(actor, () => canWrite(actor, item) ? apply(actor, [{ _id: item.id, ...takeOffChanges() }]) : failed());
  }

  static setContainer(actor, item, containerId) {
    return serial(actor, () => {
      if (!canWrite(actor, item)) return failed();
      if (containerId && wouldCreateContainerCycle(actor, item, containerId)) {
        return { ok: false, message: game.i18n.format("AIM.containers.cycle", { item: item.name }) };
      }
      return apply(actor, [{ _id: item.id, "system.container": containerId || null,
        ...(containerId ? takeOffChanges() : {}) }]);
    });
  }
}
