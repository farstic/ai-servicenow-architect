#!/usr/bin/env node
/**
 * L01 and L03 on the real tree — reported, not enforced. Yet.
 *
 * The engine's texts still cite retired names: sweeping them is ARC-02-S12's story, and making
 * this job red today would mean every unrelated PR ships past a failing check, which is how a
 * check stops being read. So the count is printed and the exit stays 0 — until S12 flips ONE
 * constant here and the same command becomes required.
 *
 * The constant is named rather than inlined precisely so that flip is a one-line, reviewable
 * change with a story attached, instead of an edit to a shell pipeline in a workflow file.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ARC-02-S12 sets this to true. Its exit test is `engine-lint --only L01,L02,L03` exiting 0.
 *
 * L02 is here rather than in the required set because the real tree fails it today — three
 * lines in `CLAUDE.md` still carry the old prefixes, and those are S12's to sweep. Requiring it
 * now would make every unrelated PR ship past a red check, which is how a check stops being
 * read.
 */
const NAME_CHECKS_REQUIRED = true;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = join(root, 'packages', 'contract', 'lint', 'engine-lint.mjs');

let stdout = '';
let code = 0;
try {
  stdout = execFileSync(process.execPath, [cli, '--only', 'L01,L02,L03', '--json'],
    { cwd: root, encoding: 'utf8', stdio: 'pipe' });
} catch (e) {
  stdout = e.stdout ?? '';
  code = e.status ?? 1;
}

let counts = { L01: '?', L02: '?', L03: '?' };
try {
  const doc = JSON.parse(stdout);
  counts = Object.fromEntries(doc.checks.map((c) => [c.id, c.findings.length]));
} catch { /* the lint could not run; `code` says so and the summary shows ? */ }

process.stdout.write(
  `SUMMARY engine-lint name checks — L01 ${counts.L01}, L02 ${counts.L02}, L03 ${counts.L03} `
  + `(${NAME_CHECKS_REQUIRED ? 'REQUIRED' : 'reported only until ARC-02-S12'})\n`);

if (code === 2) {
  // "Could not run" is always fatal, whatever the flag says: a summary of a check that never
  // executed is worse than no summary, because it reads as a number.
  process.stderr.write('SUMMARY: engine-lint could not run — see above.\n');
  process.exit(2);
}
process.exit(NAME_CHECKS_REQUIRED ? code : 0);
