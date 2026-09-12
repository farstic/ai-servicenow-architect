// ARC-09-S04 — what `./snowarch version` says about the release it is on.
//
// The command is what a person runs when something is already wrong, so every line has to be true
// on a checkout nobody prepared: no tag, a tag two commits back, a shallow clone, a pin that does
// not match. The fixtures make each of those states rather than asserting the one this machine
// happens to be in — except the last case, which IS this machine, and is the only one that proves
// the command works where it will be run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTagMessage } from '../scripts/lib/release/tag.mjs';
import { describe as gitDescribe, isShallow, resetGitBinary } from '../tools/snowarch/lib/git.mjs';
import { renderVersion, versionInfo } from '../tools/snowarch/lib/version-info.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const REAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(readFileSync(join(REAL_ROOT, 'engine.config.json'), 'utf8'));
const PIN = CONFIG.docs.pin;

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
const write = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

/** A checkout the command can describe: the four files it reads, a corpus gitlink, one commit. */
function checkout(t, { version = '2.0.0', contract = '{"schema":1,"tools":[]}' } = {}) {
  const root = tempDir('snowarch-version-', t);
  const sha = createHash('sha256').update(contract).digest('hex');
  write(root, 'package.json', `${JSON.stringify({ name: 'fixture', version }, null, 2)}\n`);
  write(root, 'engine.config.json', `${JSON.stringify(CONFIG, null, 2)}\n`);
  write(root, 'packages/snowarch/dist/contract.json', contract);
  write(root, 'packages/contract/required-tools.json', `${JSON.stringify({ contractSha256: sha, tools: [] }, null, 2)}\n`);
  mkdirSync(join(root, 'vendor/ServiceNowDocs'), { recursive: true });
  git(join(root, 'vendor/ServiceNowDocs'), ['init', '-q']);

  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'fixture@example.com']);
  git(root, ['config', 'user.name', 'fixture']);
  assert.equal(git(root, ['config', 'user.name']).trim(), 'fixture', 'the fixture identity did not take');
  git(root, ['add', 'package.json', 'engine.config.json', 'packages']);
  git(root, ['update-index', '--add', '--cacheinfo', `160000,${PIN},vendor/ServiceNowDocs`]);
  git(root, ['commit', '-qm', 'chore(release): v2.0.0']);
  return { root, sha, version };
}

const tagAt = (root, name, message) => {
  const file = join(root, 'TAG_MESSAGE');
  writeFileSync(file, message);
  git(root, ['tag', '-a', name, '-F', file]);
};

const commitOn = (root, subject) => {
  writeFileSync(join(root, 'f.txt'), `${Math.random()}\n`);
  git(root, ['add', 'f.txt']);
  git(root, ['commit', '-q', '-m', subject]);
};

const lines = (root) => renderVersion(versionInfo(root));
const lineFor = (root, prefix) => lines(root).find((l) => l.startsWith(prefix));

// ── AC 1 ───────────────────────────────────────────────────────────────────────────────────────

test('AC 1 — on the tag, the tag line says exact and the shas are the tag\'s own', (t) => {
  const f = checkout(t);
  assert.equal(git(f.root, ['tag', '-l']).trim(), '', 'the fixture already carries a tag');
  tagAt(f.root, 'v2.0.0', buildTagMessage({
    version: '2.0.0', contract: f.sha, docsPin: PIN, floors: CONFIG.floors }));

  const info = versionInfo(f.root);
  assert.equal(info.tag.name, 'v2.0.0');
  assert.equal(info.tag.exact, true);
  assert.equal(info.tag.distance, 0);
  assert.equal(lineFor(f.root, 'tag:'), 'tag:        v2.0.0 (exact)');

  // The values the tag records ARE the values the tree has — which is what `git show v2.0.0` says.
  assert.equal(info.tag.message.contract, info.contractSha);
  assert.equal(info.tag.message.docsPin, info.docsPinGitlink);
  assert.match(lineFor(f.root, 'tag says:'), /^tag says:   contract [0-9a-f]{4}…[0-9a-f]{4} · docs-pin [0-9a-f]{7}$/);
  assert.equal(lineFor(f.root, 'tag says:').includes('differs'), false);
});

test('a tag whose message describes a DIFFERENT tree says so', (t) => {
  const f = checkout(t);
  tagAt(f.root, 'v2.0.0', buildTagMessage({
    version: '2.0.0', contract: 'a'.repeat(64), docsPin: PIN, floors: CONFIG.floors }));
  assert.match(lineFor(f.root, 'tag says:'), /\(differs — checkout is not the release\)$/);
});

// ── AC 2 ───────────────────────────────────────────────────────────────────────────────────────

test('AC 2 — two commits past the tag, the distance is named twice over', (t) => {
  const f = checkout(t);
  tagAt(f.root, 'v2.0.0', buildTagMessage({
    version: '2.0.0', contract: f.sha, docsPin: PIN, floors: CONFIG.floors }));
  commitOn(f.root, 'feat(engine): one');
  commitOn(f.root, 'feat(engine): two');
  assert.equal(git(f.root, ['rev-list', '--count', 'v2.0.0..HEAD']).trim(), '2',
    'the fixture is not two commits past — the case would be measuring something else');

  const info = versionInfo(f.root);
  assert.equal(info.tag.distance, 2);
  assert.equal(info.tag.exact, false);
  assert.equal(lineFor(f.root, 'tag:'), 'tag:        v2.0.0+2 (2 commits past v2.0.0)');

  // One commit past is singular — the kind of thing nobody notices until a user reads it.
  commitOn(f.root, 'feat(engine): three');
  git(f.root, ['tag', '-a', 'v2.1.0', '-m', 'snowarch v2.1.0']);
  commitOn(f.root, 'feat(engine): four');
  assert.equal(lineFor(f.root, 'tag:'), 'tag:        v2.1.0+1 (1 commit past v2.1.0)');
});

test('an import/* tag is not a release — the --match filter is the whole point', (t) => {
  const f = checkout(t);
  // This repository really carries two of these, from the predecessor histories. Without the
  // filter, `describe` would name one of them as the release a user is on.
  git(f.root, ['tag', '-a', 'import/snow-mcp-1.0.0', '-m', 'the imported history']);
  assert.equal(git(f.root, ['tag', '-l']).trim(), 'import/snow-mcp-1.0.0');
  assert.equal(gitDescribe(f.root), null, 'an import tag was described as a release');
  assert.equal(lineFor(f.root, 'tag:'), 'tag:        none (no release tag reachable — development checkout)');
});

// ── AC 3, and the shallow case ─────────────────────────────────────────────────────────────────

test('AC 3 — a checkout says which of the two it is, and means it', () => {
  const info = versionInfo(REAL_ROOT);
  const rendered = renderVersion(info);

  // TWO TREES (ARC-09-C17). This used to assert `info.tag === null` — a property of the checkout
  // that a RELEASE CHANGES, so it failed on the release commit's own pull request, which is the
  // one place it must not. Rehearsal run 4: `this checkout has a v* tag now — the case needs
  // rewriting`. It is rewritten: on a tagged tree the released shape is asserted, and that is the
  // shape this test should be most interested in.
  if (info.tag) {
    // SEVEN lines on a tagged tree, not six (ARC-09-C17b). The seventh is S04's comparison of the
    // tag's message with the tree, and it exists only when a tag is exact — so the count itself is
    // part of what distinguishes the two shapes. I asserted six ABOVE this branch in C17, which
    // made the branch unreachable in the only case it was written for; rehearsal run 5 reported it
    // as `the layout is not six lines: 7 !== 6`.
    assert.equal(rendered.length, 7, `a tagged checkout prints seven lines:\n${rendered.join('\n')}`);
    assert.match(rendered[6],
      /^tag says: {3}contract [0-9a-f]{4}…[0-9a-f]{4} · docs-pin [0-9a-f]{7}$/, rendered[6]);
    assert.equal(info.tag.distance, 0,
      `the tag is ${info.tag.distance} commits back — this is not the release commit`);
    assert.equal(info.tag.exact, true, 'a tag is reachable but this commit is not it');
    assert.match(rendered[1], /^tag: {8}v\d[^ ]* \(exact\)$/, rendered[1]);
    // The message IS the release's record, so it is read rather than assumed present.
    assert.ok(info.tag.message, 'the tag carries no parsable snowarch message');
    for (const key of ['contract', 'docsPin']) {
      assert.ok(info.tag.message[key], `the tag message has no ${key}`);
    }
    assert.ok(info.tag.message.floors && Object.keys(info.tag.message.floors).length >= 3,
      'the tag message carries fewer than three floors');
    return;
  }

  assert.equal(rendered.length, 6, `an untagged checkout prints six lines:\n${rendered.join('\n')}`);

  // WHICH "none" depends on the clone, and the test must not decide that for it: CI's `test` job
  // clones shallow, where the honest answer is "tags unreachable" rather than "no release tag".
  // The first version of this pinned the development-checkout wording and went red on four cells
  // for a checkout that was behaving correctly. What is asserted is the pairing — the flag and the
  // sentence agree — which is the property either way.
  assert.equal(rendered[1], info.shallow
    ? 'tag:        none (shallow clone — tags unreachable; git fetch --tags --unshallow)'
    : 'tag:        none (no release tag reachable — development checkout)');
});

test('a shallow clone says WHY it cannot name a tag', (t) => {
  const f = checkout(t);
  tagAt(f.root, 'v2.0.0', buildTagMessage({
    version: '2.0.0', contract: f.sha, docsPin: PIN, floors: CONFIG.floors }));
  commitOn(f.root, 'feat(engine): after the tag');

  const shallow = tempDir('snowarch-shallow-', t);
  const target = join(shallow, 'clone');
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${f.root}`, target],
    { encoding: 'utf8', stdio: 'pipe' });
  assert.equal(isShallow(target), true, 'the clone is not shallow — the case would be vacuous');
  // The files the command reads are in the clone; only the history is missing.
  assert.equal(gitDescribe(target), null);
  const line = renderVersion(versionInfo(target))[1];
  assert.equal(line, 'tag:        none (shallow clone — tags unreachable; git fetch --tags --unshallow)');
});

// ── the commit line ────────────────────────────────────────────────────────────────────────────

test('the commit line names the branch, and dirty means dirty — untracked included', (t) => {
  const f = checkout(t);
  assert.match(lineFor(f.root, 'commit:'), /^commit:     [0-9a-f]{7} \(main, clean\)$/);

  // An untracked file makes a tree nobody else can reproduce, so it counts.
  write(f.root, 'scratch.txt', 'x\n');
  assert.match(lineFor(f.root, 'commit:'), /\(main, dirty\)$/);

  execFileSync('git', ['rm', '-q', '--cached', '--ignore-unmatch', 'scratch.txt'], { cwd: f.root });
  writeFileSync(join(f.root, 'scratch.txt'), '');
  execFileSync('rm', [join(f.root, 'scratch.txt')]);
  git(f.root, ['checkout', '-q', '--detach', 'HEAD']);
  assert.equal(git(f.root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'HEAD',
    'the fixture is not detached — the case would be testing a branch');
  assert.match(lineFor(f.root, 'commit:'), /^commit:     [0-9a-f]{7} \(detached, clean\)$/);
});

// ── the two verdicts ───────────────────────────────────────────────────────────────────────────

test('a pin that disagrees with the artefact is REPORTED, and the exit stays 0', (t) => {
  const f = checkout(t);
  assert.equal(versionInfo(f.root).contractMatches, true, 'the fixture is already mismatched');

  write(f.root, 'packages/contract/required-tools.json',
    `${JSON.stringify({ contractSha256: 'f'.repeat(64), tools: [] }, null, 2)}\n`);
  const info = versionInfo(f.root);
  assert.equal(info.contractMatches, false);
  assert.match(lineFor(f.root, 'contract:'), /DOES NOT match engine pin \(run npm run contract\)$/);

  // It is a REPORT, and the exit code says so. The launcher resolves the checkout from its OWN
  // location rather than from `cwd` — deliberately, so `./snowarch` run from a subdirectory still
  // answers about the checkout — which means a subprocess cannot be pointed at this fixture. What
  // is asserted through the real binary is therefore the property that does not need one: it exits
  // 0 and prints the contract line. The mismatch WORDING is asserted above, on the fixture, where
  // a mismatch can actually be made.
  const r = execFileSync(process.execPath,
    [join(REAL_ROOT, 'tools/snowarch/bin/snowarch.mjs'), 'version'],
    { cwd: REAL_ROOT, encoding: 'utf8', stdio: 'pipe' });
  assert.match(r, /^contract: /m);
});

test('a moved corpus gitlink is reported against engine.config.json', (t) => {
  const f = checkout(t);
  assert.equal(versionInfo(f.root).docsPinMatches, true);

  // COMMITTED, not just staged: `ls-tree HEAD` reads the commit, which is the right question —
  // the pin a release records is the one in history, not the one someone has in their index.
  const moved = 'b'.repeat(40);
  git(f.root, ['update-index', '--cacheinfo', `160000,${moved},vendor/ServiceNowDocs`]);
  git(f.root, ['commit', '-qm', 'chore(docs): move the pin']);
  assert.equal(versionInfo(f.root).docsPinGitlink, moved, 'the gitlink did not move');
  const info = versionInfo(f.root);
  assert.equal(info.docsPinMatches, false);
  assert.match(lineFor(f.root, 'docs-pin:'), /gitlink bbbbbbb ≠ engine\.config\.json \(run \.\/snowarch docs verify\)$/);
});

// ── AC 4a ──────────────────────────────────────────────────────────────────────────────────────

test('AC 4a — the doctor\'s engine header is this command\'s answer, not a second reading', () => {
  const bin = join(REAL_ROOT, 'tools/snowarch/bin/snowarch.mjs');
  const version = JSON.parse(execFileSync(process.execPath, [bin, 'version', '--json'],
    { cwd: REAL_ROOT, encoding: 'utf8', stdio: 'pipe', maxBuffer: 1 << 24 }));
  // The doctor exits 1 when any check FAILS, which is a legitimate state for a working checkout
  // and is not what this test is about — the header is. Its stdout is the report either way.
  let out;
  try {
    out = execFileSync(process.execPath, [bin, 'doctor', '--json', '--quick', '--no-cache'],
      { cwd: REAL_ROOT, encoding: 'utf8', stdio: 'pipe', maxBuffer: 1 << 24 });
  } catch (e) {
    out = String(e.stdout ?? '');
    assert.ok(out.trimStart().startsWith('{'), `the doctor printed no report:\n${e.stderr}`);
  }
  const doctor = JSON.parse(out);

  assert.equal(doctor.engine.version, version.version);
  assert.equal(doctor.engine.contractSha, version.contractSha);
  assert.equal(doctor.engine.tag, version.tag?.name ?? null);
});

test('the header costs less than the command — and says the same thing', (t) => {
  const f = checkout(t);
  tagAt(f.root, 'v2.0.0', buildTagMessage({
    version: '2.0.0', contract: f.sha, docsPin: PIN, floors: CONFIG.floors }));
  const full = versionInfo(f.root);
  const header = versionInfo(f.root, { full: false });

  // The three fields the doctor's header takes are identical: that is what "one source" means, and
  // AC 4a asserts it end to end through the two commands.
  assert.equal(header.version, full.version);
  assert.equal(header.contractSha, full.contractSha);
  assert.equal(header.tag?.name ?? null, full.tag?.name ?? null);

  // ...and the expensive part is genuinely not done. `git status --porcelain` walks the working
  // tree — 35,000 corpus files in this repository — and the doctor is what the SessionStart banner
  // runs before a session's first word. The banner's median went 614 ms to 1188 ms on a macOS
  // runner and failed its own 1 s budget, which is how this was found.
  assert.notEqual(full.commit, null);
  assert.equal(header.commit, null, 'the header asked for the commit state it does not use');
  // ...and neither the tag's message nor the shallow hint, which are two more spawns each on the
  // path the banner runs. The tag NAME — which the header does use — is there either way.
  assert.notEqual(full.tag.message, null, 'the fixture tag has no message — the case is vacuous');
  assert.equal(header.tag.message, null, 'the header read the tag message it does not render');
  assert.equal(header.tag.name, full.tag.name);

  // The renderer tolerates it, because a null here must never become a crash in the one command a
  // person runs when something is already wrong.
  assert.match(renderVersion(header)[2], /^commit:     unknown \(unknown, clean\)$/);
});

// ── AC 5 ───────────────────────────────────────────────────────────────────────────────────────

test('AC 5 — there is no network code, and a listener that nobody calls proves it', async () => {
  // ARC-09-C3. This used to assert `elapsed < 2000` and call the difference "something waited on a
  // socket". A wall clock cannot tell a socket from CONTENTION: inside the concurrent suite it read
  // 2494 ms and failed, while the same file alone reads 232–268 ms and the command itself 240–278
  // — so the test was red for the machine being busy, which is the one thing it was not about.
  //
  // The claim is "this command opens no connection", so the proof counts connections. A real
  // listener on loopback, named as the proxy in the CHILD's environment only (B00's lesson: a test
  // that edits the machine's own settings is a test that breaks the machine), and the assertion is
  // that nothing ever arrived. No timing, nothing to tune, and it fails for exactly one reason.
  const { connect, createServer } = await import('node:net');
  const connections = [];
  const server = createServer((socket) => { connections.push(1); socket.destroy(); });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();

  try {
    const proxy = `http://127.0.0.1:${port}`;

    // NEGATIVE CONTROL, first: a listener that cannot count is a listener that proves anything.
    // One deliberate connection, and the counter must see it — otherwise "zero connections" below
    // would pass just as happily against a socket nobody was listening on.
    await new Promise((resolve, reject) => {
      const probe = connect(port, '127.0.0.1', () => { probe.end(); resolve(); });
      probe.on('error', reject);
    });
    assert.equal(connections.length, 1, 'the listener does not count connections');
    connections.length = 0;

    const out = execFileSync(process.execPath,
      [join(REAL_ROOT, 'tools/snowarch/bin/snowarch.mjs'), 'version'],
      {
        cwd: REAL_ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, HTTPS_PROXY: proxy, HTTP_PROXY: proxy, ALL_PROXY: proxy },
      });
    assert.match(out, /^snowarch /);
    assert.deepEqual(connections, [],
      `version opened ${connections.length} connection(s) — it is meant to read files and run git`);
  } finally {
    await new Promise((resolve) => { server.close(resolve); });
  }
});

test('the git seam refuses to answer rather than answering nothing', (t) => {
  const empty = tempDir('snowarch-nogit-', t);
  resetGitBinary();
  // Not a repository at all: `describe` is allowed to fail and returns null; the state is honest.
  assert.equal(gitDescribe(empty), null);
});


test('C17: the released-tree branch of AC 3 is reachable, and asserts the released shape', (t) => {
  // The negative control for that branch. This checkout is untagged, so the code above would
  // otherwise be unrun until the next release — which is precisely how the OLD assertion survived
  // to fail on a release commit. A tagged fixture exercises it here instead.
  const f = checkout(t);
  tagAt(f.root, 'v2.0.0', buildTagMessage({
    version: '2.0.0', contract: f.sha, docsPin: PIN, floors: CONFIG.floors }));

  const info = versionInfo(f.root);
  assert.ok(info.tag, 'the fixture is not tagged — the control proves nothing');
  assert.equal(info.tag.exact, true);
  assert.equal(info.tag.distance, 0);
  const rendered = renderVersion(info);
  assert.match(rendered[1], /^tag: {8}v2\.0\.0 \(exact\)$/);
  // ARC-09-C17b: seven lines on a tagged tree, and the seventh is the tag-message comparison. This
  // fixture is the only place that shape is exercised until a release happens.
  assert.equal(rendered.length, 7, `a tagged fixture prints seven lines:\n${rendered.join('\n')}`);
  assert.match(rendered[6],
    /^tag says: {3}contract [0-9a-f]{4}…[0-9a-f]{4} · docs-pin [0-9a-f]{7}$/, rendered[6]);
  assert.equal(info.tag.message.contract, f.sha);
  assert.equal(info.tag.message.docsPin, PIN);

  // And the OLD assertion — `info.tag === null` — would fail here, which is the defect.
  assert.notEqual(info.tag, null, 'a released tree would still pass the assertion that was removed');
});
