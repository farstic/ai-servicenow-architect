// ARC-01-S11 — ARC-01-S05 criterion 6: `npm ci` must write nothing outside node_modules.
// Node rather than bash so the Windows cell exercises the Q-B assumption (node, npm, git only).
import { execFileSync } from 'node:child_process';

const out = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (out) {
  console.error('assert-clean: the install modified or added files — npm ci must not do this.\n'
    + 'Untracked entries count too: in CI the checkout is pristine, so anything new here was created\n'
    + 'by the install (a stray .npmrc, a lockfile rewrite, a generated file).\n' + out);
  process.exit(1);
}
console.log('assert-clean: working tree unchanged by the install');
