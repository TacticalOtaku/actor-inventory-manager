import test from "node:test";
import assert from "node:assert/strict";
import { handlePreUpdateItem } from "../scripts/foundry/enforcement-hooks.js";
import { isSupportedActor, isTradeActor } from "../scripts/core/actor-scope.js";
import { equipItemToSlot, unequipItem, toggleItemEquipped, toggleAttunement, setItemContainer, useItem } from "../scripts/ui/item-actions.js";
import { setActorPaperdollTemplate } from "../scripts/core/paperdoll-templates.js";
import { getActorEquippedMap, equipmentRuleEngine } from "../scripts/core/equipment-rules.js";

test("GM NPC equipment changes are untouched without accessing Foundry rules", () => {
  const actor = { type: "npc", documentName: "Actor", hasPlayerOwner: false };
  const changes = { "system.equipped": true };
  assert.equal(handlePreUpdateItem({ parent: actor }, changes, {}, "gm"), true);
  assert.deepEqual(changes, { "system.equipped": true });
});
test("player-owned NPCs remain supported while GM NPCs and groups are excluded", () => {
  assert.equal(isSupportedActor({ type: "npc", hasPlayerOwner: true }), true);
  assert.equal(isSupportedActor({ type: "npc", hasPlayerOwner: false }), false);
  assert.equal(isSupportedActor({ type: "group" }), false);
  assert.equal(isTradeActor({ type: "character", hasPlayerOwner: true, isToken: true }), false);
});
test("public item mutations and template assignment leave GM NPCs untouched", async () => {
  const actor = { type: "npc", documentName: "Actor", hasPlayerOwner: false };
  const item = { parent: actor, update() { assert.fail("NPC item was mutated"); }, use() { assert.fail("NPC item was used"); } };
  await equipItemToSlot(actor, item, "mainHand");
  await unequipItem(actor, item);
  await toggleItemEquipped(actor, item);
  await toggleAttunement(item);
  await setItemContainer(item, "bag");
  await useItem(item);
  await setActorPaperdollTemplate(actor, "custom", {});
});
test("NPCs cannot open inventory or editor through direct API or constructors", async () => {
  globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: Base => Base } } };
  const { ActorInventoryApp, openActorInventory, toggleActorInventory } = await import("../scripts/ui/inventory-app.js");
  const { PaperdollEditorApp, openPaperdollEditor } = await import("../scripts/ui/paperdoll-editor.js");
  const actor = { type: "npc", hasPlayerOwner: false };
  assert.equal(await openActorInventory(actor), undefined);
  assert.equal(await toggleActorInventory(actor), null);
  assert.equal(openPaperdollEditor(actor), undefined);
  assert.throws(() => new ActorInventoryApp(actor), /unsupported/);
  assert.throws(() => new PaperdollEditorApp(actor), /unsupported/);
});
test("direct equipment rules do not impose paperdoll constraints on GM NPCs", () => {
  const actor = { type: "npc", hasPlayerOwner: false, items: new Map() };
  assert.equal(getActorEquippedMap(actor).size, 0);
  assert.equal(equipmentRuleEngine.validateEquip(actor, { name: "NPC weapon", type: "weapon", system: {} }, "not-a-paperdoll-slot").valid, true);
});
