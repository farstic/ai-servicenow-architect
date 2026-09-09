/**
 * A minimal unified diff, shared by the generators.
 *
 * Every `--check` in this repository has the same job: say which line moved, not that something
 * did. It lived inside `gen-roster.mjs` until `gen-governance.mjs` needed the same thing, and two
 * copies of a diff algorithm is two ways for a finding to be formatted.
 */
export function unifiedDiff(before, after, path) {
  const a = before.split('\n'), b = after.split('\n');
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const rows = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { rows.push(` ${a[i]}`); i += 1; j += 1; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { rows.push(`-${a[i]}`); i += 1; }
    else { rows.push(`+${b[j]}`); j += 1; }
  }
  while (i < a.length) { rows.push(`-${a[i]}`); i += 1; }
  while (j < b.length) { rows.push(`+${b[j]}`); j += 1; }
  // Only the changed lines and three of context: the whole block is ~50 rows and a full dump
  // would bury the one that moved.
  const keep = new Set();
  rows.forEach((r, k) => { if (r[0] !== ' ') for (let d = -3; d <= 3; d += 1) keep.add(k + d); });
  const body = rows.filter((_, k) => keep.has(k));
  return [`--- a/${path}`, `+++ b/${path}`, ...body].join('\n');
}
