import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync }
  from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The launcher prints the same sentences the Node path does — and it runs on machines with no Node
 * to check it, which is exactly where a drifted copy would go unnoticed for a release. So every
 * embedded string is compared against the file it was generated from, and the recipe is asserted to
 * be SOURCED rather than copied.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { BEGIN, END } = await import(
  pathToFileURL(join(root, 'scripts/gen-launcher-text.mjs')).href);
const launcher = readFileSync(join(root, 'bootstrap.sh'), 'utf8');
const ps1Raw = readFileSync(join(root, 'bootstrap.ps1'), 'utf8');
// The BOM is a byte of the file, not of the text (see the BOM test below for why it is
// there). Stripped once, here, so no other assertion has to know about it.
const ps1 = ps1Raw.replace(/^\uFEFF/, '');
const remedies = JSON.parse(readFileSync(join(root, 'tools/snowarch/lib/remedies.json'), 'utf8'));
const text = JSON.parse(readFileSync(join(root, 'tools/snowarch/lib/text.json'), 'utf8'));
const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));

/** The value of a single-quoted shell assignment in the generated region. */
function shellVar(name) {
  const m = new RegExp(`^${name}='((?:[^']|'\\\\'')*)'$`, 'm').exec(launcher);
  assert.ok(m, `${name} is not assigned in bootstrap.sh`);
  return m[1].replace(/'\\''/g, "'");
}

/** The same, for PowerShell: `$Name = '…'`, where an embedded quote is doubled. */
function psVar(name) {
  const m = new RegExp(`^\\$${name} = '((?:[^']|'')*)'\\r?$`, 'm').exec(ps1);
  assert.ok(m, `$${name} is not assigned in bootstrap.ps1`);
  // CRLF → LF before comparing. The FILE is CRLF because `.gitattributes` says so, and a
  // multi-line sentence inside it therefore carries CRLF too — that is the file's line endings,
  // not a different sentence. What is compared is the text.
  return m[1].replace(/''/g, "'").replace(/\r\n/g, '\n');
}

test('every embedded sentence equals the file it was generated from', async () => {
  const sentences = await import(
    pathToFileURL(join(root, 'tools/snowarch/lib/net-sentences.mjs')).href);

  assert.equal(shellVar('SERVER_KEY'), config.mcp.serverKey);
  assert.equal(shellVar('MSG_NODE_DARWIN'), remedies.node.darwin);
  assert.equal(shellVar('MSG_NODE_LINUX'), remedies.node.linux);
  assert.equal(shellVar('MSG_GIT_DARWIN'), remedies.git.darwin);
  assert.equal(shellVar('MSG_GIT_LINUX'), remedies.git.linux);
  assert.equal(shellVar('MSG_CLAUDE'), remedies.claudeCode.default);
  assert.equal(shellVar('MSG_NET'), remedies.network.default);
  // ARC-03's network vocabulary, not a second phrasing of it.
  assert.equal(shellVar('MSG_DNS'), sentences.dnsFailure('github.com'));
  assert.equal(shellVar('MSG_TLS'), sentences.tlsIntercepted({ tool: sentences.TOOL.git }));
  // ARC-06-S09's closing block, including the newlines inside it.
  assert.equal(shellVar('MSG_DOCTOR'), text.doctorUnavailable);
  assert.equal(shellVar('MSG_MODE'), text.modeDesign);
  assert.equal(shellVar('MSG_NEXT'), text.posix.nextDesign);
});

test('the generated region is current — the check the generator itself runs', () => {
  const r = spawnSync(process.execPath, [join(root, 'scripts/gen-launcher-text.mjs'), '--check'],
    { encoding: 'utf8', cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /region\(s\) current/);
});

test('the recipe is SOURCED, not copied — there is only one copy of those commands', () => {
  assert.match(launcher, /^\. "\$ROOT\/tools\/snowarch\/launcher\/docs-recipe\.sh"$/m);
  // The recipe's own distinctive line must appear in the recipe file and nowhere in the launcher.
  const copies = (launcher.match(/sparse-checkout set/g) ?? []).length;
  assert.equal(copies, 0, 'the launcher carries its own copy of the recipe');
  const recipe = readFileSync(join(root, 'tools/snowarch/launcher/docs-recipe.sh'), 'utf8');
  assert.match(recipe, /sparse-checkout set/);
  // ...and it calls the functions that file defines.
  for (const fn of ['docs_recipe_sparse', 'docs_recipe_full']) {
    assert.ok(launcher.includes(fn), `${fn} is never called`);
    assert.ok(recipe.includes(`${fn}()`), `${fn} is not defined by the recipe file`);
  }
});

test('bash 3.2 — none of the forbidden constructs appears', () => {
  // macOS ships bash 3.2 and always will; every one of these is 4.0+ or a non-POSIX tool, and
  // each would fail on the exact machine this launcher exists for.
  const forbidden = [
    [/\bdeclare -A\b/, 'associative arrays'],
    [/\bmapfile\b|\breadarray\b/, 'mapfile/readarray'],
    [/\$\{[A-Za-z_][A-Za-z0-9_]*,,\}/, '${var,,}'],
    [/\[\[.*=~.*\]\]/, '[[ =~ ]]'],
    [/(^|[^-\w])curl\b/, 'curl'],
    [/(^|[^-\w])jq\b/, 'jq'],
    [/(^|[^-\w])python[0-9]?\b/, 'python'],
    [/(^|[^-\w])timeout\b/, 'timeout'],
    [/\bsort -V\b/, 'sort -V (absent on BSD)'],
  ];
  const body = launcher.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  for (const [pattern, name] of forbidden) {
    assert.ok(!pattern.test(body), `bootstrap.sh uses ${name}`);
  }
  // Not vacuous: the same scan finds a planted one.
  assert.ok(forbidden[0][0].test('declare -A x'));
});

test('the file is executable, LF-only, and parses under bash', () => {
  assert.ok(!launcher.includes('\r'), 'CRLF line endings');
  assert.equal(launcher.at(-1), '\n');
  if (process.platform !== 'win32') {
    assert.ok((statSync(join(root, 'bootstrap.sh')).mode & 0o111) !== 0, 'the executable bit is not committed');
  }
  // `bash -n` is the parse; the run itself is CI's job, with Node stripped from PATH.
  assert.doesNotThrow(() => execFileSync('bash', ['-n', join(root, 'bootstrap.sh')], { stdio: 'pipe' }));
});

test('the launcher is short — it is a launcher, not a second implementation', () => {
  const lines = launcher.split('\n').filter((l, i, a) => !(i === a.length - 1 && l === '')).length;
  const generated = launcher.slice(launcher.indexOf('# text-begin'),
    launcher.indexOf('# text-end')).split('\n').length + 1;
  // The story's budget is 180 and assumed the recipe was EMBEDDED; the ruling moved it out to a
  // sourced file, and added a generated region in its place. Hand-written lines are what a reader
  // has to hold in their head, so that is what is measured — with the total reported beside it.
  // Raised 180 → 185 (total 200 → 206) when the S14 ruling made the launcher RECORD the B02
  // duration it already measured: three lines of comment saying that timing a step and caching one
  // are different claims, and one more line to keep the elapsed seconds in a variable rather than
  // calling `date` twice. Same trade as bootstrap.ps1's 250 → 265 — the budget exists to stop a
  // launcher becoming an application, and the measured total is printed either way.
  assert.ok(lines - generated <= 185,
    `${lines - generated} hand-written lines (${lines} total, ${generated} generated)`);
  assert.ok(lines <= 206, `${lines} total lines`);
});

test('the state and the cache bash writes are the ones Node reads', async () => {
  // The launcher writes S03's schema and S08's cache by heredoc. A Node test loads both through the
  // real readers rather than parsing them here: "it is valid JSON" is not the claim — "the module
  // that consumes it accepts it" is.
  const { loadState, assertStorable } = await import(
    pathToFileURL(join(root, 'tools/snowarch/lib/state.mjs')).href);
  const { COMPATIBILITY_KEYS } = await import(
    pathToFileURL(join(root, 'tools/snowarch/lib/doctor-cache.mjs')).href);

  const fixture = JSON.parse(readFileSync(join(root, 'tests/fixtures/bash-written-state.json'), 'utf8'));
  assert.equal(fixture.state.writer, 'bash');
  assert.equal(fixture.state.version, 1);
  assert.doesNotThrow(() => assertStorable(fixture.state), 'the guard rejects what bash wrote');
  for (const key of COMPATIBILITY_KEYS) {
    assert.ok(key in fixture.cache, `the bash cache is missing ${key}`);
  }
  assert.equal(fixture.cache.writer, 'bootstrap');
  assert.equal(typeof loadState, 'function');
});

test('the Windows launcher carries the same sentences, in PowerShell syntax', async () => {
  const sentences = await import(
    pathToFileURL(join(root, 'tools/snowarch/lib/net-sentences.mjs')).href);

  assert.equal(psVar('SERVER_KEY'), config.mcp.serverKey);
  assert.equal(psVar('MSG_NODE_WIN'), remedies.node.win32);
  assert.equal(psVar('MSG_GIT_WIN'), remedies.git.win32);
  assert.equal(psVar('MSG_CLAUDE'), remedies.claudeCode.default);
  assert.equal(psVar('MSG_NET'), remedies.network.default);
  assert.equal(psVar('MSG_DNS'), sentences.dnsFailure('github.com'));
  assert.equal(psVar('MSG_TLS'), sentences.tlsIntercepted({ tool: sentences.TOOL.git }));
  assert.equal(psVar('MSG_DOCTOR'), text.doctorUnavailable);
  assert.equal(psVar('MSG_MODE'), text.modeDesign);
  // The WINDOWS spellings, because this launcher runs where `.\bootstrap.cmd` is what works.
  assert.equal(psVar('MSG_NEXT'), text.windows.nextDesign);
  assert.match(psVar('MSG_NEXT'), /snowarch\.cmd mode live/);
  // ...and the two launchers agree on everything that is not a spelling.
  assert.equal(psVar('MSG_DOCTOR'), shellVar('MSG_DOCTOR'));
  assert.equal(psVar('MSG_DNS'), shellVar('MSG_DNS'));
});

test('the PowerShell recipe is dot-sourced, not copied', () => {
  assert.match(ps1, /^\. "\$Root\\tools\\snowarch\\launcher\\docs-recipe\.ps1"\r?$/m);
  assert.equal((ps1.match(/sparse-checkout set/g) ?? []).length, 0,
    'the Windows launcher carries its own copy of the recipe');
  const recipe = readFileSync(join(root, 'tools/snowarch/launcher/docs-recipe.ps1'), 'utf8');
  for (const fn of ['Invoke-DocsRecipeSparse', 'Invoke-DocsRecipeFull']) {
    assert.ok(ps1.includes(fn), `${fn} is never called`);
    assert.ok(recipe.includes(`function ${fn}`), `${fn} is not defined by the recipe file`);
  }
});

test('PowerShell 5.1 — none of the 7-only constructs appears', () => {
  // Every one of these is PowerShell 7 and would fail on the exact machine this file exists for:
  // Windows 10/11 ships 5.1 and nothing else is guaranteed.
  const body = ps1.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  const forbidden = [
    [/\?\?/, 'the ?? operator'],
    [/\)\s*\?\s*[^:\n]+:\s/, 'the ternary operator'],
    [/-AsHashtable/, '-AsHashtable'],
    [/\bpwsh\b/, 'pwsh (5.1 is what Windows has)'],
    [/\bConvertFrom-Json\b[^\n]*-Depth/, 'ConvertFrom-Json -Depth (7 only)'],
  ];
  for (const [pattern, name] of forbidden) {
    assert.ok(!pattern.test(body), `bootstrap.ps1 uses ${name}`);
  }
  // Not vacuous.
  assert.ok(forbidden[0][0].test('$x = $a ?? $b'));
  assert.ok(forbidden[3][0].test('pwsh -File x.ps1'));
  // ...and it declares the mode it was written for.
  assert.match(ps1, /Set-StrictMode -Version 2\.0/);
  assert.match(ps1, /\$ErrorActionPreference = 'Stop'/);
});

test('the cmd wrappers are exactly the story\'s, and they call powershell not pwsh', () => {
  const cmd = readFileSync(join(root, 'bootstrap.cmd'), 'utf8');
  const sn = readFileSync(join(root, 'snowarch.cmd'), 'utf8');

  assert.match(cmd, /powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap\.ps1" %\*/);
  // `-ExecutionPolicy Bypass` is what makes a double-click work under the default Restricted
  // policy; without it the .ps1 cannot run at all on a stock Windows machine.
  assert.match(cmd, /set "RC=%ERRORLEVEL%"/);
  // The pause fires only on a double-click with no arguments — otherwise the window would close
  // before anyone could read the summary.
  assert.match(cmd, /echo %CMDCMDLINE% \| find \/i "%~nx0" >nul && if "%~1"=="" pause/);
  assert.match(cmd, /endlocal & exit \/b %RC%/);

  assert.match(sn, /where node >nul 2>nul \|\|/);
  assert.match(sn, /exit \/b 3\)/, 'a missing Node must be exit 3, not a stack trace');
  assert.match(sn, /node "%~dp0tools\\snowarch\\bin\\snowarch\.mjs" %\*/);
  assert.match(sn, /exit \/b %ERRORLEVEL%/);

  for (const [name, body] of [['bootstrap.cmd', cmd], ['snowarch.cmd', sn]]) {
    assert.ok(!/\bpwsh\b/.test(body), `${name} reaches for pwsh`);
  }
});

test('the Windows files arrive CRLF in every checkout', () => {
  // `git ls-files --eol` is the authority, and what it must say is `w/crlf` — the WORKING TREE,
  // which is what actually runs. A lone LF in a `.cmd` is a batch file that stops at the first
  // line, on a machine with no other launcher to fall back to.
  //
  // The story's criterion 8 also expects `i/crlf`, and that one cannot hold: `text eol=crlf` — the
  // attribute ARC-01-S07 chose — normalises to LF in the INDEX and converts on checkout, which is
  // the whole point of it. `i/crlf` would require `-text`, which turns normalisation off entirely
  // and is a worse choice for a repository three platforms clone. So the assertion is on the
  // property that matters and on the attribute that produces it.
  const out = execFileSync('git', ['ls-files', '--eol', 'bootstrap.ps1', 'bootstrap.cmd', 'snowarch.cmd'],
    { cwd: root, encoding: 'utf8' });
  const rows = out.split('\n').filter(Boolean);
  assert.equal(rows.length, 3, out);
  for (const row of rows) {
    assert.match(row, /w\/crlf/, `${row} does not reach a checkout as CRLF`);
    assert.match(row, /attr\/text eol=crlf/, `${row} is missing the attribute that makes it so`);
  }
  const attrs = readFileSync(join(root, '.gitattributes'), 'utf8');
  assert.match(attrs, /\*\.ps1 text eol=crlf/);
  assert.match(attrs, /\*\.cmd text eol=crlf/);
  // ...and bootstrap.sh is LF for the same reason, from the other side.
  const sh = execFileSync('git', ['ls-files', '--eol', 'bootstrap.sh'], { cwd: root, encoding: 'utf8' });
  assert.match(sh, /w\/lf/, 'the POSIX launcher must not arrive CRLF');
});

test('Git Bash gets the Windows remedies, and the region followed it back', () => {
  // ARC-06-S12's ruling (4): `platform()` answered `linux` for MINGW/MSYS, so a Windows user
  // running the POSIX launcher was told to `apt install git`. The arm is the fix; the interesting
  // half is that the generated region needed NO edit — S11's derivation rule saw the two new
  // references and put the sentences back on the next generate.
  assert.match(launcher, /MINGW\*\|MSYS\*\|CYGWIN\*\) echo win32/);
  assert.match(launcher, /^MSG_NODE_WIN=/m);
  assert.match(launcher, /^MSG_GIT_WIN=/m);
  assert.equal(shellVar('MSG_NODE_WIN'), remedies.node.win32);
  assert.equal(shellVar('MSG_GIT_WIN'), remedies.git.win32);
  // ...and the three arms each pick a different pair, rather than one arm shadowing the rest.
  const arms = launcher.match(/^\s*(darwin|win32|\*)\)\s+NODE_REMEDY="\$(\w+)" ; GIT_REMEDY="\$(\w+)"/gm) ?? [];
  assert.equal(arms.length, 3, `expected three platform arms, found ${arms.length}`);
  assert.equal(new Set(arms.map((a) => a.split('NODE_REMEDY=')[1])).size, 3);
});

test('each launcher declares the sentences it uses, and only those', () => {
  // Both linters call an assigned-never-read variable a defect — shellcheck SC2034 and
  // PSScriptAnalyzer PSUseDeclaredVarsMoreThanAssignments — and the first version of this
  // generator wrote every sentence into both files, so `bootstrap.sh` declared the `winget`
  // remedies it can never print and `bootstrap.ps1` the `brew` ones. Six findings, one cause.
  // The region is now derived from each file's own references, which is why this holds.
  // `bootstrap.sh` DOES carry the Windows remedies now — S12 gave it a Git Bash arm that prints
  // them, and the region followed. The rule is unchanged: declared iff used.
  assert.ok(!/^\$MSG_NODE_DARWIN = /m.test(ps1), 'bootstrap.ps1 declares a macOS remedy it never prints');
  assert.ok(!/^\$MSG_GIT_LINUX = /m.test(ps1), 'bootstrap.ps1 declares a Linux remedy it never prints');

  // The other half, and the one that matters: everything a file DOES mention is defined. A
  // generator that simply wrote fewer lines would pass the four assertions above.
  for (const [name, doc, assign] of [['bash', launcher, (n) => new RegExp(`^${n}=`, 'm')],
    ['powershell', ps1, (n) => new RegExp(`^\\$${n} = `, 'm')]]) {
    const used = new Set([...doc.matchAll(/\$\{?(MSG_[A-Z_]+|SERVER_KEY)\}?/g)].map((m) => m[1]));
    assert.ok(used.size >= 6, `${name}: only ${used.size} sentences referenced — is the regex right?`);
    for (const n of used) assert.match(doc, assign(n), `${name}: ${n} is used but never assigned`);
  }
});

test('a launcher that names a sentence the generator does not have is an error, not a silence', () => {
  // The failure this guards: a typo'd `$MSG_NET_WORK` would simply not be written, and the
  // launcher would print an empty remedy on the one machine that needed it.
  const dir = mkdtempSync(join(tmpdir(), 'launcher-gen-'));
  try {
    mkdirSync(join(dir, 'tools/snowarch/lib'), { recursive: true });
    for (const f of ['net-sentences.mjs', 'remedies.json', 'text.json']) {
      copyFileSync(join(root, 'tools/snowarch/lib', f), join(dir, 'tools/snowarch/lib', f));
    }
    copyFileSync(join(root, 'engine.config.json'), join(dir, 'engine.config.json'));
    writeFileSync(join(dir, 'bootstrap.sh'),
      `#!/usr/bin/env bash\n${BEGIN}\n${END}\necho "$MSG_NET_WORK"\n`);
    const r = spawnSync(process.execPath, [join(root, 'scripts/gen-launcher-text.mjs'), '--root', dir],
      { encoding: 'utf8' });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /MSG_NET_WORK/);
    // And the same tree without the typo generates cleanly — so the exit 2 was the typo.
    writeFileSync(join(dir, 'bootstrap.sh'),
      `#!/usr/bin/env bash\n${BEGIN}\n${END}\necho "$MSG_NET"\n`);
    const ok = spawnSync(process.execPath, [join(root, 'scripts/gen-launcher-text.mjs'), '--root', dir],
      { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(readFileSync(join(dir, 'bootstrap.sh'), 'utf8'), /^MSG_NET=/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the network probe believes git\'s exit code, and says which failure it was', {
  // bootstrap.sh is the POSIX launcher and the stub is a `#!/bin/sh` script; the Windows
  // twin of this assertion is the windows-launcher job, which runs the real .ps1.
  skip: process.platform === 'win32' ? 'POSIX launcher; the .ps1 is proved in CI' : false,
}, () => {
  // The bug this pins, found by the Windows job: `ls-remote --exit-code -h <url> HEAD` matches no
  // HEAD ref, so git exits 2 and prints NOTHING. bash read only stderr and called that reachable;
  // the PowerShell port read only the exit code and called a working network unreachable. Same
  // command, two answers — which is exactly the drift a shared launcher is supposed to prevent.
  // Run against a stubbed git, so the assertion is about the launcher and not about the network.
  const dir = mkdtempSync(join(tmpdir(), 'launcher-net-'));
  const run = (gitExit, gitStderr) => {
    const bin = join(dir, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'git'), ['#!/bin/sh',
      'case "$1" in --version) echo "git version 2.44.0" ; exit 0 ;; esac',
      `[ -n "${gitStderr}" ] && echo "${gitStderr}" >&2`,
      `exit ${gitExit}`].join('\n'), { mode: 0o755 });
    return spawnSync('bash', [join(dir, 'bootstrap.sh'),
      '--mode', 'design', '--yes', '--docs', 'skip', '--skip-claude-check'],
    { cwd: dir, encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin`, HOME: dir, TERM: 'dumb' } });
  };
  try {
    mkdirSync(join(dir, 'tools/snowarch/launcher'), { recursive: true });
    for (const f of ['bootstrap.sh', 'engine.config.json']) copyFileSync(join(root, f), join(dir, f));
    copyFileSync(join(root, 'tools/snowarch/launcher/docs-recipe.sh'),
      join(dir, 'tools/snowarch/launcher/docs-recipe.sh'));

    // Silent non-zero: the case the old `-n "$NET"` test could not see at all.
    const silent = run(2, '');
    assert.equal(silent.status, 3, silent.stdout + silent.stderr);
    assert.match(silent.stdout + silent.stderr, /cannot reach github\.com/);
    // The two classified failures still pick their own sentence, from stderr.
    const dns = run(128, 'fatal: could not resolve host: github.com');
    assert.match(dns.stdout + dns.stderr, /\(DNS\)/);
    const tls = run(128, 'fatal: unable to access: SSL certificate problem: self signed certificate');
    assert.match(tls.stdout + tls.stderr, /TLS interception detected/);
    // ...and a reachable network is not reported as a failure — the half that proves the rest.
    const ok = run(0, '');
    assert.match(ok.stdout, /ok B00 network: github\.com reachable/, ok.stdout + ok.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('and the Windows launcher runs the same probe, with the same flags', () => {
  // CI runs it; this is what stops the two from parting company between runs.
  const flags = /ls-remote --exit-code (-h )?/;
  const sh = flags.exec(launcher);
  const ps = flags.exec(ps1);
  assert.ok(sh && ps, 'one of the launchers no longer probes with ls-remote');
  assert.equal(sh[1], undefined, 'bootstrap.sh passes -h, which makes --exit-code meaningless');
  assert.equal(ps[1], undefined, 'bootstrap.ps1 passes -h, which makes --exit-code meaningless');
  for (const doc of [launcher, ps1]) {
    assert.match(doc, /http\.lowSpeedLimit=1000/);
    assert.match(doc, /GIT_TERMINAL_PROMPT/);
  }
});

test('no argument to a native command carries an embedded double quote', () => {
  // PowerShell 5.1 rewrites native-command arguments cmd-style on the way out, and a `"` inside
  // one does not survive: `node -p 'process.versions.node.split(".")[0]'` reached node as
  // `split(.)[0]`, so the launcher decided Node was unusable on a machine that had it. Found by
  // CI on the run WITH Node — the Node-free cells could never have shown it.
  const calls = [...ps1.matchAll(/^\s*(?:\$\w+ = \()?& (node|git|claude)\b([^\r\n]*)/gm)];
  assert.ok(calls.length >= 3, `only ${calls.length} native calls found — is the regex right?`);
  for (const [line, cmd, args] of calls) {
    assert.ok(!/'[^']*"[^']*'/.test(args), `${cmd}: an argument embeds a double quote — ${line.trim()}`);
  }
  // Not vacuous: the shape it is looking for is exactly the one that broke.
  assert.ok(/'[^']*"[^']*'/.test(`& node -p 'process.versions.node.split(".")[0]'`));
});

test('the Windows path never reaches for bash', () => {
  // The CI job rebuilds PATH without Git Bash to prove this from the outside; this proves it from
  // the inside, where no runner is needed. `C:\\Windows\\System32\\bash.exe` (the WSL stub) is on every
  // Windows machine, so the environment can never assert the absence of `bash` itself — only that
  // the launcher does not depend on the Git one.
  const cmd = readFileSync(join(root, 'bootstrap.cmd'), 'utf8');
  const sn = readFileSync(join(root, 'snowarch.cmd'), 'utf8');
  for (const [name, doc] of [['bootstrap.ps1', ps1], ['bootstrap.cmd', cmd], ['snowarch.cmd', sn]]) {
    const body = doc.split('\n').filter((l) => !/^\s*(#|rem )/i.test(l)).join('\n');
    assert.ok(!/\b(bash|sh\.exe|bootstrap\.sh)\b/.test(body), `${name} invokes a POSIX shell`);
  }
});

test('bootstrap.ps1 carries a UTF-8 BOM, because 5.1 reads a file without one as ANSI', () => {
  const bytes = readFileSync(join(root, 'bootstrap.ps1'));
  assert.deepEqual([...bytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF],
    'no BOM — PowerShell 5.1 would decode the non-ASCII sentences as the ANSI code page');
  // Not a ritual: the file genuinely contains characters that mojibake without it. If this ever
  // fails, the BOM is no longer needed and the assertion above should go with it.
  assert.ok(/[^\u0000-\u007F]/.test(ps1), 'bootstrap.ps1 is pure ASCII — the BOM has no subject');
  // ...and the console side of the same problem is handled too, with a catch that says something.
  assert.match(ps1, /\[Console\]::OutputEncoding = \[Text\.Encoding\]::UTF8/);
  assert.ok(!/catch \{ \}/.test(ps1), 'an empty catch block (PSAvoidUsingEmptyCatchBlock)');
  // The BOM is declared where the tooling reads it, not just left in the bytes.
  assert.match(readFileSync(join(root, '.editorconfig'), 'utf8'),
    /\[bootstrap\.ps1\]\ncharset = utf-8-bom/);
});

test('the Windows launcher is a launcher too — the budget, with the region reported', () => {
  const lines = ps1.replace(/\r/g, '').split('\n').filter((l, i, a) => !(i === a.length - 1 && l === '')).length;
  const generated = ps1.replace(/\r/g, '').slice(ps1.replace(/\r/g, '').indexOf('# text-begin'),
    ps1.replace(/\r/g, '').indexOf('# text-end')).split('\n').length + 1;
  // PowerShell is wordier than bash for the same work — `[ordered]@{}` state, typed parameters, a
  // `switch -Regex` — so the budget is its own rather than bash's 180. The total is reported so the
  // number is a measurement rather than a target to game.
  // Raised from 250 to 265 when the one JSON writer landed (`Set-Content -Encoding UTF8` is
  // BOM'd on 5.1, which Node then refuses): eight lines, five of them the comment that records
  // why. Deleting the explanation to hold a number would be the wrong trade — the budget exists
  // to stop a launcher becoming an application, and the total is printed either way.
  assert.ok(lines - generated <= 265,
    `${lines - generated} hand-written lines (${lines} total, ${generated} generated)`);
});
