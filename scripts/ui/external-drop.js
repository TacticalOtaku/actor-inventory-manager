// ─────────────────────────────────────────────────────────
// AIM: Actor Window - drops from outside the actor (ADR 0004): sidebar, compendium, chat, journal, bastion cards,
// another actor's sheet or window
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID } from "../constants.js";
import { dropBehavior, landedOutside, received, refusedType, spellBecomes } from "../core/external-drop.js";
import { createDroppedItems, createDroppedSpell, sheetUnsupportedTypes } from "../integrations/dnd5e.js";
import { isItemPile } from "../integrations/item-piles.js";
import { validateContainerDrop } from "../integrations/weighty-containers.js";
import { sessionFor } from "../trade/service.js";
import { t } from "./html.js";

const NOTE_MS = 2400;
const NONE = Object.freeze({ refusal: null, note: null });

const quantities = (actor) => new Map(actor.items.map((item) => [item.id, Number(item.system?.quantity ?? 1)]));
const STACK_WAIT_MS = 3000;
// A running exchange locks the inventory, as it locks the window's own drags.
const tradeLocked = (actor) => ["executing", "recovery"].includes(sessionFor(actor.id)?.status);

/** The open tab's content shows it takes the drop while something from outside is over the window. */
export function showDropTarget(app, on) {
  app.element?.querySelector(".aim-panels")?.classList.toggle("is-drop-outside", on);
}

/** A refusal shakes the open tab and names the reason where the drop was let go. */
export function refuseDrop(app, event, text) {
  const panel = app.element.querySelector(`[data-panel="${app.tab}"]`);
  panel?.classList.remove("is-refused");
  void panel?.offsetWidth;
  panel?.classList.add("is-refused");
  panel?.addEventListener("animationend", () => panel.classList.remove("is-refused"), { once: true });
  noteDrop(app, event, text, true);
}

/** A short line where the drop was let go: why it was refused, or where the item went instead. */
export function noteDrop(app, event, text, refused = false) {
  const root = app.element;
  const box = root.getBoundingClientRect();
  const note = document.createElement("div");
  note.className = `aim-drop-note${refused ? "" : " is-info"}`;
  note.setAttribute("role", "status");
  note.textContent = text;
  note.style.left = `${Math.max(8, Math.min(event.clientX - box.left, box.width - 8))}px`;
  note.style.top = `${Math.max(8, event.clientY - box.top)}px`;
  root.append(note);
  setTimeout(() => note.remove(), NOTE_MS);
}

/** What was dropped, as documents: an item, a folder's items, an effect; null for anything the window ignores. */
async function resolve(data) {
  if (data.type === "Item") return { items: [await Item.implementation.fromDropData(data)].filter(Boolean) };
  if (data.type === "Folder") {
    const folder = await Folder.implementation.fromDropData(data);
    if (folder?.type !== "Item") return null;
    const items = await Promise.all(folder.contents.map((entry) => (entry instanceof Item ? entry : fromUuid(entry.uuid))));
    return { items: items.filter(Boolean) };
  }
  if (data.type === "ActiveEffect") return { effect: await ActiveEffect.implementation.fromDropData(data) };
  return null;
}

/**
 * Whether the actor got the drop. dnd5e stacks an identical consumable onto the actor's own without awaiting that
 * update, so a drop that created nothing waits for the stack to grow (a refused drop waits out the timeout).
 */
function arrival(actor, before, created) {
  if (created.length || received(before, quantities(actor))) return Promise.resolve(received(before, quantities(actor)));
  return new Promise((resolve) => {
    const done = (value) => { Hooks.off("updateItem", hook); clearTimeout(timer); resolve(value); };
    const hook = Hooks.on("updateItem", (item) => item.parent === actor && received(before, quantities(actor)) && done(true));
    const timer = setTimeout(() => done(false), STACK_WAIT_MS);
  });
}

/** Spells follow the window's tab: a scroll through dnd5e's dialog on the equipment tab, a spell elsewhere. */
async function create(app, event, items, container) {
  const actor = app.actor;
  const spells = items.filter((item) => item.type === "spell");
  const rest = items.filter((item) => item.type !== "spell");
  const created = [];
  if (spells.length && spellBecomes(app.tab) === "spell") {
    for (const spell of spells) created.push(...await createDroppedSpell(actor, event, spell));
  } else {
    for (const spell of spells) {
      const scroll = await Item.implementation.createScrollFromSpell(spell);
      if (scroll) rest.push(scroll);
    }
  }
  // The copies carry «Новое» from the start; keepId keeps a container's contents with it.
  // The source actor's slot stays behind, as in a trade: on this actor it would steer the next equip.
  const marked = rest.map((item) => item.clone({ [`flags.${MODULE_ID}.${FLAGS.TRADE_NEW}`]: true, [`flags.${MODULE_ID}.${FLAGS.SLOT}`]: null }, { keepId: true }));
  if (marked.length) created.push(...await createDroppedItems(actor, event, marked, { container }));
  return created;
}

/**
 * Takes a drop from outside the actor: resolves it, fires `dropActorSheetData`, then copies, moves or refuses it
 * (ADR 0004). Returns the reason when it is refused, or a note about where the item went.
 * @param {ActorWindow} app
 * @param {DragEvent} event
 * @param {{tray: string|null}} where  the container tray it was dropped on
 * @returns {Promise<{refusal: string|null, note: string|null, shakeTray?: boolean}>}
 */
export async function dropFromOutside(app, event, { tray = null } = {}) {
  const actor = app.actor;
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if (!data?.type) return NONE;
  if (tradeLocked(actor)) return { refusal: t("AIM.window.drop.trade"), note: null };
  if (data.type === "Actor") return { refusal: t("AIM.window.drop.actor"), note: null };
  const dropped = await resolve(data);
  if (!dropped) return NONE;
  if (Hooks.call("dropActorSheetData", actor, actor.sheet, data) === false) return NONE;

  if (dropped.effect) {
    const effect = dropped.effect;
    if ([effect.parent, effect.parent?.parent].includes(actor)) return NONE;
    await ActiveEffect.implementation.create(effect.toObject(), { parent: actor });
    return NONE;
  }

  const items = dropped.items;
  if (!items.length) return NONE;
  // An actor in a compendium is a source to copy from, as the dnd5e sheet does, never one to move out of.
  const parent = items[0].parent;
  const source = parent?.documentName === "Actor" && !parent.pack ? parent : null;
  // A move would delete from an actor whose exchange is running; its preDeleteItem refuses and the item would double.
  if (source && source.uuid !== actor.uuid && tradeLocked(source)) return { refusal: t("AIM.window.drop.trade"), note: null };
  const { behavior, refusal } = dropBehavior({
    fromActor: Boolean(source),
    sameActor: source?.uuid === actor.uuid,
    isPile: Boolean(source && isItemPile(source)),
    ownsSource: Boolean(source?.isOwner),
    isGM: game.user.isGM,
    shift: event.shiftKey
  });
  if (refusal) return { refusal: t(`AIM.window.drop.${refusal}`), note: null };
  if (!behavior) return NONE;
  const type = refusedType(items.map((item) => item.type), sheetUnsupportedTypes(actor));
  if (type) return { refusal: t("AIM.window.drop.type", { type: game.i18n.localize(CONFIG.Item.typeLabels[type] ?? type) }), note: null };
  const container = tray ? actor.items.get(tray) : null;
  for (const item of container ? items : []) {
    const check = validateContainerDrop(container, item);
    if (!check.ok) return { refusal: check.reason, note: null };
  }

  const before = quantities(actor);
  const created = await create(app, event, items, container);
  app.landItems(created.map((item) => item.id).filter(Boolean));
  const arrived = await arrival(actor, before, created);
  // A move finishes only once the actor has it: then the source goes, with its contents. If the source keeps an item
  // (a hook refused the delete), the copies go instead, so nothing exists twice.
  if (behavior === "move" && arrived) {
    for (const item of items) await item.delete({ deleteContents: true });
    if (items.some((item) => source.items.has(item.id))) {
      const copies = created.map((item) => item.id).filter((id) => actor.items.has(id));
      if (copies.length) await actor.deleteEmbeddedDocuments("Item", copies);
      return { refusal: t("AIM.window.drop.moveFailed"), note: null };
    }
  }
  // Weighty Containers refuses an overflowing container in its own words; the tray still shakes.
  if (container && !arrived) return { refusal: null, note: null, shakeTray: true };
  // A sheet that cannot put items into a container (Tidy) leaves them in the inventory root (ADR 0004).
  const outside = container && landedOutside(created.map((item) => item.system?.container), container.id);
  return { refusal: null, note: outside ? t("AIM.window.drop.root") : null };
}
