// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-S07 — the parts of `upgrade` that do not need a tree.
 *
 * The classifier, the tag ordering, the plan renderer and the cache: four things whose failures
 * are all of the same kind — a user reading a sentence that is not true. They are unit-tested
 * because each has cases the e2e harness cannot reach cheaply (a 407, a prerelease ordering, a
 * clock that went backwards), and because a plan is text a person acts on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  classifyGitFetchError, doctorLines, licenceNotice, parseSemver, refusesTarget, renderPlan, returnRef, sortTags,
  targetRefusalLines, upgradeCommand,
} from '../../tools/snowarch/lib/commands/upgrade.mjs';
import { LAST_UNENFORCED_RELEASE } from '../../tools/snowarch/lib/doctor/checks/licence.mjs';
import { branchState, describe } from '../../tools/snowarch/lib/git.mjs';
import { git as harnessGit } from './harness.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { REMEDY } from '../../tools/snowarch/lib/licence/state.mjs';
import { failureLines } from '../../tools/snowarch/lib/doctor/panel.mjs';
import {
  MAX_AGE_MS, REFRESH_AFTER_MS, cachePath, isFresh, needsRefresh, readUpgradeCheck,
  writeUpgradeCheck,
} from '../../tools/snowarch/lib/upgrade-check.mjs';
import { initFixtureRepo } from '../../tools/snowarch/tests/helpers/fixture-git.mjs';

const isWindows = process.platform === 'win32';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('ARC-09-C185c — originLine: a GitHub origin that is not the releases\' repository, and only that', async () => {
  const { originLine } = await import('../../tools/snowarch/lib/commands/upgrade.mjs');
  const home = 'https://github.com/farstic/snowarch.git';
  // The launcher is the caller's to spell (a neutral token here: the launcher audit counts a spelled one).
  const line = (url) => originLine(url, 'farstic/snowarch', 'CLI');
  assert.equal(line('https://github.com/farstic/old-home.git'), 'upgrade: origin is https://github.com/farstic/old-home.git, '
    + `and releases are published at ${home} — git remote set-url origin ${home}, then run CLI upgrade again`);
  // The other spellings of a GitHub origin: ssh, scp-like, no `.git`, http, a trailing slash.
  for (const url of ['git@github.com:farstic/old-home.git', 'ssh://git@github.com/farstic/old-home', 'http://github.com/farstic/old-home/',
    'https://github.com/someone/fork.git']) {
    assert.match(line(url) ?? '', /^upgrade: origin is .+, and releases are published at /, url);
  }
  // The releases' own repository, however it is spelled, is silent.
  for (const url of [home, 'https://github.com/Farstic/SnowArch', 'git@github.com:farstic/snowarch.git',
    'ssh://git@github.com/farstic/snowarch.git', 'https://github.com/farstic/snowarch/']) {
    assert.equal(line(url), null, url);
  }
  // An origin that is not on GitHub is a mirror or a path, and is silent; so is no origin at all.
  for (const url of ['https://gitlab.example.com/mirrors/snowarch.git', 'file:///srv/git/snowarch.git', '/srv/git/snowarch.git',
    'git@github.example.com:farstic/old-home.git', '', null, undefined]) {
    assert.equal(line(url), null, String(url));
  }
  // A credential in the URL is never printed.
  const masked = line('https://someone:ghp_secret@github.com/farstic/old-home.git') ?? '';
  assert.match(masked, /origin is https:\/\/github\.com\/farstic\/old-home\.git,/, masked);
  assert.equal(/ghp_secret|someone/.test(masked), false, masked);
  const token = line('https://ghp_alone@github.com/farstic/old-home.git') ?? '';
  assert.equal(token.includes('ghp_alone'), false, token);
  // An ssh login name is not a credential, and the origin is printed as the reader configured it.
  assert.match(line('git@github.com:farstic/old-home.git') ?? '', /origin is git@github\.com:farstic\/old-home\.git,/);
  // No configured repository, no line: the product cannot say where releases are.
  assert.equal(originLine('https://github.com/farstic/old-home.git', undefined, 'CLI'), null);
});

// ── ARC-09-C194 — every floor the tag states is judged at U4, before anything moves ──────────────────────────────

/** A probe that answers `--version` for the tools it is given, and finds nothing else. */
const versions = (map) => (cmd) => (map[cmd] === undefined
  ? { found: false, ok: false, stdout: '' }
  : { found: true, ok: true, stdout: map[cmd] });
const TAG = { floors: { claudeCode: '2.1.214', node: '20.0.0', git: '2.34.1' } };
const NPM = () => '/usr/bin/npm';

test('ARC-09-C194 — U4 judges the git and Node floors with B00\'s own predicates', async () => {
  const { toolFloorRefusal } = await import('../../tools/snowarch/lib/commands/upgrade.mjs');
  const judge = (map, mode = 'design') => toolFloorRefusal(TAG, { exec: versions(map), mode, platform: 'linux', locate: NPM });
  assert.equal(judge({ git: 'git version 2.43.0', node: 'v22.11.0' }), null);
  // git, in every mode: below, unreadable, absent. B00 refuses each, so U4 does.
  assert.match(judge({ git: 'git version 2.30.0', node: 'v22.11.0' }) ?? '', /git 2\.30\.0 found, ≥ 2\.34\.1 required/);
  assert.match(judge({ git: 'git, a build of some kind', node: 'v22.11.0' }) ?? '', /git version not understood/);
  assert.match(judge({ node: 'v22.11.0' }) ?? '', /git not found/);
  // Node: B00 refuses it only for live mode, so U4 does the same; design-only notes it and goes on.
  assert.match(judge({ git: 'git version 2.43.0', node: 'v18.20.0' }, 'live') ?? '', /live mode needs Node\.js 20\+/);
  assert.equal(judge({ git: 'git version 2.43.0', node: 'v18.20.0' }, 'design'), null);
  assert.match(judge({ git: 'git version 2.43.0', node: 'node, unreadable' }, 'live') ?? '', /live mode needs Node\.js 20\+/);
});

test('ARC-09-C194 — a Claude Code that cannot be read is below the floor, not past it', async () => {
  const { floorCheck } = await import('../../tools/snowarch/lib/commands/upgrade.mjs');
  // B00 refuses an absent or unreadable Claude Code unless its check is skipped, so U4 may not wave either through.
  assert.equal(floorCheck(TAG, { exec: versions({}) }).below, true, 'absent');
  assert.equal(floorCheck(TAG, { exec: versions({ claude: 'some build' }) }).below, true, 'unreadable');
  assert.equal(floorCheck(TAG, { exec: versions({ claude: '2.1.100 (Claude Code)' }) }).below, true, 'below');
  assert.equal(floorCheck(TAG, { exec: versions({ claude: '2.1.300 (Claude Code)' }) }).below, false, 'at or above');
});

test('the classifier names a remedy only for a shape it recognises', () => {
  // Git's own words are printed by the CALLER, always. What this decides is whether a second,
  // actionable line is added — and a confident wrong remedy costs more than none.
  assert.equal(classifyGitFetchError('fatal: could not resolve host: github.com').kind, 'dns');
  assert.match(classifyGitFetchError('fatal: could not resolve host: github.com').line,
    /DNS failure for github\.com.*HTTPS_PROXY.*TROUBLESHOOTING\.md#proxy_unreachable/);

  assert.equal(classifyGitFetchError('SSL certificate problem: unable to get local issuer certificate').kind, 'tls');
  assert.match(classifyGitFetchError('SSL certificate problem: self signed certificate').line,
    /http\.sslCAInfo.*NODE_EXTRA_CA_CERTS.*#tls_ca_untrusted/);

  assert.equal(classifyGitFetchError('Received HTTP code 407 from proxy after CONNECT').kind, 'proxy-auth');
  assert.match(classifyGitFetchError('proxy authentication required').line, /\(407\)/);

  assert.equal(classifyGitFetchError('fatal: unable to access \'https://x/\': Failed to connect to 127.0.0.1 port 9: Connection refused').kind, 'proxy');

  // The honest answer when the shape is new: no line at all, and the caller falls back to a
  // sentence that promises nothing about the cause.
  assert.deepEqual(classifyGitFetchError('fatal: the remote end hung up unexpectedly'),
    { kind: 'unknown', line: null });
  assert.deepEqual(classifyGitFetchError(''), { kind: 'unknown', line: null });
  assert.deepEqual(classifyGitFetchError(undefined), { kind: 'unknown', line: null });
});

// ── ARC-09-C190 — the fetch never asks ───────────────────────────────────────────────────────────────────────────

const AUTH_LINE = 'upgrade: origin asked for credentials, or was not found — it may be private or moved; check it with '
  + 'git remote get-url origin; nothing was changed';

test('ARC-09-C190 — the classifier names an origin that wants a credential, or is not there, as auth', () => {
  // Git's words for the three answers, as measured: prompts off, a refused credential, and GitHub on a private repository.
  for (const stderr of [
    "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
    "remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/o/n.git/'",
    "remote: Repository not found.\nfatal: repository 'https://github.com/o/n.git/' not found",
  ]) {
    assert.deepEqual(classifyGitFetchError(stderr, { remote: 'origin' }), { kind: 'auth', line: AUTH_LINE }, stderr);
  }
  // A proxy's 407 is still the proxy's, and a refused connection still a refused connection.
  assert.equal(classifyGitFetchError('Received HTTP code 407 from proxy after CONNECT').kind, 'proxy-auth');
  assert.equal(classifyGitFetchError('fatal: unable to access \'https://x/\': Failed to connect to 127.0.0.1 port 9: Connection refused').kind, 'proxy');
});

test('ARC-09-C207 — a plain 404, git\'s "repository \'<url>\' not found" with no remote line, is the auth kind', () => {
  // Measured: a server answering 404 with no `remote:` line, as a moved URL on a self-hosted server does. Git names the
  // URL between the words, so the GitHub pattern above does not see it.
  const stderr = "fatal: repository 'http://127.0.0.1:55344/fixture.git/' not found";
  assert.deepEqual(classifyGitFetchError(stderr, { remote: 'origin' }), { kind: 'auth', line: AUTH_LINE }, stderr);
});

test('ARC-09-C190 — an origin that wants a credential is answered at once: no askpass, no prompt, the auth line', async (t) => {
  // A remote that asks for a credential, with no network: a child process answers every request with 401. It is a
  // separate process because the upgrade's git runs synchronously, and a server in this one could not answer it.
  const server = spawn(process.execPath, ['-e', [
    "const s = require('node:http').createServer((q, r) => {",
    "  r.writeHead(401, { 'WWW-Authenticate': 'Basic realm=\"fixture\"' }); r.end(); });",
    "s.listen(0, '127.0.0.1', () => process.stdout.write(s.address().port + '\\n'));",
  ].join('\n')], { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => server.kill());
  const port = await new Promise((resolve, reject) => {
    server.stdout.once('data', (d) => resolve(Number(String(d).trim())));
    server.once('error', reject);
  });

  const root = tempDir('snowarch-c190-', t);
  initFixtureRepo((args) => harnessGit(root, args), root, ['-q', '-b', 'main']);
  writeFileSync(join(root, 'engine.config.json'), readFileSync(join(REPO, 'engine.config.json')));
  harnessGit(root, ['add', 'engine.config.json']);
  harnessGit(root, ['commit', '-q', '-m', 'fixture']);
  harnessGit(root, ['remote', 'add', 'origin', `http://127.0.0.1:${port}/fixture.git`]);

  // An askpass program that leaves a mark: git runs it when it would ask, and the fix is that it never asks. No global
  // or system configuration, so no credential helper answers in its place on this machine or on a runner.
  const aside = tempDir('snowarch-c190-askpass-', t);
  const marker = join(aside, 'asked');
  const askpass = join(aside, 'askpass.sh');
  writeFileSync(askpass, `#!/bin/sh\necho asked >> '${marker}'\necho\n`);
  chmodSync(askpass, 0o755);
  const empty = join(aside, 'gitconfig');
  writeFileSync(empty, '');
  const env = { ...process.env, GIT_ASKPASS: askpass, GIT_CONFIG_GLOBAL: empty, GIT_CONFIG_NOSYSTEM: '1' };
  for (const k of ['GIT_TERMINAL_PROMPT', 'SSH_ASKPASS', 'GCM_INTERACTIVE']) delete env[k];

  const lines = [];
  const log = { step: (l) => lines.push(l), fail: (l) => lines.push(`FAIL ${l}`),
    warn: (l) => lines.push(`WARN ${l}`), ok: (l) => lines.push(String(l)) };
  const code = await upgradeCommand({ flags: { check: true }, log, root, env, cwd: root });
  const text = lines.join('\n');
  assert.equal(existsSync(marker), false, `git ran the askpass program, so a terminal would have prompted:\n${text}`);
  assert.ok(text.includes(`FAIL ${AUTH_LINE}`), text);
  assert.notEqual(code, 0, text);
  assert.equal(text.includes('releases are published at'), false, `an origin off GitHub got the set-url line:\n${text}`);

  // An install cloned from another GitHub repository, now private: `insteadOf` sends git to the same 401, while the URL
  // the install has configured, the one the product reads, stays the GitHub one. The auth line, then the set-url line.
  const old = 'https://github.com/farstic/old-home.git';
  harnessGit(root, ['remote', 'set-url', 'origin', old]);
  assert.equal(harnessGit(root, ['config', '--get', 'remote.origin.url']), old, 'the origin did not move');
  harnessGit(root, ['config', `url.http://127.0.0.1:${port}/fixture.git.insteadOf`, old]);
  assert.equal(harnessGit(root, ['config', '--get', `url.http://127.0.0.1:${port}/fixture.git.insteadOf`]), old,
    'the insteadOf did not take');
  lines.length = 0;
  const again = await upgradeCommand({ flags: { check: true }, log, root, env, cwd: root });
  const both = lines.join('\n');
  const home = 'https://github.com/farstic/snowarch.git';
  const said = `upgrade: origin is ${old}, and releases are published at ${home} — git remote set-url origin ${home}`;
  assert.equal(existsSync(marker), false, `git ran the askpass program on the GitHub origin:\n${both}`);
  assert.ok(both.includes(`FAIL ${AUTH_LINE}`), both);
  assert.ok(both.includes(said), both);
  assert.ok(both.indexOf(`FAIL ${AUTH_LINE}`) < both.indexOf(said), `the set-url line came before the auth line:\n${both}`);
  assert.notEqual(again, 0, both);
});

test('a prerelease sorts BELOW the release it precedes, and a non-tag is not a tag', () => {
  assert.deepEqual(sortTags(['v1.2.0', 'v1.10.0', 'v1.2.10', 'v0.9.9']).map((t) => t.tag),
    ['v1.10.0', 'v1.2.10', 'v1.2.0', 'v0.9.9']);
  // 10 > 2 by NUMBER, not by string: `v1.10.0` sorting under `v1.2.0` is the classic version of
  // this bug and it would silently offer an older release as the newest.
  assert.equal(sortTags(['v1.2.0', 'v1.10.0'])[0].tag, 'v1.10.0');

  assert.deepEqual(sortTags(['v2.0.0', 'v2.0.0-rc.1']).map((t) => t.tag), ['v2.0.0', 'v2.0.0-rc.1']);
  assert.deepEqual(sortTags(['nightly', 'v', 'v1', 'v1.2', 'release-1.2.3']), []);
  assert.equal(parseSemver('v2.0.0-rc.1').pre, 'rc.1');
  assert.equal(parseSemver('v2.0.0').pre, null);
});

test('the plan block says the five things a reader has to decide from', () => {
  const text = renderPlan({
    from: 'v2.0.0', to: 'v2.1.0', commits: 12, date: '2026-10-14',
    tagInfo: { contract: 'a'.repeat(64), docsPin: 'b'.repeat(40) },
    floor: { line: 'claude-floor 2.1.214 (installed 2.1.260 ok)', below: false },
    steps: [{ step: 'B02', title: 'the documentation corpus', files: ['vendor/docs-areas.txt'] }],
    store: { line: 'store: schema v1 → v1 (no migration)' },
    restart: 'restart claude',
  });
  assert.match(text, /^Upgrade plan: v2\.0\.0 → v2\.1\.0 \(12 commits, 2026-10-14\)$/m);
  assert.match(text, /tag verified: contract aaaaaaa… · docs-pin bbbbbbb · claude-floor 2\.1\.214/);
  assert.match(text, /steps that will re-run: B02 the documentation corpus \(vendor\/docs-areas\.txt changed\)/);
  assert.match(text, /store: schema v1 → v1 \(no migration\)/);
  assert.match(text, /credentials: untouched/);
  // The sha is SHORTENED, never printed whole: a plan is read, and 64 characters of hex in the
  // middle of a sentence is a line nobody finishes.
  assert.equal(text.includes('a'.repeat(64)), false);

  const nothing = renderPlan({
    from: 'v2.0.0', to: 'v2.0.1', commits: 1, date: null,
    tagInfo: {}, floor: { line: null }, steps: [], store: { line: 'store: none' },
  });
  assert.match(nothing, /steps that will re-run: none \(only the preflight and the summary\)/);
  assert.match(nothing, /\(1 commit\)/, 'one commit is not "1 commits"');
  assert.match(nothing, /claude-floor not stated/);
});

test('ARC-11-C6 — U4 says what a release that enforces refuses, and E-31\'s remedy alone', () => {
  const cli = './snowarch';
  const lines = licenceNotice({ licence: { state: 'missing' }, target: 'v2.0.13', cli });
  assert.deepEqual(lines, [
    'Licence: missing — v2.0.13 runs no MCP tool, and no command but licence, doctor, status, version, upgrade, '
      + 'bootstrap and mode design, without a licence in force.',
    REMEDY(cli),
  ]);
  // Every refused state, and any release after the last that runs without one, prereleases included.
  for (const state of ['invalid', 'expired', 'revoked']) {
    assert.ok(licenceNotice({ licence: { state }, target: 'v2.1.0-rc.1', cli }), state);
  }
  // A licence in force says nothing, and nor does a target at or below the last release that enforces nothing.
  for (const state of ['ok', 'expiring']) assert.equal(licenceNotice({ licence: { state }, target: 'v2.0.13', cli }), null);
  for (const target of ['v2.0.12', 'v2.0.9']) {
    assert.equal(licenceNotice({ licence: { state: 'missing' }, target, cli }), null, target);
  }
});

test('ARC-11-C6 — with no licence in force, a move at or below the boundary is refused; licensed or forward, never', () => {
  // The owner's ruling from the rc.3 sitting (2026-10-13). The boundary is internal and never printed.
  assert.equal(LAST_UNENFORCED_RELEASE, 'v2.0.12');
  for (const state of ['missing', 'invalid', 'expired', 'revoked']) {
    for (const target of ['v2.0.12', 'v2.0.12-rc.2', 'v2.0.9', 'v2.0.0']) {
      assert.equal(refusesTarget({ licence: { state }, target }), true, `${state} ${target}`);
    }
    // 2.0.13's prereleases enforce, so they are not a way back; forward is never refused.
    for (const target of ['v2.0.13-rc.3', 'v2.0.13', 'v2.1.0', 'v9.1.0']) {
      assert.equal(refusesTarget({ licence: { state }, target }), false, `${state} ${target}`);
    }
  }
  // A licence in force takes the move: the owner's own way back.
  for (const state of ['ok', 'expiring']) assert.equal(refusesTarget({ licence: { state }, target: 'v2.0.12' }), false);
  // A target this product cannot order is presumed to enforce, as U4's notice presumes.
  assert.equal(refusesTarget({ licence: { state: 'missing' }, target: 'not-a-version' }), false);
});

test('ARC-11-C6 — the refusal names the state and the code, then the remedy, and says nothing of why', () => {
  const cli = './snowarch';
  assert.deepEqual(targetRefusalLines({ licence: { state: 'missing' }, target: 'v2.0.12', cli }), [
    'snowarch upgrade: licence missing (Code: LICENCE_NOT_VALID) — upgrade --to v2.0.12 does not run without a valid '
      + 'licence; nothing was changed',
    REMEDY(cli),
  ]);
  const signed = targetRefusalLines({ licence: { state: 'revoked', signatureValid: true, id: 'LIC-2026-0002' },
    target: 'v2.0.9', cli });
  assert.match(signed[0], /^snowarch upgrade: licence revoked \(LIC-2026-0002\) \(Code: LICENCE_NOT_VALID\)/);
  assert.equal(/runs without|go back|unenforced|without enforcement|last release/i.test(signed.join(' ')), false);
});

test('the cache is the hook\'s contract: three keys that may never be renamed', (t) => {
  const dir = tempDir('snowarch-upgrade-cache-', t);

  const written = writeUpgradeCheck(dir,
    { latestTag: 'v2.1.0', localTag: 'v2.0.0', localDistance: 3, behind: true });
  // SUPERSET, NOT EQUALITY — and the difference is this test's own title. It promises three names
  // that may never be RENAMED; `deepEqual` on the sorted keys froze the whole set at six, so ADDING
  // a field failed a test about removing one. ARC-08-C17's `source` marker did exactly that: the
  // over-assertion was the test's, not the change's, and a test that fails for a property it does
  // not name teaches the next author to delete it rather than to read it.
  //
  // What must never happen is a key going away or changing its spelling under a reader that has no
  // way to notice — the SessionStart hook and the banner both read this file and both fail quietly.
  // A new key beside them breaks nobody. So: everything that has ever been in this file is still in
  // it, by name.
  for (const key of ['behind', 'checkedAt', 'latestTag', 'localDistance', 'localTag', 'remote']) {
    assert.ok(key in written, `${key} left the cache — something reads it and will not say so`);
  }
  // …and the three of them the banner reads, named again with the story that owns them, because
  // that is the promise in the title.
  for (const key of ['behind', 'latestTag', 'checkedAt']) {
    assert.ok(key in written, `${key} is the banner's contract (ARC-08-S08)`);
  }
  assert.equal(readUpgradeCheck(dir).latestTag, 'v2.1.0');
  if (!isWindows) assert.equal(statSync(cachePath(dir)).mode & 0o777, 0o600);

  // A malformed file is an ABSENT one — the hook reads this on every session start and must not
  // be the thing that breaks one.
  writeFileSync(cachePath(dir), '{ half written');
  assert.equal(readUpgradeCheck(dir), null);
  writeFileSync(cachePath(dir), '{"latestTag":"v9"}');
  assert.equal(readUpgradeCheck(dir), null, 'a file with no `behind` is not an answer');
});

test('freshness: a week old is silence, and a clock that went backwards is too', () => {
  const at = (ms) => ({ behind: true, latestTag: 'v1', checkedAt: new Date(ms).toISOString() });
  const now = () => new Date(1_000_000_000_000);

  assert.equal(isFresh(at(1_000_000_000_000 - 1000), { now }), true);
  assert.equal(isFresh(at(1_000_000_000_000 - MAX_AGE_MS + 1000), { now }), true);
  assert.equal(isFresh(at(1_000_000_000_000 - MAX_AGE_MS - 1000), { now }), false);
  assert.equal(isFresh(at(1_000_000_000_000 + 60_000), { now }), false, 'a check from the future');
  assert.equal(isFresh({ behind: true }, { now }), false, 'no checkedAt is not fresh');
  assert.equal(isFresh(null, { now }), false);

  // The doctor refreshes on a different, shorter clock than the banner trusts: a day versus a week,
  // so a daily doctor keeps the nudge alive and a checkout nobody runs the doctor in goes quiet.
  assert.ok(REFRESH_AFTER_MS < MAX_AGE_MS);
  assert.equal(needsRefresh(at(1_000_000_000_000 - 2 * REFRESH_AFTER_MS), { now }), true);
  assert.equal(needsRefresh(at(1_000_000_000_000 - 1000), { now }), false);
});

/**
 * ARC-09-C46 — U7 named a number and not what it counted.
 *
 * The owner's rc.4 → rc.5 upgrade printed `[U7/7] doctor` and then `DOCTOR: 31 ok, 3 warn, 1 fail
 * (4 skip)` and the Mode line, nothing else. They had to run `./snowarch doctor` a second time to
 * learn the failure was E-27. The lines were in the parsed report the whole time and were dropped
 * with it — ARC-08-C3's defect one command over, and B09 had already fixed it for the bootstrap.
 *
 * So the renderer is B09's, imported rather than re-typed, and the tally now lives INSIDE the same
 * function as the lines. That is the part that closes the row: the two were separable, and for one
 * release a caller printed the number and skipped the list. There is nothing left to skip.
 */
const REPORT = {
  summary: { ok: 31, warn: 3, fail: 1, skip: 4 },
  checks: [
    { id: 'E-01', status: 'ok', title: 'node' },
    { id: 'E-28', status: 'warn', title: 'release currency', detail: 'v9.9.8 available',
      remedy: './snowarch upgrade' },
    { id: 'E-27', status: 'fail', title: 'Claude Code registration status',
      detail: 'design-only is not in force: a local-scope entry keeps the server loaded',
      remedy: './snowarch mode design' },
    { id: 'E-30', status: 'warn', title: 'proxy' },
    { id: 'E-40', status: 'skip', title: 'network' },
  ],
};

test('ARC-09-C46 — U7 prints the tally AND every check it counted, failures first', () => {
  const lines = doctorLines(REPORT);

  assert.equal(lines[0], 'DOCTOR: 31 ok, 3 warn, 1 fail (4 skip)',
    'the tally must survive the fix — this row adds to U7, it does not replace what was there');

  // THE DEFECT, named: a reader must be able to act without running the doctor again.
  assert.equal(lines[1],
    'E-27 FAIL Claude Code registration status: design-only is not in force: a local-scope entry '
    + 'keeps the server loaded — ./snowarch mode design',
    'the failing check is not named with its remedy on the line after the tally');

  // Failures FIRST: a reader scanning for what stopped them should not pass two warnings to reach
  // it. E-28 appears before E-30 in the report and after E-27 here, which is the whole ordering.
  assert.deepEqual(lines.slice(2).map((l) => l.split(' ')[0]), ['E-28', 'E-30']);
  assert.match(lines[2], /E-28 WARN release currency: v9\.9\.8 available — \.\/snowarch upgrade/);

  // A check with no detail and no remedy still gets a line — its ID and title are the point.
  assert.equal(lines[3], 'E-30 WARN proxy');

  // `ok` and `skip` are NOT printed: 31 ok lines would bury the one that matters, and a skip is
  // already reported by the doctor's own run. The tally still counts them, which is its job.
  assert.equal(lines.length, 4);
  assert.equal(lines.filter((l) => /E-01|E-40/.test(l)).length, 0);
});

test('ARC-09-C46 control — the tally cannot be printed without its lines', () => {
  // NON-VACUITY AND THE CLOSED PATH IN ONE. The defect was a caller that could take the number and
  // leave the list. There is now no way to ask for one: a report with failures always renders more
  // than one line, and the count is index 0 of the same array.
  assert.ok(doctorLines(REPORT).length > 1,
    'the tally is separable from its lines again — this is exactly the C46 defect');

  // A healthy report is still ONE line, or every clean upgrade grows noise it has no reason to.
  const healthy = { summary: { ok: 35, warn: 0, fail: 0, skip: 4 }, checks: [
    { id: 'E-01', status: 'ok', title: 'node' }] };
  assert.deepEqual(doctorLines(healthy), ['DOCTOR: 35 ok, 0 warn, 0 fail (4 skip)']);

  // And the shapes that reach this on a bad day. A doctor whose JSON did not parse is `null`, and
  // U7 must print nothing rather than `DOCTOR: undefined ok` — the caller's `if (report?.summary)`
  // guard used to live at the call site, so moving it had to bring the behaviour with it.
  assert.deepEqual(doctorLines(null), []);
  assert.deepEqual(doctorLines({}), []);
  assert.deepEqual(doctorLines({ summary: { ok: 1, warn: 0, fail: 0, skip: 0 } }),
    ['DOCTOR: 1 ok, 0 warn, 0 fail (0 skip)'], 'a summary with no checks array must not throw');
});

test('ARC-09-C46 — B09 keeps the output it had, which is why the renderer could be shared', () => {
  // BOTH DIRECTIONS. `failureLines` is B09's view and is now defined over `nonOkLines`; if that
  // refactor had changed what the bootstrap prints, this row would have broken B09's summary to
  // fix U7's. Fail-only, and byte-identical to the template it replaced.
  assert.deepEqual(failureLines(REPORT), [
    'E-27 FAIL Claude Code registration status: design-only is not in force: a local-scope entry '
    + 'keeps the server loaded — ./snowarch mode design',
  ]);
  assert.equal(failureLines(REPORT).length, 1, 'a warning reached B09\'s failure list');
  assert.deepEqual(failureLines({ checks: [] }), []);
  assert.deepEqual(failureLines(null), []);

  // The two views share one implementation, so the fail line must be the same string in both.
  assert.equal(failureLines(REPORT)[0], doctorLines(REPORT)[1]);
});

// ─── ARC-09-C53 — U7's Mode line is the user's words, not the JSON boundary's mask ─────────────
//
// U7 printed `Mode: live — instance=<label> (<label>) preset=custom …` while `./snowarch doctor`
// a second later printed `instance=pdi (pdi)` (owner's sitting, 2026-09-23).
//
// `<label>` is NOT an unfilled template. It is `LABEL_MASK` from `doctor/json-boundary.mjs`, and the
// masking is deliberate and correct: `--json` is the form that TRAVELS — an issue template asks a
// stranger to paste it — so labels and hosts leave as `<label>` / `<host>`. The bug is that U7 runs
// `doctor --json`, parses the masked stdout, and prints its `modeLine` to the user's own terminal,
// where the mask is not wanted and the reader owns the words.
//
// The unmasked line is already on disk: `doctor/index.mjs` caches the report at line 331 BEFORE
// `maskForJson` is applied at 514/543, and U7 already passes `--write-cache`. So this is a matter of
// reading the line from the copy meant for this machine rather than the copy meant to be pasted.
import { finish } from '../../tools/snowarch/lib/commands/upgrade.mjs';
import { CACHE_FILE } from '../../tools/snowarch/lib/doctor-cache.mjs';

const MASKED = 'Mode: live — instance=<label> (<label>) preset=custom — doctor 2026-09-24 14 ok';
const REAL = 'Mode: live — instance=pdi (pdi) preset=custom — doctor 2026-09-24 14 ok';

/** A tree whose doctor cache carries the UNMASKED line, as the real doctor writes it. */
function treeWithCache(t, modeLine = REAL) {
  const root = tempDir('snowarch-u7-', t);
  mkdirSync(join(root, dirname(CACHE_FILE)), { recursive: true });
  writeFileSync(join(root, CACHE_FILE), JSON.stringify({
    version: 1, at: '2026-09-24T12:00:00.000Z', writer: 'doctor', mode: 'live',
    modeLine, checks: [], summary: { ok: 14, warn: 1, fail: 0, skip: 25 },
  }));
  return root;
}

/** U7 with the doctor stubbed: bootstrap succeeds, the doctor prints MASKED json on stdout. */
async function runU7(root, { modeLine = MASKED } = {}) {
  const lines = [];
  const log = { step: (l) => lines.push(l), fail: (l) => lines.push(l), warn: (l) => lines.push(l) };
  const run = (_cmd, args) => (args.includes('doctor')
    ? { status: 0, stdout: JSON.stringify({ mode: 'live', modeLine,
      summary: { ok: 14, warn: 1, fail: 0, skip: 25 }, checks: [] }) }
    : { status: 0 });
  await finish({ root, env: {}, log, run, target: 'v9.1.0', latest: 'v9.1.0',
    remote: 'origin', now: () => new Date('2026-09-24T12:00:00.000Z'), state: { mode: 'live' } });
  return lines;
}

test('ARC-09-C53 — U7 prints the label the user owns, not the JSON boundary\'s mask', async (t) => {
  const root = treeWithCache(t);
  const lines = await runU7(root);
  const mode = lines.find((l) => l.startsWith('Mode:')) ?? '';
  assert.notEqual(mode, '', `U7 printed no Mode line at all: ${JSON.stringify(lines)}`);
  assert.equal(mode.includes('<label>'), false,
    `U7 printed the JSON boundary's mask to the user's terminal: ${mode}`);
  assert.match(mode, /instance=pdi \(pdi\)/,
    'U7 did not print the instance label the doctor cached for this machine');
});

test('ARC-09-C53 — with no cached line, U7 says nothing rather than printing a mask', async (t) => {
  // The degradation that matters: a masked line is worse than no line, because it reads as a value.
  const root = tempDir('snowarch-u7-nocache-', t);
  const lines = [];
  const log = { step: (l) => lines.push(l), fail: (l) => lines.push(l), warn: (l) => lines.push(l) };
  const run = (_cmd, args) => (args.includes('doctor')
    ? { status: 0, stdout: JSON.stringify({ mode: 'live', modeLine: MASKED,
      summary: { ok: 1, warn: 0, fail: 0, skip: 0 }, checks: [] }) }
    : { status: 0 });
  await finish({ root, env: {}, log, run, target: 'v9.1.0', latest: 'v9.1.0', remote: 'origin',
    now: () => new Date('2026-09-24T12:00:00.000Z'), state: { mode: 'live' } });
  assert.equal(lines.some((l) => l.includes('<label>')), false,
    `a mask reached the user's terminal with no cache to read: ${JSON.stringify(lines)}`);
});

// ─── ARC-09-C53, second half — the cached line must be THIS run's ─────────────────────────────
//
// Reading the cache fixed the mask and introduced the defect one layer down: `readCachedModeLine`
// had no notion of WHICH run wrote the file. Every bootstrapped tree carries a cache from an earlier
// doctor, so when U7's own doctor FAILED — the upgrade that broke something, the moment the closing
// line matters most — U7 closed with yesterday's line, tally and all, as if it had just been
// measured:
//
//     Mode: live — instance=old-pdi (old-pdi) preset=custom — doctor 2026-09-23 12 ok
//
// That is ARC-07-C9's class exactly (a recorded value rendered as fresh), one step from where it was
// just fixed — and the same split B09 gets right and U7 got wrong. So the read is bound to this run:
// the doctor exited 0, its report parsed, it reported no `cacheError`, and the cache was written at
// or after the moment U7 started it. Anything else is silence, because a stale line reads as a
// measurement.

/** U7 with a cache of a given age and a doctor of a given outcome. */
async function u7With(t, { cacheAt, modeLine, doctorStatus = 0, cacheError = null,
  startedAt = '2026-09-24T12:00:00.000Z' }) {
  const root = tempDir('snowarch-u7-age-', t);
  mkdirSync(join(root, dirname(CACHE_FILE)), { recursive: true });
  writeFileSync(join(root, CACHE_FILE), JSON.stringify({
    version: 1, at: cacheAt, writer: 'doctor', mode: 'live', modeLine,
    checks: [], summary: { ok: 12, warn: 0, fail: 0, skip: 0 },
  }));
  const lines = [];
  const log = { step: (l) => lines.push(l), fail: (l) => lines.push(l), warn: (l) => lines.push(l) };
  const run = (_cmd, args) => (args.includes('doctor')
    ? { status: doctorStatus,
      stdout: doctorStatus === 0
        ? JSON.stringify({ mode: 'live', modeLine: MASKED, summary: { ok: 14, warn: 0, fail: 0, skip: 0 },
          checks: [], ...(cacheError ? { cacheError } : {}) })
        : '' }
    : { status: 0 });
  await finish({ root, env: {}, log, run, target: 'v9.1.0', latest: 'v9.1.0', remote: 'origin',
    now: () => new Date(startedAt), state: { mode: 'live' } });
  return lines.filter((l) => l.startsWith('Mode:'));
}

const YESTERDAY = 'Mode: live — instance=old-pdi (old-pdi) preset=custom — doctor 2026-09-23 12 ok';

test('ARC-09-C53 — a doctor that FAILED does not get to print yesterday\'s Mode line', async (t) => {
  const modes = await u7With(t, { cacheAt: '2026-09-23T09:00:00.000Z', modeLine: YESTERDAY,
    doctorStatus: 1 });
  assert.deepEqual(modes, [],
    `U7 closed a failed upgrade with a stale line as if measured now: ${modes.join(' | ')}`);
});

test('ARC-09-C53 — a doctor that could not write its cache does not print the old one', async (t) => {
  const modes = await u7With(t, { cacheAt: '2026-09-23T09:00:00.000Z', modeLine: YESTERDAY,
    cacheError: 'EACCES: permission denied' });
  assert.deepEqual(modes, [], `a stale line was printed after a cacheError: ${modes.join(' | ')}`);
});

test('ARC-09-C53 — a cache older than this run is not this run, even with a healthy doctor', async (t) => {
  const modes = await u7With(t, { cacheAt: '2026-09-23T09:00:00.000Z', modeLine: YESTERDAY });
  assert.deepEqual(modes, [], `a cache from yesterday was printed as this run: ${modes.join(' | ')}`);
});

test('ARC-09-C53 — a cache written AT the start instant counts as this run', async (t) => {
  // Equality matters: the doctor stamps the cache from its own clock, and a run fast enough to land
  // on the same millisecond must not be discarded as stale.
  const fresh = 'Mode: live — instance=pdi (pdi) preset=custom — doctor 2026-09-24 14 ok';
  const modes = await u7With(t, { cacheAt: '2026-09-24T12:00:00.000Z', modeLine: fresh });
  assert.deepEqual(modes, [fresh]);
});

// ─── ARC-09-C56 — the non-ok lines come from the same cache, for the same reason ───────────────
//
// C53 fixed the Mode line and left the lines under it reading from the masked `--json` stdout. The
// spike (docs/spikes/nonoklines-mask-options.md) measured what that costs, and the REMEDY is the
// sharper half — C53 recorded this as a masked *detail*, which under-reported it:
//
//   today   SV-03 WARN instances: instances: <label>: … — ./snowarch instance test <label>
//   truth   SV-03 WARN instances: instances: pdi: …     — ./snowarch instance test pdi
//
// A detail that says `<label>` is a fact rendered vaguely. A REMEDY that says `<label>` is a
// command-shaped string that fails when pasted, in the one place the product is telling somebody
// what to do next. `./snowarch instance test <label>` is not a command.
//
// Same cache, same four-condition binding, ONE definition of freshness — not a second rule. The
// tally still comes from the parsed stdout, because a tally is a count and carries no label: the
// split B09 gets right, and the one U7 got wrong twice.

/** A cache whose checks carry what THIS machine's doctor actually saw — labels and all. */
function treeWithCachedChecks(t, checks, { at = '2026-09-24T12:00:00.000Z' } = {}) {
  const root = tempDir('snowarch-u7-checks-', t);
  mkdirSync(join(root, dirname(CACHE_FILE)), { recursive: true });
  writeFileSync(join(root, CACHE_FILE), JSON.stringify({
    version: 1, at, writer: 'doctor', mode: 'live', modeLine: REAL,
    checks, summary: { ok: 14, warn: checks.length, fail: 0, skip: 25 },
  }));
  return root;
}

/** The cached copy: unmasked, and WITHOUT `title` — the cache stores `{id,status,detail,remedy?}`. */
const CACHED_SV03 = { id: 'SV-03', status: 'warn',
  detail: 'instances: pdi: flags explicit, preset custom',
  remedy: './snowarch instance test pdi' };

/** What the doctor's `--json` stdout carries for the same check: masked by value, title included. */
const MASKED_SV03 = { id: 'SV-03', status: 'warn', title: 'instances',
  detail: 'instances: <label>: flags explicit, preset custom',
  remedy: './snowarch instance test <label>' };

/** U7 with a cache and a stdout that DISAGREE — which copy reaches the terminal is the whole test. */
async function u7Checks(t, { cached = [CACHED_SV03], stdout = [MASKED_SV03],
  doctorStatus = 0, cacheError = null, at = '2026-09-24T12:00:00.000Z' } = {}) {
  const root = treeWithCachedChecks(t, cached, { at });
  const lines = [];
  const log = { step: (l) => lines.push(l), fail: (l) => lines.push(l), warn: (l) => lines.push(l) };
  const run = (_cmd, args) => (args.includes('doctor')
    ? { status: doctorStatus,
      stdout: doctorStatus === 0
        ? JSON.stringify({ mode: 'live', modeLine: MASKED,
          summary: { ok: 14, warn: stdout.length, fail: 0, skip: 25 }, checks: stdout,
          ...(cacheError ? { cacheError } : {}) })
        : '' }
    : { status: 0 });
  await finish({ root, env: {}, log, run, target: 'v9.1.0', latest: 'v9.1.0', remote: 'origin',
    now: () => new Date('2026-09-24T12:00:00.000Z'), state: { mode: 'live' } });
  return lines;
}

test('ARC-09-C56 — the remedy U7 prints is one a user can paste', async (t) => {
  const lines = await u7Checks(t);
  const sv03 = lines.find((l) => l.startsWith('SV-03')) ?? '';
  assert.notEqual(sv03, '', `U7 printed no SV-03 line at all: ${JSON.stringify(lines)}`);

  // THE POINT OF THE ROW: the remedy is text the reader is meant to TYPE.
  assert.match(sv03, /— \.\/snowarch instance test pdi$/,
    `the remedy is not pasteable — it still carries the JSON boundary's mask: ${sv03}`);
  assert.equal(sv03.includes('<label>'), false,
    `a mask reached the user's own terminal: ${sv03}`);

  // The title is the registry's, resolved by id, because the cache does not store it.
  assert.equal(sv03,
    'SV-03 WARN instances: instances: pdi: flags explicit, preset custom '
    + '— ./snowarch instance test pdi');
});

test('ARC-09-C56 — the tally still comes from the run, not from the cache', async (t) => {
  // A tally is a count and carries no label, so it has no reason to move — and if it did, it would
  // be the CACHE's tally, which is a different run's. This is the half C53 got right.
  const lines = await u7Checks(t);
  assert.ok(lines.includes('DOCTOR: 14 ok, 1 warn, 0 fail (25 skip)'),
    `the tally moved or changed: ${JSON.stringify(lines.filter((l) => l.startsWith('DOCTOR')))}`);
});

test('ARC-09-C56 — a check the registry cannot name prints its id, never `undefined`', async (t) => {
  // The bounded risk the spike measured: `registry.mjs` refuses id reuse, so an unresolvable id can
  // only ever mean a RETIRED check — never the wrong title. The fallback is one line.
  const retired = { id: 'SV-99', status: 'warn', detail: 'a check that no longer exists',
    remedy: './snowarch doctor' };
  const lines = await u7Checks(t, { cached: [retired], stdout: [{ ...retired, title: 'gone' }] });
  const sv99 = lines.find((l) => l.startsWith('SV-99')) ?? '';
  assert.notEqual(sv99, '', `the retired check lost its line entirely: ${JSON.stringify(lines)}`);
  assert.equal(sv99.includes('undefined'), false, `\`undefined\` reached the terminal: ${sv99}`);
  assert.equal(sv99, 'SV-99 WARN: a check that no longer exists — ./snowarch doctor');
});

// The four-condition binding is C53's, reused — not restated. Each case is a way the cached lines
// could be about a DIFFERENT run, and the answer is the masked stdout rather than a wrong label:
// a mask is vague, a stale label is false.

test('ARC-09-C56 — a doctor that FAILED does not get yesterday\'s non-ok lines', async (t) => {
  const lines = await u7Checks(t, { doctorStatus: 1 });
  assert.equal(lines.some((l) => l.includes('pdi')), false,
    `a failed doctor printed the cache's labels as this run's: ${JSON.stringify(lines)}`);
});

test('ARC-09-C56 — a cacheError means the cache is not this run\'s, lines included', async (t) => {
  const lines = await u7Checks(t, { cacheError: 'EACCES: permission denied' });
  const sv03 = lines.find((l) => l.startsWith('SV-03')) ?? '';
  assert.equal(sv03.includes('pdi'), false,
    `the old cache's labels were printed after a cacheError: ${sv03}`);
});

test('ARC-09-C56 — a cache older than this run is not this run', async (t) => {
  const lines = await u7Checks(t, { at: '2026-09-23T09:00:00.000Z' });
  const sv03 = lines.find((l) => l.startsWith('SV-03')) ?? '';
  assert.equal(sv03.includes('pdi'), false,
    `yesterday's labels were printed as this run's measurement: ${sv03}`);
  // ...and the line is still THERE, from the stdout — silence would lose the check entirely.
  assert.match(sv03, /^SV-03 WARN/, `the check lost its line instead of falling back: ${sv03}`);
});

/**
 * ARC-07-C39 — U5's return hint names a ref the checkout actually has.
 *
 * `git checkout main` is what it said, and a clone made with `--branch v2.0.5` has no local `main`: the
 * command handed to a reader mid-upgrade failed with `error: pathspec 'main' did not match any file(s) known
 * to git`. The assertion is NOT that the sentence matches a string — that is how a wrong command passes a
 * test that reads it back — but that the ref this chooses RESOLVES in a repository of that shape.
 */
test('ARC-07-C39 — the return ref resolves in a tag-only checkout, and a branch still wins', (t) => {
  const dir = tempDir('c39-', t);
  // THE HARNESS'S WRAPPER, not `execFileSync` — ARC-09-C27b, and `harness-shape` caught my first version:
  // every git call under `tests/upgrade/` carries `core.longpaths` because the Windows cells need it, and a
  // direct call is a path length away from failing there and nowhere else. The wrapper also supplies the
  // fixture identity, so a runner with no git author still commits.
  const git = (...args) => harnessGit(dir, args);

  initFixtureRepo((args) => git(...args), dir, ['--quiet', '-b', 'trunk']);
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'one');
  git('tag', '-a', 'v2.0.5', '-m', 'v2.0.5');
  writeFileSync(join(dir, 'a.txt'), 'two\n');
  git('commit', '--quiet', '-am', 'two');
  git('tag', '-a', 'v2.0.6', '-m', 'v2.0.6');

  // THE SHAPE THE ROW NAMES: detached at a tag, no local `main`.
  git('checkout', '--quiet', '--detach', 'v2.0.5');
  const detached = branchState(dir);
  assert.equal(detached.branch, null, 'the fixture is not detached — the case is not testing the shape');
  assert.equal(harnessGit(dir, ['rev-parse', '--verify', 'main'], { allowFail: true }), null,
    'this fixture HAS a local main, so it cannot show the defect');

  const ref = returnRef(detached, describe(dir));
  assert.equal(ref, 'v2.0.5', `the hint names ${ref}, which is not where HEAD was`);
  // THE PROPERTY THAT MATTERS: the command runs, and it leaves git where it said it would.
  git('checkout', '--quiet', 'v2.0.6');
  git('checkout', '--quiet', ref);
  assert.equal(describe(dir)?.name, 'v2.0.5', 'following the hint did not return to the ref it named');

  // ...and a reader who WAS on a branch is still sent to their branch, so the fix is not "always the tag".
  git('checkout', '--quiet', 'trunk');
  assert.equal(returnRef(branchState(dir), describe(dir)), 'trunk');

  // ...and with no tag at all the sha is the floor, because a sha always resolves.
  const bare = { branch: null, short: detached.sha.slice(0, 7), sha: detached.sha };
  assert.equal(returnRef(bare, null), detached.sha.slice(0, 7));
});

test('ARC-07-C39 — the hint says the store is untouched, which is the reader\'s real question', () => {
  // A remedy that moves HEAD and says nothing about the instance store invites a reader mid-upgrade to go
  // looking for their credentials. The answer is that `.local/` is ignored by git, so no checkout touches it.
  // ARC-09-C203 moved the sentence into returnLine; the call site still prints the store line right after it.
  const source = readFileSync(join(REPO, 'tools/snowarch/lib/commands/upgrade.mjs'), 'utf8');
  const call = source.indexOf('log.step(returnLine(');
  assert.ok(call > 0, 'U5 no longer prints its return line through returnLine');
  assert.match(source.slice(call, call + 400), /\.local\/, which git ignores/);
  const line = source.slice(source.indexOf('export function returnLine'));
  assert.doesNotMatch(line.slice(0, line.indexOf('\n}\n')), /git checkout main/,
    'the hint still hard-codes `main`, which a tag clone does not have');
});

test('ARC-09-C196 — at the tag itself, a plan that cannot check the tag out lists nothing: "up to date" holds', async (t) => {
  // The at-target path asks planSteps whether a stopped move left steps to run. When the tag cannot be checked out
  // into a worktree, planSteps falls back to the file diff, and at HEAD == tag that diff is empty: the answer
  // degrades to today's "up to date", never to a "continuing" nothing can finish.
  const { planSteps } = await import('../../tools/snowarch/lib/commands/upgrade.mjs');
  const root = tempDir('snowarch-c196-plan-', t);
  initFixtureRepo((args) => harnessGit(root, args), root, ['-q', '-b', 'main']);
  writeFileSync(join(root, 'engine.config.json'), readFileSync(join(REPO, 'engine.config.json')));
  harnessGit(root, ['add', 'engine.config.json']);
  harnessGit(root, ['commit', '-q', '-m', 'fixture']);
  harnessGit(root, ['tag', 'v1.0.0']);
  const config = JSON.parse(readFileSync(join(REPO, 'engine.config.json'), 'utf8'));
  const worktrees = [];
  const run = (cmd, args) => { if (args[0] === 'worktree') worktrees.push(args); return { status: 1 }; };
  const plan = planSteps(root, 'v1.0.0', { ctx: { root, config }, state: {}, run });
  assert.equal(worktrees.length, 1, 'planSteps never tried the worktree, so the fallback was not what answered');
  assert.deepEqual(plan, { steps: [], estimate: true });
});

test('ARC-09-C196 — every status a step entry can carry has its verdict, on U4\'s path and at the tag', async () => {
  // The statuses written, as measured: the runner's ok, warn and fail (steps/index.mjs:202, the catch at :189),
  // `skipped` when runsWhen declined (:125), and interrupt()'s `failed` with reason `interrupted` (:260). A status
  // `interrupted` is read for older states; nothing in this tree writes it. null = judged by its hash and outputs.
  const { statusVerdict } = await import('../../tools/snowarch/lib/commands/upgrade.mjs');
  const table = [
    [undefined, 'never recorded', 'never recorded'],
    [{ status: 'ok' }, null, null],
    [{ status: 'warn' }, 'last run warned', null],
    [{ status: 'fail' }, 'last run did not finish', 'last run did not finish'],
    [{ status: 'failed', reason: 'interrupted' }, 'last run interrupted', 'last run interrupted'],
    [{ status: 'failed' }, 'last run did not finish', 'last run did not finish'],
    [{ status: 'interrupted' }, 'last run interrupted', 'last run interrupted'],
    [{ status: 'skipped' }, 'last run skipped it', 'last run skipped it'],
    // A status this table does not name is unfinished, the runner's own rule for anything not ok.
    [{ status: 'something-new' }, 'last run did not finish', 'last run did not finish'],
  ];
  for (const [recorded, atU4, atTag] of table) {
    assert.equal(statusVerdict(recorded, { warnIsDone: false }), atU4, `U4: ${JSON.stringify(recorded)}`);
    assert.equal(statusVerdict(recorded, { warnIsDone: true }), atTag, `at the tag: ${JSON.stringify(recorded)}`);
  }
});

test('ARC-09-C203 — after a move below the first distributed release, the line names a fresh install', async () => {
  // The D3 drill: from v2.2.1-rc.2, `--to v2.2.0`, and the printed `upgrade --to v2.2.1-rc.2` was refused, because it
  // runs under v2.2.0's code, which predates ARC-09-C192. No harness world can hold such a target: its tags all carry
  // today's code. So the line is checked here, with the boundary named, and the C194 e2e covers the call site.
  const { returnLine } = await import('../../tools/snowarch/lib/commands/upgrade.mjs');
  // The launcher is a neutral placeholder, as originLine's cases pass one: the line's logic is under test, not a spelling.
  const manifest = { entry: {} };
  const at = (here, target, over = {}) => returnLine({ cli: 'CLI', here, target, manifest, returnTo: 'main',
    distributionFrom: '2.2.1', ...over });
  const fresh = (target, here) => `HEAD is detached at ${target} — ${target} checks releases by its own older rule: `
    + `return to ${here} by a fresh install (docs/MIGRATION.md)`;
  assert.equal(at('v2.2.1-rc.2', 'v2.2.0'), fresh('v2.2.0', 'v2.2.1-rc.2'));
  // A 2.2.1 release candidate compares below 2.2.1 and is counted with it: rc.1 predates C192.
  assert.equal(at('v2.2.1', 'v2.2.1-rc.1'), fresh('v2.2.1-rc.1', 'v2.2.1'));
  // Exactly at the boundary is not below.
  assert.equal(at('v2.2.2', 'v2.2.1'), 'HEAD is detached at v2.2.1 — return with: CLI upgrade --to v2.2.2');
  assert.equal(at('v9.0.0', 'v9.1.0'), 'HEAD is detached at v9.1.0 — return with: CLI upgrade --to v9.0.0');
  // No manifest, or a tree that was on no release: git takes it back, as before.
  assert.equal(at('v2.2.1-rc.2', 'v2.2.0', { manifest: null }), 'HEAD is detached at v2.2.0 — return with: git checkout main');
  assert.equal(at(null, 'v9.1.0'), 'HEAD is detached at v9.1.0 — return with: git checkout main');
  // Without the argument, the boundary is DISTRIBUTION_FROM.
  assert.equal(returnLine({ cli: 'CLI', here: 'v2.2.1-rc.2', target: 'v2.2.0', manifest, returnTo: 'main' }),
    fresh('v2.2.0', 'v2.2.1-rc.2'));
});

// ── ARC-09-C201 — a tag that is not there, told apart from a tag that is no release ─────────────────────────────────
//
// U3 said "<x> is not a release tag of this product" both when the tag was absent and when it carried no contract
// trailer. On an install from github.com/farstic/snowarch, which carries finals only, `--to` an rc or a release before
// 2.2.1 meets an absent tag and was told the other cause.

/**
 * A distribution-shaped world: an origin holding one release and one tag that is no release, and an install cloned
 * from it. The install's origin URL is `url`, github.com/<config.repo> unless given, and `insteadOf` sends git to the
 * origin on disk while the URL the product reads stays the one an install has.
 */
function missingTagWorld(t, url = null) {
  const config = JSON.parse(readFileSync(join(REPO, 'engine.config.json'), 'utf8'));
  const origin = tempDir('snowarch-c201-origin-', t);
  initFixtureRepo((args) => harnessGit(origin, args), origin, ['-q', '-b', 'main']);
  writeFileSync(join(origin, 'engine.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(origin, 'package.json'), `${JSON.stringify({ name: 'fixture', version: '9.1.0' }, null, 2)}\n`);
  harnessGit(origin, ['add', '-A']);
  harnessGit(origin, ['commit', '-q', '-m', 'the release']);
  const trailers = [`contract: ${'a'.repeat(64)}`, `docs-pin: ${'b'.repeat(40)}`].join('\n');
  harnessGit(origin, ['tag', '-a', 'v9.1.0', '-m', `snowarch v9.1.0\n\n${trailers}`]);
  harnessGit(origin, ['tag', '-a', 'v9.5.0', '-m', 'snowarch v9.5.0\n\na tag, with no contract trailer']);
  const user = tempDir('snowarch-c201-user-', t);
  harnessGit(dirname(user), ['clone', '-q', origin, user]);
  const own = url ?? `https://github.com/${config.repo}.git`;
  harnessGit(user, ['remote', 'set-url', 'origin', own]);
  if (own !== origin) harnessGit(user, ['config', `url.${pathToFileURL(origin).href}.insteadOf`, own]);
  return { user, config, origin };
}

/** `upgrade --to <target> --yes` in the world, with no global or system git configuration, and what it said. */
async function upgradeTo(t, w, target) {
  const empty = join(tempDir('snowarch-c201-home-', t), 'gitconfig');
  writeFileSync(empty, '');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: empty, GIT_CONFIG_NOSYSTEM: '1' };
  const lines = [];
  const log = { step: (l) => lines.push(l), fail: (l) => lines.push(`FAIL ${l}`),
    warn: (l) => lines.push(`WARN ${l}`), ok: (l) => lines.push(String(l)) };
  const head = harnessGit(w.user, ['rev-parse', 'HEAD']);
  const code = await upgradeCommand({ flags: { to: target, yes: true }, log, root: w.user, env, cwd: w.user });
  assert.equal(harnessGit(w.user, ['rev-parse', 'HEAD']), head, 'the tree moved');
  return { code, text: lines.join('\n') };
}

const NOT_RELEASE = (x) => `FAIL upgrade: ${x} is not a release tag of this product`;
const NOT_THERE = (x, repo) => `FAIL upgrade: ${x} is not a tag of github.com/${repo}, which carries final releases `
  + 'from 2.2.1 on';
const NOT_IN_ORIGIN = (x) => `FAIL upgrade: ${x} is not a tag of this checkout's origin`;

for (const [what, target] of [['a release candidate', 'v9.5.0-rc.1'], ['a release older than the first final', 'v9.0.0']]) {
  test(`ARC-09-C201 — ${what} that the releases' repository does not hold is named as not there`, async (t) => {
    const w = missingTagWorld(t);
    const r = await upgradeTo(t, w, target);
    assert.equal(r.code, 1, r.text);
    assert.ok(r.text.includes(NOT_THERE(target, w.config.repo)), r.text);
    assert.equal(r.text.includes(NOT_RELEASE(target)), false, `told the other cause:\n${r.text}`);
  });
}

test('ARC-09-C201 — a tag that is there but carries no contract keeps its sentence', async (t) => {
  const w = missingTagWorld(t);
  const r = await upgradeTo(t, w, 'v9.5.0');
  assert.equal(r.code, 1, r.text);
  assert.ok(r.text.includes(NOT_RELEASE('v9.5.0')), r.text);
});

test('ARC-09-C201 — the control: a release tag passes the tag check', async (t) => {
  const w = missingTagWorld(t);
  const r = await upgradeTo(t, w, 'v9.1.0');
  for (const line of [NOT_RELEASE('v9.1.0'), NOT_THERE('v9.1.0', w.config.repo), NOT_IN_ORIGIN('v9.1.0')]) {
    assert.equal(r.text.includes(line), false, `a release tag was refused as a tag:\n${r.text}`);
  }
});

test('ARC-09-C201 — on any other origin, an absent tag is not a tag of this checkout\'s origin', async (t) => {
  // An engineering-shaped origin: a path, no GitHub, no insteadOf.
  const engineering = missingTagWorld(t, null);
  harnessGit(engineering.user, ['remote', 'set-url', 'origin', engineering.origin]);
  const r = await upgradeTo(t, engineering, 'v9.5.0-rc.1');
  assert.equal(r.code, 1, r.text);
  assert.ok(r.text.includes(NOT_IN_ORIGIN('v9.5.0-rc.1')), r.text);
});

test('ARC-09-C201 — an origin URL that carries a credential prints neither it nor the host', async (t) => {
  const w = missingTagWorld(t, 'https://someone:tok3n-c201@git.example.invalid/snowarch.git');
  const r = await upgradeTo(t, w, 'v9.5.0-rc.1');
  assert.equal(r.code, 1, r.text);
  assert.ok(r.text.includes(NOT_IN_ORIGIN('v9.5.0-rc.1')), r.text);
  for (const leak of ['tok3n-c201', 'someone', 'git.example.invalid']) {
    assert.equal(r.text.includes(leak), false, `the origin URL reached the output (${leak}):\n${r.text}`);
  }
});
