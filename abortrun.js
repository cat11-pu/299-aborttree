// abortrun.js：按处理预算处理并留账
import { children, descendants } from "./canceltree.js";

const CODE_PARENT = "E_NO_PARENT";
const CODE_DUP = "E_DUP_TASK";
const CODE_TASK = "E_NO_TASK";
const CODE_EVENT = "E_BAD_EVENT";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isNum(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    fail(CODE_EVENT, "事件必须是对象");
  }
  if (event.kind === "spawn") {
    if (!isNum(event.task) || !isNum(event.parent)) {
      fail(CODE_EVENT, "spawn 需要数值 task 与 parent");
    }
  } else if (event.kind === "cancel") {
    if (!isNum(event.task)) {
      fail(CODE_EVENT, "cancel 需要数值 task");
    }
  } else {
    fail(CODE_EVENT, "未知的事件种类 " + String(event.kind));
  }
}

function eventToEntry(event) {
  return {
    id: event.id === undefined ? null : event.id,
    kind: event.kind === "spawn" ? "spawn" : event.kind,
    task: event.task,
    parent: event.kind === "spawn" ? event.parent : null
  };
}

function normalizeEntry(entry) {
  if (Array.isArray(entry)) {
    return {
      id: null,
      kind: entry[0],
      task: entry[1],
      parent: entry.length > 2 ? entry[2] : null
    };
  }
  return {
    id: entry && entry.id === undefined ? null : entry && entry.id,
    kind: entry && entry.kind,
    task: entry && entry.task,
    parent: entry && entry.parent === undefined ? null : entry && entry.parent
  };
}

function project(entry) {
  return entry.kind === "spawn"
    ? ["spawn", entry.task, entry.parent]
    : ["cancel", entry.task];
}

function hasTask(tasks, id) {
  return tasks.some(function (row) { return row[0] === id; });
}

function applyEntry(work, entry) {
  if (entry.kind === "spawn") {
    if (hasTask(work.tasks, entry.task)) {
      fail(CODE_DUP, "任务号已存在 " + entry.task);
    }
    if (entry.parent !== 0 && !hasTask(work.tasks, entry.parent)) {
      fail(CODE_PARENT, "父任务不存在 " + entry.parent);
    }
    work.tasks.push([entry.task, entry.parent]);
  } else if (entry.kind === "cancel") {
    if (!hasTask(work.tasks, entry.task)) {
      fail(CODE_TASK, "任务不存在 " + entry.task);
    }
    if (work.cancelled.indexOf(entry.task) < 0) {
      work.cancelled.push(entry.task);
      descendants(work.tasks, entry.task).forEach(function (kid) {
        if (work.cancelled.indexOf(kid) < 0) {
          work.queue.push({ id: null, kind: "cancel", task: kid, parent: null });
        }
      });
    }
  } else {
    fail(CODE_EVENT, "未知的请求种类 " + String(entry.kind));
  }
  if (entry.id !== null && work.applied.indexOf(entry.id) < 0) {
    work.applied.push(entry.id);
  }
}

function freshWork(state) {
  return {
    tasks: (state.tasks || []).map(function (row) { return row.slice(); }),
    cancelled: (state.cancelled || []).slice(),
    applied: (state.applied || []).slice(),
    queue: (state.ledger || []).map(normalizeEntry)
  };
}

function snapshot(work, ledger) {
  return { tasks: work.tasks, cancelled: work.cancelled, ledger: ledger, applied: work.applied };
}

export function step(spec) {
  const source = spec.state || { tasks: [], cancelled: [], ledger: [], applied: [] };
  const events = spec.events || [];
  events.forEach(validateEvent);
  let budget = isNum(spec.budget) ? spec.budget : 0;
  const work = freshWork(source);
  events.forEach(function (event) { work.queue.push(eventToEntry(event)); });
  let served = 0;
  while (work.queue.length > 0) {
    const head = work.queue[0];
    if (head.id !== null && work.applied.indexOf(head.id) >= 0) {
      work.queue.shift();
      continue;
    }
    if (budget <= 0) break;
    work.queue.shift();
    applyEntry(work, head);
    served += 1;
    budget -= 1;
  }
  const ledger = work.queue;
  return {
    state: snapshot(work, ledger),
    served: served,
    ledger_before: ledger.length,
    ledger: ledger.map(project),
    judged: served,
    judged_bound: events.length + (source.ledger || []).length
  };
}

export function close(spec) {
  const source = spec.state || { tasks: [], cancelled: [], ledger: [], applied: [] };
  const work = freshWork(source);
  let catchup = 0;
  while (work.queue.length > 0) {
    const entry = work.queue.shift();
    if (entry.id !== null && work.applied.indexOf(entry.id) >= 0) {
      continue;
    }
    applyEntry(work, entry);
    catchup += 1;
  }
  return { state: snapshot(work, []), catchup: catchup };
}
