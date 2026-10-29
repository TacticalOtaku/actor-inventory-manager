// ─────────────────────────────────────────────────────────
// AIM: Actor Window - tooltip cards: our own layer on the document body (game.tooltip is left alone),
// nested up to four levels, pinned by holding, middle click or the pin, dragged by the head
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";
import { TIP_TIMING, TIP_MAX_DEPTH, cardsToSweep, openDelay, planClose, planOpen, planPin } from "../core/tooltips.js";
import { damageParts } from "../core/damage-scenes.js";
import { readCardData, readDamageType } from "../integrations/dnd5e.js";
import { startScene } from "./damage-scenes.js";
import { t, unwrapSecrets } from "./html.js";
import { scRarityColor, scSchoolColor } from "../integrations/sc-rarity-colors.js";
import { stampTheme } from "./theme-root.js";

export const TOOLTIP_TEMPLATE = `modules/${MODULE_ID}/templates/window/tooltip-card.hbs`;

/** What opens a card in the window, and inside a card. */
const TRIGGERS = ".aim-dmg[data-dmg], [data-row], .aim-slot[data-item-id], .aim-socket[data-item-id], .aim-slotless-item[data-item-id], [data-effect-row], .aim-fav[data-fav-id], .aim-cond[data-status], a.content-link[data-uuid]";


/** One layer per document, so a detached window shows its cards in its own window. */
const LAYERS = new WeakMap();
const ALL_LAYERS = new Set();

class TooltipLayer {
  constructor(doc) {
    this.doc = doc;
    this.cards = [];
    this.seq = 0;
    this.openTimer = null;
    this.sweepTimer = null;
    this.pointer = { x: -1, y: -1 };
    this.el = doc.createElement("div");
    this.el.className = "aim-root aim-tips";
    doc.body.append(this.el);
    doc.addEventListener("pointermove", (event) => { this.pointer = { x: event.clientX, y: event.clientY }; }, { passive: true });
    bindRoot(this.el, null);
  }

  static for(doc) {
    let layer = LAYERS.get(doc);
    if (!layer?.el.isConnected) {
      ALL_LAYERS.delete(layer);
      LAYERS.set(doc, (layer = new TooltipLayer(doc)));
      ALL_LAYERS.add(layer);
    }
    return layer;
  }

  /** The layer follows the user's theme, accent and motion level, like the window it serves. */
  restamp() {
    stampTheme(this.el);
  }

  /** Is the pointer over this element now? */
  under(el) {
    const node = this.pointer.x < 0 ? null : this.doc.elementFromPoint(this.pointer.x, this.pointer.y);
    return Boolean(node && el.contains(node));
  }

  record(el) {
    return this.cards.find((c) => c.el === el) ?? null;
  }

  schedule(anchor, app) {
    clearTimeout(this.openTimer);
    // A card replaces the native title (and core's tooltip) of what it covers; the text stays for screen readers.
    for (const attr of ["title", "data-tooltip"]) {
      const text = anchor.getAttribute(attr);
      if (text === null) continue;
      if (!anchor.getAttribute("aria-label") && text) anchor.setAttribute("aria-label", text);
      anchor.removeAttribute(attr);
    }
    const inCard = Boolean(anchor.closest(".aim-tip"));
    const liveTop = this.cards.some((c) => !c.pinned && c.depth === 1);
    this.openTimer = setTimeout(() => this.open(anchor, app ?? this.record(anchor.closest(".aim-tip"))?.app), openDelay({ inCard, liveTop }));
  }

  async open(anchor, app) {
    if (!anchor.isConnected || this.cards.some((c) => c.anchor === anchor)) return;
    const parent = this.record(anchor.closest(".aim-tip"));
    const plan = planOpen(this.cards, parent?.id ?? null);
    if (!plan) return;
    const card = anchor.matches(".aim-dmg[data-dmg]") ? await damageCard(anchor.dataset.dmg) : await readCardData(await resolveAnchor(anchor, app));
    // The pointer may have moved on while the document loaded.
    if (!card || !anchor.isConnected || !(this.under(anchor) || anchor.contains(this.doc.activeElement))) return;
    for (const id of plan.replace) this.close(this.cards.find((c) => c.id === id));
    const el = this.doc.createElement("div");
    el.innerHTML = await foundry.applications.handlebars.renderTemplate(TOOLTIP_TEMPLATE, cardContext(card, plan.depth));
    const cardEl = el.firstElementChild;
    tone(cardEl, card);
    // Links inside the card open our cards, not core's or dnd5e's; on the last level they open nothing.
    for (const node of cardEl.querySelectorAll("[data-tooltip], [data-tooltip-html]")) { node.removeAttribute("data-tooltip"); node.removeAttribute("data-tooltip-html"); }
    if (plan.depth >= TIP_MAX_DEPTH) for (const link of cardEl.querySelectorAll("a.content-link")) link.classList.add("is-last");
    this.restamp();
    this.el.append(cardEl);
    place(cardEl, anchor);
    const canvas = cardEl.querySelector("canvas[data-scene]");
    if (canvas) {
      const stop = startScene(canvas, canvas.dataset.scene, card.color ?? getComputedStyle(this.el).getPropertyValue("--accent").trim(), this.el.dataset.motion);
      cardEl.addEventListener("aim-tip-close", stop, { once: true });
    }
    const rec = { id: `tip${++this.seq}`, el: cardEl, anchor, app, parent: parent?.id ?? null, depth: plan.depth, pinned: false, at: 0 };
    this.cards.push(rec);
    this.wire(rec);
  }

  /** Holding, middle click and the pin pin it; the head drags it (pinning it); × and right click close it. */
  wire(rec) {
    const el = rec.el;
    el.addEventListener("pointerenter", () => {
      if (rec.pinned) return;
      el.classList.add("is-pinning");
      rec.hold = setTimeout(() => this.pin(rec), TIP_TIMING.pinHold);
    });
    el.addEventListener("pointerleave", () => {
      clearTimeout(rec.hold);
      el.classList.remove("is-pinning");
      this.queueSweep();
    });
    el.addEventListener("auxclick", (event) => { if (event.button === 1) { event.preventDefault(); this.pin(rec); } });
    el.addEventListener("mousedown", (event) => { if (event.button === 1) event.preventDefault(); });
    el.addEventListener("contextmenu", (event) => { event.preventDefault(); this.close(rec); });
    el.addEventListener("click", (event) => {
      if (event.target.closest("[data-tip-pin]")) this.pin(rec);
      else if (event.target.closest("[data-tip-close]")) this.close(rec);
      else if (event.target.closest("[data-tip-closeall]")) this.cards.filter((c) => c.pinned).forEach((c) => this.close(c));
      else if (event.target.closest("a.content-link.is-last")) { event.preventDefault(); event.stopPropagation(); }
    });
    el.querySelector("[data-tip-drag]")?.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) return;
      event.preventDefault();
      this.pin(rec);
      const box = el.getBoundingClientRect();
      const dx = event.clientX - box.left;
      const dy = event.clientY - box.top;
      const move = (e) => { el.style.left = `${e.clientX - dx}px`; el.style.top = `${e.clientY - dy}px`; };
      const up = () => { this.doc.removeEventListener("pointermove", move); this.doc.removeEventListener("pointerup", up); el.classList.remove("is-dragging"); };
      el.classList.add("is-dragging");
      this.doc.addEventListener("pointermove", move);
      this.doc.addEventListener("pointerup", up);
    });
  }

  pin(rec) {
    if (rec.pinned) return;
    const plan = planPin(this.cards.map(plain), rec.id, ++this.seq);
    for (const next of plan.cards) Object.assign(this.cards.find((c) => c.id === next.id), next);
    clearTimeout(rec.hold);
    rec.el.classList.remove("is-pinning");
    rec.el.classList.add("is-pinned");
    rec.el.querySelector("[data-tip-pin]")?.setAttribute("aria-pressed", "true");
    for (const id of plan.close) this.close(this.cards.find((c) => c.id === id));
    this.footer();
  }

  close(rec) {
    if (!rec || !this.cards.includes(rec)) return;
    const { close, detach } = planClose(this.cards.map(plain), rec.id);
    for (const id of detach) this.cards.find((c) => c.id === id).parent = null;
    for (const id of close) {
      const card = this.cards.find((c) => c.id === id);
      clearTimeout(card.hold);
      card.el.dispatchEvent(new CustomEvent("aim-tip-close"));
      card.el.classList.add("is-leaving");
      const motion = this.el.dataset.motion;
      setTimeout(() => card.el.remove(), motion === "off" ? 150 : 120);
    }
    this.cards = this.cards.filter((c) => !close.includes(c.id));
    this.footer();
  }

  /** With two or more pinned, the newest offers «Close all (N)». */
  footer() {
    this.el.querySelectorAll(".aim-tip-foot").forEach((f) => f.remove());
    const pinned = this.cards.filter((c) => c.pinned).sort((a, b) => b.at - a.at);
    if (pinned.length < 2) return;
    pinned[0].el.insertAdjacentHTML("beforeend", `<div class="aim-tip-foot"><button type="button" data-tip-closeall>${t("AIM.tips.closeAll", { n: pinned.length })}</button></div>`);
  }

  /** Unpinned cards close a moment after the pointer leaves both them and their anchors. */
  queueSweep() {
    clearTimeout(this.sweepTimer);
    this.sweepTimer = setTimeout(() => {
      const under = this.pointer.x < 0 ? null : this.doc.elementFromPoint(this.pointer.x, this.pointer.y);
      const active = this.doc.activeElement;
      const live = this.cards
        .filter((c) => c.el.contains(under) || c.anchor.contains(under) || c.anchor === active || c.anchor.contains(active))
        .map((c) => c.id);
      for (const id of cardsToSweep(this.cards.map(plain), live)) this.close(this.cards.find((c) => c.id === id));
    }, TIP_TIMING.close);
  }

  /** A closing window takes its unpinned cards; pinned ones stay until closed or the page reloads. */
  dropApp(app) {
    clearTimeout(this.openTimer);
    this.cards.filter((c) => c.app === app && !c.pinned).forEach((c) => this.close(c));
  }
}

const plain = ({ id, parent, depth, pinned, at }) => ({ id, parent, depth, pinned, at });

/**
 * Hover, focus and Escape of a window or of the layer. The layer is looked up per event: a window detached into its
 * own browser window shows its cards there.
 */
function bindRoot(root, app) {
  const layer = () => TooltipLayer.for(root.ownerDocument);
  const anchorOf = (event) => {
    const anchor = event.target.closest?.(TRIGGERS);
    return anchor && !anchor.closest(".aim-settings, .aim-trade") ? anchor : null;
  };
  root.addEventListener("pointerover", (event) => {
    const anchor = anchorOf(event);
    if (anchor && !anchor.contains(event.relatedTarget)) layer().schedule(anchor, app);
  });
  root.addEventListener("pointerout", () => layer().queueSweep());
  root.addEventListener("focusin", (event) => {
    const anchor = anchorOf(event);
    if (anchor) layer().schedule(anchor, app);
  });
  root.addEventListener("focusout", () => layer().queueSweep());
  root.addEventListener("keydown", (event) => {
    const tips = layer();
    if (event.key !== "Escape" || !tips.cards.some((c) => !c.pinned)) return;
    event.stopPropagation();
    tips.cards.filter((c) => !c.pinned).forEach((c) => tips.close(c));
  }, { capture: true });
}

/** The document behind an anchor: an item row, a doll tile, an effect, a favorite, a condition, a content link. */
async function resolveAnchor(anchor, app) {
  const actor = app?.actor;
  if (anchor.matches("a.content-link[data-uuid]")) return fromUuid(anchor.dataset.uuid);
  if (anchor.matches("[data-effect-row]")) return fromUuid(anchor.closest("[data-effect-uuid]")?.dataset.effectUuid);
  if (anchor.matches(".aim-cond[data-status]")) {
    const reference = CONFIG.statusEffects?.find((s) => s.id === anchor.dataset.status)?.reference;
    return reference ? fromUuid(reference) : null;
  }
  if (anchor.matches(".aim-fav[data-fav-id]")) {
    const doc = actor ? await fromUuid(anchor.dataset.favId, { relative: actor }) : null;
    return doc?.documentName === "Item" || doc?.documentName === "ActiveEffect" ? doc : doc?.item ?? null;
  }
  return actor?.items.get(anchor.closest("[data-item-id]")?.dataset.itemId) ?? null;
}

/** A damage type's card: its scene, its name and dnd5e's rule page for it when there is one. */
async function damageCard(key) {
  const type = readDamageType(key);
  const page = type?.reference ? await fromUuid(type.reference).catch(() => null) : null;
  const rule = page ? await readCardData(page) : null;
  return {
    kind: "damage",
    name: type?.label ?? key,
    subtitle: t(type && type.color ? "AIM.tips.damageType" : "AIM.tips.damageTypeAdded"),
    color: type?.color ?? null,
    scene: key,
    html: rule?.html ?? ""
  };
}

/** A damage type as a chip in its colour; a type dnd5e does not know is no chip. */
export function damageChip(key) {
  const type = readDamageType(key);
  return type ? { key, label: type.label, color: type.color ?? "var(--accent)" } : null;
}

function cardContext(card, depth) {
  return {
    ...card,
    depth,
    description: unwrapSecrets(card.description),
    html: unwrapSecrets(card.html),
    stats: (card.stats ?? []).map((s) => ({
      label: t(`AIM.tips.stats.${s.key}`),
      value: s.key === "attunement" ? `${t(`AIM.tips.attunement.${s.value}`)}${card.attuned ? " ✓" : ""}` : s.value,
      // A damage part shows its formula and a chip per type («fire|cold» is two).
      parts: s.key === "damage" && card.damages?.some((d) => d.types.length)
        ? card.damages.map((d) => ({ formula: d.formula || d.label, chips: d.types.flatMap((k) => damageParts(k)).map(damageChip).filter(Boolean) }))
        : null
    })),
    hint: t("AIM.tips.holdToPin"),
    pinLabel: t("AIM.tips.pin"),
    closeLabel: t("AIM.window.close")
  };
}

/** The frame glows in the rarity or school colour: SC Rarity Colors' when it is on, our palette otherwise. */
function tone(el, card) {
  if (card.kind === "damage" && card.color) return el.style.setProperty("--tone", card.color);
  if (card.school) el.dataset.school = card.school;
  else if (card.rarity) el.dataset.rarity = card.rarity;
  // Only a colour SC itself gives replaces ours; with that rarity or school left off in SC our palette stays.
  const color = card.school ? scSchoolColor(card.school, 0) : scRarityColor(card.rarity);
  if (color) el.style.setProperty("--tone", color);
}

/** Beside the anchor, on the side with room, inside the viewport. */
function place(el, anchor) {
  const view = anchor.ownerDocument.defaultView;
  const a = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left = a.right + 8;
  if (left + w > view.innerWidth - 8) left = a.left - w - 8;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, Math.min(a.top, view.innerHeight - h - 8))}px`;
}

/** Cards for a window: its hovers and focus open them in the layer of the window's own document. */
export function bindTooltips(app) {
  bindRoot(app.element, app);
}

/** The window may already be gone from its document when it closes, so every layer is asked. */
export function releaseTooltips(app) {
  for (const layer of ALL_LAYERS) layer.dropApp(app);
}
