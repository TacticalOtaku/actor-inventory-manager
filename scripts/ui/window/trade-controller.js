// ─────────────────────────────────────────────────────────
// AIM: Actor Window - Trade Panel Lifecycle & Motion Controller
// ─────────────────────────────────────────────────────────

import { sessionFor } from "../../trade/service.js";
import { SETTLE } from "../motion.js";

export class TradeController {
  constructor(app) {
    this.app = app;
    this._tradeFocus = null;
    this._tradeShown = undefined;
    this._tradePrev = null;
    this._tradeErrorShown = null;
    this._tradeKey = undefined;
    this._offeredPrev = null;
  }

  /** Preserve focus on quantity / coin inputs across trade redraws. */
  captureFocus() {
    const el = this.app.element;
    const active = el?.ownerDocument.activeElement;
    const field = el?.contains(active) ? active : null;
    const key = field?.dataset?.offerQty ?? field?.dataset?.tradeCoin;
    this._tradeFocus = key ? { attr: field.dataset.offerQty ? "data-offer-qty" : "data-trade-coin", key } : null;
  }

  afterRender(options) {
    const el = this.app.element;
    // A redrawn panel is already where it ends; it starts again from where it was, so opening and closing slide.
    const panel = el.querySelector(".aim-trade");
    if (panel && this._tradeShown !== undefined && this._tradeShown !== this.app.trade.open) {
      el.classList.toggle("is-trading", this._tradeShown);
      void panel.offsetWidth;
      el.classList.toggle("is-trading", this.app.trade.open);
    }
    this._tradeShown = this.app.trade.open;

    // Confirmations reset by an offer change (a new revision) shake the status once; a withdrawn one does not.
    const session = sessionFor(this.app.actor.id);
    const confirmed = Boolean(session?.confirmed.some(Boolean));
    const prev = this._tradePrev;
    if (prev?.id === session?.id && prev?.confirmed && !confirmed && prev.revision !== session?.revision && session?.status === "open") {
      this.app.shake(el.querySelector("[data-trade-status]"));
    }
    this._tradePrev = session ? { id: session.id, confirmed, revision: session.revision } : null;

    // An error shakes when it appears or changes, not on each redraw while it stays.
    const error = el.querySelector(".aim-trade-err");
    if (error && error.textContent !== this._tradeErrorShown) this.app.shake(error);
    this._tradeErrorShown = error?.textContent ?? null;

    // An item that joined either offer slides in; the panel is redrawn whole, so the rest stay put.
    const offered = new Set(
      [...el.querySelectorAll("[data-offer-item]")].map(
        (row) => `${row.closest("[data-offer-drop]") ? "mine" : "theirs"}:${row.dataset.offerItem}`
      )
    );
    if (this._offeredPrev && this.app.motionOn) {
      for (const row of el.querySelectorAll("[data-offer-item]")) {
        if (!this._offeredPrev.has(`${row.closest("[data-offer-drop]") ? "mine" : "theirs"}:${row.dataset.offerItem}`)) {
          row.classList.add("is-new");
        }
      }
    }
    this._offeredPrev = offered;

    // The chosen partner stays selected across redraws until the trade starts.
    if (options.parts.includes("trade")) {
      el.querySelector("[data-trade-partner]")?.addEventListener("change", (event) => {
        this.app.trade.partner = event.target.value;
      });
    }

    if (this._tradeFocus) {
      const field = el.querySelector(`[${this._tradeFocus.attr}="${CSS.escape(this._tradeFocus.key)}"]`);
      field?.focus();
      this._tradeFocus = null;
    }
  }

  onTradeHook(state) {
    const key = JSON.stringify((state?.sessions ?? []).filter((s) => s.actors?.includes(this.app.actor.id)));
    if (key === this._tradeKey && !this.app.trade.open) return;
    this._tradeKey = key;
    this.app.renderTrade();
  }

  flyToOffer(from, img) {
    const to = this.app.element.querySelector("[data-offer-drop]");
    if (!from || !to || !this.app.motionOn) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const ghost = Object.assign(document.createElement("img"), { src: img, className: "aim-flight" });
    Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    document.body.append(ghost);
    ghost.animate(
      [{ transform: "none", opacity: 1 }, { transform: `translate(${b.left + 24 - a.left}px, ${b.top + 40 - a.top}px) scale(0.7)`, opacity: 0.2 }],
      { duration: 480, easing: SETTLE }
    ).finished.finally(() => ghost.remove());
  }

  toggle() {
    if (this.app.trade.toggle()) this.app.switchTo("equipment");
    this.app._settings.applyRootState();
    this.app.render({ parts: ["trade", "main"] });
  }

  start(target) {
    const option = this.app.element.querySelector("[data-trade-partner]")?.selectedOptions?.[0];
    if (option && !option.disabled) return this.app.trade.start(option.value, option.dataset.user, target.dataset.kind);
  }

  confirm(target) {
    return this.app.trade.confirm(Number(target.dataset.revision));
  }

  cancel() {
    return this.app.trade.cancel();
  }

  qty(target) {
    return this.app.trade.step(target.dataset.id, Number(target.dataset.step));
  }

  offer(target) {
    const item = this.app.itemFrom(target);
    if (!item) return;
    if (!this.app.trade.open) {
      this.app.trade.open = true;
      this.app._settings.applyRootState();
    }
    this.flyToOffer(target.closest("[data-item-id]")?.querySelector(".aim-tile"), item.img);
    return this.app.trade.offer(item, 1);
  }

  askRecover() {
    this.app.trade.askRestore = true;
    this.app.render({ parts: ["trade"] });
  }

  cancelRecover() {
    this.app.trade.askRestore = false;
    this.app.render({ parts: ["trade"] });
  }

  confirmRecover() {
    return this.app.trade.recover();
  }

  dismiss() {
    this.app.trade.dismiss();
    this.app.render({ parts: ["trade", "main"] });
  }
}

export const TRADE_ACTIONS = {
  toggleTrade() { return this._tradeCtrl.toggle(); },
  tradeStart(_event, target) { return this._tradeCtrl.start(target); },
  tradeConfirm(_event, target) { return this._tradeCtrl.confirm(target); },
  tradeCancel() { return this._tradeCtrl.cancel(); },
  tradeQty(_event, target) { return this._tradeCtrl.qty(target); },
  tradeOffer(_event, target) { return this._tradeCtrl.offer(target); },
  tradeRecover() { return this._tradeCtrl.askRecover(); },
  tradeRecoverYes() { return this._tradeCtrl.confirmRecover(); },
  tradeRecoverNo() { return this._tradeCtrl.cancelRecover(); },
  tradeDismiss() { return this._tradeCtrl.dismiss(); }
};
