import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync }
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
  // ARC-03's network vocabulary, not a second phrasing of it. ARC-09-C29: the host is a SLOT, so
  // the launcher fills in whichever corpus remote is configured — `printf` takes `%s`.
  assert.equal(shellVar('MSG_DNS_FMT'), sentences.dnsFailure('%s'));
  assert.equal(shellVar('MSG_UPSTREAM_LOCAL'), sentences.localUpstream);
  assert.equal(shellVar('MSG_UPSTREAM_SCHEME_FMT'), sentences.unprobeableUpstream('%s'));
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
  //
  // Raised 185 → 195 (total 206 → 217) by ARC-09-C29: B00 used to probe one hardcoded URL, and now
  // probes the CONFIGURED corpus remote — which is three outcomes rather than one (probe it; say it
  // is local; say it is a scheme this probe cannot speak). Ten lines for a `case` with three arms
  // and two comments, after the first draft was trimmed from fourteen by using parameter expansion
  // instead of two `sed` subshells. Three more for a `file://` arm the first draft folded into the
  // scheme arm — which reported a local upstream as an unspeakable remote, and the case below
  // caught it in one run. The alternative was a launcher that keeps a check simple by making it
  // untrue, which is the defect C29 exists to remove.
  //
  // Raised 198 → 209 (total 220 → 231) by ARC-03-C1. Eleven lines, seven of them the comment: the
  // recipe's exit status used to be its final `echo`'s, so a transient 408 at the fetch or the
  // checkout was swallowed and `|| die B02` never fired. Fixing that made `|| die` reachable, which
  // made the directory a failed clone leaves behind matter — MSG_NET says "re-run", and a re-run
  // died on "already exists and is not an empty directory". Three lines remember whether the corpus
  // was there BEFORE this run so a failure removes only what this run created. The comment is the
  // part a reader needs: `rm -rf` in a launcher must say who is allowed to run it.
  assert.ok(lines - generated <= 209,
    `${lines - generated} hand-written lines (${lines} total, ${generated} generated)`);
  assert.ok(lines <= 231, `${lines} total lines`);
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
  // PowerShell's `-f` takes `{0}` where printf takes `%s`: one sentence, two placeholder spellings.
  assert.equal(psVar('MSG_DNS_FMT'), sentences.dnsFailure('{0}'));
  assert.equal(psVar('MSG_UPSTREAM_LOCAL'), sentences.localUpstream);
  assert.equal(psVar('MSG_UPSTREAM_SCHEME_FMT'), sentences.unprobeableUpstream('{0}'));
  assert.equal(psVar('MSG_TLS'), sentences.tlsIntercepted({ tool: sentences.TOOL.git }));
  assert.equal(psVar('MSG_DOCTOR'), text.doctorUnavailable);
  assert.equal(psVar('MSG_MODE'), text.modeDesign);
  // The WINDOWS spellings, because this launcher runs where `.\bootstrap.cmd` is what works.
  assert.equal(psVar('MSG_NEXT'), text.windows.nextDesign);
  assert.match(psVar('MSG_NEXT'), /snowarch\.cmd mode live/);
  // ...and the two launchers agree on everything that is not a spelling.
  assert.equal(psVar('MSG_DOCTOR'), shellVar('MSG_DOCTOR'));
  // The two placeholder spellings differ BY DESIGN; what must match is the sentence around them.
  const slotless = (v) => v.replace('{0}', '<host>').replace('%s', '<host>');
  assert.equal(slotless(psVar('MSG_DNS_FMT')), slotless(shellVar('MSG_DNS_FMT')));
  assert.equal(psVar('MSG_UPSTREAM_LOCAL'), shellVar('MSG_UPSTREAM_LOCAL'));
  assert.equal(slotless(psVar('MSG_UPSTREAM_SCHEME_FMT')), slotless(shellVar('MSG_UPSTREAM_SCHEME_FMT')));
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
  assert.match(sn, /node "%~dp0tools\\snowarch\\bin\\snowarch\.mjs" %\*/);
  assert.match(sn, /exit \/b %ERRORLEVEL%/);

  // A missing Node is exit 3, and this asserts the CODE PATH rather than the sentence.
  //
  // It used to be `assert.match(sn, /exit \/b 3\)/)`, which matched
  // `(echo … ^& exit /b 3)` — and inside a parenthesised block that `^&` is ESCAPED, so
  // "exit /b 3" was part of the echoed TEXT. The launcher printed the words and fell through to
  // `node`, which is not there, and returned cmd's 9009. The test passed for three ARCs because it
  // was reading a message, and the CI cell that would have caught it was dead code — invoked
  // without `call`, so the assertion on the next line never ran (ARC-09-S04).
  const branch = sn.slice(sn.indexOf('where node'));
  assert.match(branch, /\|\| goto :no_node/, 'the no-Node branch must LEAVE, not fall through');
  assert.match(sn, /^:no_node$/m);
  const label = sn.slice(sn.indexOf('\n:no_node'));
  assert.match(label, /^exit \/b 3$/m, 'the no-Node path does not exit 3');
  // ...and the code is not inside the message, which is the mistake that hid for three ARCs.
  const echoed = /^echo snowarch: .*$/m.exec(label)?.[0] ?? '';
  assert.equal(/exit \/b/.test(echoed), false, 'the exit code is part of the printed sentence again');

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

    // ARC-09-C29 — a LOCAL corpus upstream is not probed, and says so. This is the half that makes
    // the fixture suites hermetic: ten `bootstrapUser` call sites used to need DNS for a host they
    // never contacted, and one network blip took the run with it.
    const config = JSON.parse(readFileSync(join(dir, 'engine.config.json'), 'utf8'));
    const rewrite = (upstream) => writeFileSync(join(dir, 'engine.config.json'),
      `${JSON.stringify({ ...config, docs: { ...config.docs, upstream } }, null, 2)}\n`);

    // `git` here EXITS 1 on any probe: if the launcher probed at all, B00 would FAIL. The
    // assertion is on B00's line rather than on the exit code, because this fixture has no
    // `.mcp.json` and B01 stops the run afterwards for a reason that is not what is being tested.
    rewrite('file:///srv/corpus.git');
    const local = run(1, 'fatal: could not resolve host: example.invalid');
    assert.match(local.stdout, /ok B00 network: corpus upstream is local — no probe/);
    assert.equal(/FAIL B00/.test(local.stdout + local.stderr), false, local.stdout + local.stderr);

    // A scheme this probe cannot speak is remote, and must not claim to be local.
    rewrite('ssh://git@git.corp.example/corpus.git');
    const ssh = run(1, 'fatal: could not resolve host: git.corp.example');
    assert.match(ssh.stdout, /ok B00 network: corpus upstream is ssh — not probed/);
    assert.equal(/FAIL B00/.test(ssh.stdout + ssh.stderr), false, ssh.stdout + ssh.stderr);

    // ...and a MIRROR is probed, and named. The old check passed on github.com and said nothing
    // about the host B02 would actually fetch from.
    rewrite('https://git.corp.example/mirror/ServiceNowDocs.git');
    const mirrorOk = run(0, '');
    assert.match(mirrorOk.stdout, /ok B00 network: git\.corp\.example reachable/);
    const mirrorDns = run(128, 'fatal: could not resolve host: git.corp.example');
    assert.equal(mirrorDns.status, 3, 'a DNS failure on the configured host is still a B00 refusal');
    assert.match(mirrorDns.stdout + mirrorDns.stderr,
      /cannot reach git\.corp\.example \(DNS\)/, 'the DNS sentence names the configured host');
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
  // Raised 265 → 278 by ARC-09-C29, for the same probe as bootstrap.sh's 185 → 198.
  // Raised 278 → 298 by ARC-03-C1, for bootstrap.sh's 198 → 209 plus nine lines PowerShell costs
  // for the same work: `$LASTEXITCODE` was never a sound check here — the recipe's two `submodule`
  // steps are allowed to fail, so their exit code condemned a good install, and a fatal step now
  // throws, which no exit-code check sees — so the call moved into `try/catch` (seven lines where
  // bash needs a `|| { … }`), and `Remove-Item -Recurse -Force` with its guard takes three where
  // `rm -rf` takes one.
  assert.ok(lines - generated <= 298,
    `${lines - generated} hand-written lines (${lines} total, ${generated} generated)`);
});

/**
 * ARC-03-C1 — a failed corpus checkout leaves nothing behind, so "re-run" is a true instruction.
 *
 * The recipe's first step is `git clone … vendor/ServiceNowDocs`, and a clone refuses a directory
 * that exists and is not empty. Before this, a run that died halfway left the directory there and
 * MSG_NET's "re-run" walked the operator into "already exists and is not an empty directory". The
 * rule is narrow on purpose: remove a directory THIS RUN created, never one that was already there,
 * whatever state it is in. Someone else's checkout is not ours to delete.
 */
test('a failed recipe removes the corpus THIS run created, and dies with B02 — not the doctor\'s wording', {
  skip: process.platform === 'win32' ? 'POSIX launcher; the real .ps1 runs in the no-node, windows-latest cell' : false,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'launcher-b02-'));
  // A git that gets the bootstrap to B02, creates the corpus directory at the clone as the real one
  // would, and then fails the FETCH — the step the 408 landed on in the run that started this.
  const stub = (failVerb) => [
    '#!/bin/sh',
    'case "$1" in --version) echo "git version 2.44.0" ; exit 0 ;; esac',
    'for a in "$@" ; do case "$a" in',
    '  clone) mkdir -p vendor/ServiceNowDocs/.git ; exit 0 ;;',
    `  ${failVerb}) echo "error: RPC failed; HTTP 408 curl 22 The requested URL returned error: 408" >&2 ; exit 128 ;;`,
    'esac ; done',
    'exit 0',
  ].join('\n');
  const run = () => {
    const bin = join(dir, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'git'), stub('fetch'), { mode: 0o755 });
    return spawnSync('bash', [join(dir, 'bootstrap.sh'),
      '--mode', 'design', '--yes', '--docs', 'sparse', '--skip-claude-check'],
    { cwd: dir, encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin`, HOME: dir, TERM: 'dumb' } });
  };
  try {
    mkdirSync(join(dir, 'tools/snowarch/launcher'), { recursive: true });
    mkdirSync(join(dir, 'vendor'), { recursive: true });
    for (const f of ['bootstrap.sh', 'engine.config.json']) copyFileSync(join(root, f), join(dir, f));
    copyFileSync(join(root, 'tools/snowarch/launcher/docs-recipe.sh'),
      join(dir, 'tools/snowarch/launcher/docs-recipe.sh'));
    copyFileSync(join(root, 'vendor/docs-areas.txt'), join(dir, 'vendor/docs-areas.txt'));

    const r = run();
    const out = r.stdout + r.stderr;
    // B02, with the NETWORK remedy. Before this fix the recipe returned 0, bootstrap carried on,
    // and the failure surfaced three steps later as the doctor's "area missing" — the symptom.
    assert.match(out, /B02/, out);
    assert.match(out, /the corpus checkout failed/, out);
    assert.match(out, /check your network/, out);
    assert.doesNotMatch(out, /area .* missing/, 'it reported the symptom, not the cause');
    assert.notEqual(r.status, 0, 'a failed checkout exited 0');
    // And the directory this run created is gone, so the re-run it just advised can clone.
    assert.ok(!existsSync(join(dir, 'vendor/ServiceNowDocs')),
      'the failed run left a directory that the re-run\'s clone will refuse');

    // The other direction, and it is the one that protects the operator: a corpus that was ALREADY
    // there is not ours to delete, however the run ends.
    mkdirSync(join(dir, 'vendor/ServiceNowDocs'), { recursive: true });
    writeFileSync(join(dir, 'vendor/ServiceNowDocs/MINE'), 'not the bootstrap\'s to delete');
    const second = run();
    assert.notEqual(second.status, 0, 'the second run should still fail');
    assert.ok(existsSync(join(dir, 'vendor/ServiceNowDocs/MINE')),
      'bootstrap deleted a corpus directory it did not create');

    // THE CONTROL. Same fixture, same stub, same failing fetch — with the pre-C1 recipe, whose
    // steps ran in sequence with no joiner. This is what the `no-node, macos-latest` cell did on
    // 89bb06f: the function's exit status was its final `echo`'s, `|| die` never fired, and the
    // failure surfaced as the doctor's "area missing" three steps later. Without this control the
    // assertions above would also pass on a recipe that swallows the failure and happens to leave
    // no directory behind, which is a different bug wearing this one's clothes.
    rmSync(join(dir, 'vendor/ServiceNowDocs'), { recursive: true, force: true });
    const joined = readFileSync(join(dir, 'tools/snowarch/launcher/docs-recipe.sh'), 'utf8');
    assert.ok(joined.includes(' && \\\n'), 'fixture: the recipe under test carries no joiner at all');
    writeFileSync(join(dir, 'tools/snowarch/launcher/docs-recipe.sh'),
      joined.replace(/ && \\\n/g, '\n').replace(/\{ (.*) \|\| true ; \}/g, '$1'));
    const swallowed = run();
    const swallowedOut = swallowed.stdout + swallowed.stderr;
    assert.match(swallowedOut, /area .* missing/,
      'the control did not reproduce the swallow — this test proves nothing about the joiner');
    assert.doesNotMatch(swallowedOut, /the corpus checkout failed/,
      'the control reported the cause, so the joiner is not what produced it above');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the Windows launcher carries the same two rulings, in PowerShell', () => {
  // Static, like every other assertion about the .ps1 in this file: the dynamic proof is the
  // `no-node, windows-latest` CI cell, which runs the real launcher end to end on every push.
  // $LASTEXITCODE is NOT the check any more, and that is the point — the recipe's two `submodule`
  // steps are allowed to fail, so their exit code condemned a good install, and a fatal step now
  // throws, which no exit-code check ever sees.
  const b02 = ps1.slice(ps1.indexOf('$corpusPre'), ps1.indexOf("Record 'B02' 'ok'"));
  assert.ok(b02.length > 0, 'no B02 region found in bootstrap.ps1');
  assert.match(b02, /\$corpusPre = Test-Path/, 'it does not record whether the corpus pre-existed');
  assert.match(b02, /try \{/, 'the recipe call is not wrapped — a thrown step would escape as a PowerShell error');
  assert.match(b02, /catch \{/);
  assert.match(b02, /if \(-not \$corpusPre\) \{[\s\S]*?Remove-Item -Recurse -Force/,
    'it removes the corpus without asking whether this run created it');
  assert.match(b02, /Die 'B02' 'the corpus checkout failed' \$MSG_NET 1/);
  // Both directions on the check that was wrong: the region must no longer consult $LASTEXITCODE
  // for the recipe's outcome.
  assert.doesNotMatch(b02, /if \(\$LASTEXITCODE -ne 0\) \{ Die 'B02'/,
    '$LASTEXITCODE is back as the recipe check, and the tolerated submodule steps will condemn a good install');
});

test('the recipe is idempotent — a second bootstrap succeeds, with .git left as a FILE', {
  skip: process.platform === 'win32' ? 'POSIX launcher; the real .ps1 runs in the no-node, windows-latest cell' : false,
}, () => {
  // Written by CI. The rendered recipe is the FRESH-checkout list and a launcher runs it on every
  // bootstrap, so its first step meets a directory that is already there — and `git clone` refuses
  // a non-empty target. Until the fail-fast joiner landed, that failure was swallowed with all the
  // others and the rest of the recipe reconciled the existing checkout, so the recipe had never
  // been idempotent and nothing had noticed. All three `no-node` cells went red on the second run.
  //
  // The stub reproduces the two behaviours that matter: a clone REFUSES a non-empty target, and
  // `submodule absorbgitdirs` leaves `.git` as a FILE. The second is why the guard asks whether
  // `.git` EXISTS rather than whether it is a directory — `-d` is false on exactly the tree the
  // guard exists for, and a fixture that left a directory behind would have passed a broken guard.
  const dir = mkdtempSync(join(tmpdir(), 'launcher-idem-'));
  const calls = join(dir, 'calls');
  const stub = [
    '#!/bin/sh',
    'case "$1" in --version) echo "git version 2.44.0" ; exit 0 ;; esac',
    // Every invocation is recorded, so the test can assert WHERE the chain stopped rather than
    // inferring it from what bootstrap printed.
    `echo "$*" >> "${calls}"`,
    'for a in "$@" ; do case "$a" in',
    '  clone)',
    '    if [ -n "$(ls -A vendor/ServiceNowDocs 2>/dev/null)" ] ; then',
    "      echo \"fatal: destination path 'vendor/ServiceNowDocs' already exists and is not an empty directory.\" >&2",
    '      exit 128',
    '    fi',
    '    mkdir -p vendor/ServiceNowDocs && echo "gitdir: ../../.git/modules/vendor/ServiceNowDocs" > vendor/ServiceNowDocs/.git',
    '    for d in $(cat vendor/docs-areas.txt) ; do mkdir -p "vendor/ServiceNowDocs/$d" ; done',
    '    exit 0 ;;',
    'esac ; done',
    'exit 0',
  ].join('\n');
  const run = () => {
    const bin = join(dir, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'git'), stub, { mode: 0o755 });
    return spawnSync('bash', [join(dir, 'bootstrap.sh'),
      '--mode', 'design', '--yes', '--docs', 'sparse', '--skip-claude-check'],
    { cwd: dir, encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin`, HOME: dir, TERM: 'dumb' } });
  };
  try {
    mkdirSync(join(dir, 'tools/snowarch/launcher'), { recursive: true });
    mkdirSync(join(dir, 'vendor'), { recursive: true });
    for (const f of ['bootstrap.sh', 'engine.config.json']) copyFileSync(join(root, f), join(dir, f));
    copyFileSync(join(root, 'tools/snowarch/launcher/docs-recipe.sh'),
      join(dir, 'tools/snowarch/launcher/docs-recipe.sh'));
    copyFileSync(join(root, 'vendor/docs-areas.txt'), join(dir, 'vendor/docs-areas.txt'));

    const first = run();
    assert.equal(first.status, 0, `first run: ${first.stdout}${first.stderr}`);
    assert.match(first.stdout + first.stderr, /\[B02\/09\] docs … ok/, 'the first run did not finish B02');
    // The state the guard has to survive: `.git` is a FILE, not a directory.
    assert.ok(statSync(join(dir, 'vendor/ServiceNowDocs/.git')).isFile(),
      'fixture: .git is not a file, so this does not test the absorbgitdirs state at all');

    writeFileSync(calls, '');
    const second = run();
    assert.equal(second.status, 0,
      `the second bootstrap failed — the recipe is not idempotent: ${second.stdout}${second.stderr}`);
    // The POSITIVE direction, so "nothing ran after the clone" below cannot pass by the recipe
    // doing nothing at all: with the guard, the clone is SKIPPED and every later step still runs.
    const secondCalls = readFileSync(calls, 'utf8').split('\n').filter(Boolean);
    assert.ok(!secondCalls.some((l) => /(^| )clone( |$)/.test(l)),
      `the guarded second run still cloned: ${secondCalls.join(' | ')}`);
    for (const verb of ['sparse-checkout', 'fetch', 'checkout']) {
      assert.ok(secondCalls.some((l) => new RegExp(`(^| )${verb}( |$)`).test(l)),
        `the guarded second run skipped \`${verb}\` too — it reconciles nothing: ${secondCalls.join(' | ')}`);
    }
    assert.doesNotMatch(second.stdout + second.stderr, /already exists and is not an empty directory/,
      'the second run re-ran the clone over an existing checkout');
    assert.doesNotMatch(second.stdout + second.stderr, /the corpus checkout failed/, second.stdout);

    // THE CONTROL: strip the precondition from the fixture's recipe and the second run must break
    // exactly as CI broke. Without it this test would pass on a recipe whose clone is guarded by
    // nothing, so long as something else happened to make the second run succeed.
    const guarded = readFileSync(join(dir, 'tools/snowarch/launcher/docs-recipe.sh'), 'utf8');
    assert.ok(guarded.includes('[ -e vendor/ServiceNowDocs/.git ] || git clone'),
      'fixture: the recipe under test has no clone precondition to strip');
    writeFileSync(join(dir, 'tools/snowarch/launcher/docs-recipe.sh'),
      guarded.replace(/\{ \[ -e vendor\/ServiceNowDocs\/\.git \] \|\| (git clone[^\n]*?) ; \}/g, '$1'));
    writeFileSync(calls, '');
    const unguarded = run();
    assert.notEqual(unguarded.status, 0, 'the control did not reproduce the CI failure');
    assert.match(unguarded.stdout + unguarded.stderr, /already exists and is not an empty directory/,
      'the control failed for some other reason than the unguarded clone');
    assert.match(unguarded.stdout + unguarded.stderr, /the corpus checkout failed/,
      'and the joiner must still report it as the corpus step, not leave it to the doctor');

    // WHERE the chain stopped, and this is the hazard the joiner actually closes. Before ARC-03-C1
    // the refused clone was swallowed and the next step ran anyway:
    //   git -C vendor/ServiceNowDocs sparse-checkout set --cone <19 areas> legal
    // `git -C` on a directory that is NOT a repository walks up and finds the SUPERPROJECT, so that
    // step sparsified the product checkout itself. Measured on a product-shaped fixture: exit 0,
    // `core.sparseCheckout=true` set on the superproject, and `tools/`, `tests/` and `docs/` gone
    // from the working tree — with `git status --porcelain` reporting ZERO deletions, because
    // sparse-checkout marks them skip-worktree. Source directories vanish and git calls the tree
    // clean. With the chain, nothing runs after the clone fails, and this asserts exactly that.
    const made = readFileSync(calls, 'utf8').split('\n').filter(Boolean);
    assert.ok(made.length > 0, 'the stub recorded no calls at all — the recording is broken');
    // The recorded line is the argument list, so the verb can be the FIRST word — `includes(' clone ')`
    // found nothing and the assertion below said so rather than passing vacuously.
    const cloneAt = made.findIndex((l) => /(^| )clone( |$)/.test(l));
    assert.notEqual(cloneAt, -1, 'the control never reached the clone');
    const after = made.slice(cloneAt + 1);
    for (const verb of ['sparse-checkout', 'fetch', 'checkout', 'submodule']) {
      assert.ok(!after.some((l) => new RegExp(`(^| )${verb}( |$)`).test(l)),
        `the chain did not stop: \`${verb}\` ran after the clone was refused — ${after.join(' | ')}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
