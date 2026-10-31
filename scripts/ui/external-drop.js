// ─────────────────────────────────────────────────────────
// AIM: Actor Window - drops from outside the actor (ADR 0004): sidebar, compendium, chat, journal, bastion cards,
// another actor's sheet or window
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID } from "../constants.js";
import { dropBehavior, landedOutside, refusedType, spellBecomes } from "../core/external-drop.js";
import { createDroppedItems, createDroppedSpell, droppedItemContainer, sheetUnsupportedTypes } from "../integrations/dnd5e.js";
import { isItemPile } from "../integrations/item-piles.js";
import { validateContainerDrop } from "../integrations/weighty-containers.js";
import { isTradeLocked } from "../trade/service.js";
import { t } from "./html.js";
import { moveDroppedItems, receiveDroppedCopies } from "../foundry/external-drop.js";

const NOTE_MS = 2400;
const NONE = Object.freeze({ refusal: null, note: null });


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

/** Spells follow the window's tab: a scroll through dnd5e's dialog on the equipment tab, a spell elsewhere. */
async function prepareCreation(app, event, items, container) {
  const actor = app.actor;
  const spells = items.filter((item) => item.type === "spell");
  const rest = items.filter((item) => item.type !== "spell");
  const keptSpells = [];
  if (spells.length && spellBecomes(app.tab) === "spell") {
    keptSpells.push(...spells);
  } else {
    for (const spell of spells) {
      const scroll = await Item.implementation.createScrollFromSpell(spell);
      if (scroll) rest.push(scroll);
    }
  }
  // The copies carry «Новое» from the start; keepId keeps a container's contents with it.
  // The source actor's slot stays behind, as in a trade: on this actor it would steer the next equip.
  const marked = rest.map((item) => item.clone({ [`flags.${MODULE_ID}.${FLAGS.TRADE_NEW}`]: true, [`flags.${MODULE_ID}.${FLAGS.SLOT}`]: null }, { keepId: true }));
  return {
    items: [...keptSpells, ...marked],
    async create() {
      const created = [];
      for (const spell of keptSpells) created.push(...await createDroppedSpell(actor, event, spell));
      if (marked.length) created.push(...await createDroppedItems(actor, event, marked, { container }));
      return created;
    }
  };
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
  if (!app.canEdit) return { refusal: t("AIM.notifications.noPermission"), note: null };
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if (!data?.type) return NONE;
  if (isTradeLocked(actor)) return { refusal: t("AIM.window.drop.trade"), note: null };
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
  if (source && source.uuid !== actor.uuid && isTradeLocked(source)) return { refusal: t("AIM.window.drop.trade"), note: null };
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

  const created = [];
  let arrived = false;
  let failure = null;
  let moved = 0;
  // Copies keep dnd5e's batch rules (including its multiple-advancement guard). Moves complete one source at a time.
  if (behavior === "copy") {
    const outcome = await receiveDroppedCopies(actor, () => prepareCreation(app, event, items, container), { container });
    created.push(...outcome.created);
    arrived = outcome.arrived;
  } else {
    const outcomes = await moveDroppedItems(actor, items, (item) => prepareCreation(app, event, [item], container), { container });
    for (const outcome of outcomes) {
      const item = outcome.item;
      if (outcome.arrived) { created.push(...outcome.created); arrived = true; moved++; }
      if (!outcome.failure) continue;
      const text = t(`AIM.window.drop.${outcome.failure}`, {
        item: item.name ?? item.id,
        source: `${item.parent.name ?? item.parent.id} (${item.parent.uuid})`,
        target: `${actor.name ?? actor.id} (${actor.uuid})`
      });
      failure ??= text;
      if (outcome.failure === "recovery" || outcome.failure === "unconfirmed") {
        ui.notifications?.error(text, { permanent: true });
        break;
      }
    }
  }
  app.landItems(created.map((item) => item.id).filter(Boolean));
  if (failure) return { refusal: moved ? t("AIM.window.drop.partial", { count: moved, reason: failure }) : failure, note: null };
  // Weighty Containers refuses an overflowing container in its own words; the tray still shakes.
  if (container && !arrived) return { refusal: null, note: null, shakeTray: true };
  // A sheet that cannot put items into a container (Tidy) leaves them in the inventory root (ADR 0004).
  const outside = container && (droppedItemContainer(actor, container) === null || landedOutside(created.map((item) => item.system?.container), container.id));
  return { refusal: null, note: outside ? t("AIM.window.drop.root") : null };
}
