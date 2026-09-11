// ARC-09-S03 — what the release workflow runs, proved without pushing a tag.
//
// The workflow itself can only be exercised by a real tag on a real repository, which creates a
// PUBLIC Release — so it is rehearsed once, by hand, with the owner's approval. What is testable
// here is everything the workflow CALLS: the tag verifier against fixture tags in a temp
// repository, the metrics collector against a fixture state file, the notes wrapper, and the asset
// check against reports with and without a credential in them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTagMessage } from '../scripts/lib/release/tag.mjs';
import { collect, directorySize, megabytes, seconds, table } from '../scripts/ci/install-metrics.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const REAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(readFileSync(join(REAL_ROOT, 'engine.config.json'), 'utf8'));
const PIN = CONFIG.docs.pin;

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
const write = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

/** A checkout that a correct tag would describe: version 2.0.0 everywhere, pinned, with a contract. */
function tagged(t, { contract = '{"schema":1,"tools":[]}', version = '2.0.0' } = {}) {
  const root = tempDir('snowarch-verify-tag-', t);
  write(root, 'package.json', `${JSON.stringify({ name: 'fixture', version }, null, 2)}\n`);
  write(root, 'CLAUDE.md', `# F\n\n**Version:** ${version} — written by scripts/release.mjs.\n`);
  write(root, 'engine.config.json', `${JSON.stringify(CONFIG, null, 2)}\n`);
  write(root, 'packages/snowarch/dist/contract.json', contract);
  mkdirSync(join(root, 'vendor/ServiceNowDocs'), { recursive: true });
  git(join(root, 'vendor/ServiceNowDocs'), ['init', '-q']);

  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'fixture@example.com']);
  git(root, ['config', 'user.name', 'fixture']);
  assert.equal(git(root, ['config', 'user.name']).trim(), 'fixture', 'the fixture identity did not take');
  git(root, ['add', 'package.json', 'CLAUDE.md', 'engine.config.json', 'packages']);
  git(root, ['update-index', '--add', '--cacheinfo', `160000,${PIN},vendor/ServiceNowDocs`]);
  git(root, ['commit', '-qm', 'chore(release): v2.0.0']);

  const sha = createHash('sha256').update(contract).digest('hex');
  return { root, version, contractSha: sha };
}

const verify = (root, tag) => {
  const script = join(REAL_ROOT, 'scripts/ci/verify-tag.mjs');
  try {
    return { code: 0, out: execFileSync(process.execPath, [script, tag],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    return { code: e.status, out: String(e.stdout ?? ''), err: String(e.stderr ?? '') };
  }
};

const annotate = (root, tag, message) => {
  const file = join(root, 'TAG_MESSAGE');
  writeFileSync(file, message);
  git(root, ['tag', '-a', tag, '-F', file]);
};

// ── verify-tag ─────────────────────────────────────────────────────────────────────────────────

test('a tag written by the release script verifies', (t) => {
  const f = tagged(t);
  assert.equal(git(f.root, ['tag', '-l']).trim(), '', 'the fixture already carries a tag');
  annotate(f.root, 'v2.0.0', buildTagMessage({
    version: '2.0.0', contract: f.contractSha, docsPin: PIN, floors: CONFIG.floors }));

  const r = verify(f.root, 'v2.0.0');
  assert.equal(r.code, 0, `${r.out}${r.err ?? ''}`);
  assert.match(r.out, /^tag v2\.0\.0 verified$/m);
});

test('a LIGHTWEIGHT tag is refused — it records nothing at all', (t) => {
  const f = tagged(t);
  git(f.root, ['tag', 'v9.9.8']);                       // no -a, no message
  assert.equal(git(f.root, ['cat-file', '-t', 'refs/tags/v9.9.8']).trim(), 'commit',
    'the fixture tag is annotated — the case would be vacuous');

  const r = verify(f.root, 'v9.9.8');
  assert.equal(r.code, 1);
  assert.equal(r.err.trim(), 'tag v9.9.8 is not annotated — create it with scripts/release.mjs');
});

test('an edited contract sha is refused, and both values are named', (t) => {
  const f = tagged(t);
  const message = buildTagMessage({
    version: '2.0.0', contract: 'f'.repeat(64), docsPin: PIN, floors: CONFIG.floors });
  annotate(f.root, 'v2.0.0', message);

  const r = verify(f.root, 'v2.0.0');
  assert.equal(r.code, 1);
  assert.match(r.err, new RegExp(`^v2\\.0\\.0: contract sha in message \\(ffffffffffff…\\) `
    + `!= dist/contract\\.json \\(${f.contractSha.slice(0, 12)}…\\)$`, 'm'));
});

test('a docs-pin, a floor and a version that do not match are each named', (t) => {
  const f = tagged(t);
  annotate(f.root, 'v2.0.0', buildTagMessage({
    version: '2.0.0', contract: f.contractSha, docsPin: 'a'.repeat(40),
    floors: { ...CONFIG.floors, node: '18.0.0' } }));

  const r = verify(f.root, 'v2.0.0');
  assert.equal(r.code, 1);
  assert.match(r.err, /docs-pin in message \(aaaaaaaaaaaa…\) != the gitlink/);
  assert.match(r.err, /node-floor in message \(18\.0\.0\) != engine\.config\.json \(20\.0\.0\)/);
});

test('a tag whose NAME is not the tree\'s version is refused — the easy mistake', (t) => {
  const f = tagged(t, { version: '2.0.0-dev' });
  annotate(f.root, 'v2.0.0', buildTagMessage({
    version: '2.0.0', contract: f.contractSha, docsPin: PIN, floors: CONFIG.floors }));

  const r = verify(f.root, 'v2.0.0');
  assert.equal(r.code, 1);
  assert.match(r.err, /v2\.0\.0: the tree carries 2\.0\.0-dev, not 2\.0\.0/);
});

// ── install-metrics ────────────────────────────────────────────────────────────────────────────

test('the metrics come from the state file the install wrote', (t) => {
  const root = tempDir('snowarch-metrics-', t);
  write(root, '.local/bootstrap-state.json', `${JSON.stringify({
    version: 1,
    steps: {
      B00: { status: 'ok', durationMs: 400 },
      B02: { status: 'ok', durationMs: 25_300 },
      B09: { status: 'ok', durationMs: 1_200 },
    },
  }, null, 2)}\n`);
  write(root, 'vendor/ServiceNowDocs/a.md', 'x'.repeat(2048));
  write(root, 'vendor/ServiceNowDocs/nested/b.md', 'y'.repeat(1024));
  write(root, 'node_modules/pkg/index.js', 'z'.repeat(512));

  const m = collect({ root, os: 'ubuntu-latest', node: 'v22.0.0' });
  assert.equal(m.os, 'ubuntu-latest');
  assert.equal(m.docsFiles, 2);
  assert.equal(m.docsBytes, 3072);
  assert.equal(m.docsSeconds, 25.3, 'B02 is the corpus fetch, and its seconds are the quoted number');
  assert.equal(m.depsBytes, 512);
  // The TOTAL is every step, not just B02 — what a person waited for.
  assert.equal(m.bootstrapSeconds, 26.9);
});

test('the walk counts real files, and a symlinked entry is not counted twice', (t) => {
  const root = tempDir('snowarch-metrics-link-', t);
  write(root, 'tree/a.md', 'x'.repeat(100));
  write(root, 'tree/b.md', 'y'.repeat(50));
  // A link INSIDE the tree: fixtures link the corpus and node_modules in, and counting through one
  // would report a copy's worth of bytes for something that takes none.
  symlinkSync(join(root, 'tree/a.md'), join(root, 'tree/link.md'));
  assert.equal(directorySize(join(root, 'tree')).files, 2, 'the symlink was counted as a file');
  assert.equal(directorySize(join(root, 'tree')).bytes, 150);
  assert.deepEqual(directorySize(join(root, 'nowhere')), { bytes: 0, files: 0 });
});

test('--table renders the columns docs/INSTALL.md quotes, with the file-bytes note', () => {
  const rows = [
    { os: 'ubuntu-latest', docsBytes: 187 * 1024 * 1024, docsFiles: 34_360, docsSeconds: 25.3, depsBytes: 420 * 1024 * 1024, bootstrapSeconds: 61.2 },
    { os: 'macos-latest', docsBytes: 187 * 1024 * 1024, docsFiles: 34_360, docsSeconds: 27.5, depsBytes: 420 * 1024 * 1024, bootstrapSeconds: 64.0 },
    { os: 'windows-latest', docsBytes: 191 * 1024 * 1024, docsFiles: 34_360, docsSeconds: 35.1, depsBytes: 421 * 1024 * 1024, bootstrapSeconds: 80.4 },
  ];
  const md = table(rows);
  assert.match(md, /^\| OS \| docs on disk \| docs files \| B02 time \| node_modules \| bootstrap total \|$/m);
  assert.match(md, /^\| ubuntu-latest \| 187 MB \| 34360 \| 25\.3 s \| 420 MB \| 61\.2 s \|$/m);
  assert.equal((md.match(/^\| \w/gm) ?? []).length, 4, 'three rows and a header');
  // The semantics ARC-06-S14's summary and the install page share: file bytes, not `du` blocks.
  assert.match(md, /sum of file sizes/);

  // The install page's band: the corpus is ~180 MB of working tree, and a row far outside that is
  // a measurement of something else.
  for (const r of rows) assert.ok(megabytes(r.docsBytes) <= 350, `${r.os}: ${megabytes(r.docsBytes)} MB`);
});

test('seconds and megabytes round the way the page reads them', () => {
  assert.equal(seconds(25_349), 25.3);
  assert.equal(seconds(0), 0);
  assert.equal(seconds(undefined), null);
  assert.equal(megabytes(187 * 1024 * 1024), 187);
});

// ── assert-assets ──────────────────────────────────────────────────────────────────────────────

const assets = (root, files) => {
  const script = join(REAL_ROOT, 'scripts/ci/assert-assets.mjs');
  try {
    return { code: 0, out: execFileSync(process.execPath, [script, ...files],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    return { code: e.status, out: String(e.stdout ?? ''), err: String(e.stderr ?? '') };
  }
};

test('the real doctor fixtures are publishable — including the live one, which is masked', () => {
  const r = assets(REAL_ROOT, ['tests/fixtures/doctor/status-design.json', 'tests/fixtures/doctor/status-live.json']);
  assert.equal(r.code, 0, `${r.out}${r.err ?? ''}`);
  assert.match(r.out, /2 asset\(s\) clean/);
});

test('an unmasked address in a report is refused, and the value is never printed', (t) => {
  const root = tempDir('snowarch-assets-', t);
  const report = JSON.parse(readFileSync(join(REAL_ROOT, 'tests/fixtures/doctor/status-live.json'), 'utf8'));
  // The shape the mask exists to prevent: a username that reached the report whole.
  report.server.instances[0].username = ['someone', '@', 'corp.example.com'].join('');
  write(root, 'doctor-ubuntu-latest.json', `${JSON.stringify(report, null, 2)}\n`);

  const r = assets(root, ['doctor-ubuntu-latest.json']);
  assert.equal(r.code, 1);
  assert.match(r.err, /an unmasked e-mail address, at offset \d+/);
  assert.equal(r.err.includes('corp.example.com'), false,
    'the check printed the value it found — that publishes it in the job log');
});

/** The design-only report the assets check reads, with the named checks forced to `fail`. */
function reportFailing(root, ids) {
  const report = JSON.parse(readFileSync(join(REAL_ROOT, 'tests/fixtures/doctor/status-design.json'), 'utf8'));
  report.checks = report.checks.map((c) => (ids.includes(c.id) ? { ...c, status: 'fail' } : c));
  for (const id of ids) {
    if (!report.checks.some((c) => c.id === id)) report.checks.push({ id, status: 'fail', detail: 'planted' });
  }
  write(root, 'doctor-ubuntu-latest.json', `${JSON.stringify(report, null, 2)}\n`);
  return assets(root, ['doctor-ubuntu-latest.json']);
}

test('a report with an unexplained FAIL is not published', (t) => {
  const r = reportFailing(tempDir('snowarch-assets-fail-', t), ['E-01']);
  assert.equal(r.code, 1);
  assert.match(r.err, /1 unexplained FAIL \(E-01\)/);
});

// ── ARC-09-C19 — E-00 is the runner's, and only E-00 ──────────────────────────────────────────
//
// The published reports come from hosted runners, which have no Claude Code: E-00 fails on every
// one of them. Refusing any FAIL at all would block every release for ever on a machine nobody
// ships from — which is what rehearsal run 7 walked into from the other side, losing all three
// `verify` jobs to a report whose only failure was E-00.

test('C19: a report whose only FAIL is E-00 IS published', (t) => {
  const r = reportFailing(tempDir('snowarch-assets-e00-', t), ['E-00']);
  assert.equal(r.code, 0, `${r.err}${r.out}`);
  assert.match(r.out, /asset\(s\) clean/);
});

test('C19: E-00 beside another FAIL is still refused, and names the other one', (t) => {
  const r = reportFailing(tempDir('snowarch-assets-e00-plus-', t), ['E-00', 'E-12']);
  assert.equal(r.code, 1);
  // The message names what is NOT explained, and says E-00 was.
  assert.match(r.err, /1 unexplained FAIL \(E-12\)/);
  assert.match(r.err, /E-00 is expected on a hosted runner/);
});

// ── release-notes ──────────────────────────────────────────────────────────────────────────────

test('the release body is the changelog section, and a missing one stops the release', (t) => {
  const root = tempDir('snowarch-notes-', t);
  write(root, 'docs/CHANGELOG.md',
    '# C\n\n## Unreleased\n\n### Notes\n\n## 2.0.0 — 2026-10-01\n\n### Added\n\n- a thing (abc1234)\n\nTag v2.0.0\n\n## Before 2.0.0\n\nold\n');
  const script = join(REAL_ROOT, 'scripts/ci/release-notes.mjs');
  const run = (tag) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [script, tag],
        { cwd: root, encoding: 'utf8', stdio: 'pipe' }) };
    } catch (e) { return { code: e.status, out: String(e.stdout ?? ''), err: String(e.stderr ?? '') }; }
  };

  const ok = run('v2.0.0');
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /### Added\n\n- a thing \(abc1234\)/);
  assert.equal(ok.out.includes('## Before 2.0.0'), false, 'the body ran into the frozen region');

  const missing = run('v3.0.0');
  assert.equal(missing.code, 1);
  assert.match(missing.err, /has no section for 3\.0\.0/);
});

// ── ARC-09-C16 — a checkout that peeled the tag is not a tag that was never annotated ──────────
//
// `actions/checkout@v4` on a tag ref writes `refs/tags/<name>` pointing straight at the COMMIT,
// even with `fetch-depth: 0`. So an annotated tag arrives in the runner's clone indistinguishable
// from a lightweight one, and `verify-tag` refused a release that was perfectly well formed on the
// remote — all three `verify` jobs of the v2.0.0-rc.0 rehearsal, run 34643610242. The refusal is
// still right (this clone cannot read a message it does not have); what was wrong was blaming the
// tag, and telling the reader to re-create it.

/** A bare remote holding an ANNOTATED tag, cloned into a tree whose tag ref was peeled to a commit. */
function peeledClone(t, { annotatedOnRemote = true } = {}) {
  const f = tagged(t);
  annotate(f.root, 'v2.0.0', ['snowarch v2.0.0', '', `contract: ${f.contractSha}`,
    `docs-pin: ${PIN}`, 'claude-floor: 2.1.214', 'node-floor: 20.0.0', 'git-floor: 2.34.1'].join('\n'));
  if (!annotatedOnRemote) {
    // The control: lightweight on the remote too, which is the case the old message is FOR.
    git(f.root, ['tag', '-d', 'v2.0.0']);
    git(f.root, ['tag', 'v2.0.0']);
  }
  const bare = join(dirname(f.root), `${basename(f.root)}-origin.git`);
  execFileSync('git', ['clone', '--quiet', '--bare', f.root, bare], { stdio: 'pipe' });

  // What checkout does: the ref exists and points at the commit, not at the tag object.
  const commit = git(f.root, ['rev-list', '-n', '1', 'v2.0.0']).trim();
  git(f.root, ['tag', '-d', 'v2.0.0']);
  git(f.root, ['update-ref', 'refs/tags/v2.0.0', commit]);
  git(f.root, ['remote', 'add', 'origin', bare]);
  return f;
}

test('C16: a peeled tag whose remote IS annotated names the re-fetch, not the tag', (t) => {
  const f = peeledClone(t);
  // The precondition, asserted: locally this really does look lightweight.
  assert.equal(execFileSync('git', ['cat-file', '-t', 'refs/tags/v2.0.0'],
    { cwd: f.root, encoding: 'utf8' }).trim(), 'commit');

  const r = verify(f.root, 'v2.0.0');
  assert.equal(r.code, 1);
  const text = `${r.out}${r.err ?? ''}`;
  assert.match(text, /the remote has the annotated object; this checkout peeled it to a commit/);
  assert.match(text, /git fetch --force origin/);
  // And NOT the message that sends someone to re-cut a tag that is fine.
  assert.equal(/is not annotated — create it with scripts\/release\.mjs/.test(text), false,
    'it still blames the tag');
});

test('C16: a tag lightweight on the remote too keeps the original refusal', (t) => {
  const f = peeledClone(t, { annotatedOnRemote: false });
  const r = verify(f.root, 'v2.0.0');
  assert.equal(r.code, 1);
  const text = `${r.out}${r.err ?? ''}`;
  // The negative control: without it, the new branch could swallow the case it was added beside.
  assert.match(text, /is not annotated — create it with scripts\/release\.mjs/);
  assert.equal(/the remote has the annotated object/.test(text), false);
});

test('C16: every job that reads the tag re-fetches it first', () => {
  const text = readFileSync(join(REAL_ROOT, '.github/workflows/release.yml'), 'utf8');
  // Comments out first: this step's own comment names both scripts (ARC-09-S09's lesson).
  const code = text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const refetch = /git fetch --force origin "\+refs\/tags\//g;
  assert.equal((code.match(refetch) ?? []).length, 2, 'a tag-reading job has no re-fetch step');
  // Order, per job: the re-fetch precedes the thing that reads the tag object.
  for (const reader of ['verify-tag.mjs', 'release-notes.mjs']) {
    const at = code.indexOf(reader);
    const before = code.lastIndexOf('git fetch --force origin "+refs/tags/', at);
    assert.ok(before > -1 && before < at, `${reader} runs before its re-fetch`);
  }
});
