// ─────────────────────────────────────────────────────────
// AIM: Actor Window - dragging inventory rows: into and out of containers, manual order, out of the window
// ─────────────────────────────────────────────────────────

import { isItemAttuned } from "../core/attunement.js";
import { containerDropRefusal, listPrefsFor } from "../core/inventory.js";
import { validateContainerDrop } from "../integrations/weighty-containers.js";
import { isItemCompatibleWithSlot } from "../core/item-classifier.js";
import { equipItemToSlot, setItemContainer, toggleAttunement, unequipItem } from "./item-actions.js";
import { MODULE_ID } from "../constants.js";
import { dropFromOutside, noteDrop, refuseDrop, showDropTarget } from "./external-drop.js";
import { t } from "./html.js";

/** Hovering a folded tray this long while dragging unfolds it. */
const SPRING_MS = 500;


/** Rows of one list: the same parent, and the same type at the root (sections) or any non-container inside a tray. */
function sameList(a, b) {
  const parent = a.system.container ?? null;
  if (parent !== (b.system.container ?? null)) return false;
  if (a.type === "container" || b.type === "container") return false;
  return parent ? true : a.type === b.type;
}

/**
 * Where a drop lands. With the manual order a row of the same list takes the item before or after itself;
 * otherwise a tray puts it in that container and a section takes it out of its container.
 */
function dropTarget(node, event, manual, dragged, fromDoll) {
  // A row dropped on the offer of an open trade offers the whole stack.
  const offer = node.closest?.("[data-offer-drop]");
  if (offer) return { kind: "offer", node: offer };
  // Anything dropped on the favorites list is starred there.
  const favorites = node.closest?.("[data-favorites]");
  if (favorites) return { kind: "favorite", node: favorites };
  const slot = node.closest?.(".aim-slot[data-slot]");
  if (slot) return { kind: "slot", node: slot, id: slot.dataset.slot };
  const attune = node.closest?.("[data-attune]");
  if (attune) return { kind: "attune", node: attune };
  if (node.closest?.("[data-doll]")) return null;
  const row = node.closest?.("[data-row]");
  const wrap = row?.closest("[data-item-id]");
  if (manual && wrap && wrap.dataset.itemId !== dragged.id) {
    const target = dragged.actor.items.get(wrap.dataset.itemId);
    if (target && sameList(target, dragged) && !row.closest(".aim-tray-head")) {
      const box = row.getBoundingClientRect();
      return { kind: "sort", node: row, target, before: event.clientY < box.top + box.height / 2 };
    }
  }
  const tray = node.closest?.("[data-tray]");
  if (tray) return { kind: "container", node: tray, id: tray.dataset.tray };
  const section = node.closest?.(".aim-section");
  // A tile dragged out of the doll onto the list is taken off.
  if (section) return fromDoll ? { kind: "unequip", node: section } : { kind: "root", node: section, id: null };
  return null;
}

/** Rows, doll tiles, slotless chips and attunement sockets can all be dragged. */
const DRAGGABLE = "[data-row], .aim-slot.is-filled, .aim-slotless-item, .aim-socket.is-on";

function shake(node) {
  if (!node) return;
  node.classList.remove("is-refused");
  void node.offsetWidth;
  node.classList.add("is-refused");
  node.addEventListener("animationend", () => node.classList.remove("is-refused"), { once: true });
}

/**
 * Drag listeners for the window's rows, bound once on the window element.
 * Drops from outside the actor go to the external drop (ADR 0004); an observer's window takes none.
 * @param {ActorWindow} app
 */
export function bindInventoryDrag(app) {
  const el = app.element;
  let dragged = null;
  let fromDoll = false;
  let fromSocket = false;
  // Trays that sprang open under the drag stay open after it.
  const sprung = new Set();
  // A favorite row being reordered, or a slot track, an effect, a skill or a tool dragged into the favorites.
  let draggedFav = null;
  let draggedNew = null;
  let lit = null;
  let spring = { tray: null, timer: null };

  const light = (target) => {
    const node = target?.node ?? null;
    const cls = target?.kind === "sort" ? (target.before ? "is-drop-before" : "is-drop-after") : "is-drop";
    if (lit?.node === node && lit?.cls === cls) return;
    lit?.node.classList.remove(lit.cls);
    lit = node ? { node, cls } : null;
    node?.classList.add(cls);
  };
  const stopSpring = () => {
    clearTimeout(spring.timer);
    spring = { tray: null, timer: null };
  };
  const reset = () => {
    light(null);
    stopSpring();
    el.querySelector(".is-dragging")?.classList.remove("is-dragging");
    for (const slot of el.querySelectorAll(".aim-slot.is-fit")) slot.classList.remove("is-fit");
    dragged = null;
    fromDoll = fromSocket = false;
    if (sprung.size) {
      const folds = { ...game.settings.get(MODULE_ID, "trayFolds") };
      for (const id of sprung) {
        const tray = app.actor.items.get(id);
        if (tray) folds[tray.uuid] = false;
      }
      sprung.clear();
      game.settings.set(MODULE_ID, "trayFolds", folds);
    }
    draggedFav = null;
    draggedNew = null;
  };

  /** Favorites take a dragged favorite (to reorder it before or after a row) or a slot track. */
  const favoriteTarget = (event) => {
    const list = event.target.closest?.("[data-favorites]");
    if (!list) return null;
    const row = event.target.closest?.("[data-fav-id]");
    if (draggedFav && row && row.dataset.favId !== draggedFav) {
      const box = row.getBoundingClientRect();
      return { kind: "reorder", node: row, id: row.dataset.favId, before: event.clientY < box.top + box.height / 2 };
    }
    return draggedNew ? { kind: "favorite", node: list } : null;
  };

  // A row dragged out of the window carries the item's own drag data, so sheets, the canvas and Item Piles take it.
  el.addEventListener("dragstart", (event) => {
    const fav = event.target.closest?.("[data-fav-id]");
    const track = event.target.closest?.("[data-fav-type]");
    if ((fav || track) && app.canEdit) {
      draggedFav = fav?.dataset.favId ?? null;
      draggedNew = track ? { type: track.dataset.favType, id: track.dataset.favKey } : null;
      event.dataTransfer.setData("text/plain", JSON.stringify({ aimActorUuid: app.actorKey, aimFavorite: draggedFav, aimNew: draggedNew }));
      event.dataTransfer.effectAllowed = "link";
      (fav ?? track).classList.add("is-dragging");
      return;
    }
    const source = event.target.closest?.(DRAGGABLE);
    const item = source && app.actor.items.get(source.closest("[data-item-id]")?.dataset.itemId);
    if (!item || !app.canEdit) return;
    event.dataTransfer.setData("text/plain", JSON.stringify({ ...item.toDragData(), aimActorUuid: app.actorKey, aimItemId: item.id }));
    event.dataTransfer.effectAllowed = "copyMove";
    source.classList.add("is-dragging");
    dragged = item;
    fromDoll = !source.matches("[data-row]");
    fromSocket = source.matches(".aim-socket");
    // The slots the item fits glow while it is dragged.
    for (const slot of el.querySelectorAll(".aim-slot[data-slot]")) {
      slot.classList.toggle("is-fit", isItemCompatibleWithSlot(item, slot.dataset.slot, app.actor));
    }
  });

  el.addEventListener("dragover", (event) => {
    if (draggedFav || draggedNew) {
      const target = favoriteTarget(event);
      light(target?.kind === "reorder" ? { ...target, kind: "sort" } : target);
      if (target) { event.preventDefault(); event.dataTransfer.dropEffect = "link"; }
      return;
    }
    if (!dragged) {
      if (!app.canEdit) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      showDropTarget(app, true);
      light(event.target.closest?.("[data-tray]") ? { node: event.target.closest("[data-tray]") } : null);
      return;
    }
    const manual = listPrefsFor(game.settings.get(MODULE_ID, "listPrefs"), "equipment").sort === "manual";
    const target = dropTarget(event.target, event, manual, dragged, fromDoll);
    light(target);
    if (!target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    // A folded tray opens after half a second under the pointer, so an item can reach any nested container.
    const folded = event.target.closest?.(".aim-tray.is-folded > .aim-tray-head")?.parentElement ?? null;
    if (folded !== spring.tray) {
      stopSpring();
      if (folded) spring = { tray: folded, timer: setTimeout(() => {
        folded.classList.remove("is-folded");
        folded.querySelector(".aim-tray-toggle")?.setAttribute("aria-expanded", "true");
        sprung.add(folded.dataset.tray);
      }, SPRING_MS) };
    }
  });

  el.addEventListener("dragleave", (event) => {
    if (el.contains(event.relatedTarget)) return;
    light(null);
    stopSpring();
    showDropTarget(app, false);
  });

  el.addEventListener("drop", (event) => {
    if (draggedFav || draggedNew) {
      const target = favoriteTarget(event);
      const fav = draggedFav;
      const added = draggedNew;
      reset();
      if (!target) return;
      event.preventDefault();
      if (target.kind === "reorder") app.reorderFavorite(fav, target.id, target.before);
      else if (added) app.addFavorite(added);
      return;
    }
    if (!dragged) {
      showDropTarget(app, false);
      light(null);
      if (!app.canEdit) return;
      event.preventDefault();
      event.stopPropagation();
      const tray = app.tab === "equipment" ? event.target.closest?.("[data-tray]")?.dataset.tray ?? null : null;
      dropFromOutside(app, event, { tray })
        .then(({ refusal, note, shakeTray }) => {
          if (refusal) refuseDrop(app, event, refusal);
          else if (note) noteDrop(app, event, note);
          if (shakeTray) shake(app.element.querySelector(`[data-tray="${tray}"]`));
        })
        .catch((error) => console.error("AIM | drop from outside failed", error));
      return;
    }
    const manual = listPrefsFor(game.settings.get(MODULE_ID, "listPrefs"), "equipment").sort === "manual";
    const target = dropTarget(event.target, event, manual, dragged, fromDoll);
    // A socket dragged out of the doll ends the attunement; the item stays worn.
    if (target?.kind === "unequip" && fromSocket) target.kind = "unattune";
    // Another client may have deleted the item mid-drag.
    const item = app.actor.items.get(dragged.id);
    reset();
    if (!target || !item) return;
    event.preventDefault();
    event.stopPropagation();
    moveInventoryItem(app, item, target);
  });

  el.addEventListener("dragend", reset);
}

/**
 * Moves an item where it was dropped: before or after a row, into a container (Weighty Containers checks it first,
 * a container never goes into itself), or out of its container. The item's type, and so its section, never changes.
 */
export async function moveInventoryItem(app, item, target) {
  if (!app.canEdit) return;
  // A slot equips through the equipment rules; a refusal shakes it with the reason the rules give.
  if (target.kind === "slot") {
    if (item.system.equipped && app.element.querySelector(`.aim-slot[data-slot="${target.id}"][data-item-id="${item.id}"]`)) return;
    if (!await equipItemToSlot(item.actor, item, target.id)) shake(app.element.querySelector(`.aim-slot[data-slot="${target.id}"]`));
    return;
  }
  if (target.kind === "favorite") return app.addFavorite({ type: "item", id: item.getRelativeUUID(item.actor) });
  if (target.kind === "offer") return app.offerItem(item, Number(item.system?.quantity ?? 1));
  if (target.kind === "attune") return isItemAttuned(item) ? undefined : app.attuneWithLimit(item, null);
  if (target.kind === "unequip") return item.system.equipped ? unequipItem(item.actor, item) : undefined;
  if (target.kind === "unattune") return isItemAttuned(item) ? toggleAttunement(item) : undefined;
  if (target.kind === "sort") {
    // Siblings go in the order the list shows (sort, then name), so equal sort values keep their visible order.
    const siblings = item.actor.items.filter((i) => i.id !== item.id && sameList(i, item))
      .sort((x, y) => (x.sort - y.sort) || x.name.localeCompare(y.name, game.i18n.lang));
    return item.sortRelative({ target: target.target, siblings, sortBefore: target.before });
  }
  const entries = item.actor.items.map((i) => ({ id: i.id, container: i.system.container ?? null }));
  const refusal = containerDropRefusal(entries, item.id, target.id);
  if (refusal === "same") return;
  const container = target.id ? item.actor.items.get(target.id) : null;
  if (refusal) {
    shake(target.node);
    return ui.notifications.warn(t(refusal === "self" ? "AIM.window.inv.dropSelf" : "AIM.window.inv.dropInside", { item: item.name, container: container?.name ?? "" }));
  }
  if (container) {
    const check = validateContainerDrop(container, item);
    if (!check.ok) {
      shake(target.node);
      return ui.notifications.warn(check.reason);
    }
  }
  await setItemContainer(item, target.id);
  // Weighty Containers refuses an overflowing container in its own words; the tray still shakes.
  if ((item.actor.items.get(item.id)?.system.container ?? null) !== (target.id ?? null)) shake(app.element.querySelector(`[data-tray="${target.id}"]`));
}
