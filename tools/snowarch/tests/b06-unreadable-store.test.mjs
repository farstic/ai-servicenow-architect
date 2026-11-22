// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C307 — B06 does not read a store it cannot parse as "no default instance", and does not save over one.
 *
 * `mode live` and the installer reach the instance wizard through B06. B06 asked `readDefaultSummary` whether the store names a default, and
 * that reader answers `null` for a file it cannot parse (it is a mirror: "an unreadable store is not this reader's failure"). So an unparseable
 * store read as "nothing to keep": a run with `--yes` or no terminal said NO_TERMINAL (which hides the cause), and an interactive one started
 * the wizard, whose save replaced the file. The `--instance-file` path was worse: it probed, then saved a new store over whatever was there.
 *
 * Now, in live mode and before `--instance-file`: a store that cannot be read as JSON fails the step with the store's own code and a remedy,
 * before the wizard is started, before an instance is probed, and with the file untouched. The check is stdlib only, because B06 also runs
 * in a design-only checkout that has no `node_modules`; design-only mode never writes a store here and is not changed.
 * The `--instance-file` path also asks the server's own store module (it is live-only and already imports it) for every other way a store
 * can fail to load: a mode that is too open, a shape that is wrong, a schema from the future or the past.
 *
 * Nothing the file held reaches the step's answer: the answer goes to `.local/logs`, and the first characters of a credential file are not
 * for a log. Every secret here is assembled, never spelled.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NO_TERMINAL, fromInstanceFile, run as runB06 } from '../lib/steps/B06.mjs';
import { spellings } from '../lib/text.mjs';
import { makeCheckout } from './helpers/workspace.mjs';
import { tempDir } from './helpers/temp.mjs';

const isWindows = process.platform === 'win32';
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const CLI = spellings().cli;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const contract = JSON.parse(readFileSync(join(repoRoot, 'packages/snowarch/dist/contract.json'), 'utf8'));

const SECRET_LIKE = ['sk', 'live', 'q7Zr', '4491xv'].join('-');
const STORED_PASSWORD = ['pw', 'stored', '8821'].join('-');
const FILE_PASSWORD = ['pw', 'file', '5530'].join('-');
const REL = join('.local', 'instances.json');

const ctxFor = (root, over = {}) => ({
  root, mode: 'live', instanceFile: null, env: {}, licence: { state: 'ok' },
  node: { present: true, version: '22.11.0', major: 22 },
  state: { hooksDisabledByBootstrap: false, registration: 'project' },
  ...over,
});

const validStore = (version = 1) => ({
  version,
  defaultInstance: 'keep',
  instances: {
    keep: {
      url: 'https://dev55555.service-now.com', environment: 'pdi', preset: 'read-only',
      auth: { method: 'basic', username: 'kept.user', password: STORED_PASSWORD },
      flags: { WRITE_ENABLED: 'false', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false', ATF_ENABLED: 'false', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false' },
      toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    },
  },
});

/** The stores B06 meets that cannot be read as JSON, and the ones the server's loader refuses for another reason. */
const PLANTS = [
  { name: 'unparseable', code: 'STORE_UNREADABLE', json: false, mode: 0o600, text: `${SECRET_LIKE} { "version": 1, "instances": { "keep": { "auth": { "password": "` },
  { name: 'unreadable (mode 000)', code: 'STORE_UNREADABLE', json: false, mode: 0o000, text: `${JSON.stringify(validStore())}\n`, posixOnly: true, notRoot: true },
  { name: 'too open (mode 0644)', code: 'STORE_PERMISSIONS_TOO_OPEN', json: true, mode: 0o644, text: `${JSON.stringify(validStore())}\n`, posixOnly: true },
  { name: 'newer schema', code: 'STORE_SCHEMA_NEWER', json: true, mode: 0o600, text: `${JSON.stringify(validStore(99))}\n` },
  { name: 'older schema', code: 'STORE_SCHEMA_OUTDATED', json: true, mode: 0o600, text: `${JSON.stringify(validStore(0))}\n` },
  { name: 'wrong shape', code: 'STORE_SCHEMA_INVALID', json: true, mode: 0o600, text: `${JSON.stringify({ version: 1, instances: [] })}\n` },
];
const canPlant = (p) => !(p.posixOnly && isWindows) && !(p.notRoot && isRoot);

function put(root, p) {
  mkdirSync(join(root, '.local'), { recursive: true });
  const file = join(root, REL);
  writeFileSync(file, p.text, { mode: 0o600 });
  if (!isWindows) chmodSync(file, p.mode);
  return { file, bytes: Buffer.from(p.text), mode: isWindows ? null : p.mode, folder: readdirSync(join(root, '.local')).sort() };
}

/** Bytes (through a temporary 0600 when the plant is mode 000), mode and folder: what a refusal must leave exactly as it was. */
function look(root) {
  const file = join(root, REL);
  const mode = isWindows ? null : statSync(file).mode & 0o777;
  if (mode === 0) { chmodSync(file, 0o600); }
  const bytes = readFileSync(file);
  if (mode === 0) { chmodSync(file, 0o000); }
  return { file, bytes, mode, folder: readdirSync(join(root, '.local')).sort() };
}
const unchanged = (root, was) => { const now = look(root); assert.deepEqual({ ...now, file: undefined }, { ...was, file: undefined }); };
const release = (root) => { const file = join(root, REL); if (!isWindows && existsSync(file)) chmodSync(file, 0o600); };

/** A spawn that fails the test if anything reaches it: the wizard must not be started over a store it cannot read. */
const refuseToSpawn = () => { throw new Error('the wizard was started over a store that cannot be read'); };

const WORDS = {
  detailWizard: `STORE_UNREADABLE — ${REL} cannot be read as JSON, so the instance wizard was not started and nothing was changed`,
  detailFile: `STORE_UNREADABLE — ${REL} cannot be read as JSON, so the instance file was not used and nothing was changed`,
  remedy: `restore a backup (${CLI} store backups lists them) and run ${CLI} mode live again, or ask for help; moving the file aside starts an empty store`,
};

/** An instance file outside any checkout, 0600, with a password of its own. */
function instanceFile(t) {
  const dir = tempDir('snowarch-c307-if-', t);
  const path = join(dir, 'pdi.json');
  writeFileSync(path, `${JSON.stringify({ version: 1, instances: { pdi: { url: 'https://dev123456.service-now.com', auth: { method: 'basic', username: 'admin', password: FILE_PASSWORD } } } }, null, 2)}\n`);
  if (!isWindows) chmodSync(path, 0o600);
  return path;
}

/** Every string a step answer carries, and every line the step printed: what the bootstrap shows and writes to `.local/logs`. */
const said = (result, lines) => `${JSON.stringify(result)}\n${lines.join('\n')}`;

// ── the wizard path: `mode live` and the installer ───────────────────────────────────────────────────────────────────────────────────────────
for (const p of PLANTS.filter((x) => !x.json)) {
  const skip = !canPlant(p) ? (isWindows ? 'modes are ACL-inherited on Windows' : 'root reads a mode 000 file') : false;

  test(`${p.name}: a live run with a terminal fails the step with the store's code and a remedy, and the wizard is not started`, { skip }, async (t) => {
    const root = makeCheckout({}, t);
    const was = put(root, p);
    try {
      const result = await runB06(ctxFor(root, { isTTY: true, spawn: refuseToSpawn }));
      assert.equal(result.status, 'fail');
      assert.equal(result.detail, WORDS.detailWizard);
      assert.equal(result.remedy, WORDS.remedy);
      unchanged(root, was);
    } finally { release(root); }
  });

  test(`${p.name}: --yes and no terminal say the same, not NO_TERMINAL, which would hide the cause`, { skip }, async (t) => {
    const root = makeCheckout({}, t);
    const was = put(root, p);
    try {
      for (const over of [{ yes: true, isTTY: true }, { yes: true, isTTY: false }, { isTTY: false }]) {
        const result = await runB06(ctxFor(root, { ...over, spawn: refuseToSpawn }));
        assert.equal(result.status, 'fail', JSON.stringify(over));
        assert.notEqual(result.detail, NO_TERMINAL, JSON.stringify(over));
        assert.equal(result.detail, WORDS.detailWizard);
        assert.equal(result.remedy, WORDS.remedy);
      }
      unchanged(root, was);
    } finally { release(root); }
  });

  test(`${p.name}: the answer and the lines carry nothing the file held (what is logged is what is shown)`, { skip }, async (t) => {
    const root = makeCheckout({}, t);
    put(root, p);
    try {
      const lines = [];
      const result = await runB06(ctxFor(root, { isTTY: true, spawn: refuseToSpawn, line: (l) => lines.push(l) }));
      const out = said(result, lines);
      for (const piece of [SECRET_LIKE, SECRET_LIKE.slice(0, 6), 'q7Zr', STORED_PASSWORD, 'Unexpected', 'position ']) assert.ok(!out.includes(piece), `${piece} is in: ${out}`);
      assert.ok(!out.includes(root), 'the temp root, an absolute path, is in the answer');
      // and whatever the run left under .local/logs (nothing: B06 writes no log of its own; the runner logs this answer)
      const logs = join(root, '.local', 'logs');
      if (existsSync(logs)) for (const f of readdirSync(logs)) assert.ok(!readFileSync(join(logs, f), 'utf8').includes(SECRET_LIKE), f);
    } finally { release(root); }
  });

  test(`${p.name}: --instance-file fails the step before the instance is probed, and the store is untouched`, { skip }, async (t) => {
    const root = makeCheckout({}, t);
    const was = put(root, p);
    const file = instanceFile(t);
    let probed = 0;
    try {
      const result = await runB06(ctxFor(root, { instanceFile: file, contract, spawn: refuseToSpawn, probeAuth: async () => { probed += 1; return { ok: true }; } }));
      assert.equal(result.status, 'fail');
      assert.equal(result.detail, WORDS.detailFile);
      assert.equal(result.remedy, WORDS.remedy);
      assert.equal(probed, 0, 'the instance was probed before the store was found unreadable');
      unchanged(root, was);
      assert.ok(!said(result, []).includes(FILE_PASSWORD));
    } finally { release(root); }
  });
}

// ── the instance file asks the server's loader for every other way a store fails to load ───────────────────────────────────────────────────────
for (const p of PLANTS) {
  const skip = !canPlant(p) ? (isWindows ? 'modes are ACL-inherited on Windows' : 'root reads a mode 000 file') : false;

  test(`fromInstanceFile over ${p.name}: refuses with ${p.code} before probing, and the store is byte-identical`, { skip }, async (t) => {
    const root = makeCheckout({}, t);
    const was = put(root, p);
    const file = instanceFile(t);
    let probed = 0;
    try {
      const result = await fromInstanceFile({ root, instanceFile: file, contract, line: () => {}, probeAuth: async () => { probed += 1; return { ok: true }; } });
      assert.equal(result.status, 'fail');
      assert.ok(result.detail.startsWith(`${p.code} — `), result.detail);
      assert.ok(typeof result.remedy === 'string' && result.remedy.length > 0, 'a failure with no remedy prints "none recorded"');
      assert.equal(probed, 0, 'the instance was probed before the store was found unable to load');
      const out = said(result, []);
      assert.ok(!out.includes(SECRET_LIKE) && !out.includes(STORED_PASSWORD) && !out.includes(FILE_PASSWORD));
      assert.ok(!out.includes(root), 'an absolute path, the temp root, is in the answer: it goes to .local/logs');
      unchanged(root, was);
    } finally { release(root); }
  });
}

// ── what did not change ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('control: a live run with a store that loads and names a default still keeps it, and starts nothing', async (t) => {
  const root = makeCheckout({}, t);
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, REL), `${JSON.stringify(validStore())}\n`, { mode: 0o600 });
  const result = await runB06(ctxFor(root, { isTTY: true, spawn: refuseToSpawn }));
  assert.equal(result.status, 'ok');
  assert.equal(result.data.kept, true);
});

test('control: a live run with NO store is not a refusal of the store: a run with no terminal still says NO_TERMINAL, and one with a terminal goes on to the wizard\'s own checks', async (t) => {
  const root = makeCheckout({}, t);
  assert.equal(existsSync(join(root, REL)), false);
  const noTerminal = await runB06(ctxFor(root, { yes: true, isTTY: false, spawn: refuseToSpawn }));
  assert.equal(noTerminal.status, 'fail');
  assert.equal(noTerminal.detail, NO_TERMINAL);
  // With a terminal the step goes on to probe the wizard, which this fixture has not built: a failure of THAT, never of a store that is not there.
  const probed = await runB06(ctxFor(root, { isTTY: true, spawn: () => ({ status: 0, stdout: '', stderr: '' }) }));
  assert.ok(!String(probed.detail).startsWith('STORE_'), probed.detail);
  assert.equal(existsSync(join(root, REL)), false, 'a step that found no store made one');
});

test('control: --instance-file with NO store creates one, as it always did', async (t) => {
  const root = makeCheckout({}, t);
  const file = instanceFile(t);
  const result = await fromInstanceFile({ root, instanceFile: file, contract, line: () => {}, probeAuth: async () => ({ ok: true }) });
  assert.equal(result.status, 'ok', result.detail);
  const saved = JSON.parse(readFileSync(join(root, REL), 'utf8'));
  assert.deepEqual(Object.keys(saved.instances), ['pdi']);
});

test('control: in design-only mode a store that cannot be read is neither written nor asked about: the step answers as it did, and starts nothing', async (t) => {
  const root = makeCheckout({}, t);
  const was = put(root, PLANTS[0]);
  const result = await runB06(ctxFor(root, { mode: 'design-only', spawn: refuseToSpawn }));
  // design-only never writes a store in this step, so it is not asked (and a checkout with no node_modules could not ask: the question is the package's)
  assert.deepEqual([result.status, result.detail], ['ok', 'store present and current; no wizard in design-only mode']);
  unchanged(root, was);
});
