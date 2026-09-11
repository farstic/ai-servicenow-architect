// ARC-01-S11 — the production install's footprint, in the ONE metric the gate names.
// `du` block-rounds and its semantics differ per OS (72 MB vs 57.3 MB on the same tree, measured in
// ARC-01-S05), so the gate sums file CONTENT with node:fs and is comparable across the matrix.
// The du figure is printed alongside for context only; it is never the thing compared.
import { readdirSync, statSync } from 'node:fs';
import { existsSync, writeSync } from 'node:fs';

const limitMb = Number(process.argv[2] ?? 80);
const dir = process.argv[3] ?? 'node_modules';
if (!existsSync(dir)) {
  writeSync(2, `footprint: ${dir} does not exist — run npm ci --omit=dev --ignore-scripts first\n`);
  process.exit(1);
}
let bytes = 0, files = 0;
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue;              // never follow: a cycle would hang the job
    const p = `${d}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else { try { bytes += statSync(p).size; files++; } catch { /* vanished mid-walk */ } }
  }
})(dir);
const mb = bytes / 1048576;
writeSync(1, `node_modules: ${mb.toFixed(1)} MB (limit ${limitMb}) — summed file content, `
  + `${files} files\n`);
if (mb > limitMb) {
  writeSync(2, `footprint: ${mb.toFixed(1)} MB exceeds the ${limitMb} MB limit\n`);
  // The LAST statement, so `exitCode` is exact: nothing follows it to skip.
  process.exitCode = 1;
}
