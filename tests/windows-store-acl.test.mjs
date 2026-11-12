// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C272 — on Windows, for real: a folder directly under `C:\` is open, and what the engine and the server make there is not.
 *
 * Every other case for this row runs on any OS with the lock tools as a seam. This one runs icacls. It is the evidence the row needs
 * and the others cannot give: that the command the product builds does what it says on the file system it is for.
 *
 *   BEFORE  a folder made under C:\ by plain `mkdir` carries BUILTIN\Users and Authenticated Users (the CONTROL: if the image ever
 *           stopped doing that, the cases below would pass for no reason, so this one fails first and says so);
 *   AFTER   what `makePrivateDir` and `saveStore` make there carries the account and SYSTEM, read back from the DACL, and the
 *           account can still read and write it;
 *   AFTER   a folder that already existed (the guide's order: `mkdir .local`, copy the licence in, then the bootstrap) is locked
 *           when a credential is stored, its existing children with it, and the result says what it was open to;
 *   NOT     a routine write into an open folder changes nothing, and the doctor's repair locks it;
 *   EFFECT  on a CI runner, a second local account is denied the locked file and — the control — reads the open one.
 *
 * It needs to create a folder in C:\ and, for the last case, to be an administrator on a throwaway machine; where it cannot it says
 * so and skips, except on CI, where it must run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const onWindows = process.platform === 'win32';
const onCi = process.env.GITHUB_ACTIONS === 'true';
const skip = onWindows ? false : 'Windows only: the lock is proved on the file system it is for';

const href = (rel) => pathToFileURL(join(root, rel)).href;

/** A store the server accepts, with a password in it. */
const store = () => ({
  version: 1, defaultInstance: 'pdi',
  instances: { pdi: {
    url: 'https://dev12345.service-now.com', environment: 'pdi',
    auth: { method: 'basic', username: 'admin', password: ['pw', 'for', 'the', 'test'].join('-') }, preset: 'pdi-developer',
    flags: { WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false',
      ATF_ENABLED: 'false', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false' },
    toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
  } },
});

const sandbox = () => {
  const base = `C:\\snowarch-acl-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  try { mkdirSync(base); } catch (e) {
    if (onCi) throw e;
    return { base: null, why: `cannot create ${base}: ${e.code}` };
  }
  return { base };
};

test('ARC-09-C272 — a folder under C:\\ is open (the control), and what the product makes there is private', { skip }, async (t) => {
  const { base, why } = sandbox();
  if (!base) { t.skip(why); return; }
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const { createAclTools, parseSddl, SYSTEM_SID } = await import(href('packages/snowarch/dist/store/acl.js'));
  const { saveStore } = await import(href('packages/snowarch/dist/store/index.js'));
  const { makePrivateDir } = await import(href('tools/snowarch/lib/private-dir.mjs'));
  const tools = createAclTools();
  const sid = tools.userSid();
  assert.match(sid ?? '', /^S-1-/, 'whoami gave no SID');
  const readers = (path) => {
    const r = tools.read(path);
    assert.equal(r.ok, true, `${path}: ${r.reason}`);
    return r.exposure;
  };

  // CONTROL — plain mkdir under C:\ is what the owner's folders were.
  const plain = join(base, 'plain');
  mkdirSync(plain);
  const open = readers(plain);
  assert.ok(open.who.includes('BUILTIN\\Users'), `the control folder is not open to Users: ${JSON.stringify(open)}`);
  assert.ok(open.who.includes('NT AUTHORITY\\Authenticated Users'), `the control folder is not open to Authenticated Users: ${JSON.stringify(open)}`);

  // The engine's way of making a private folder.
  const engineDir = join(base, 'engine', '.local');
  const made = makePrivateDir(engineDir);
  assert.deepEqual(made, { created: true, lock: { ok: true } });
  assert.deepEqual(readers(engineDir).who, []);

  // The server's way of making the store: the folder, and the file inside it, carry the account and SYSTEM and nothing else.
  const storeDir = join(base, 'server', '.local');
  const storeFile = join(storeDir, 'instances.json');
  const written = saveStore(storeFile, store());
  assert.deepEqual(written.acl, { state: 'created' });
  for (const p of [storeDir, storeFile]) assert.deepEqual(readers(p).who, [], p);
  // Read back from the DACL itself, not only through the tolerance: exactly the two principals, as SIDs.
  const save = join(base, 'dacl.txt');
  assert.equal(spawnSync('icacls', [storeFile, '/save', save], { encoding: 'utf8' }).status, 0);
  const trustees = parseSddl(readFileSync(save, 'utf16le').split(/\r?\n/).find((l) => l.startsWith('D:'))).map((a) => a.trustee);
  assert.deepEqual([...trustees].sort(), ['SY', sid].sort(), `the store's DACL is not just the account and SYSTEM: ${trustees}`);
  assert.ok(trustees.includes('SY') && !trustees.includes('BU') && !trustees.includes('AU') && !trustees.includes(SYSTEM_SID.toLowerCase()));

  // The account can still read it, change it, and the server can write it again.
  assert.equal(JSON.parse(readFileSync(storeFile, 'utf8')).version, 1);
  appendFileSync(storeFile, '\n');
  const again = saveStore(storeFile, store());
  assert.deepEqual(again.acl, { state: 'untouched' });
  assert.equal(JSON.parse(readFileSync(storeFile, 'utf8')).defaultInstance, 'pdi');
});

test('ARC-09-C272 — the guide\'s order: an existing .local with a licence in it is locked when the credential is stored, and says what it was open to', { skip }, async (t) => {
  const { base, why } = sandbox();
  if (!base) { t.skip(why); return; }
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const { createAclTools } = await import(href('packages/snowarch/dist/store/acl.js'));
  const { saveStore } = await import(href('packages/snowarch/dist/store/index.js'));
  const tools = createAclTools();
  const dir = join(base, 'checkout', '.local');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'licence.json'), '{"licence":"a"}');
  assert.ok(tools.read(dir).exposure.who.length > 0, 'control: the folder the user made is open');

  // A routine write into it — a probe result, a default — changes nothing about who can read it.
  const file = join(dir, 'instances.json');
  saveStore(file, store());   // creates the file: locked as a file (the folder existed)
  const routine = saveStore(file, store());
  assert.deepEqual(routine.acl, { state: 'untouched' });
  assert.ok(tools.read(dir).exposure.who.length > 0, 'a routine write changed the folder\'s permissions');

  // Storing a credential into it does, and says so.
  const stored = saveStore(file, store(), { lock: 'always' });
  assert.equal(stored.acl.state, 'locked');
  assert.ok(stored.acl.was.who.includes('BUILTIN\\Users'), JSON.stringify(stored.acl));
  assert.deepEqual(tools.read(dir).exposure.who, []);
  assert.deepEqual(tools.read(join(dir, 'licence.json')).exposure.who, [], 'the existing licence did not follow the folder');
  assert.equal(readFileSync(join(dir, 'licence.json'), 'utf8'), '{"licence":"a"}', 'the account lost the file it had');
  // And a second time it finds nothing to change.
  assert.deepEqual(saveStore(file, store(), { lock: 'always' }).acl, { state: 'private' });
});

test('ARC-09-C272 — the doctor\'s repair (F9) locks an open .local, children included', { skip }, async (t) => {
  const { base, why } = sandbox();
  if (!base) { t.skip(why); return; }
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const { createAclTools } = await import(href('packages/snowarch/dist/store/acl.js'));
  const { applyPlan } = await import(href('tools/snowarch/lib/doctor/fix.mjs'));
  const tools = createAclTools();
  const checkout = join(base, 'checkout');
  const dir = join(checkout, '.local');
  mkdirSync(join(dir, 'logs'), { recursive: true });
  writeFileSync(join(dir, 'instances.json'), '{}');
  assert.ok(tools.read(dir).exposure.who.length > 0, 'control: the folder is open');
  const action = { id: 'F9', check: 'SV-02', kind: 'store-acl', title: 't', target: '.local/', detail: 'd', fix: { path: '.local' } };
  const done = await applyPlan({ actions: [action] }, { root: checkout, platform: 'win32' });
  assert.equal(done[0].result, 'applied', done[0].detail);
  for (const p of [dir, join(dir, 'logs'), join(dir, 'instances.json')]) assert.deepEqual(tools.read(p).exposure.who, [], p);
});

test('ARC-09-C272 — the effect: another local account is denied the locked store and — the control — can read an open file', { skip: skip || (onCi ? false : 'runs on CI, where a throwaway account can be made') }, async (t) => {
  const { base, why } = sandbox();
  if (!base) { t.skip(why); return; }
  const out = `${base}-out`;
  mkdirSync(out);
  t.after(() => { spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Remove-LocalUser -Name aclprobe -ErrorAction SilentlyContinue']); rmSync(base, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); });
  const { saveStore } = await import(href('packages/snowarch/dist/store/index.js'));
  const locked = join(base, 'locked', '.local', 'instances.json');
  saveStore(locked, store());
  const openDir = join(base, 'open');
  mkdirSync(openDir);
  const openFile = join(openDir, 'instances.json');
  writeFileSync(openFile, 'OPEN-SECRET');

  const script = [
    "$ErrorActionPreference = 'Stop'",
    `icacls '${out}' /grant '*S-1-1-0:(OI)(CI)F' | Out-Null`,
    '$pw = ConvertTo-SecureString $env:ACL_TEST_PW -AsPlainText -Force',
    "New-LocalUser -Name 'aclprobe' -Password $pw | Out-Null",
    "$cred = New-Object System.Management.Automation.PSCredential('.\\aclprobe', $pw)",
    `foreach ($f in '${locked}', '${openFile}') {`,
    '  $n = [IO.Path]::GetRandomFileName()',
    `  $o = Join-Path '${out}' ($n + '.txt')`,
    '  $a = \'/c type "\' + $f + \'" > "\' + $o + \'" 2>&1\'',
    `  $p = Start-Process -FilePath cmd.exe -ArgumentList $a -Credential $cred -WorkingDirectory '${out}' -Wait -PassThru -WindowStyle Hidden`,
    '  "RESULT|$f|$($p.ExitCode)|" + ((Get-Content -LiteralPath $o -Raw) -replace "\\s+", " ").Trim()',
    '}',
  ].join('\n');
  // The throwaway account's password is assembled and handed over in the environment: no secret-shaped literal in the file or the command.
  const env = { ...process.env, ACL_TEST_PW: ['Acl', 'Probe', '1!aA'].join('-') };
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 120_000, env });
  assert.equal(r.status, 0, `the second account could not be made or run: ${r.stdout}${r.stderr}`);
  const results = Object.fromEntries(r.stdout.split(/\r?\n/).filter((l) => l.startsWith('RESULT|'))
    .map((l) => { const [, f, code, text] = l.split('|'); return [f, { code, text }]; }));
  assert.equal(results[openFile]?.text, 'OPEN-SECRET', `the control failed: the second account could not read an open file: ${JSON.stringify(results)}`);
  assert.match(results[locked]?.text ?? '', /Access is denied/, `the locked store was readable by the second account: ${JSON.stringify(results)}`);
  assert.ok(existsSync(locked));
});
