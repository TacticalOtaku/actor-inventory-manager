// ─────────────────────────────────────────────────────────
// AIM: Actor Window - Header, Identity, Vitals & Rail Controller
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../../constants.js";
import { isSupportedActor } from "../../core/actor-scope.js";
import { SHEET_MENU_TABS, crLabel, orbAction, sheetMenuEntries } from "../../core/actor-window.js";
import { parseHpEntry, previewHp } from "../../core/vitals.js";
import { LOG } from "../../foundry/logger.js";
import { renderVanillaActorSheet } from "../../foundry/sheet-injection.js";
import { readAbilities, readIdentity, readNpc, readRail, readVehicle } from "../../integrations/dnd5e.js";
import { playBurst } from "../bursts.js";
import { handleMenuKey } from "../equipment.js";
import { t } from "../html.js";
import { signed } from "../../core/overview.js";
import { buildRailContext, floatText, openStatConfig, playRailChanges, railSnapshot, startRuneGlints } from "../rail.js";
import { vehicleKind } from "../vehicle.js";

const getSetting = (key) => game.settings.get(MODULE_ID, key);

/** With several classes the level goes to the one the player picks. */
async function chooseClass(classes) {
  return foundry.applications.api.DialogV2.wait({
    window: { title: t("AIM.window.xp.chooseClass") },
    content: `<p>${t("AIM.window.xp.chooseClassHint")}</p>`,
    buttons: classes.map((cls) => ({ action: cls.id, label: `${cls.name} ${cls.levels}` })),
    rejectClose: false
  });
}

export class RailController {
  constructor(app) {
    this.app = app;
    this.menuOpen = false;
    this.xpOpen = false;
    this._railPrev = null;
    this._orbReady = undefined;
    this._glints = null;
  }

  inlineEditAdapter() {
    return {
      selector: "[data-hp-input]",
      part: "rail",
      beforeWrite: true,
      editable: () => this.app.canEdit,
      parse: (_target, text) => parseHpEntry(text),
      preview: (input) => this.previewHp(input),
      write: async (_target, entry) => {
        const result = await this.changeHp(entry);
        if (entry.kind === "set" && !result) throw new Error("HP update refused");
      }
    };
  }

  buildHeaderContext() {
    const actor = this.app.actor;
    return {
      identity: this.buildIdentity(),
      abilities: readAbilities(actor).map((a) => ({ ...a, modText: signed(a.mod), saveText: signed(a.save) })),
      abilityHint: t("AIM.window.abilityHint"),
      menuOpen: this.menuOpen,
      xpOpen: this.xpOpen,
      xpSteps: [50, 100, 250, 1000],
      sheetLabel: t(`AIM.window.menu.openSheet${{ npc: "Npc", vehicle: "Vehicle" }[actor.type] ?? ""}`),
      menu: Object.fromEntries(sheetMenuEntries({
        type: actor.type,
        // dnd5e shows the bastion tab only when bastions are on and the character has reached the threshold level.
        bastion: Boolean(dnd5e.applications.actor.CharacterActorSheet?.hasBastion?.(actor)),
        polymorphed: Boolean(actor.isPolymorphed)
      }).map((entry) => [entry, true]))
    };
  }

  buildRailContext({ hasSpells }) {
    return buildRailContext(this.app.actor, {
      canEdit: this.app.canEdit,
      hasSpells,
      hiddenBlocks: getSetting("hiddenRailBlocks") ?? []
    });
  }

  buildIdentity() {
    const actor = this.app.actor;
    const id = readIdentity(actor);
    const npc = readNpc(actor);
    const links = [];
    for (const cls of id.classes) {
      links.push({ id: cls.id, label: `${cls.name} ${cls.levels}` });
      if (cls.subclass) links.push({ id: cls.subclass.id, label: cls.subclass.name });
    }
    if (id.species) links.push({ id: id.species.id, label: id.species.name });
    if (id.background) links.push({ id: id.background.id, label: id.background.name });
    const span = Math.max(1, id.xp.max - id.xp.min);
    const share = Math.min(1, Math.max(0, (id.xp.value - id.xp.min) / span));
    return {
      ...id,
      links,
      hasLevel: actor.type === "character",
      nextLevel: id.level + 1,
      xpShare: id.xp.ready ? 1 : share.toFixed(3),
      xpNear: share >= 0.9,
      orbLabel: id.xp.ready
        ? t("AIM.window.xp.ready", { level: id.level + 1 })
        : t("AIM.window.xp.orb", { value: id.xp.value, max: id.xp.max }),
      // An NPC's challenge rating sits in the level orb's place, its size and type under the name.
      cr: npc && { text: crLabel(npc.cr), hint: t("AIM.window.npc.crHint", { xp: npc.xp.toLocaleString(game.i18n.lang) }) },
      kind: npc ? [npc.type, npc.size].filter(Boolean).join(" · ") : actor.type === "vehicle" ? vehicleKind(actor) : "",
      summary: npc
        ? [t("AIM.window.npc.crShort", { cr: crLabel(npc.cr) }), npc.type].filter(Boolean).join(" · ")
        : actor.type === "vehicle"
          ? (readVehicle(actor)?.typeLabel ?? "")
          : links.slice(0, 2).map((l) => l.label).join(" · ")
    };
  }

  startGlints() {
    this._glints = startRuneGlints(this.app);
  }

  afterRender(parts) {
    if (parts.includes("rail")) {
      this.bindRail();
      // Only a redrawn rail shows the change; a later rail redraw (dnd5e adding Bloodied) waits until it has played.
      const next = railSnapshot(this.app.actor);
      const playing = playRailChanges(this.app.element, this._railPrev, next);
      this.app._redraws.holdRail(playing ? 1100 : 0);
      this._railPrev = next;
    }
    // The orb that just became ready to level throws golden stars.
    const ready = Boolean(this.app.element.querySelector(".aim-level.is-ready"));
    if (ready && this._orbReady === false) {
      playBurst(this.app.element, this.app.element.querySelector(".aim-level"), "inspired");
    }
    this._orbReady = ready;
  }

  /** Listeners the rail needs beyond click actions: the HP field, right clicks. */
  bindRail() {
    const el = this.app.element;
    el.querySelector('[data-action="editHp"]')?.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (this.app.canEdit) this.openHpField("в");
    });
    el.querySelector("[data-exhaustion]")?.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (this.app.canEdit) this.setExhaustion(-1);
    });
    for (const stat of el.querySelectorAll("[data-config]")) {
      stat.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        if (this.app.canEdit) openStatConfig(this.app.actor, stat.dataset.config);
      });
    }
  }

  closeMenuIfOpen() {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.app.render({ parts: ["main"] });
  }

  closePopupsOnAway(event) {
    if (!(this.menuOpen || this.xpOpen) || event.target.closest?.(".aim-menu-wrap, .aim-xp-card, .aim-level")) return;
    this.menuOpen = this.xpOpen = false;
    this.app.render({ parts: ["main"] });
  }

  handleKeydown(event) {
    if (this.menuOpen) {
      const menu = this.app.element.querySelector(".aim-menu:not(.aim-popmenu)");
      if (event.key === "ArrowDown" && event.target.matches?.('[data-action="toggleMenu"]')) {
        event.preventDefault();
        menu?.querySelector('[role="menuitem"]')?.focus?.({ preventScroll: true });
        return true;
      }
      if (event.target.closest?.(".aim-menu:not(.aim-popmenu)")) {
        if (event.key === "Tab") {
          this.menuOpen = false;
          this.app.render({ parts: ["main"] });
          return true;
        }
        if (handleMenuKey(event, menu, () => {
          this.menuOpen = false;
          this.app.render({ parts: ["main"] }).then(() => {
            this.app.element?.querySelector('[data-action="toggleMenu"]')?.focus({ preventScroll: true });
          });
        })) return true;
      }
    }
    if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229 && event.target.matches?.('[data-xp-form] [name="xp"]')) {
      event.preventDefault();
      this.xpChange(event.target);
      return true;
    }
    return false;
  }

  closePopupsOnEscape(event) {
    if (event.key !== "Escape" || !(this.menuOpen || this.xpOpen)) return false;
    event.stopPropagation();
    const restoreMenu = this.menuOpen;
    this.menuOpen = this.xpOpen = false;
    this.app.render({ parts: ["main"] }).then(() => {
      if (restoreMenu) this.app.element?.querySelector('[data-action="toggleMenu"]')?.focus({ preventScroll: true });
    });
    return true;
  }

  openHpField(draft = "") {
    this.app._edits.begin("hp", true, draft);
  }

  /** While typing, the result is drawn on the bar: red for damage (after temporary HP), green for healing. */
  previewHp(input) {
    const band = this.app.element.querySelector("[data-hp-preview]");
    const entry = parseHpEntry(input.value);
    input.classList.toggle("is-invalid", (Boolean(input.value.trim()) && !entry) || this.app._edits.state("hp").invalid);
    if (!band) return;
    const hp = readRail(this.app.actor).hp;
    if (!entry || !hp.max) { band.hidden = true; return; }
    const after = previewHp(hp, entry);
    const from = Math.min(hp.value, after.value) / hp.max;
    const to = Math.max(hp.value, after.value) / hp.max;
    band.hidden = from === to;
    band.classList.toggle("is-heal", after.value > hp.value);
    band.style.left = `${from * 100}%`;
    band.style.width = `${(to - from) * 100}%`;
  }

  /** Damage and healing go through applyDamage (so preApplyDamage listeners run), temporary HP through applyTempHP. */
  async changeHp({ kind, amount }) {
    if (!this.app.canEdit) return;
    if (kind === "damage") return this.app.actor.applyDamage(amount);
    if (kind === "heal") return this.app.actor.applyDamage(-amount);
    if (kind === "temp") return this.app.actor.applyTempHP(amount);
    return this.app.actor.update({
      "system.attributes.hp.value": Math.max(0, Math.min(readRail(this.app.actor).hp.max, amount))
    });
  }

  async setExhaustion(delta) {
    const { value, max } = readRail(this.app.actor).exhaustion;
    const next = Math.max(0, Math.min(max, value + delta));
    if (next !== value) await this.app.actor.update({ "system.attributes.exhaustion": next });
  }

  /** A quick step or the field's amount adds to the experience, «Задать» sets it; the field empties after. */
  async xpChange(target) {
    const field = this.app.element.querySelector('[data-xp-form] [name="xp"]');
    const raw = target.dataset.amount ?? field?.value ?? "";
    const amount = Math.trunc(Number(raw));
    const set = target.dataset.action === "xpSet";
    if (!this.app.canEdit || raw === "" || !Number.isFinite(amount) || (!set && !amount)) return;
    if (field) field.value = "";
    const value = set ? amount : readIdentity(this.app.actor).xp.value + amount;
    await this.app.actor.update({ "system.details.xp.value": Math.max(0, value) });
  }

  async toggleMenu() {
    this.menuOpen = !this.menuOpen;
    const opening = this.menuOpen;
    await this.app.render({ parts: ["main"] });
    if (opening) this.app.element?.querySelector('.aim-menu:not(.aim-popmenu) [role="menuitem"]')?.focus({ preventScroll: true });
  }

  openSheet() {
    this.menuOpen = false;
    renderVanillaActorSheet(this.app.actor.sheet, { force: true });
    this.app.render({ parts: ["main"] });
  }

  /** dnd5e 5.3.3 has no standalone dialog for special traits or the bastion: the actor's sheet opens on that tab. */
  async openSheetTab(tab) {
    this.menuOpen = false;
    this.app.render({ parts: ["main"] });
    const sheet = this.app.actor.sheet;
    await renderVanillaActorSheet(sheet, { force: true });
    // Another sheet (Tidy or a third-party one) may not have that tab; then it simply opens.
    if (sheet.constructor.TABS?.some?.((entry) => entry.tab === tab)) sheet.changeTab(tab, "primary");
  }

  async revertForm() {
    this.menuOpen = false;
    await this.app.actor.revertOriginalForm?.();
  }

  openDocument(target) {
    this.app.actor.items.get(target.dataset.id)?.sheet?.render({ force: true });
  }

  openCrew(target) {
    const member = foundry.utils.fromUuidSync(target.dataset.uuid);
    if (!member?.testUserPermission?.(game.user, "LIMITED")) return;
    if (isSupportedActor(member) && member.testUserPermission(game.user, "OBSERVER")) {
      this.app.constructor.openWindow(member);
    } else {
      member.sheet?.render({ force: true });
    }
  }

  rollAbility(event, target) {
    if (!this.app.canEdit) return;
    const ability = target.dataset.ability;
    if (event.shiftKey) this.app.actor.rollSavingThrow({ ability, event });
    else this.app.actor.rollAbilityCheck({ ability, event });
  }

  async levelOrb(event) {
    const { xp, classes } = readIdentity(this.app.actor);
    const action = orbAction({ ready: xp.ready, canEdit: this.app.canEdit, shift: event.shiftKey, classCount: classes.length });
    if (action === "card") {
      this.xpOpen = !this.xpOpen;
      return this.app.render({ parts: ["main"] });
    }
    const classId = action === "level" ? classes[0].id : await chooseClass(classes);
    if (!classId) return;
    const cls = this.app.actor.items.get(classId);
    try {
      const manager = dnd5e.applications.advancement.AdvancementManager.forLevelChange(this.app.actor, classId, 1);
      if (manager.steps.length) manager.render({ force: true });
      else await cls.update({ "system.levels": cls.system.levels + 1 });
    } catch (error) {
      LOG.error("Level up failed", error);
    }
  }

  editHp() {
    if (this.app.canEdit) this.openHpField("");
  }

  stepHp(target) {
    const step = Number(target.dataset.step);
    if (!game.user.isGM || !step) return;
    return this.changeHp(step < 0 ? { kind: "damage", amount: -step } : { kind: "heal", amount: step });
  }

  tempHp() {
    if (game.user.isGM) this.openHpField("в");
  }

  async rollHitDie(target) {
    if (!this.app.canEdit) return;
    if (!readRail(this.app.actor).hitDice.value) {
      target.closest("[data-block]")?.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }],
        { duration: 300 }
      );
      return;
    }
    this.showRoll(await this.app.actor.rollHitDie(), '[data-block="hitDice"]');
  }

  showRoll(result, selector) {
    const roll = Array.isArray(result) ? result[0] : result;
    if (typeof roll?.total !== "number") return;
    const die = roll.dice?.[0];
    const rolled = die?.total ?? roll.total;
    const mod = roll.total - rolled;
    const text = [
      die ? `${t("AIM.window.rail.die", { faces: die.faces })}: ${rolled}` : String(rolled),
      mod ? ` ${mod > 0 ? "+" : "−"} ${Math.abs(mod)} = ${roll.total}` : ""
    ].join("");
    const anchor = this.app.element?.querySelector(selector) ?? this.app.element?.querySelector("[data-hpcard]");
    if (anchor) floatText(this.app.element, anchor, text, "roll");
  }

  async markDeath(target) {
    if (!this.app.canEdit) return;
    const kind = target.dataset.kind;
    const current = readRail(this.app.actor).death[kind];
    const index = Number(target.dataset.index) + 1;
    await this.app.actor.update({ [`system.attributes.death.${kind}`]: index === current ? index - 1 : index });
  }

  async rollDeathSave(event) {
    if (this.app.canEdit) this.showRoll(await this.app.actor.rollDeathSave({ event }), ".aim-death");
  }

  shortRest() {
    if (this.app.canEdit) return this.app.actor.shortRest();
  }

  longRest() {
    if (this.app.canEdit) return this.app.actor.longRest();
  }

  rollInitiative() {
    if (this.app.canEdit) return this.app.actor.rollInitiativeDialog();
  }

  toggleInspiration() {
    if (this.app.canEdit) {
      return this.app.actor.update({ "system.attributes.inspiration": !readRail(this.app.actor).inspiration });
    }
  }

  exhaustion() {
    if (this.app.canEdit) return this.setExhaustion(1);
  }

  async rollConcentration(event) {
    if (this.app.canEdit) this.showRoll(await this.app.actor.rollConcentration({ event }), ".aim-chip.is-conc");
  }

  async endConcentration(target) {
    if (!this.app.canEdit) return;
    const effect = await this.app._effects.effectFrom(target);
    this.app._effects.measureEffects();
    return this.app.actor.endConcentration(effect ?? undefined);
  }

  dispose() {
    clearInterval(this._glints);
  }
}

export const RAIL_ACTIONS = {
  xpAdd(_event, target) { return this._rail.xpChange(target); },
  xpSet(_event, target) { return this._rail.xpChange(target); },
  toggleMenu() { return this._rail.toggleMenu(); },
  openSheet() { return this._rail.openSheet(); },
  openTraits() { return this._rail.openSheetTab(SHEET_MENU_TABS.traits); },
  openBastion() { return this._rail.openSheetTab(SHEET_MENU_TABS.bastion); },
  revertForm() { return this._rail.revertForm(); },
  openDocument(_event, target) { return this._rail.openDocument(target); },
  openCrew(_event, target) { return this._rail.openCrew(target); },
  rollAbility(event, target) { return this._rail.rollAbility(event, target); },
  levelOrb(event) { return this._rail.levelOrb(event); },
  editHp() { return this._rail.editHp(); },
  stepHp(_event, target) { return this._rail.stepHp(target); },
  tempHp() { return this._rail.tempHp(); },
  rollHitDie(_event, target) { return this._rail.rollHitDie(target); },
  markDeath(_event, target) { return this._rail.markDeath(target); },
  rollDeathSave(event) { return this._rail.rollDeathSave(event); },
  shortRest() { return this._rail.shortRest(); },
  longRest() { return this._rail.longRest(); },
  rollInitiative() { return this._rail.rollInitiative(); },
  toggleInspiration() { return this._rail.toggleInspiration(); },
  exhaustion() { return this._rail.exhaustion(); },
  rollConcentration(event) { return this._rail.rollConcentration(event); },
  endConcentration(_event, target) { return this._rail.endConcentration(target); }
};
