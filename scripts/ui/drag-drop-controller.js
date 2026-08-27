// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Drag & Drop Controller
// ─────────────────────────────────────────────────────────

import { validateContainerDrop } from "../integrations/weighty-containers.js";
import { LOG } from "../foundry/logger.js";
import { equipItemToSlot, setItemContainer, unequipItem } from "./item-actions.js";

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
    const target = event.currentTarget;
    const itemId = target.dataset.itemId;
    const fromSlot = target.dataset.slotId;
    const actor = this.app.actor;

    const dragData = {
      type: "Item",
      uuid: target.dataset.itemUuid || (actor ? `${actor.uuid}.Item.${itemId}` : null),
      itemId,
      actorId: actor?.id,
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
    event.dataTransfer.dropEffect = "move";
    const dropTarget = event.currentTarget;
    dropTarget.classList.add("drag-hover");
  }

  _onDragLeave(event) {
    const dropTarget = event.currentTarget;
    dropTarget.classList.remove("drag-hover");
  }

  async _onDrop(event) {
    event.preventDefault();
    const dropTarget = event.currentTarget;
    dropTarget.classList.remove("drag-hover");

    let dragData = null;
    try {
      const raw = event.dataTransfer.getData("text/plain");
      dragData = JSON.parse(raw);
    } catch {
      return;
    }

    if (!dragData || dragData.type !== "Item") return;

    const actor = this.app.actor;
    if (!actor) return;

    const item = dragData.itemId ? actor.items.get(dragData.itemId) : await fromUuid(dragData.uuid);
    if (!item) return;

    // Check if item belongs to this actor or is being added to actor
    if (item.parent?.id !== actor.id) {
      // Dropping an item from world/compendium onto the actor
      return;
    }

    const dropType = dropTarget.dataset.dropTarget; // "slot", "container", "inventory"

    if (dropType === "slot") {
      const targetSlotId = dropTarget.dataset.slotId;
      if (targetSlotId) {
        await equipItemToSlot(actor, item, targetSlotId);
      }
    } else if (dropType === "container") {
      const containerId = dropTarget.dataset.containerId;
      const containerItem = actor.items.get(containerId);
      if (containerItem && containerItem.id !== item.id) {
        // Validate with Weighty Containers
        const validation = validateContainerDrop(containerItem, item);
        if (!validation.ok) {
          ui.notifications?.warn(validation.reason);
          LOG.warn("Container drop rejected by Weighty Containers rules", validation);
          return;
        }
        await setItemContainer(item, containerId);
      }
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
