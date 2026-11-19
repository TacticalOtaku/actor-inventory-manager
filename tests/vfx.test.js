import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import { RENDERER_IDLE_MS, halt, hasRenderer, paint, releaseRenderer, run } from "../scripts/ui/vfx.js";

let instances;

function fakeEntry(rafQueue) {
  return {
    canvas: {
      isConnected: true,
      width: 120,
      height: 80,
      ownerDocument: {
        hidden: false,
        defaultView: {
          requestAnimationFrame: (cb) => {
            rafQueue.push(cb);
            return rafQueue.length;
          }
        }
      }
    },
    ctx: { clearRect() {}, drawImage() {} },
    size: { w: 120, h: 80, ratio: 1 },
    stage: {},
    update() { return true; },
    stop() { halt(this); }
  };
}

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout"] });
  instances = [];
  globalThis.PIXI = {
    Renderer: class FakeRenderer {
      constructor(options) {
        this.options = options;
        this.resolution = options.resolution;
        this.width = options.width * options.resolution;
        this.height = options.height * options.resolution;
        this.screen = { width: options.width, height: options.height };
        this.view = {};
        this.destroyed = false;
        this.emptyPoolCalls = 0;
        this.contextLost = false;
        this.filter = { emptyPool: () => { this.emptyPoolCalls++; } };
        this.gl = {
          isContextLost: () => this.contextLost,
          getExtension: (name) => name === "WEBGL_lose_context"
            ? { loseContext: () => { this.contextLost = true; } }
            : null
        };
        instances.push(this);
      }
      resize(w, h) {
        this.screen = { width: w, height: h };
        this.width = Math.round(w * this.resolution);
        this.height = Math.round(h * this.resolution);
      }
      render() {}
      destroy() {
        this.destroyed = true;
      }
    }
  };
});

afterEach(() => {
  releaseRenderer();
  mock.timers.reset();
  delete globalThis.PIXI;
});

describe("shared VFX renderer lifecycle", () => {
  it("lazily creates PIXI.Renderer with preserveDrawingBuffer: false and releases it after idle timeout", () => {
    assert.equal(hasRenderer(), false);
    const entry = fakeEntry([]);
    paint(entry);

    assert.equal(instances.length, 1);
    assert.equal(instances[0].options.preserveDrawingBuffer, false);
    assert.equal(hasRenderer(), true);
    assert.equal(instances[0].emptyPoolCalls, 1);

    mock.timers.tick(RENDERER_IDLE_MS - 1);
    assert.equal(hasRenderer(), true);
    assert.equal(instances[0].destroyed, false);

    mock.timers.tick(1);
    assert.equal(hasRenderer(), false);
    assert.equal(instances[0].destroyed, true);
    assert.equal(instances[0].contextLost, true);

    // Next paint cleanly recreates the renderer.
    paint(entry);
    assert.equal(instances.length, 2);
    assert.equal(hasRenderer(), true);
  });

  it("keeps the renderer alive while an effect is running and releases after halt() + idle timeout", () => {
    const rafs = [];
    const entry = fakeEntry(rafs);
    paint(entry);
    run(entry);

    mock.timers.tick(RENDERER_IDLE_MS * 2);
    assert.equal(hasRenderer(), true);
    assert.equal(instances[0].destroyed, false);

    halt(entry);
    assert.equal(hasRenderer(), true);
    mock.timers.tick(RENDERER_IDLE_MS);
    assert.equal(hasRenderer(), false);
    assert.equal(instances[0].destroyed, true);
    assert.equal(instances[0].contextLost, true);
  });
});
