import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { LOG } from "../scripts/foundry/logger.js";
LOG.setLevel("none");
// The settings menu class extends Foundry's ApplicationV2 when the module loads.
globalThis.foundry = { applications: { api: { ApplicationV2: class {} } }, utils: { deepClone: (value) => structuredClone(value) } };
const { runMigration } = await import("../scripts/foundry/migration.js");

const M = "actor-inventory-manager";
let settings, chat;

/** A world actor with its own 1.9 doll, and its unlinked tokens (synthetic actors that inherit its flags). */
function world({ tokens }) {
  const doll = { templateName: "Своя", slots: [{ id: "neck" }] };
  const base = {
    id: "wolf", uuid: "Actor.wolf", name: "Волк", type: "npc", isToken: false, items: [],
    flags: { [M]: { paperdollCustomTemplate: doll } },
    async setFlag(scope, key, value) { this.flags[scope][key] = value; }
  };
  const tokenActor = (id, delta) => ({
    ...base, uuid: `Scene.s.Token.${id}.Actor.wolf`, isToken: true, token: { id, delta },
    flags: { [M]: { ...base.flags[M], ...(delta.flags?.[M] ?? {}) } },
    async setFlag(scope, key, value) { (delta.flags ??= {})[scope] ??= {}; delta.flags[scope][key] = value; this.flags[scope][key] = value; }
  });
  const sceneTokens = tokens.map(([id, delta]) => ({ actorLink: false, actor: tokenActor(id, delta) }));
  return { actors: [base], scenes: [{ tokens: sceneTokens }] };
}

function stub({ actors, scenes }) {
  settings = { migrationVersion: "", customTemplates: {}, tradeState: { sessions: [], receipts: {} } };
  chat = [];
  const gm = { id: "gm", isGM: true, active: true };
  const users = new Map([["gm", gm]]);
  users.activeGM = gm;
  globalThis.game = {
    user: gm, users, actors, scenes,
    settings: { get: (id, key) => structuredClone(settings[key]), set: async (id, key, value) => { settings[key] = structuredClone(value); } },
    i18n: { localize: (key) => key, format: (key, data) => `${key} ${JSON.stringify(data)}` }
  };
  globalThis.ChatMessage = { implementation: { create: async (data) => chat.push(data) } };
}

describe("running the 1.9 → 2.0 migration (ADR 0005)", () => {
  beforeEach(() => { delete globalThis.game; });

  it("makes one preset for an actor's own doll, none for unlinked tokens that only inherit it", async () => {
    stub(world({ tokens: [["t1", {}], ["t2", { flags: {} }]] }));
    const counts = await runMigration();
    assert.deepEqual(Object.keys(settings.customTemplates), ["own-wolf"]);
    assert.equal(counts.presets, 1);
    assert.equal(counts.failures, 0);
    assert.equal(settings.migrationVersion, "2.0.0");
  });

  it("gives an unlinked token with a doll of its own its own preset", async () => {
    const own = { templateName: "Токен", slots: [{ id: "head" }] };
    stub(world({ tokens: [["t1", { flags: { [M]: { paperdollCustomTemplate: own } } }]] }));
    await runMigration();
    assert.deepEqual(Object.keys(settings.customTemplates).sort(), ["own-t1", "own-wolf"]);
    assert.equal(settings.customTemplates["own-t1"].templateName, "Токен");
  });

  it("cancels open trades through the trade coordinator and tells both sides", async () => {
    stub(world({ tokens: [] }));
    settings.tradeState.sessions = [{ id: "s1", status: "open", users: ["gm"] }, { id: "s2", status: "executing", users: ["gm"] }];
    game.users.get("gm").getFlag = () => undefined;
    const counts = await runMigration();
    assert.deepEqual(settings.tradeState.sessions.map((s) => s.status), ["cancelled", "executing"]);
    assert.equal(counts.trades, 1);
    assert.ok(chat.some((message) => message.content.includes("AIM.migration.tradeCancelled")));
  });

  it("leaves live trades alone when the GM reruns a finished migration", async () => {
    stub(world({ tokens: [] }));
    settings.migrationVersion = "2.0.0";
    settings.tradeState.sessions = [{ id: "s1", status: "open", users: ["gm"] }];
    const counts = await runMigration({ force: true });
    assert.deepEqual([settings.tradeState.sessions[0].status, counts.trades], ["open", 0]);
  });
});
