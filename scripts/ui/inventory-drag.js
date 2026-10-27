// ─────────────────────────────────────────────────────────
// AIM: Actor Window - dragging inventory rows: into and out of containers, manual order, out of the window
// ─────────────────────────────────────────────────────────

import { containerDropRefusal, listPrefsFor } from "../core/inventory.js";
import { validateContainerDrop } from "../integrations/weighty-containers.js";
import { setItemContainer } from "./item-actions.js";
import { MODULE_ID } from "../constants.js";

/** Hovering a folded tray this long while dragging unfolds it. */
const SPRING_MS = 500;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

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
function dropTarget(node, event, manual, dragged) {
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
  if (section) return { kind: "root", node: section, id: null };
  return null;
}

function shake(node) {
  if (!node) return;
  node.classList.remove("is-refused");
  void node.offsetWidth;
  node.classList.add("is-refused");
  node.addEventListener("animationend", () => node.classList.remove("is-refused"), { once: true });
}

/**
 * Drag listeners for the window's rows, bound once on the window element.
 * Drops from outside the window are left to the external drop (#39).
 * @param {ActorWindow} app
 */
export function bindInventoryDrag(app) {
  const el = app.element;
  let dragged = null;
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
    el.querySelector(".aim-row.is-dragging")?.classList.remove("is-dragging");
    dragged = null;
  };

  // A row dragged out of the window carries the item's own drag data, so sheets, the canvas and Item Piles take it.
  el.addEventListener("dragstart", (event) => {
    const row = event.target.closest?.("[data-row]");
    const item = row && app.actor.items.get(row.closest("[data-item-id]")?.dataset.itemId);
    if (!item || !app.canEdit) return;
    event.dataTransfer.setData("text/plain", JSON.stringify({ ...item.toDragData(), aimActorUuid: app.actorKey, aimItemId: item.id }));
    event.dataTransfer.effectAllowed = "copyMove";
    row.classList.add("is-dragging");
    dragged = item;
  });

  el.addEventListener("dragover", (event) => {
    if (!dragged) return;
    const manual = listPrefsFor(game.settings.get(MODULE_ID, "listPrefs"), "equipment").sort === "manual";
    const target = dropTarget(event.target, event, manual, dragged);
    light(target);
    if (!target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    // A folded tray opens after half a second under the pointer, so an item can reach any nested container.
    const folded = event.target.closest?.(".aim-tray.is-folded > .aim-tray-head")?.parentElement ?? null;
    if (folded !== spring.tray) {
      stopSpring();
      if (folded) spring = { tray: folded, timer: setTimeout(() => folded.classList.remove("is-folded"), SPRING_MS) };
    }
  });

  el.addEventListener("dragleave", (event) => {
    if (dragged && !el.contains(event.relatedTarget)) { light(null); stopSpring(); }
  });

  el.addEventListener("drop", (event) => {
    if (!dragged) return;
    const manual = listPrefsFor(game.settings.get(MODULE_ID, "listPrefs"), "equipment").sort === "manual";
    const target = dropTarget(event.target, event, manual, dragged);
    const item = dragged;
    reset();
    if (!target) return;
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
