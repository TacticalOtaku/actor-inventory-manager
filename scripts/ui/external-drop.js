// ─────────────────────────────────────────────────────────
// AIM: Actor Window - drops from outside the actor (ADR 0004): sidebar, compendium, chat, journal, bastion cards,
// another actor's sheet or window
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID } from "../constants.js";
import { dropBehavior, received, refusedType, spellBecomes } from "../core/external-drop.js";
import { createDroppedItems, createDroppedSpell, sheetUnsupportedTypes } from "../integrations/dnd5e.js";
import { isItemPile } from "../integrations/item-piles.js";
import { validateContainerDrop } from "../integrations/weighty-containers.js";
import { sessionFor } from "../trade/service.js";

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const NOTE_MS = 2400;

const quantities = (actor) => new Map(actor.items.map((item) => [item.id, Number(item.system?.quantity ?? 1)]));
// A running exchange locks the inventory, as it locks the window's own drags.
const tradeLocked = (actor) => ["executing", "recovery"].includes(sessionFor(actor.id)?.status);

/** The open tab's content shows it takes the drop while something from outside is over the window. */
export function showDropTarget(app, on) {
  app.element?.querySelector(".aim-panels")?.classList.toggle("is-drop-outside", on);
}

/** A refusal shakes the open tab and names the reason where the drop was let go. */
export function refuseDrop(app, event, text) {
  const root = app.element;
  const panel = root.querySelector(`[data-panel="${app.tab}"]`);
  panel?.classList.remove("is-refused");
  void panel?.offsetWidth;
  panel?.classList.add("is-refused");
  panel?.addEventListener("animationend", () => panel.classList.remove("is-refused"), { once: true });
  const box = root.getBoundingClientRect();
  const note = document.createElement("div");
  note.className = "aim-drop-note";
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
  const marked = rest.map((item) => item.clone({ [`flags.${MODULE_ID}.${FLAGS.TRADE_NEW}`]: true }, { keepId: true }));
  if (marked.length) created.push(...await createDroppedItems(actor, event, marked, { container }));
  return created;
}

/**
 * Takes a drop from outside the actor: resolves it, fires `dropActorSheetData`, then copies, moves or refuses it
 * (ADR 0004). Returns the reason when it is refused, null otherwise.
 * @param {ActorWindow} app
 * @param {DragEvent} event
 * @param {{tray: string|null}} where  the container tray it was dropped on
 */
export async function dropFromOutside(app, event, { tray = null } = {}) {
  const actor = app.actor;
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if (!data?.type) return null;
  if (tradeLocked(actor)) return t("AIM.window.drop.trade");
  if (data.type === "Actor") return t("AIM.window.drop.actor");
  const dropped = await resolve(data);
  if (!dropped) return null;
  if (Hooks.call("dropActorSheetData", actor, actor.sheet, data) === false) return null;

  if (dropped.effect) {
    const effect = dropped.effect;
    if ([effect.parent, effect.parent?.parent].includes(actor)) return null;
    await ActiveEffect.implementation.create(effect.toObject(), { parent: actor });
    return null;
  }

  const items = dropped.items;
  if (!items.length) return null;
  const source = items[0].parent?.documentName === "Actor" ? items[0].parent : null;
  const { behavior, refusal } = dropBehavior({
    fromActor: Boolean(source),
    sameActor: source?.uuid === actor.uuid,
    isPile: Boolean(source && isItemPile(source)),
    ownsSource: Boolean(source?.isOwner),
    isGM: game.user.isGM,
    shift: event.shiftKey
  });
  if (refusal) return t(`AIM.window.drop.${refusal}`);
  if (!behavior) return null;
  const type = refusedType(items.map((item) => item.type), sheetUnsupportedTypes(actor));
  if (type) return t("AIM.window.drop.type", { type: game.i18n.localize(CONFIG.Item.typeLabels[type] ?? type) });
  const container = tray ? actor.items.get(tray) : null;
  for (const item of container ? items : []) {
    const check = validateContainerDrop(container, item);
    if (!check.ok) return check.reason;
  }

  const before = quantities(actor);
  const created = await create(app, event, items, container);
  app.landItems(created.map((item) => item.id).filter(Boolean));
  // A move finishes only once the actor has it: then the source goes, with its contents.
  if (behavior === "move" && received(before, quantities(actor))) {
    for (const item of items) await item.delete({ deleteContents: true });
  }
  return null;
}
