// ARC-01-S07 — the checkout must make it impossible to commit per-checkout state, engagement
// content, or a credential-shaped literal. Structure (D-04's store location) is the real defence;
// this test is the net under it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  credentialLines, CREDENTIAL_EXT, ENVISH, isPlaceholder,
} from '../tools/snowarch/lib/doctor/checks/credential-shape.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8' });

// The credential SHAPE — the prefixes, the generic words, the two regexes — lives in
// `tools/snowarch/lib/doctor/checks/credential-shape.mjs`, because the doctor's E-09 sweeps the
// same tree on a user's machine (ARC-08-S02). It was two copies for one commit, and the copies had
// already diverged: the doctor's list was missing `<`, so `"password": "<password>"` in README.md
// read as a leak to one sweep and as documentation to the other. One definition, two callers.
const FORBIDDEN_TRACKED = /^(\.local|clients|deliverables|memory)\/|(^|\/)\.env$|settings\.local\.json$|(^|\/)\.DS_Store$/;

test('every per-checkout and engagement path is ignored', () => {
  const paths = ['.local/instances.json', '.local/audit.jsonl', 'clients/acme/notes.md',
    'deliverables/x.docx', 'memory/MEMORY.md', '.env', '.env.local',
    '.claude/settings.local.json', '.DS_Store', 'node_modules/x'];
  for (const p of paths) {
    const r = spawnSync('git', ['check-ignore', '-q', p], { cwd: root });
    assert.equal(r.status, 0, `${p} is NOT ignored`);
  }
});

test('the .env.example files are deliberately NOT ignored, and ARE scanned', () => {
  for (const p of ['.env.example', 'packages/snowarch/.env.example']) {
    const r = spawnSync('git', ['check-ignore', '-q', p], { cwd: root });
    assert.notEqual(r.status, 0, `${p} is ignored but must not be`);
    // ARC-09-C10. Tracked and NOT scanned was the state until then: `CREDENTIAL_EXT` listed nine
    // extensions, none of them the `.env` family, so the sweep below skipped the one kind of file
    // named after the thing it hunts — including the one that ships in the npm tarball. The sweep
    // is the same regex the doctor's E-09 uses, so this assertion is about both.
    assert.ok(CREDENTIAL_EXT.test(p), `${p} is tracked but the credential sweep skips it`);
  }
  // And a `.env` itself, which is what a person actually leaks — `.env.local` too.
  for (const p of ['.env', '.env.local', 'packages/snowarch/.env']) {
    assert.ok(CREDENTIAL_EXT.test(p), `${p} would not be scanned`);
  }
  // Not direnv's file: a shell script, and a different question.
  assert.equal(CREDENTIAL_EXT.test('.envrc'), false);
});

test('no forbidden path is tracked', () => {
  const bad = git(['ls-files']).split('\n').filter((f) => f && FORBIDDEN_TRACKED.test(f));
  assert.deepEqual(bad, [], `never-commit: tracked path matches forbidden pattern: ${bad[0]}`);
});

test('no credential-shaped literal is tracked', () => {
  const hits = [];
  for (const f of git(['ls-files']).split('\n').filter((f) => f && CREDENTIAL_EXT.test(f))) {
    let text;
    try { text = readFileSync(join(root, f), 'utf8'); } catch { continue; }
    for (const line of credentialLines(text)) hits.push(`${f}:${line}`);
  }
  assert.deepEqual(hits, [], `credential-shaped literal(s): ${hits.slice(0, 8).join(', ')}`);
});

test('the eol policy is stored in the index as lf and applied on checkout', () => {
  // Two separate claims, because they are true at different times.
  //  (a) the INDEX side and the ATTRIBUTE are properties of the committed tree -- assert now;
  //  (b) the WORKTREE side is decided at CHECKOUT, so a file already on disk before .gitattributes
  //      existed keeps its old endings until it is re-checked-out. `git add --renormalize` fixes the
  //      index, not the worktree. Asserting w/crlf on THIS worktree would therefore fail for a
  //      reason that says nothing about the policy -- criterion 5 says "after a fresh clone", so a
  //      fresh checkout is what gets asserted, in a throwaway worktree.
  const rows = git(['ls-files', '--eol']).split('\n').filter(Boolean);
  const pick = (re) => rows.filter((r) => re.test(r.split('\t').pop()));
  const ps = pick(/\.(ps1|cmd)$/);
  const sh = pick(/\.(sh|mjs)$/);
  assert.ok(ps.length > 0, 'no .ps1/.cmd files found to check');
  assert.ok(sh.length > 0, 'no .sh/.mjs files found to check');
  for (const r of [...ps, ...sh]) assert.match(r, /i\/lf/, `index side is not lf: ${r}`);
  for (const r of ps) assert.match(r, /attr\/[^\t]*eol=crlf/, `eol=crlf attribute missing: ${r}`);
  for (const r of sh) assert.match(r, /attr\/[^\t]*eol=lf/, `eol=lf attribute missing: ${r}`);

  // (b) a fresh checkout of the same commit, in a temp worktree -- this is criterion 5's condition.
  const wt = mkdtempSync(join(tmpdir(), 'eol-check-'));
  try {
    git(['worktree', 'add', '--detach', '-q', wt, 'HEAD']);
    const fresh = execFileSync('git', ['ls-files', '--eol'], { cwd: wt, encoding: 'utf8' })
      .split('\n').filter(Boolean);
    const freshPick = (re) => fresh.filter((r) => re.test(r.split('\t').pop()));
    for (const r of freshPick(/\.(ps1|cmd)$/)) assert.match(r, /w\/crlf/, `fresh checkout is not crlf: ${r}`);
    for (const r of freshPick(/\.(sh|mjs)$/)) assert.match(r, /w\/lf/, `fresh checkout is not lf: ${r}`);
  } finally {
    try { git(['worktree', 'remove', '--force', wt]); } catch { rmSync(wt, { recursive: true, force: true }); }
  }
});

test('one ignore file for the monorepo', () => {
  assert.equal(git(['ls-files']).split('\n').filter((f) => f === '.gitignore').length, 1);
  const r = spawnSync('git', ['ls-files', '--error-unmatch', 'packages/snowarch/.gitignore'], { cwd: root });
  assert.notEqual(r.status, 0, 'packages/snowarch/.gitignore is still tracked');
});

// ---------- mutations, in a throwaway repository so the real worktree is never dirtied ----------
const withScratchRepo = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'never-commit-'));
  try {
    git(['init', '-q', '-b', 'main', '.'], dir);
    writeFileSync(join(dir, '.gitignore'), readFileSync(join(root, '.gitignore')));
    fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('mutation: a force-added .local/instances.json is caught by the tracked-path scan', () => {
  withScratchRepo((dir) => {
    mkdirSync(join(dir, '.local'), { recursive: true });
    writeFileSync(join(dir, '.local/instances.json'), '{"password":"hunter2hunter2"}');
    assert.equal(spawnSync('git', ['check-ignore', '-q', '.local/instances.json'], { cwd: dir }).status, 0,
      'the fixture repo does not even ignore it — the .gitignore copy failed');
    git(['add', '-f', '.local/instances.json'], dir);
    const bad = git(['ls-files'], dir).split('\n').filter((f) => f && FORBIDDEN_TRACKED.test(f));
    assert.deepEqual(bad, ['.local/instances.json']);
  });
});

test('mutation: a real-looking env literal fails, the same line with a placeholder passes', () => {
  const real = 'SERVICENOW_BASIC_PASSWORD=RealLookingValue123'.match(ENVISH);
  assert.ok(real && !isPlaceholder(real[2]), 'a real-looking value was treated as a placeholder');
  const fake = 'SERVICENOW_BASIC_PASSWORD=your_password'.match(ENVISH);
  assert.ok(fake && isPlaceholder(fake[2]), 'your_password was not recognised as a placeholder');
});
