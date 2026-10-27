import { FLAGS, MODULE_ID } from "../constants.js";
import { currencyProfile, tradeError, transferMoney } from "./currencies.js";
import { canonicalJSON, documentFingerprint, recoveryAttributes } from "./document-data.js";

/** Private journal recovery data includes item currencies and custom attribute paths. */
export function captureInventory(actor) {
  const paths = new Set(currencyProfile(actor).rows.map(r => r.path).filter(Boolean));
  const attributes = {};
  for (const path of paths) attributes[path] = foundry.utils.getProperty(actor, path) ?? 0;
  return { actorId: actor.id, items: Array.from(actor.items.values(), i => i.toObject()), attributes };
}

/** Diagnostics contain IDs and paths only, never item contents or currency balances. */
export function inventoryChanges(actor, snapshot) {
  const current = captureInventory(actor);
  const attributes = recoveryAttributes(snapshot.attributes);
  const previous = new Map(snapshot.items.map(item => [item._id, documentFingerprint(item)]));
  const present = new Map(current.items.map(item => [item._id, documentFingerprint(item)]));
  return {
    currencyPaths: [...new Set([...Object.keys(attributes), ...Object.keys(current.attributes)])]
      .filter(path => canonicalJSON(attributes[path]) !== canonicalJSON(current.attributes[path])),
    addedItemIds: [...present.keys()].filter(id => !previous.has(id)),
    removedItemIds: [...previous.keys()].filter(id => !present.has(id)),
    changedItemIds: [...present.keys()].filter(id => previous.has(id) && previous.get(id) !== present.get(id))
  };
}

export async function restoreInventory(actor, snapshot, guard = () => {}) {
  const attributes = recoveryAttributes(snapshot.attributes);
  const originalIds = new Set(snapshot.items.map(i => i._id));
  const addedIds = Array.from(actor.items.keys()).filter(id => !originalIds.has(id));
  guard();
  if (addedIds.length) await actor.deleteEmbeddedDocuments("Item", addedIds);
  const missing = snapshot.items.filter(i => !actor.items.has(i._id));
  const existing = snapshot.items.filter(i => actor.items.has(i._id));
  guard();
  if (missing.length) await actor.createEmbeddedDocuments("Item", missing, { keepId: true, aimTradeRecovery: true });
  guard();
  if (existing.length) await actor.updateEmbeddedDocuments("Item", existing, { diff: false, recursive: false, aimTradeRecovery: true });
  guard();
  await actor.update(attributes, { aimTradeRecovery: true });
  if (actor.items.size !== snapshot.items.length || snapshot.items.some(data => !actor.items.has(data._id)
    || Number(actor.items.get(data._id).system?.quantity ?? 1) !== Number(data.system?.quantity ?? 1))) throw tradeError("recovery");
  if (Object.entries(attributes).some(([path, value]) => foundry.utils.getProperty(actor, path) !== value)) throw tradeError("recovery");
}

export async function transferItems(source, target, items, guard = () => {}) {
  guard();
  const whole = [], partial = [], copies = [];
  for (const entry of items) {
    const item = source.items.get(entry.id);
    const quantity = Number(item?.system?.quantity ?? 1);
    if (!item || quantity < entry.quantity) throw tradeError("changed");
    const data = item.toObject();
    data._id = foundry.utils.randomID();
    delete data._stats;
    data.system.quantity = entry.quantity;
    data.system.equipped = false;
    data.system.container = null;
    if ("attuned" in data.system) data.system.attuned = false;
    // The slot assignment stays behind; the item is marked «Новое» until its new owner opens it.
    data.flags = { ...data.flags, [MODULE_ID]: { [FLAGS.TRADE_NEW]: true } };
    copies.push(data);
    if (quantity === entry.quantity) whole.push(item.id);
    else partial.push({ _id: item.id, "system.quantity": quantity - entry.quantity, left: quantity - entry.quantity });
  }
  if (!copies.length) return;
  // Debit first, in one write per kind (a big offer must not run past the request timeout); a failed credit is
  // recovered from the persisted snapshot.
  if (partial.length) await source.updateEmbeddedDocuments("Item", partial.map(({ left, ...update }) => update));
  if (whole.length) await source.deleteEmbeddedDocuments("Item", whole);
  if (whole.some(id => source.items.has(id)) || partial.some(({ _id, left }) => Number(source.items.get(_id)?.system?.quantity) !== left)) throw tradeError("transfer");
  guard();
  const created = await target.createEmbeddedDocuments("Item", copies, { keepId: true });
  if (created?.length !== copies.length) throw tradeError("transfer");
}

export async function executeTransfer(actors, session, guard = () => {}) {
  for (let side = 0; side < 2; side++) {
    await transferMoney(actors[side], actors[1 - side], session.offers[side].money, session.signature, session.id, guard);
  }
  for (let side = 0; side < 2; side++) await transferItems(actors[side], actors[1 - side], session.offers[side].items, guard);
  guard();
}
