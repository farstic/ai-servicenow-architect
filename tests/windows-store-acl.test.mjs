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
  const { createAclTools, parseSddl } = await import(href('packages/snowarch/dist/store/acl.js'));
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
  // Read back from the DACL itself, not only through the tolerance: exactly the two principals. SDDL writes SYSTEM as `SY`, and the account as
  // its SID — except the built-in Administrator (RID 500, which a hosted runner uses), which it writes as the alias `LA` (measured).
  const account = sid.endsWith('-500') ? 'LA' : sid;
  const save = join(base, 'dacl.txt');
  assert.equal(spawnSync('icacls', [storeFile, '/save', save], { encoding: 'utf8' }).status, 0);
  const trustees = parseSddl(readFileSync(save, 'utf16le').split(/\r?\n/).find((l) => l.startsWith('D:'))).map((a) => a.trustee);
  assert.deepEqual([...trustees].sort(), ['SY', account].sort(), `the store's DACL is not just the account and SYSTEM: ${trustees}`);
  assert.ok(!trustees.includes('BU') && !trustees.includes('AU'), 'Users or Authenticated Users are still on the store');

  // The account can still read it, change it, and the server can write it again.
  assert.equal(JSON.parse(readFileSync(storeFile, 'utf8')).version, 1);
  appendFileSync(storeFile, '\n');
  // A routine save replaces the file with one made in its folder; the file was private, so the replacement is made private again.
  const again = saveStore(storeFile, store());
  assert.deepEqual(again.acl, { state: 'private' });
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
  const routine = saveStore(file, store());   // the file was private: the replacement is private again, and the folder is not the write's to change
  assert.deepEqual(routine.acl, { state: 'private' });
  assert.deepEqual(tools.read(file).exposure.who, [], 'a routine write reopened the file it replaced');
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

test('ARC-09-C272 — the loop, for real: SV-02 finds an open .local and names who, the doctor\'s repair locks it, and SV-02 is then ok', { skip }, async (t) => {
  const { base, why } = sandbox();
  if (!base) { t.skip(why); return; }
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const { svStore } = await import(href('packages/snowarch/dist/doctor/checks.js'));
  const { stubProbesFor } = await import(href('packages/snowarch/dist/doctor/types.js'));
  const { saveStore } = await import(href('packages/snowarch/dist/store/index.js'));
  const { applyPlan } = await import(href('tools/snowarch/lib/doctor/fix.mjs'));
  const checkout = join(base, 'checkout');
  const dir = join(checkout, '.local');
  mkdirSync(dir, { recursive: true });     // the user's own folder, made before the bootstrap: open
  const file = join(dir, 'instances.json');
  saveStore(file, store());                // a routine create: the file is locked, the folder is not the save's to change
  const before = { project: process.env.CLAUDE_PROJECT_DIR, store: process.env.SNOW_STORE };
  process.env.CLAUDE_PROJECT_DIR = checkout;
  delete process.env.SNOW_STORE;
  t.after(() => {
    for (const [key, value] of [['CLAUDE_PROJECT_DIR', before.project], ['SNOW_STORE', before.store]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const ctx = { noNetwork: true, cwd: checkout, platform: 'win32', env: process.env, probes: stubProbesFor({ platform: 'win32', env: process.env }),
    fluent: () => ({ installed: false }) };

  const found = await svStore.run(ctx);
  assert.equal(found.status, 'fail', found.detail);
  assert.match(found.detail, /its folder: .*BUILTIN\\Users.*can read it/s);
  assert.equal(found.fixable, true);
  assert.deepEqual(found.data, { fix: { kind: 'store-acl', path: '.local' } });
  assert.ok(found.remedy.endsWith(' doctor --fix'), found.remedy);

  const action = { id: 'F9', check: 'SV-02', kind: 'store-acl', title: 't', target: '.local/', detail: 'd', fix: found.data.fix };
  const done = await applyPlan({ actions: [action] }, { root: checkout, platform: 'win32' });
  assert.equal(done[0].result, 'applied', done[0].detail);

  const after = await svStore.run(ctx);
  assert.equal(after.status, 'ok', after.detail);
  assert.match(after.detail, /readable only by you/);
});

/**
 * The environment for a Windows PowerShell 5.1 child. A job's default shell on a hosted Windows runner is pwsh (PowerShell 7), which puts its
 * own module folders in PSModulePath; powershell.exe inherits that, finds PowerShell 7's Microsoft.PowerShell.Security before its own and
 * cannot load it: "The 'ConvertTo-SecureString' command was found in the module 'Microsoft.PowerShell.Security', but the module could not be
 * loaded" (measured on windows-latest, 2026-11-12). Without the variable, 5.1 works out its own.
 */
function windowsPowerShellEnv() {
  // Any spelling: a copy of process.env is a plain object, and Windows variable names are not case-sensitive.
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'psmodulepath'));
}

test('ARC-09-C272 — the effect: another local account is denied the locked store and — the control — can read an open file', { skip: skip || (onCi ? false : 'runs on CI, where a throwaway account can be made') }, async (t) => {
  const { base, why } = sandbox();
  if (!base) { t.skip(why); return; }
  const out = `${base}-out`;
  mkdirSync(out);
  t.after(() => { spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Remove-LocalUser -Name aclprobe -ErrorAction SilentlyContinue'], { env: windowsPowerShellEnv() }); rmSync(base, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); });
  const { saveStore } = await import(href('packages/snowarch/dist/store/index.js'));
  const locked = join(base, 'locked', '.local', 'instances.json');
  saveStore(locked, store());
  const openDir = join(base, 'open');
  mkdirSync(openDir);
  const openFile = join(openDir, 'instances.json');
  writeFileSync(openFile, 'OPEN-SECRET');

  // TIMING lines say where the seconds go. The case first allowed 120 s and was cut at 126.5 s (release-dryrun (windows-latest), 2026-11-12) when it started
  // its children with Start-Process -Credential: the first logon of a new account that way builds its profile, 1,317 MB on the hosted image (ARC-09-C274).
  // The limit is 300 s still, as a margin.
  //
  // THE SECOND ACCOUNT'S PROCESSES ARE STARTED WITH System.Diagnostics.Process, NOT Start-Process -Credential (ARC-09-C274). On hosted runners that cmdlet
  // failed this case four times in about three hours (2026-11-12: develop's push run on node 20 and 22, #578 on node 24, develop's next push run in release-dryrun) with "Start-Process : Cannot
  // process request because the process (N) has exited", on its first launch, right after the account was made. The cmdlet creates the child with
  // CreateProcessWithLogonW and then looks it up by its id (PowerShell 7's Process.cs: Process.GetProcessById, then process.Handle; Windows PowerShell
  // 5.1's own code is closed and was not read), and .NET throws that message for a process that has already exited; `cmd.exe /c type` of a small file is
  // gone in milliseconds. Process.Start keeps the handle CreateProcessWithLogonW returned, so a child that is already gone is still waited for and its
  // exit code read; its output comes back on a pipe, read to the end before the wait. It builds no profile either: 20 runs left no account, no profile and
  // C: as free as before, where the old call left 1,317 MB a run, and a run takes about 1.3 s instead of about 17 s. docs/CONTRIBUTING.md has the numbers.
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$sw = [Diagnostics.Stopwatch]::StartNew()',
    `icacls '${out}' /grant '*S-1-1-0:(OI)(CI)F' | Out-Null`,
    '$pw = ConvertTo-SecureString $env:ACL_TEST_PW -AsPlainText -Force',
    "New-LocalUser -Name 'aclprobe' -Password $pw | Out-Null",
    "'TIMING|account|' + [math]::Round($sw.Elapsed.TotalSeconds, 1)",
    `foreach ($f in '${locked}', '${openFile}') {`,
    '  $psi = New-Object System.Diagnostics.ProcessStartInfo',
    "  $psi.FileName = 'cmd.exe'",
    '  $psi.Arguments = \'/c type "\' + $f + \'" 2>&1\'',
    "  $psi.UserName = 'aclprobe'",
    "  $psi.Domain = '.'",
    '  $psi.Password = $pw',
    '  $psi.UseShellExecute = $false',
    '  $psi.RedirectStandardOutput = $true',
    '  $psi.CreateNoWindow = $true',
    `  $psi.WorkingDirectory = '${out}'`,
    '  $p = [System.Diagnostics.Process]::Start($psi)',
    '  $text = $p.StandardOutput.ReadToEnd()',
    '  $p.WaitForExit()',
    '  "RESULT|$f|$($p.ExitCode)|" + ($text -replace "\\s+", " ").Trim()',
    "  'TIMING|read|' + [math]::Round($sw.Elapsed.TotalSeconds, 1)",
    '}',
  ].join('\n');
  // The throwaway account's password is assembled and handed over in the environment: no secret-shaped literal in the file or the command.
  const env = { ...windowsPowerShellEnv(), ACL_TEST_PW: ['Acl', 'Probe', '1!aA'].join('-') };
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 300_000, env });
  assert.equal(r.status, 0, `the second account could not be made or run (status ${r.status}, signal ${r.signal ?? 'none'}${r.error ? `, ${r.error.message}` : ''}): ${r.stdout}${r.stderr}`);
  const results = Object.fromEntries(r.stdout.split(/\r?\n/).filter((l) => l.startsWith('RESULT|'))
    .map((l) => { const [, f, code, text] = l.split('|'); return [f, { code, text }]; }));
  assert.equal(results[openFile]?.text, 'OPEN-SECRET', `the control failed: the second account could not read an open file: ${JSON.stringify(results)}`);
  assert.match(results[locked]?.text ?? '', /Access is denied/, `the locked store was readable by the second account: ${JSON.stringify(results)}`);
  assert.ok(existsSync(locked));
});
