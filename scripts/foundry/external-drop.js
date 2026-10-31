// A copy-first move owns its receipt and compensation, including dnd5e's unawaited stack update (ADR 0004).
import { droppedItemContainer, matchesDroppedStack } from "../integrations/dnd5e.js";
import { isTradeLocked } from "../trade/service.js";

const STACK_WAIT_MS = 3000;
const pending = new Map();
const quantity = (item) => Number(item.system?.quantity ?? 1);
const fingerprint = (item) => JSON.stringify(item.toObject?.() ?? { quantity: quantity(item) });

/** A container and its descendants are one move; dnd5e creates and deletes their contents for us. */
function contents(item) {
  const actor = item.parent;
  const included = new Set([item.id]);
  let changed;
  do {
    changed = false;
    for (const entry of actor.items.values()) {
      if (!included.has(entry.id) && included.has(entry.system?.container)) {
        included.add(entry.id);
        changed = true;
      }
    }
  } while (changed);
  return [...included].map((id) => actor.items.get(id));
}

function unchangedContents(item, originals) {
  if (!item.parent.items.has(item.id)) return false;
  const current = contents(item);
  return current.length === originals.size && current.every((entry) => originals.get(entry.id) === fingerprint(entry));
}

/** Observe only a matching quantity write, then follow that exact write across Foundry's update hooks. */
function watchArrival(actor, item, container) {
  const token = crypto.randomUUID();
  let receipt = null;
  let ambiguous = false;
  let attempted = null;
  let finish;
  let timer;
  const arrived = new Promise((resolve) => { finish = resolve; });
  const pre = Hooks.on("preUpdateItem", (doc, changes, options, userId) => {
    if (doc.parent !== actor || userId !== game.user.id || !matchesDroppedStack(doc, item, container)) return;
    const value = changes["system.quantity"] ?? changes.system?.quantity;
    if (Number(value) !== quantity(doc) + Math.max(quantity(item), 1)) return;
    if (attempted) { ambiguous = true; return; }
    attempted = { id: doc.id, before: quantity(doc), after: Number(value) };
    options.aimDropReceipt = token;
  });
  const update = Hooks.on("updateItem", (doc, _changes, options) => {
    if (doc.parent !== actor || options?.aimDropReceipt !== token || doc.id !== attempted?.id) return;
    if (quantity(doc) !== attempted.after) { ambiguous = true; finish(); return; }
    receipt = { ...attempted };
    finish();
  });
  return {
    seal() { Hooks.off("preUpdateItem", pre); },
    async receipt() {
      if (!attempted) return null;
      if (!receipt && !ambiguous) {
        timer = setTimeout(finish, STACK_WAIT_MS);
        await arrived;
      }
      return ambiguous ? null : receipt;
    },
    close() { clearTimeout(timer); Hooks.off("preUpdateItem", pre); Hooks.off("updateItem", update); }
  };
}

/** Returned documents must cover the whole source, not just the first successful child of a container. */
function completeCreation(entries, created) {
  if (entries.length !== created.length) return false;
  // A spell converted into a scroll may change its name and type, but still creates one item.
  if (entries.length === 1) return quantity(entries[0]) === quantity(created[0]);
  const signature = (entry) => JSON.stringify([entry.name, entry.type, quantity(entry)]);
  return entries.map(signature).sort().join("\n") === created.map(signature).sort().join("\n");
}

async function compensate(actor, created, snapshots, stack) {
  // An intervening edit makes deletion or resetting a stack unsafe. Leave both actors for explicit recovery.
  const ids = new Set(created.map((doc) => doc.id));
  if ([...actor.items.values()].some((doc) => !ids.has(doc.id) && ids.has(doc.system?.container))) return false;
  if (created.some((doc) => !actor.items.has(doc.id) || fingerprint(actor.items.get(doc.id)) !== snapshots.get(doc.id))) return false;
  if (stack && (!actor.items.has(stack.id) || quantity(actor.items.get(stack.id)) !== stack.after)) return false;
  try {
    if (created.length) await actor.deleteEmbeddedDocuments("Item", created.map((doc) => doc.id));
    if (stack) await actor.updateEmbeddedDocuments("Item", [{ _id: stack.id, "system.quantity": stack.before }]);
  } catch {
    return false;
  }
  return created.every((doc) => !actor.items.has(doc.id)) && (!stack || actor.items.has(stack.id) && quantity(actor.items.get(stack.id)) === stack.before);
}

async function receive(actor, item, prepared, container) {
  const source = item.parent;
  const result = (created, arrived, failure = null) => ({ created, arrived, failure });
  const allowed = () => actor.isOwner && source.isOwner && !isTradeLocked(actor) && !isTradeLocked(source);
  if (!allowed() || !source.items.has(item.id)) return result([], false, "moveFailed");
  if (!prepared.items.length) return result([], false);
  const entries = contents(item);
  const originals = new Map(entries.map((entry) => [entry.id, fingerprint(entry)]));
  const before = new Set(actor.items.keys());
  const watch = watchArrival(actor, prepared.items[0], droppedItemContainer(actor, container));
  let created = [];
  let stack = null;
  let failed = false;
  try {
    try { created = await prepared.create(); } catch { failed = true; }
    // A later manual edit is never a receipt. Await only writes already observed during the sheet call.
    watch.seal();
    // Only returned, newly created documents belong to this operation; unrelated changes never count.
    created = created.filter((doc) => doc?.id && !before.has(doc.id) && actor.items.has(doc.id));
    if (!created.length) stack = await watch.receipt();
  } finally {
    watch.close();
  }
  const snapshots = new Map(created.map((doc) => [doc.id, fingerprint(doc)]));
  const complete = created.length ? completeCreation(entries, created) : Boolean(stack && entries.length === 1);
  if (!complete) {
    // A refusal or a dialog may finish later. Keep the source; no unrelated item can justify deleting it.
    if (created.length && !await compensate(actor, created, snapshots, stack)) return result(created, false, "recovery");
    return result([], false, "unconfirmed");
  }
  const unchanged = () => unchangedContents(item, originals);
  if (!failed && allowed() && unchanged()) {
    try { await item.delete({ deleteContents: true }); } catch { /* Inspect the actual result, including a partial deletion. */ }
    if (entries.every((entry) => !source.items.has(entry.id))) return result(created, true);
  }
  // Never remove the destination if only part of a source container disappeared or its contents changed.
  if (!unchanged()) return result(created, false, "recovery");
  const restored = await compensate(actor, created, snapshots, stack);
  return result(restored ? [] : created, false, restored ? "moveFailed" : "recovery");
}

/** Items already included in a dropped container are created and removed with that container. */
function roots(items) {
  return items.filter((item) => {
    const included = new Set(items.filter((entry) => entry.parent === item.parent && entry.type === "container").map((entry) => entry.id));
    const seen = new Set([item.id]);
    let parent = item.system?.container;
    while (parent && !seen.has(parent)) {
      if (included.has(parent)) return false;
      seen.add(parent);
      parent = item.parent?.items?.get(parent)?.system?.container;
    }
    return true;
  });
}

/** Complete each copy-first move separately; a recovery outcome stops the remaining automatic work. */
export function moveDroppedItems(actor, items, prepare, { container = null } = {}) {
  return withActors([actor, ...items.map((item) => item.parent)], async () => {
    const outcomes = [];
    for (const item of roots(items)) {
      if (!item.parent.items.has(item.id)) {
        outcomes.push({ item, created: [], arrived: false, failure: "moveFailed" });
        continue;
      }
      const originals = new Map(contents(item).map((entry) => [entry.id, fingerprint(entry)]));
      let outcome;
      try {
        const prepared = await prepare(item);
        outcome = unchangedContents(item, originals)
          ? await receive(actor, item, prepared, container)
          : { created: [], arrived: false, failure: "moveFailed" };
      } catch {
        outcome = { created: [], arrived: false, failure: "unconfirmed" };
      }
      outcomes.push({ item, ...outcome });
      if (outcome.failure === "recovery" || outcome.failure === "unconfirmed") break;
    }
    return outcomes;
  });
}

/** Copy batches retain dnd5e's batch rules; the receipt controls presentation only, never source deletion. */
export function receiveDroppedCopies(actor, prepare, { container = null } = {}) {
  return withActors([actor], async () => {
    const prepared = await prepare();
    const watches = prepared.items.map((item) => watchArrival(actor, item, droppedItemContainer(actor, container)));
    try {
      const created = await prepared.create();
      for (const watch of watches) watch.seal();
      const arrived = created.length > 0 || (await Promise.all(watches.map((watch) => watch.receipt()))).some(Boolean);
      return { created, arrived };
    } finally {
      for (const watch of watches) watch.close();
    }
  });
}

function withActors(actors, run) {
  const keys = [...new Set(actors.map((actor) => actor.uuid ?? actor))];
  const waiting = keys.map((key) => pending.get(key)).filter(Boolean);
  const operation = Promise.all(waiting.map((previous) => previous.catch(() => {}))).then(run);
  for (const key of keys) pending.set(key, operation);
  const clean = () => { for (const key of keys) if (pending.get(key) === operation) pending.delete(key); };
  operation.then(clean, clean);
  return operation;
}
