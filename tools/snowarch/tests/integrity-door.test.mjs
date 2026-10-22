// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C141 — ONE DOOR for the integrity refusal (the architect's ruling Q6): the launcher and the package CLI refuse
 * through the one `refusesCommand` in the server build's `gate.js`, the licence asked first, so one refusal names one
 * reason. The launcher restores before any command (the owner's ruling), and refuses outside the repair set only when
 * the Architect's own files cannot be restored.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { refusesCommand } from '../../../packages/snowarch/dist/licence/gate.js';
import { integrityGate, refusalFor } from '../lib/cli.mjs';
import { manifestFromArchive, signManifest, writeManifestCache } from '../lib/licence/manifest.mjs';
import { keyPair, productKeys } from './helpers/licence.mjs';
import { tempDir } from './helpers/temp.mjs';
import { initFixtureRepo } from './helpers/fixture-git.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const signer = keyPair();
const KEYS = productKeys(signer, keyPair());
const OK = { state: 'ok' };
const REFUSED_INTEGRITY = { state: 'refused', line: 'Integrity: cannot restore — no signed manifest for v9.1.0 — Run <cli> licence check --refresh to fetch it; if it says none is published, reinstall from a signed release tag.' };

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
const put = (root, rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };

function release(t, { cache = true } = {}) {
  const root = tempDir('snowarch-c141-door-', t);
  for (const [rel, text] of Object.entries({
    'package.json': '{ "name": "f", "version": "9.1.0" }\n', 'engine.config.json': '{}\n', 'CLAUDE.md': '# signed\n',
    'tools/snowarch/bin/snowarch.mjs': 'export {};\n', '.claude/skills/s/SKILL.md': 'signed\n',
  })) put(root, rel, text);
  cpSync(join(REPO, '.gitattributes'), join(root, '.gitattributes'));
  initFixtureRepo((args) => git(root, args), root, ['-q', '-b', 'main']);
  git(root, ['-c', 'user.email=f@example.com', '-c', 'user.name=f', 'add', '-A']);
  git(root, ['-c', 'user.email=f@example.com', '-c', 'user.name=f', 'commit', '-qm', 'r']);
  git(root, ['-c', 'user.email=f@example.com', '-c', 'user.name=f', 'tag', '-a', 'v9.1.0', '-m', 'v9.1.0']);
  if (cache) {
    writeManifestCache(root, { tag: 'v9.1.0', doc: signManifest(manifestFromArchive(root, 'v9.1.0'), signer.privateKey),
      checkedAt: '2026-10-14T12:00:00.000Z', source: 'fixture' });
  }
  return root;
}

const capture = () => { const lines = []; return { stream: { write: (s) => lines.push(s) }, text: () => lines.join('') }; };

test('C141 — one door: a tree that cannot be restored refuses every command but the repair set, as a refused licence does', () => {
  for (const name of ['docs', 'instance', 'store', 'mode']) {
    assert.equal(refusesCommand(name, OK, [], REFUSED_INTEGRITY), true, `${name} ran on a tree that cannot be restored`);
  }
  for (const [name, positional] of [['doctor', []], ['status', []], ['version', []], ['licence', []], ['upgrade', []],
    ['bootstrap', []], ['mode', ['design']]]) {
    assert.equal(refusesCommand(name, OK, positional, REFUSED_INTEGRITY), false, `${name} is how the tree is repaired`);
  }
  // A verified, restored or exempt tree refuses nothing; a refused licence still refuses on its own.
  for (const state of ['verified', 'restored', 'exempt']) assert.equal(refusesCommand('docs', OK, [], { state }), false);
  assert.equal(refusesCommand('docs', { state: 'missing' }, [], { state: 'verified' }), true);
});

test('C141 — the licence is asked first: with both refused, the refusal names the licence alone', () => {
  const both = refusalFor('docs', { state: 'missing', signatureValid: false }, REFUSED_INTEGRITY, '<cli>');
  assert.match(both[0], /^snowarch docs: licence missing — this command does not run without a valid licence$/);
  assert.equal(both.some((l) => l.includes('Integrity')), false);
  const integrity = refusalFor('docs', OK, REFUSED_INTEGRITY, '<cli>');
  assert.deepEqual(integrity, [
    'snowarch docs: this command does not run while the AI Architect\'s own files cannot be restored',
    REFUSED_INTEGRITY.line,
  ]);
});

test('C141 — before any command the launcher puts a changed file back and says so, once, on stderr', (t) => {
  // The audit line goes to a file of the case's own: beside a store, it could be a global one on this machine.
  const was = process.env.SNOW_AUDIT_FILE;
  process.env.SNOW_AUDIT_FILE = join(tempDir('snowarch-c141-door-audit-', t), 'audit.jsonl');
  t.after(() => { if (was === undefined) delete process.env.SNOW_AUDIT_FILE; else process.env.SNOW_AUDIT_FILE = was; });
  const root = release(t);
  put(root, '.claude/skills/s/SKILL.md', 'my edit\n');
  const err = capture();
  const r = integrityGate({ root, err: err.stream, cli: '<cli>', keys: KEYS });
  assert.equal(r.state, 'restored', err.text());
  assert.equal(readFileSync(join(root, '.claude/skills/s/SKILL.md'), 'utf8'), 'signed\n');
  assert.match(err.text(), /^Integrity: restored — The AI Architect's own files are not yours to change under this licence: 1 file restored from v9\.1\.0, 0 moved to \.local\/integrity-removed\/\d{8}T\d{6}Z\/ \(\.claude\/skills\/s\/SKILL\.md\)\. Your own material belongs under clients\/<name>\/\.\n$/);
  // A verified tree prints nothing.
  const quiet = capture();
  assert.equal(integrityGate({ root, err: quiet.stream, cli: '<cli>', keys: KEYS }).state, 'verified');
  assert.equal(quiet.text(), '');
});

test('C141 — a tree that cannot be restored is returned refused, and the launcher prints nothing until it refuses', (t) => {
  const root = release(t, { cache: false });
  const err = capture();
  const r = integrityGate({ root, err: err.stream, cli: '<cli>', keys: KEYS });
  assert.equal(r.state, 'refused');
  assert.equal(err.text(), '');
});
