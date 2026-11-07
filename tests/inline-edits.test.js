import assert from "node:assert/strict";
import { it } from "node:test";
import { setImmediate as turn } from "node:timers/promises";
import { InlineEdits } from "../scripts/ui/inline-edits.js";

class Input extends EventTarget {
  constructor(value = "") {
    super();
    this.value = value;
    this.isConnected = true;
    this.attributes = new Map();
    this.classes = new Set();
    this.classList = { toggle: (key, on) => (on ? this.classes.add(key) : this.classes.delete(key)) };
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  focus() {
    this.focused = true;
  }
  setSelectionRange(a, b) {
    this.selection = [a, b];
  }
  fire(type, key) {
    const event = new Event(type, { cancelable: true });
    if (key) Object.defineProperty(event, "key", { value: key });
    this.dispatchEvent(event);
    return event;
  }
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function fixture({ beforeWrite = true, write = async () => {}, editable = () => true, render } = {}) {
  const calls = [],
    errors = [];
  const edits = new InlineEdits(
    {
      amount: {
        selector: "input",
        part: "main",
        beforeWrite,
        editable,
        parse: (_target, text) => (/^[-+]?\d+$/.test(text) ? Number(text) : null),
        write: async (target, value) => {
          calls.push(["write", target, value]);
          return write(target, value);
        },
      },
    },
    {
      render: async (part) => {
        calls.push(["render", part]);
        return render?.(part);
      },
      onError: (error) => errors.push(error),
    },
  );
  const mount = (input = new Input()) => {
    edits.mount({ querySelector: () => input });
    return input;
  };
  return { edits, calls, errors, mount };
}
it("Enter commits the current text once even when pressed again before a write finishes", async () => {
  const gate = deferred(),
    f = fixture({ write: () => gate.promise });
  f.edits.begin("amount", "gp");
  const input = f.mount();
  input.value = "+7";
  input.fire("input");
  input.fire("keydown", "Enter");
  input.fire("keydown", "Enter");
  await turn();
  assert.deepEqual(f.calls, [
    ["render", "main"],
    ["render", "main"],
    ["write", "gp", 7],
  ]);
  assert.equal(f.edits.state("amount").target, null);
  gate.resolve();
  await turn();
  f.edits.close();
});
it("invalid text stays editable without a write and its invalid state survives redraw", async () => {
  const f = fixture();
  f.edits.begin("amount", "gp");
  const input = f.mount();
  input.value = "bad";
  input.fire("input");
  input.fire("keydown", "Enter");
  await turn();
  assert.equal(f.calls.length, 1);
  assert.equal(input.classes.has("is-invalid"), true);
  const next = f.mount();
  assert.equal(next.value, "bad");
  assert.equal(next.classes.has("is-invalid"), true);
  f.edits.close();
});
for (const event of ["Escape", "blur"])
  it(`${event} cancels the draft without writing`, async () => {
    const f = fixture();
    f.edits.begin("amount", "gp");
    const input = f.mount();
    input.value = "9";
    input.fire("input");
    input.fire(event === "blur" ? "blur" : "keydown", event);
    await turn();
    assert.equal(f.edits.state("amount").target, null);
    assert.equal(
      f.calls.some((c) => c[0] === "write"),
      false,
    );
    f.edits.close();
  });
it("a detached blur preserves typed text and focuses the replacement at the end", () => {
  const f = fixture();
  f.edits.begin("amount", "gp");
  const input = f.mount();
  input.value = "+12";
  input.fire("input");
  input.isConnected = false;
  input.fire("blur");
  const next = f.mount();
  assert.equal(next.value, "+12");
  assert.equal(next.focused, true);
  assert.deepEqual(next.selection, [3, 3]);
  input.value = "stale";
  input.fire("input");
  assert.equal(f.edits.state("amount").text, "+12");
  f.edits.close();
});
it("after-write editors retain their distinct write then redraw ordering", async () => {
  const f = fixture({ beforeWrite: false });
  f.edits.begin("amount", "feature");
  const input = f.mount();
  input.value = "3";
  input.fire("keydown", "Enter");
  await turn();
  assert.deepEqual(f.calls, [
    ["render", "main"],
    ["write", "feature", 3],
    ["render", "main"],
  ]);
  f.edits.close();
});
it("a rejected write restores the original draft and permits an explicit retry", async () => {
  let fail = true;
  const f = fixture({
    write: async () => {
      if (fail) throw new Error("refused");
    },
  });
  f.edits.begin("amount", "gp");
  const input = f.mount();
  input.value = "+4";
  input.fire("keydown", "Enter");
  await turn();
  assert.equal(f.edits.state("amount").target, "gp");
  assert.equal(f.edits.state("amount").text, "+4");
  assert.equal(f.errors.length, 1);
  fail = false;
  const next = f.mount();
  next.fire("keydown", "Enter");
  await turn();
  assert.equal(f.edits.state("amount").target, null);
  assert.equal(f.calls.filter((c) => c[0] === "write").length, 2);
  f.edits.close();
});
it("a failed older write cannot replace a newly started draft", async () => {
  const gate = deferred(),
    f = fixture({ write: () => gate.promise });
  f.edits.begin("amount", "gp");
  const input = f.mount();
  input.value = "1";
  input.fire("keydown", "Enter");
  await turn();
  f.edits.begin("amount", "sp", "+9");
  const renders = f.calls.length;
  gate.reject(new Error("old"));
  await turn();
  assert.deepEqual(f.edits.state("amount"), { target: "sp", text: "+9", invalid: false });
  assert.equal(f.calls.length, renders);
  f.edits.close();
});
it("closing during an asynchronous write prevents restoration and later rendering", async () => {
  const gate = deferred(),
    f = fixture({ beforeWrite: false, write: () => gate.promise });
  f.edits.begin("amount", "gp");
  const input = f.mount();
  input.value = "4";
  input.fire("keydown", "Enter");
  await turn();
  f.edits.close();
  const calls = f.calls.length;
  gate.reject(new Error("closed"));
  await turn();
  assert.equal(f.calls.length, calls);
  assert.equal(f.errors.length, 0);
  assert.equal(f.edits.state("amount").target, null);
});
it("permission is rechecked at submission without discarding the draft", async () => {
  let allowed = true;
  const f = fixture({ editable: () => allowed });
  f.edits.begin("amount", "gp");
  const input = f.mount();
  input.value = "6";
  allowed = false;
  input.fire("keydown", "Enter");
  await turn();
  assert.equal(
    f.calls.some((c) => c[0] === "write"),
    false,
  );
  assert.equal(f.edits.state("amount").text, "6");
  assert.equal(f.errors.length, 1);
  f.edits.close();
});
it("rebinding the same input does not duplicate listeners or steal the caret", () => {
  const f = fixture();
  f.edits.begin("amount", "gp");
  const input = f.mount();
  input.selection = [0, 0];
  f.mount(input);
  assert.deepEqual(input.selection, [0, 0]);
  f.edits.close();
  input.value = "8";
  input.fire("input");
  input.fire("keydown", "Enter");
  assert.equal(f.calls.length, 1);
});

it("a morph that keeps the input cannot erase its invalid state", async () => {
  const f = fixture();
  f.edits.begin("amount", "gp");
  const input = f.mount();
  input.value = "invalid";
  input.fire("keydown", "Enter");
  await turn();
  input.classes.clear();
  f.mount(input);
  assert.equal(input.classes.has("is-invalid"), true);
  f.edits.close();
});
it("closing while the pre-write redraw waits prevents a later document write", async () => {
  const gate = deferred();
  let renders = 0;
  const f = fixture({ render: () => (++renders === 2 ? gate.promise : undefined) });
  f.edits.begin("amount", "gp");
  const input = f.mount();
  input.value = "5";
  input.fire("keydown", "Enter");
  f.edits.close();
  gate.resolve();
  await turn();
  assert.equal(
    f.calls.some((c) => c[0] === "write"),
    false,
  );
});
it("a successful older after-write commit cannot redraw over a new edit", async () => {
  const gate = deferred(),
    f = fixture({ beforeWrite: false, write: () => gate.promise });
  f.edits.begin("amount", "gp");
  const input = f.mount();
  input.value = "2";
  input.fire("keydown", "Enter");
  await turn();
  f.edits.begin("amount", "sp", "7");
  const calls = f.calls.length;
  gate.resolve();
  await turn();
  assert.equal(f.calls.length, calls);
  assert.equal(f.edits.state("amount").text, "7");
  f.edits.close();
});
it("permission loss while a pre-write redraw waits cannot write", async () => {
  const gate = deferred();
  let allowed = true,
    renders = 0;
  const f = fixture({ editable: () => allowed, render: () => (++renders === 2 ? gate.promise : undefined) });
  f.edits.begin("amount", "gp");
  const input = f.mount();
  input.value = "5";
  input.fire("keydown", "Enter");
  allowed = false;
  gate.resolve();
  await turn();
  assert.equal(
    f.calls.some((c) => c[0] === "write"),
    false,
  );
  assert.equal(f.edits.state("amount").text, "5");
  f.edits.close();
});
it("a redraw failure after a successful write cannot restore an already-applied relative edit", async () => {
  let renders = 0;
  const f = fixture({
    beforeWrite: false,
    render: async () => {
      if (++renders === 2) throw new Error("render failed");
    },
  });
  f.edits.begin("amount", "feature");
  const input = f.mount();
  input.value = "-1";
  input.fire("keydown", "Enter");
  await turn();
  assert.equal(f.edits.state("amount").target, null);
  assert.equal(f.calls.filter((c) => c[0] === "write").length, 1);
  assert.equal(f.errors.length, 1);
  f.edits.close();
});
it("Foundry replacing a focused node may blur it before detach without cancelling its draft", () => {
  const f = fixture();
  f.edits.begin("amount", "gp");
  const input = f.mount();
  input.value = "+8";
  input.fire("input");
  f.edits.replace(() => {
    input.fire("blur");
    input.isConnected = false;
  });
  const next = f.mount();
  assert.equal(next.value, "+8");
  f.edits.close();
});

it("exposes invalid submission after redraw and clears it when corrected", () => {
  const f = fixture();
  f.edits.begin("amount", "gp");
  const input = f.mount();
  input.value = "invalid";
  input.fire("keydown", "Enter");
  assert.equal(input.attributes.get("aria-invalid"), "true");

  const next = f.mount();
  assert.equal(next.attributes.get("aria-invalid"), "true");
  next.value = "+4";
  next.fire("input");
  assert.equal(next.attributes.get("aria-invalid"), "false");
});
