import { isTradeActor, ownsActor } from "../core/actor-scope.js";
import { currencyProfile } from "../trade/currencies.js";
import { transferableItems } from "../trade/offers.js";
import { activeGM, requestTrade, sessionFor, tradeState } from "../trade/service.js";

export function buildTradeContext(app) {
  const actor = app.actor;
  if (!isTradeActor(actor)) return { available: false };
  const session = sessionFor(actor.id);
  const side = session?.actors.indexOf(actor.id) ?? -1;
  const participant = side >= 0 && session.users[side] === game.user.id && ownsActor(actor, game.user);
  const last = [...tradeState().sessions].reverse().find(s => s.actors.includes(actor.id));
  const context = {
    available: true, hasGM: Boolean(activeGM()), session, participant,
    sessionId: session?.id, status: game.i18n.localize(`AIM.trade.status.${session?.status ?? last?.status ?? "idle"}`),
    recovery: Boolean(game.user.isGM && session && ["executing", "recovery"].includes(session.status)),
    locked: Boolean(session && session.status !== "open"),
    canStart: !session && ownsActor(actor, game.user) && Boolean(activeGM()),
    error: last?.error ? game.i18n.localize(last.error) : "", busy: Boolean(app.tradeBusy)
  };
  try {
    const profile = currencyProfile(actor);
    context.provider = profile.mode === "item-piles" ? "Item Piles" : "D&D5e";
    context.targets = [];
    for (const target of game.actors.values()) {
      if (!isTradeActor(target) || target.id === actor.id) continue;
      for (const user of game.users.values()) {
        if (user.isGM || !user.active || user.id === game.user.id || !ownsActor(target, user)) continue;
        context.targets.push({ value: `${target.id}:${user.id}`, label: `${target.name} · ${user.name}`, selected: app.tradeTarget === `${target.id}:${user.id}` });
      }
    }
    context.targets.sort((a, b) => a.label.localeCompare(b.label));
    context.noTargets = !context.targets.length;
    if (!session) return context;
    context.partner = session.names[1 - side];
    context.mineConfirmed = session.confirmed[side];
    context.theirsConfirmed = session.confirmed[1 - side];
    context.otherItems = session.offers[1 - side].items;
    context.otherMoney = session.currencies.filter(r => session.offers[1 - side].money[r.key]).map(r => ({
      label: r.label, amount: session.offers[1 - side].money[r.key]
    }));
    const own = session.offers[side];
    context.myItems = own.items;
    context.myMoney = session.currencies.filter(r => own.money[r.key]).map(r => ({ label: r.label, amount: own.money[r.key] }));
    if (!app.tradeDraft || app.tradeDraft.id !== session.id || app.tradeDraft.revision !== session.revision) {
      app.tradeDraft = { id: session.id, revision: session.revision,
        items: Object.fromEntries(own.items.map(i => [i.id, i.quantity])), money: { ...own.money }, dirty: false };
    }
    context.dirty = app.tradeDraft.dirty;
    context.items = transferableItems(actor).map(item => ({
      id: item.id, name: item.name, img: item.img, available: item.system?.quantity ?? 1,
      quantity: app.tradeDraft.items[item.id] ?? 0
    })).sort((a, b) => a.name.localeCompare(b.name));
    context.money = profile.rows.map(row => ({ ...row, amount: app.tradeDraft.money[row.key] ?? 0, step: profile.mode === "dnd5e" ? "1" : "any" }));
    context.canEdit = participant && session.status === "open" && !app.tradeBusy;
    context.canConfirm = context.canEdit && !context.dirty && !context.mineConfirmed && Boolean(activeGM());
    context.canSave = context.canEdit && context.dirty && Boolean(activeGM());
  } catch (error) {
    context.error = game.i18n.localize(error.message?.startsWith("AIM.") ? error.message : "AIM.trade.errors.provider");
    context.canStart = false;
    context.canEdit = false;
    context.canConfirm = false;
    context.canSave = false;
  }
  return context;
}

export function bindTradeInputs(app) {
  app.element.querySelector("[data-trade-target]")?.addEventListener("change", event => { app.tradeTarget = event.target.value; });
  for (const input of app.element.querySelectorAll("[data-trade-item], [data-trade-money]")) {
    input.addEventListener("input", () => {
      if (!app.tradeDraft) return;
      const itemId = input.dataset.tradeItem;
      const values = itemId ? app.tradeDraft.items : app.tradeDraft.money;
      values[itemId ?? input.dataset.tradeMoney] = input.value === "" ? 0 : Number(input.value);
      app.tradeDraft.dirty = true;
      const save = app.element.querySelector('[data-trade-op="offer"]');
      if (save) save.disabled = Boolean(app.tradeBusy) || !activeGM();
      const confirm = app.element.querySelector('[data-trade-op="confirm"]');
      if (confirm) confirm.disabled = true;
      app.element.querySelector("[data-trade-unsaved]")?.removeAttribute("hidden");
    });
  }
}

export async function handleTradeAction(app, target) {
  if (app.tradeBusy) return;
  const action = target.dataset.tradeOp;
  const session = sessionFor(app.actor.id);
  let data = { sessionId: session?.id, revision: app.tradeDraft?.revision };
  if (action === "start") {
    const value = app.element.querySelector("[data-trade-target]")?.value ?? "";
    const [targetId, targetUserId] = value.split(":");
    data = { targetId, targetUserId };
  } else if (action === "offer") {
    if (!app.tradeDraft) return;
    const inputs = [...app.element.querySelectorAll("[data-trade-item], [data-trade-money]")];
    if (inputs.some(input => !input.reportValidity())) return;
    data.offer = {
      items: Object.entries(app.tradeDraft.items).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => ({ id, quantity })),
      money: { ...app.tradeDraft.money }
    };
  } else if (action === "recover") {
    if (!game.user.isGM) return;
    const approved = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("AIM.trade.recover") },
      content: `<p>${game.i18n.localize("AIM.trade.recoverWarning")}</p>`, rejectClose: false
    });
    if (!approved) return;
  }
  app.tradeBusy = true;
  // Preserve the visible draft while the coordinator acknowledges the request.
  app.render(false);
  try {
    await requestTrade(app.actor, action, data);
  } catch (error) {
    ui.notifications?.warn(game.i18n.localize(error.message?.startsWith("AIM.") ? error.message : "AIM.trade.errors.transfer"));
  } finally {
    app.tradeBusy = false;
    if (app.rendered) app.render(false);
  }
}
