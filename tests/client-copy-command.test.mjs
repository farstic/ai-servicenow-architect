// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C232 — `./snowarch client-copy <working file>`: the command the Chief Architect runs in Phase 2, after a
// builder's manifest names it (governance §4.5). Clean, it exits 0 and names the copy; with internal content left
// above the marker, it exits 1 and lists each hit by line, for the working file to be rewritten; a file it cannot
// copy is a usage error with the reason, and nothing is written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { COMMANDS } from '../tools/snowarch/lib/cli.mjs';
import { clientCopyCommand } from '../tools/snowarch/lib/commands/client-copy.mjs';
import { MARKERS } from '../tools/snowarch/lib/client-copy.mjs';
import { EXIT_FAIL, EXIT_OK, EXIT_USAGE } from '../tools/snowarch/lib/exit.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

/** A logger that keeps what it was told: `out` for step/ok, `err` for warn/fail/note. */
function capture() {
  const out = []; const err = [];
  return { out, err, log: { step: (m) => out.push(m), ok: (m) => out.push(m), warn: (m) => err.push(m),
    fail: (m) => err.push(m), note: (m) => err.push(m) } };
}

function world(t) {
  const root = tempDir('snowarch-c232c-', t);
  const put = (rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
  put('clients/acme/clean.md', `# HLD\n\nThe API gateway carries it.\n\n${MARKERS.markdown}\n\nOQ-DS-1. …\n`);
  put('clients/acme/leaky.md', `# HLD\n\nThe ITSM gateway approved it.\n\nSee OQ-DS-1.\n\n${MARKERS.markdown}\n`);
  put('clients/acme/nomarker.md', '# HLD\n');
  return root;
}

test('ARC-09-C232 — a clean copy exits 0 and names where it went', async (t) => {
  const root = world(t); const c = capture();
  assert.equal(await clientCopyCommand({ positional: ['clients/acme/clean.md'], log: c.log, root }), EXIT_OK);
  assert.deepEqual(c.out, ['client copy: clients/acme/for-client/clean.md — no internal content']);
  assert.deepEqual(c.err, []);
});

test('ARC-09-C232 — internal content above the marker exits 1, each hit by line, for the working file', async (t) => {
  const root = world(t); const c = capture();
  assert.equal(await clientCopyCommand({ positional: ['clients/acme/leaky.md'], log: c.log, root }), EXIT_FAIL);
  assert.deepEqual(c.err, [
    'client copy: clients/acme/for-client/leaky.md has 2 internal terms — rewrite them in clients/acme/leaky.md and '
      + 'run it again:',
    '  line 3: a domain\'s gateway — "ITSM gateway"',
    '  line 5: OQ- id — "OQ-DS-1"',
  ]);
});

test('ARC-09-C232 — a file it cannot copy is a usage error with the reason, and nothing is written', async (t) => {
  const root = world(t);
  for (const [args, why] of [[[], /usage: .*client-copy/], [['clients/acme/nomarker.md'], /no end marker/],
    [['docs/hld.md'], /not a file under clients\/<name>\//], [['clients/acme/missing.md'], /does not exist/]]) {
    const c = capture();
    assert.equal(await clientCopyCommand({ positional: args, log: c.log, root }), EXIT_USAGE, JSON.stringify(args));
    assert.match(c.err.join('\n'), why, JSON.stringify(args));
  }
  assert.equal(existsSync(join(root, 'clients/acme/for-client/nomarker.md')), false, 'a refused file left a copy');
});

test('ARC-09-C232 — the command is in the CLI\'s table, with its usage', () => {
  const c = COMMANDS['client-copy'];
  assert.ok(c, 'no client-copy command');
  assert.equal(typeof c.run, 'function');
  const usage = typeof c.usage === 'function' ? c.usage({ platform: 'linux', env: {} }) : c.usage;
  assert.match(usage, /usage: .*client-copy <working file>/);
});
