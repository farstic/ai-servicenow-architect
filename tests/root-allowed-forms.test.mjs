// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C303 — the forms of `./snowarch` that root may run, run as root, and the forms it may not, refused as root.
 *
 * tools/snowarch/tests/root-guard.test.mjs holds the classification and the frame. This file runs the real CLI, in a checkout it really
 * works in (the library is a copy, so the CLI's root is the folder), as a child that believes it is root, and holds each run to the
 * statement the guard exists for: the checkout, `.local/`, `.git/` and the home folder are byte for byte what they were. For an allowed
 * form that is the proof that it writes nothing; for a refused one, that it was refused before anything ran.
 *
 * The measurement behind the list (2026-11-19, a write tracer over every candidate): `status` and a `doctor` with the cache on write
 * `.local/doctor-last*.json`; a full `doctor` starts Claude Code, which creates `~/.claude.json` and its backups in the HOME it is given;
 * and the quick doctor's `git diff --quiet HEAD` refreshes git's stat cache, which REWRITES `.git/index` when the stat data is stale
 * (touched files, a bind-mounted checkout). The last is why the checkout below has stale stat data in it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { elevatedSentence } from '../tools/snowarch/lib/root-guard.mjs';
import { licensedEnv } from '../tools/snowarch/tests/helpers/licence-hook/index.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { asRoot, changes, cliCheckout, described, settleIndex, snapshot } from './helpers/elevated.mjs';

const put = (root, rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };

/** A checkout the CLI works in, with a corpus of two pages, and tracked files whose stat data is stale: touched, not changed. */
function checkout(t) {
  const { root } = cliCheckout(t);
  for (const p of ['markdown/alpha/page-one.md', 'markdown/alpha/deep/folder/page-two.md']) put(root, `vendor/ServiceNowDocs/${p}`, '# page\nsc\\_req\\_item\n');
  settleIndex(root);
  const later = new Date(Date.now() + 60000);
  for (const f of ['engine.config.json', 'package.json', '.mcp.json', 'CLAUDE.md', '.claude/settings.json']) utimesSync(join(root, f), later, later);
  return root;
}

function env(t, root) {
  const home = tempDir('snowarch-c303-home-', t);
  const base = { ...process.env, HOME: home, USERPROFILE: home };
  for (const k of ['SNOWARCH_STATE_ROOT', 'SNOW_STORE', 'CLAUDE_PROJECT_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME']) delete base[k];
  return { env: asRoot(licensedEnv(base, { root })), home };
}

const cli = (root, args, e) => spawnSync(process.execPath, [join(root, 'tools/snowarch/bin/snowarch.mjs'), ...args], { cwd: root, encoding: 'utf8', env: e, timeout: 120000 });

/** Run each form; a form's checkout and home are compared before and after it, so one form cannot hide another's write. */
function runForms(t, forms, check) {
  const root = checkout(t);
  const { env: e, home } = env(t, root);
  for (const args of forms) {
    const before = { root: snapshot(root), home: snapshot(home) };
    const r = cli(root, args, e);
    check(args.join(' '), r);
    assert.deepEqual(described(changes(before.root, snapshot(root))), [], `${args.join(' ')}: wrote into the checkout`);
    assert.deepEqual(described(changes(before.home, snapshot(home))), [], `${args.join(' ')}: wrote into the home folder`);
  }
}

const ALLOWED = [
  ['version'], ['version', '--json'],
  ['status'], ['status', '--json'],
  ['doctor', '--quick'], ['doctor', '--quick', '--json'], ['doctor', '--quick', '--no-network'], ['doctor', '--quick', '--section', 'docs'],
  ['docs'], ['docs', 'status'], ['docs', 'verify'], ['docs', 'lookup', 'sc_req_item'],
  ['licence', 'show'], ['licence', 'check'], ['licence', 'verify', 'NO-SUCH-FILE'],
  ['mode'], ['instance', 'list'], ['store', 'backups'],
];

const REFUSED = [
  ['bootstrap'], ['bootstrap', '--yes'], ['upgrade'], ['upgrade', '--check'], ['mode', 'live'], ['mode', 'design'],
  ['doctor'], ['doctor', '--json'], ['doctor', '--fix'], ['doctor', '--quick', '--fix'], ['doctor', '--quick', '--write-cache'],
  ['docs', 'sync'], ['docs', 'family', 'australia'], ['licence', 'check', '--refresh'], ['licence', 'keygen', '--out', 'k', '--recovery-out', 'r'],
  ['instance', 'add', 'lab'], ['instance', 'remove', 'lab'], ['instance', 'set-credentials', 'lab'], ['store', 'migrate'], ['store', 'restore', 'f'],
];

test('C303 — as root, every form that reads runs, and the checkout, .local, .git and the home folder are byte for byte as they were', (t) => {
  runForms(t, ALLOWED, (form, r) => {
    assert.ok(!(r.stderr).includes(elevatedSentence()), `${form} was refused as a write: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /refused: this process runs as root/, form);
  });
});

test('C303 — as root, every form that writes is refused before anything runs, and nothing is written', (t) => {
  runForms(t, REFUSED, (form, r) => {
    assert.equal(r.status, 3, `${form}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /refused: this process runs as root/, form);
    assert.ok(r.stderr.includes(elevatedSentence()), `${form}: ${r.stderr}`);
  });
});

test('C303 — as root, a plain doctor is refused with the one form that runs', (t) => {
  runForms(t, [['doctor']], (form, r) => {
    assert.equal(r.status, 3);
    assert.match(r.stderr, /doctor --quick/, r.stderr);
  });
});

test('C303 — as root the help of a writing command is still answered: it writes nothing', (t) => {
  runForms(t, [['bootstrap', '--help'], ['upgrade', '--help'], ['help']], (form, r) => {
    assert.equal(r.status, 0, `${form}: ${r.stderr}`);
    assert.match(r.stdout, /usage/, form);
  });
});
