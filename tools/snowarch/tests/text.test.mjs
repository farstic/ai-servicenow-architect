import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_DIALOGS, doctorLine, exportable, isWindowsShell, modeLine, nextBlock, spellings,
  summaryBlock,
} from '../lib/text.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const config = JSON.parse(readFileSync(join(repoRoot, 'engine.config.json'), 'utf8'));
const KEY = config.mcp.serverKey;

test('AC 2 — the dialog count agrees with the row where it was measured', () => {
  // `docs/plans/03-RISKS-AND-UNKNOWNS.md` §F, the "S-01 (dialog count, 2.1.258)" row: the owner's
  // sitting on 2026-09-07 recorded `live` = 1 dialog (workspace trust only), `design` = 1, and
  // `control` — no toggle written — = 2. A wrong count here is a promise broken on first contact,
  // so the constant is checked against the row rather than against another copy of itself.
  const risks = readFileSync(join(repoRoot, 'docs/plans/03-RISKS-AND-UNKNOWNS.md'), 'utf8');
  const row = risks.split('\n').find((l) => l.includes('S-01 (dialog count'));
  assert.ok(row, 'the S-01 dialog-count row is gone — the constant has nothing to agree with');
  assert.match(row, /`live` = \*\*1\*\* dialog/);
  assert.match(row, /`control`[^|]*= \*\*2\*\*/, 'the control case is what "budgeted, not promised" means');
  assert.equal(EXPECTED_DIALOGS, 1);

  // ...and the row still says which version it was measured on, because the engine's floor is
  // older and that row is recorded as pending.
  assert.match(row, /2\.1\.258/);
});

test('one sentence per dialog — never a hedge', () => {
  const one = nextBlock({ mode: 'live', dialogs: 1, serverKey: KEY, platform: 'linux', env: {} });
  assert.equal(one.split('\n').filter((l) => /answer Yes\./.test(l)).length, 1);
  assert.ok(!one.includes('may see'), 'a hedge makes a reader distrust every other line');

  const two = nextBlock({ mode: 'live', dialogs: 2, serverKey: KEY, platform: 'linux', env: {} });
  assert.equal(two.split('\n').filter((l) => /answer Yes\./.test(l)).length, 2);
  assert.match(two, new RegExp(`…and one approval for the "${KEY}" MCP server — answer Yes\\.`));
  // The server key comes from the config, not from a literal — it is a name the contract owns.
  assert.ok(two.includes(KEY));
});

test('the Mode line has exactly two base forms', () => {
  assert.equal(modeLine({ mode: 'design-only' }), 'Mode: design-only');
  assert.equal(modeLine({ mode: 'live', instance: { label: 'pdi', environment: 'pdi', preset: 'full' } }),
    'Mode: live — instance=pdi (pdi) preset=full');
  // Live with nothing configured is still `live` — the mode is what was asked for, and the doctor
  // is what says whether it works.
  assert.equal(modeLine({ mode: 'live' }), 'Mode: live');
  // A label, an environment and a preset. Nothing that identifies a host or an account.
  const line = modeLine({ mode: 'live', instance: { label: 'pdi', environment: 'prod', preset: 'read-only',
    url: 'https://example.service-now.invalid', username: 'admin' } });
  assert.ok(!line.includes('service-now') && !line.includes('admin'), line);
});

test('AC 4 — the spellings follow the SHELL, not only the platform', () => {
  // Git Bash on Windows runs `./bootstrap.sh` perfectly well; telling that user to type
  // `.\bootstrap.cmd` would be telling them to type something that does not work.
  assert.deepEqual(spellings({ platform: 'linux', env: {} }),
    { bootstrap: './bootstrap.sh', cli: './snowarch' });
  assert.deepEqual(spellings({ platform: 'win32', env: {} }),
    { bootstrap: '.\\bootstrap.cmd', cli: 'snowarch.cmd' });
  assert.deepEqual(spellings({ platform: 'win32', env: { SHELL: '/usr/bin/bash' } }),
    { bootstrap: './bootstrap.sh', cli: './snowarch' }, 'Git Bash');
  assert.deepEqual(spellings({ platform: 'win32', env: { MSYSTEM: 'MINGW64' } }),
    { bootstrap: './bootstrap.sh', cli: './snowarch' }, 'MSYS');

  assert.equal(isWindowsShell({ platform: 'win32', env: {} }), true);
  assert.equal(isWindowsShell({ platform: 'darwin', env: {} }), false);

  // ...and the block that quotes them follows. Proven from any machine, because both are parameters.
  const cmd = nextBlock({ mode: 'design-only', serverKey: KEY, platform: 'win32', env: {} });
  assert.match(cmd, /snowarch\.cmd mode live/);
  const posix = nextBlock({ mode: 'design-only', serverKey: KEY, platform: 'linux', env: {} });
  assert.match(posix, /\.\/snowarch mode live/);
});

test('the DOCTOR line says what it does not know', () => {
  assert.equal(doctorLine({ ok: 41, warn: 0, fail: 0 }), 'DOCTOR: 41 ok, 0 warn, 0 fail');
  assert.equal(doctorLine({ nodeUsable: false }),
    'DOCTOR: unavailable until Node 20+ is installed (design-only is complete)');
  // The parenthesis matters: without it the line reads as a failed install.
  assert.match(doctorLine({ nodeUsable: false }), /design-only is complete/);
});

test('the summary block is five lines, and the warnings recap comes after them', () => {
  const clean = summaryBlock({ mode: 'design-only', counts: { ok: 7, warn: 0, fail: 0 },
    serverKey: KEY, platform: 'linux', env: {} });
  assert.equal(clean.split('\n').length, 5);
  assert.match(clean.split('\n')[0], /^DOCTOR: /);
  assert.equal(clean.split('\n')[1], 'Mode: design-only');

  const warned = summaryBlock({ mode: 'design-only', counts: { ok: 6, warn: 2, fail: 0 },
    serverKey: KEY, platform: 'linux', env: {},
    warnings: ['a cloud-synced folder (Dropbox)', '2 dead citation(s)'] });
  const lines = warned.split('\n');
  assert.equal(lines[5], 'Warnings: 2');
  assert.deepEqual(lines.slice(6), ['      a cloud-synced folder (Dropbox)', '      2 dead citation(s)']);
});

test('AC 5 — text.json is generated from these strings and is current', () => {
  const generated = JSON.parse(readFileSync(join(repoRoot, 'tools/snowarch/lib/text.json'), 'utf8'));
  const fresh = exportable({ serverKey: KEY });
  for (const [k, v] of Object.entries(fresh)) {
    assert.deepEqual(generated[k], v, `text.json is stale at ${k} — run node scripts/gen-text.mjs`);
  }
  // The launchers read this file, so the two shells' blocks must both be in it.
  assert.match(generated.posix.nextDesign, /\.\/snowarch mode live/);
  assert.match(generated.windows.nextDesign, /snowarch\.cmd mode live/);
  assert.equal(generated.expectedDialogs, EXPECTED_DIALOGS);
  assert.match(generated.$comment, /GENERATED by scripts\/gen-text\.mjs/);
});
