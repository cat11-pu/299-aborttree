import assert from "node:assert";
import { children, descendants } from "../canceltree.js";
import { step, close } from "../abortrun.js";
import { render } from "../app.js";

const base = {
  budget: 2,
  state: { tasks: [], cancelled: [], ledger: [], applied: [] },
  events: [],
  parent_error_code: "E_NO_PARENT", dup_error_code: "E_DUP_TASK",
  task_error_code: "E_NO_TASK", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("children returns a list", () => {
  assert.ok(Array.isArray(children([], 0)));
});

check("descendants returns a list", () => {
  assert.ok(Array.isArray(descendants([], 0)));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
