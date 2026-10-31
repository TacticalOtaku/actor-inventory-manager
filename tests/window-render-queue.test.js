import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { setImmediate as turn } from "node:timers/promises";
import { WindowRenderQueue } from "../scripts/core/window-render-queue.js";

beforeEach(() => mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 }));
afterEach(() => mock.timers.reset());
const advance = async (ms = 0) => { mock.timers.tick(ms); await turn(); };

function fixture(render) {
  const state = { editing: false, active: true };
  const calls = [];
  const errors = [];
  const queue = new WindowRenderQueue({
    parts: ["rail", "main", "inspector", "drawer", "trade"],
    editing: () => state.editing,
    active: () => state.active,
    now: () => Date.now(),
    render: (parts) => { calls.push(parts); return render?.(parts); },
    onError: (error) => errors.push(error)
  });
  return { queue, state, calls, errors };
}

describe("actor window redraw lifecycle", () => {
  it("coalesces for 40 ms and unions requested parts", async () => {
    const { queue, calls } = fixture();
    queue.enqueue(["main"]);
    await advance(20);
    queue.enqueue(["trade", "main"]);
    await advance(39);
    assert.deepEqual(calls, []);
    await advance(1);
    assert.deepEqual(calls, [["main", "trade"]]);
    queue.close();
  });

  it("a full request includes trade and absorbs narrower requests", async () => {
    const { queue, calls } = fixture();
    queue.enqueue(["main"]);
    queue.enqueue();
    queue.enqueue(["rail"]);
    await advance(40);
    assert.deepEqual(calls, [["rail", "main", "inspector", "drawer", "trade"]]);
    queue.close();
  });

  it("holds only main during biography editing and catches it up once", async () => {
    const { queue, state, calls } = fixture();
    state.editing = true;
    queue.enqueue();
    await advance(40);
    assert.deepEqual(calls, [["rail", "inspector", "drawer", "trade"]]);
    state.editing = false;
    queue.resume();
    queue.resume();
    await advance();
    assert.deepEqual(calls, [["rail", "inspector", "drawer", "trade"], ["main"]]);
    queue.close();
  });

  it("a rail-only update during biography editing creates no main catch-up", async () => {
    const { queue, state, calls } = fixture();
    state.editing = true;
    queue.enqueue(["rail"]);
    await advance(40);
    state.editing = false;
    queue.resume();
    await advance();
    assert.deepEqual(calls, [["rail"]]);
    queue.close();
  });

  it("keeps main pending when focus moves to another biography field", async () => {
    const { queue, state, calls } = fixture();
    state.editing = true;
    queue.request(["main", "trade"]);
    await turn();
    queue.resume();
    await advance();
    assert.deepEqual(calls, [["trade"]]);
    state.editing = false;
    queue.resume();
    await advance();
    assert.deepEqual(calls, [["trade"], ["main"]]);
    queue.close();
  });

  it("holds rail behind its effect without holding other parts", async () => {
    const { queue, calls } = fixture();
    queue.holdRail(1100);
    queue.enqueue();
    await advance(40);
    assert.deepEqual(calls, [["main", "inspector", "drawer", "trade"]]);
    await advance(1059);
    assert.equal(calls.length, 1);
    await advance(1);
    assert.deepEqual(calls[1], ["rail"]);
    queue.close();
  });

  it("rechecks an extended effect deadline instead of using a stale timer", async () => {
    const { queue, calls } = fixture();
    queue.holdRail(1100);
    queue.enqueue(["rail"]);
    await advance(500);
    queue.holdRail(1100);
    queue.enqueue(["trade"]);
    await advance(40);
    assert.deepEqual(calls, [["trade"]]);
    await advance(560);
    assert.equal(calls.length, 1);
    await advance(500);
    assert.deepEqual(calls[1], ["rail"]);
    queue.close();
  });

  it("an explicit rail render can end the old effect hold", async () => {
    const { queue, calls } = fixture();
    queue.holdRail(1100);
    queue.enqueue(["rail"]);
    await advance(40);
    queue.holdRail(0);
    await advance();
    assert.deepEqual(calls, [["rail"]]);
    queue.close();
  });

  it("serializes renders and preserves requests arriving during a render", async () => {
    let finish;
    const { queue, calls } = fixture(() => new Promise((resolve) => { finish = resolve; }));
    queue.enqueue(["rail"]);
    await advance(40);
    queue.enqueue(["main", "trade"]);
    await advance(40);
    assert.deepEqual(calls, [["rail"]]);
    finish();
    await turn();
    assert.deepEqual(calls, [["rail"], ["main", "trade"]]);
    queue.close();
    finish();
    await turn();
  });

  it("close cancels coalescing, an effect hold and a biography catch-up", async () => {
    const first = fixture();
    first.queue.enqueue();
    first.queue.close();
    const second = fixture();
    second.queue.holdRail(1100);
    second.queue.enqueue(["rail"]);
    await advance(40);
    second.queue.close();
    const third = fixture();
    third.state.editing = true;
    third.queue.request(["main"]);
    third.state.editing = false;
    third.queue.resume();
    third.queue.close();
    await advance(5000);
    assert.deepEqual(first.calls, []);
    assert.deepEqual(second.calls, []);
    assert.deepEqual(third.calls, []);
  });

  it("an in-flight render completing after close starts no follow-up", async () => {
    let finish;
    const { queue, calls } = fixture(() => new Promise((resolve) => { finish = resolve; }));
    queue.request(["rail"]);
    queue.enqueue(["main"]);
    await advance(40);
    queue.close();
    finish();
    await turn();
    await advance(5000);
    queue.request();
    queue.resume();
    assert.deepEqual(calls, [["rail"]]);
  });

  it("does not render an inactive window", async () => {
    const { queue, state, calls } = fixture();
    queue.enqueue();
    state.active = false;
    await advance(40);
    queue.resume();
    await advance();
    assert.deepEqual(calls, []);
    queue.close();
  });

  it("retains changes while an explicit Foundry render is in progress", async () => {
    const { queue, state, calls } = fixture();
    state.active = false;
    queue.enqueue(["main"]);
    await advance(40);
    assert.deepEqual(calls, []);
    state.active = true;
    queue.resume();
    await advance();
    assert.deepEqual(calls, [["main"]]);
    queue.close();
  });

  it("releasing rail does not shorten a new document burst's quiet period", async () => {
    const { queue, calls } = fixture();
    queue.holdRail(1100);
    queue.enqueue(["rail"]);
    await advance(40);
    await advance(1050);
    queue.enqueue(["main"]);
    await advance(10);
    assert.deepEqual(calls, [["rail"]]);
    await advance(29);
    assert.deepEqual(calls, [["rail"]]);
    await advance(1);
    assert.deepEqual(calls, [["rail"], ["main"]]);
    queue.close();
  });

  it("reports render failure without looping and retains work for the next request", async () => {
    const problem = new Error("render failed");
    let failed = false;
    const { queue, calls, errors } = fixture(() => {
      if (!failed) { failed = true; return Promise.reject(problem); }
    });
    queue.enqueue(["main"]);
    await advance(40);
    assert.deepEqual(errors, [problem]);
    await advance(5000);
    assert.equal(calls.length, 1);
    queue.enqueue(["trade"]);
    await advance(40);
    assert.deepEqual(calls, [["main"], ["main", "trade"]]);
    queue.close();
  });
});
