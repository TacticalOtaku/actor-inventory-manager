// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Drag & Drop Controller
// ─────────────────────────────────────────────────────────

import { isPhysicalItem } from "../core/item-classifier.js";
import { validateContainerDrop } from "../integrations/weighty-containers.js";
import { LOG } from "../foundry/logger.js";
import { equipItemToSlot, setItemContainer, unequipItem, wouldCreateContainerCycle } from "./item-actions.js";

export class DragDropController {
  constructor(app) {
    this.app = app;
    this._listenersAbort = null;
  }

  bind(element) {
    this._listenersAbort?.abort();
    this._listenersAbort = new AbortController();
    const { signal } = this._listenersAbort;

    // Draggable items
    const draggables = element.querySelectorAll("[data-drag-item]");
    for (const el of draggables) {
      el.setAttribute("draggable", "true");
      el.addEventListener("dragstart", e => this._onDragStart(e), { signal });
    }

    // Drop targets: slots, containers, inventory grid
    const dropTargets = element.querySelectorAll("[data-drop-target]");
    for (const el of dropTargets) {
      el.addEventListener("dragover", e => this._onDragOver(e), { signal });
      el.addEventListener("dragleave", e => this._onDragLeave(e), { signal });
      el.addEventListener("drop", e => this._onDrop(e), { signal });
    }
  }

  unbind() {
    this._listenersAbort?.abort();
    this._listenersAbort = null;
  }

  _onDragStart(event) {
    // Nested rows sit inside draggable cards; only the innermost one starts the drag.
    event.stopPropagation();
    const target = event.currentTarget;
    const itemId = target.dataset.itemId;
    const fromSlot = target.dataset.slotId;
    const actor = this.app.actor;

    const dragData = {
      type: "Item",
      uuid: target.dataset.itemUuid || (actor ? `${actor.uuid}.Item.${itemId}` : null),
      itemId,
      actorId: actor?.id,
      actorUuid: actor?.uuid,
      fromSlot: fromSlot || null
    };

    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = "move";
    target.classList.add("is-dragging");

    target.addEventListener("dragend", () => {
      target.classList.remove("is-dragging");
    }, { once: true });
  }

  _onDragOver(event) {
    event.preventDefault();
    // Containers sit inside the inventory area: highlight only the innermost target.
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.add("drag-hover");
  }

  _onDragLeave(event) {
    const dropTarget = event.currentTarget;
    // Moving onto a child element fires dragleave on the parent; ignore that flicker.
    if (event.relatedTarget && dropTarget.contains(event.relatedTarget)) return;
    dropTarget.classList.remove("drag-hover");
  }

  async _onDrop(event) {
    event.preventDefault();
    // Without this a drop on a container would also reach the inventory area
    // around it and race a second, contradictory update.
    event.stopPropagation();
    const dropTarget = event.currentTarget;
    dropTarget.classList.remove("drag-hover");

    let dragData = null;
    try {
      dragData = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }

    if (!dragData || dragData.type !== "Item") return;

    const actor = this.app.actor;
    if (!actor) return;

    // Only items of this very actor are rearranged here (token actors share ids).
    const sameActor = !dragData.actorUuid || dragData.actorUuid === actor.uuid;
    const item = sameActor && dragData.itemId ? actor.items.get(dragData.itemId) : null;
    if (!item || item.parent !== actor) return;

    const dropType = dropTarget.dataset.dropTarget; // "slot", "container", "inventory"

    if (dropType === "slot") {
      const targetSlotId = dropTarget.dataset.slotId;
      if (targetSlotId) await equipItemToSlot(actor, item, targetSlotId);
      return;
    }

    if (!isPhysicalItem(item)) return;

    if (dropType === "container") {
      const containerId = dropTarget.dataset.containerId;
      const containerItem = actor.items.get(containerId);
      if (!containerItem || containerItem.id === item.id || item.system?.container === containerId) return;
      if (wouldCreateContainerCycle(actor, item, containerId)) {
        ui.notifications?.warn(game.i18n.format("AIM.containers.cycle", { item: item.name }));
        return;
      }
      // Weighty Containers' content rules; its capacity check runs in its own hook.
      const validation = validateContainerDrop(containerItem, item);
      if (!validation.ok) {
        ui.notifications?.warn(validation.reason);
        LOG.warn("Container drop rejected by Weighty Containers rules", validation);
        return;
      }
      await setItemContainer(item, containerId);
    } else if (dropType === "inventory") {
      // Dropped into general inventory: unequip or remove from container
      if (item.system?.equipped) {
        await unequipItem(actor, item);
      } else if (item.system?.container) {
        await setItemContainer(item, null);
      }
    }
  }
}
