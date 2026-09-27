// canceltree.js：任务树的查询
export function children(tasks, parent) {
  return (tasks || [])
    .filter(function (row) { return row[1] === parent; })
    .map(function (row) { return row[0]; })
    .sort(function (a, b) { return a - b; });
}

export function descendants(tasks, root) {
  const rows = tasks || [];
  const found = [];
  let frontier = [root];
  while (frontier.length > 0) {
    const next = [];
    frontier.forEach(function (id) {
      children(rows, id).forEach(function (kid) {
        found.push(kid);
        next.push(kid);
      });
    });
    frontier = next;
  }
  return found.sort(function (a, b) { return a - b; });
}
