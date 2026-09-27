// abortrun.js：按处理预算推进，预算用尽的请求压在账上带入下一轮；收尾不限预算清账
import { descendants } from "./canceltree.js";

const DEFAULT_CODES = {
  parent: "E_NO_PARENT", dup: "E_DUP_TASK",
  task: "E_NO_TASK", event: "E_BAD_EVENT"
};

function isInt(value) {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function codesOf(spec) {
  spec = spec || {};
  return {
    parent: spec.parent_error_code || DEFAULT_CODES.parent,
    dup: spec.dup_error_code || DEFAULT_CODES.dup,
    task: spec.task_error_code || DEFAULT_CODES.task,
    event: spec.event_error_code || DEFAULT_CODES.event
  };
}

function failure(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

// 形状错误一律先校验，与预算无关
function validateShape(events, codes) {
  if (!Array.isArray(events)) throw failure(codes.event, "events must be an array");
  for (const ev of events) {
    if (!ev || typeof ev !== "object" || Array.isArray(ev)) {
      throw failure(codes.event, "event must be an object");
    }
    if (ev.kind === "spawn") {
      if (!isInt(ev.task) || ev.task <= 0) throw failure(codes.event, "spawn.task must be a positive int");
      if (!isInt(ev.parent) || ev.parent < 0) throw failure(codes.event, "spawn.parent must be a non-negative int");
    } else if (ev.kind === "cancel") {
      if (!isInt(ev.task) || ev.task <= 0) throw failure(codes.event, "cancel.task must be a positive int");
    } else {
      throw failure(codes.event, "unknown event kind");
    }
  }
}

function cloneState(state) {
  state = state || {};
  return {
    tasks: (state.tasks || []).map((row) => row.slice()),
    cancelled: (state.cancelled || []).slice(),
    ledger: (state.ledger || []).map((row) => row.slice()),
    applied: (state.applied || []).slice()
  };
}

function hasTask(tasks, id) {
  return tasks.some((row) => row[0] === id);
}

function fingerprintOf(item) {
  return item.kind + ":" + item.task;
}

// 内部统一用对象表示队列项；落到账上时序列化成 [kind, task, parent?]
function toTuple(item) {
  return item.kind === "spawn" ? ["spawn", item.task, item.parent] : ["cancel", item.task];
}

function run(spec, budget, takeIncoming) {
  const codes = codesOf(spec);
  const state = cloneState(spec.state);
  if (takeIncoming) validateShape(spec.events, codes);
  const incoming = Array.isArray(spec.events) ? spec.events : [];

  // 已服务请求指纹（跨轮重放依据）：以本轮开始前的快照为准，
  // 这样同一轮里重复建任务仍然报 E_DUP_TASK。
  const served = new Set(state.applied);
  const queue = [];

  // 先还旧账：账上请求 FIFO 优先
  for (const row of state.ledger) {
    queue.push(row[0] === "spawn"
      ? { kind: "spawn", task: row[1], parent: row[2], incoming: false }
      : { kind: "cancel", task: row[1], incoming: false });
  }
  if (takeIncoming) {
    for (const ev of incoming) {
      const item = ev.kind === "spawn"
        ? { kind: "spawn", task: ev.task, parent: ev.parent, incoming: true }
        : { kind: "cancel", task: ev.task, incoming: true };
      if (served.has(fingerprintOf(item))) continue; // 重放：不再处理、不花预算
      queue.push(item);
    }
  }

  let remaining = Number.isFinite(budget) ? budget : Infinity;
  let servedCount = 0;
  let judged = 0;
  // 已取消 + 本轮已排队取消的任务，避免同一后代重复入账
  const pendingCancel = new Set(state.cancelled);
  state.ledger.length = 0;

  while (queue.length > 0) {
    const item = queue.shift();

    // 预算已尽：剩余请求连着压在账上，语义校验推迟到下一轮/收尾
    if (remaining <= 0) {
      state.ledger.push(toTuple(item));
      continue;
    }

    if (item.kind === "spawn") {
      if (item.parent !== 0 && !hasTask(state.tasks, item.parent)) {
        throw failure(codes.parent, "parent task not found");
      }
      if (hasTask(state.tasks, item.task)) throw failure(codes.dup, "task already exists");
      state.tasks.push([item.task, item.parent]);
    } else {
      if (!hasTask(state.tasks, item.task)) throw failure(codes.task, "task not found");
      if (state.cancelled.indexOf(item.task) < 0) state.cancelled.push(item.task);
      if (!pendingCancel.has(item.task)) {
        pendingCancel.add(item.task);
        // 取消沿任务树向下传：未取消后代按任务号升序逐个入账
        for (const desc of descendants(state.tasks, item.task)) {
          if (!pendingCancel.has(desc)) {
            pendingCancel.add(desc);
            queue.push({ kind: "cancel", task: desc, incoming: false });
          }
        }
      }
    }

    served.add(fingerprintOf(item));
    state.applied.push(fingerprintOf(item));
    remaining -= 1;
    servedCount += 1;
    if (item.incoming) judged += 1;
  }

  state.cancelled.sort((a, b) => a - b);
  return { state, servedCount, judged };
}

export function step(spec) {
  spec = spec || {};
  const events = Array.isArray(spec.events) ? spec.events : [];
  const budget = Number.isFinite(spec.budget) ? spec.budget : 0;
  const result = run(spec, budget, true);
  return {
    state: result.state,
    served: result.servedCount,
    ledger_before: result.state.ledger.length,
    ledger: result.state.ledger.map((row) => row.slice()),
    judged: result.judged,
    judged_bound: events.length
  };
}

export function close(spec) {
  // 收尾只清账上的请求，不再接新事件，且不限预算
  const result = run(spec, Infinity, false);
  return { state: result.state, catchup: result.servedCount };
}
