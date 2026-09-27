// canceltree.js：任务树查询（tasks 为 [任务号, 父号] 的数组）
export function children(tasks, parent) {
  const ids = [];
  for (const row of tasks || []) {
    if (Array.isArray(row) && row[1] === parent) ids.push(row[0]);
  }
  return ids.sort((a, b) => a - b);
}

export function descendants(tasks, root) {
  const byParent = new Map();
  for (const row of tasks || []) {
    if (!Array.isArray(row)) continue;
    if (!byParent.has(row[1])) byParent.set(row[1], []);
    byParent.get(row[1]).push(row[0]);
  }
  const found = [];
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    const kids = (byParent.get(current) || []).slice().sort((a, b) => a - b);
    for (const kid of kids) {
      if (seen.has(kid)) continue;
      seen.add(kid);
      found.push(kid);
      queue.push(kid);
    }
  }
  return found.sort((a, b) => a - b);
}
