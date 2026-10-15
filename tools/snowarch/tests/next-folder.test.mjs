// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C157 — the folder Claude Code has to start in, printed.
//
// The Windows colleague's 2.1.0 install (2026-10-15): the bootstrap ended "Next: run `claude` here.", the colleague
// started `claude` from the folder above the checkout, and `/mcp` showed nothing — Claude Code started anywhere else
// loads none of this product. "Here" names no folder. The Next line now prints the checkout's absolute path, in every
// printer of it: the Node bootstrap, the two Node-free launchers (from a slot in the shared text, filled at run time),
// and the install page's sample. And the doctor's and status's existing "not at the repository root" line, which from
// outside any checkout said `cd <the checkout>`, names the install it was launched from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ROOT_SLOT, SAMPLE_ROOT, exportable, nextBlock, summaryBlock } from '../lib/text.mjs';
import { resolveCheckout } from '../lib/doctor/index.mjs';
import { root as installRoot } from '../lib/config.mjs';
import { closingBlock } from '../../../scripts/gen-readme.mjs';
import { tempDir } from './helpers/temp.mjs';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel) => readFileSync(join(REPO, rel), 'utf8');
const KEY = 'servicenow';

test('ARC-09-C157 — the Next line names the folder, and the dialog sentence follows on its own line', () => {
  for (const [platform, at] of [['darwin', '/Users/sam/ai-servicenow-architect'],
    ['win32', 'C:\\Users\\sam\\ai-servicenow-architect']]) {
    const lines = nextBlock({ mode: 'design-only', serverKey: KEY, root: at, platform, env: {} }).split('\n');
    assert.equal(lines[0], `Next: run \`claude\` in this folder: ${at}`);
    assert.equal(lines[1], '      You will see one workspace-trust dialog — answer Yes.');
    assert.equal(lines.some((l) => /claude` here/.test(l)), false, 'a "here" names no folder');
  }
  // The bootstrap's own summary carries the root it ran in.
  const block = summaryBlock({ mode: 'design-only', counts: { ok: 7, warn: 0, fail: 0 }, serverKey: KEY,
    root: '/Users/sam/ai-servicenow-architect', platform: 'linux', env: {} });
  assert.match(block, /^Next: run `claude` in this folder: \/Users\/sam\/ai-servicenow-architect$/m);
});

test('ARC-09-C157 — the shared text carries one slot for the folder, which the launchers fill when they print', () => {
  assert.equal(ROOT_SLOT, '{root}');
  const shared = exportable({ serverKey: KEY });
  for (const shell of ['posix', 'windows']) {
    for (const key of ['nextDesign', 'nextLive']) {
      assert.equal(shared[shell][key].split(ROOT_SLOT).length, 2, `${shell}.${key} does not carry the slot once`);
      assert.ok(shared[shell][key].startsWith(`Next: run \`claude\` in this folder: ${ROOT_SLOT}\n`));
    }
  }
  // The generated regions declare the slot, and each launcher prints MSG_NEXT with it filled by its own root.
  const sh = read('bootstrap.sh');
  const ps = read('bootstrap.ps1');
  assert.match(sh, /^MSG_ROOT_SLOT='\{root\}'$/m);
  assert.match(ps, /^\$MSG_ROOT_SLOT = '\{root\}'$/m);
  assert.ok(sh.includes('say "${MSG_NEXT%%"$MSG_ROOT_SLOT"*}$ROOT${MSG_NEXT#*"$MSG_ROOT_SLOT"}"'), 'bootstrap.sh prints the slot');
  assert.ok(ps.includes('Say $MSG_NEXT.Replace($MSG_ROOT_SLOT, $Root)'), 'bootstrap.ps1 prints the slot');
  assert.equal(/^say "\$MSG_NEXT"$/m.test(sh), false);
  assert.equal(/^Say \$MSG_NEXT$/m.test(ps), false);
});

test('ARC-09-C157 — bash fills the slot with any path: spaces, an ampersand, backslashes, a percent sign', (t) => {
  const probe = spawnSync('bash', ['-c', 'exit 0']);
  if (probe.error || probe.status !== 0) { t.skip('no bash on this machine'); return; }
  const template = exportable({ serverKey: KEY }).posix.nextDesign;
  for (const at of ['/Users/a b/ai-servicenow-architect', '/tmp/x&y/ai', 'C:\\Users\\x\\ai', '/p/%s\\n/q']) {
    const r = spawnSync('bash', ['-c', 'say() { printf \'%s\\n\' "$*" ; }; '
      + 'say "${MSG_NEXT%%"$MSG_ROOT_SLOT"*}$ROOT${MSG_NEXT#*"$MSG_ROOT_SLOT"}"'],
    { encoding: 'utf8', env: { ...process.env, MSG_NEXT: template, MSG_ROOT_SLOT: ROOT_SLOT, ROOT: at } });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `${template.replace(ROOT_SLOT, () => at)}\n`);
  }
});

test('ARC-09-C157 — the install page shows the block with a sample folder, never the slot', () => {
  const text = JSON.parse(read('tools/snowarch/lib/text.json'));
  const block = closingBlock(text);
  assert.ok(block.includes(`Next: run \`claude\` in this folder: ${SAMPLE_ROOT}\n`), block);
  assert.equal(block.includes(ROOT_SLOT), false);
  assert.ok(read('docs/INSTALL.md').includes(block), 'INSTALL.md\'s closing block is not the generated one');
});

test('ARC-09-C157 — from outside any checkout, doctor and status name the install they were launched from', (t) => {
  const outside = tempDir('snowarch-c157-outside-', t);
  for (const who of ['DOCTOR', 'STATUS']) {
    const r = resolveCheckout({ cwd: outside, who });
    assert.equal(r.problem?.message, `${who}: not at the repository root — run: cd ${installRoot}`);
  }
  // Control: a launcher that is not in a checkout has no folder to name, and says what it does not know.
  const nowhere = resolveCheckout({ cwd: outside, who: 'STATUS', install: tempDir('snowarch-c157-noinstall-', t) });
  assert.equal(nowhere.problem?.message, 'STATUS: not at the repository root — run: cd <the checkout>');
});
