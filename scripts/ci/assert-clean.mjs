// ARC-01-S11 — ARC-01-S05 criterion 6: `npm ci` must write nothing outside node_modules.
// Node rather than bash so the Windows cell exercises the Q-B assumption (node, npm, git only).
import { execFileSync } from 'node:child_process';
import { writeSync } from 'node:fs';

const out = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (out) {
  writeSync(2, 'assert-clean: the install modified or added files — npm ci must not do this.\n'
    + 'Untracked entries count too: in CI the checkout is pristine, so anything new here was created\n'
    + `by the install (a stray .npmrc, a lockfile rewrite, a generated file).\n${out}\n`);
  // No `process.exit`: this file has nothing after the branch, so setting the code and letting the
  // module end is exact — and it is the form ARC-09-C6 asks for wherever control flow allows it.
  process.exitCode = 1;
} else {
  writeSync(1, 'assert-clean: working tree unchanged by the install\n');
}
