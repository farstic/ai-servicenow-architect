// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C158 — the upgrade cases whose subject is the licence or the release's signed manifest, end to
 * end, against the same harness as `upgrade.e2e.test.mjs`.
 *
 * THE RULE, by subject and never by seconds: a case belongs here when what it measures is the licence
 * gate or the signed manifest — what U4 refuses, the manifest B01 fetches or holds, and E-31 or E-32 as
 * U7 reads them after the move. The run after a move is in `upgrade-after-move.e2e.test.mjs` (ARC-09-C215),
 * and every other upgrade case stays in `upgrade.e2e.test.mjs`, however long it runs. A new case goes to the
 * file its subject names; the two Windows shards' times follow from that, and are measured rather than
 * balanced (the architect's ruling, 2026-10-15).
 *
 * Every case runs the command the way a user runs it, in a clone with a real origin, and builds its own
 * world, so no case here depends on one in another file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { manifestFromArchive, signManifest, writeManifestCache } from '../../tools/snowarch/lib/licence/manifest.mjs';
import { licenceFixture } from '../../tools/snowarch/tests/helpers/licence-hook/index.mjs';
import { bootstrapUser, buildEnforcementWorld, buildManifestWorld, buildWorld, git, snowarch } from './harness.mjs';

const MINUTES = 10 * 60 * 1000;

// ── ARC-11-C6 — a user without a licence ─────────────────────────────────────────────────────────────────
//
// The owner's own path: a checkout on the last release that runs without a licence, upgrading to the first that
// refuses. U1 to U5 and finish() are 2.0.12's code, and U6 and U7 are 2.0.13's bootstrap and doctor. By the owner's
// ruling from the rc.3 sitting (2026-10-13), "the user must not learn how to have a working Architect without a
// licence": what U7 shows is E-31's FAIL and its remedy, and nothing that sends the reader back.

test('ARC-11-C6 — 2.0.12 to 2.0.13 with no licence: E-31 FAIL at U7 with no way back; the move back refused, licensed taken', async (t) => {
  const w = await buildEnforcementWorld(t);
  bootstrapUser(w.user, { store: false, licence: false });
  const up = snowarch(w.user, ['upgrade', '--yes'], { bin: w.bin, licence: false });
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v2.0.13', up.text);
  assert.ok(up.text.includes('[U7/7]'), up.text);
  const u7 = up.text.slice(up.text.indexOf('[U7/7]'));
  // The line a user reads at U7, in every cell's log (the owner's rule), spelled for the shell the cell runs.
  t.diagnostic(u7.split('\n').find((l) => l.includes('E-31')) ?? 'U7 printed no E-31 line');
  assert.match(u7, /E-31 FAIL/, u7);
  assert.ok(u7.includes('.local/licence.json'), u7);
  assert.equal(u7.includes('upgrade --to'), false, u7);

  // And the path is closed (the owner's ruling): with no licence in force, a move to a release at or below the last
  // that enforces nothing is refused before anything moves, exit 3, with the code and the remedy, and no word of why.
  const refused = snowarch(w.user, ['upgrade', '--to', 'v2.0.12', '--yes'], { bin: w.bin, licence: false });
  t.diagnostic(refused.text.split('\n').find((l) => l.includes('LICENCE_NOT_VALID')) ?? 'no refusal line');
  assert.equal(refused.status, 3, refused.text);
  assert.match(refused.text, /\(Code: LICENCE_NOT_VALID\)/, refused.text);
  assert.ok(refused.text.includes('licence check'), refused.text);
  assert.equal(/last release that runs without|go back to|unenforced|without enforcement/i.test(refused.text), false, refused.text);
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v2.0.13', refused.text);

  // The owner's own way back stays: with a licence in force, the same move is taken.
  const licensed = snowarch(w.user, ['upgrade', '--to', 'v2.0.12', '--yes'], { bin: w.bin });
  assert.equal(licensed.status, 0, licensed.text);
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v2.0.12', licensed.text);
}, 2 * MINUTES);

test('ARC-11-C6 — with no licence, U4 says what the release refuses and the remedy, with --yes and without', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user, { licence: false });
  const head = git(w.user, ['rev-parse', 'HEAD']);
  const said = (text) => text.indexOf('Licence: missing — v9.1.0 runs no MCP tool');

  // Without --yes: said before the question, and a no changes nothing.
  const asked = snowarch(w.user, ['upgrade', '--to', 'v9.1.0'], { input: 'n\n', bin: w.bin, licence: false });
  assert.equal(asked.status, 0, asked.text);
  assert.ok(said(asked.text) > -1, asked.text);
  assert.ok(said(asked.text) < asked.text.indexOf('Proceed? [Y/n]'), 'the notice comes after the question');
  assert.equal(asked.text.includes('upgrade --to v2.0.12'), false, asked.text);
  assert.equal(git(w.user, ['rev-parse', 'HEAD']), head);

  // With --yes: said, and the move goes ahead, because it is still the reader's to make.
  const moved = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin, licence: false });
  assert.ok(said(moved.text) > -1, moved.text);
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v9.1.0', moved.text);
}, MINUTES);

// ── ARC-11-C7 — a target from 2.1 on moves only with its signed manifest ─────────────────────────────────────────

test('ARC-11-C7 — a target with no signed manifest, or one that is not its own, is refused at U4, and nothing moves', async (t) => {
  const w = await buildWorld(t, { unsigned: ['v9.1.0'], altered: ['v9.2.0'] });
  bootstrapUser(w.user);
  const head = git(w.user, ['rev-parse', 'HEAD']);
  const status = git(w.user, ['status', '--porcelain']);
  const none = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(none.status, 1, none.text);
  assert.match(none.text, /upgrade: v9\.1\.0 has no verified signed manifest \(release manifest: none is published for v9\.1\.0\) — nothing was changed/);
  const altered = snowarch(w.user, ['upgrade', '--to', 'v9.2.0', '--yes'], { bin: w.bin });
  assert.equal(altered.status, 1, altered.text);
  assert.match(altered.text, /upgrade: v9\.2\.0 has no verified signed manifest \(1 file in the published manifest differs from v9\.2\.0's own, the first CLAUDE\.md\) — nothing was changed/);
  for (const r of [none, altered]) assert.doesNotMatch(r.text, /\[U5\/7\]/, 'the refusal came after the tree started to move');
  assert.equal(git(w.user, ['rev-parse', 'HEAD']), head, 'HEAD moved after a refusal');
  assert.equal(git(w.user, ['status', '--porcelain']), status, 'the working tree changed after a refusal');
}, MINUTES);

test('ARC-11-C7 — a covered directory with a file the release does not ship stops the upgrade after U5, before U6', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  // No manifest held, so the launcher cannot put the tree back before `upgrade` runs (ARC-11-C141); `upgrade` is in
  // the repair set and runs, and the file the checkout leaves is U5's to find.
  rmSync(join(w.user, '.local', 'release-manifest.json'));
  mkdirSync(join(w.user, '.claude', 'skills', 'mine'), { recursive: true });
  writeFileSync(join(w.user, '.claude', 'skills', 'mine', 'SKILL.md'), 'a skill nobody shipped\n');
  const r = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(r.status, 1, r.text);
  assert.match(r.text, /release manifest: v9\.1\.0 fetched \(\d+ files\)/);
  assert.match(r.text, /upgrade: the tree at v9\.1\.0 is not what its signed manifest records — 1 file differs, the first \.claude\/skills\/mine\/SKILL\.md \(extra\); the upgrade stops before the bootstrap — return with: git checkout /);
  assert.doesNotMatch(r.text, /\[U6\/7\]/, 'the bootstrap ran on a tree that is not the release');
}, MINUTES);

// ── ARC-09-C140 — B01 fetches the manifest whenever none is held for the release ─────────────────────────────────

const BOOTSTRAP = ['bootstrap', '--mode', 'design', '--yes', '--skip-claude-check', '--docs', 'sparse'];
const VERIFIED_RC1 = /Integrity: verified · v2\.1\.0-rc\.1 · \d+ files/;
const between = (text, from, to = null) => {
  const a = text.indexOf(from);
  if (a === -1) return '';
  const b = to === null ? -1 : text.indexOf(to, a);
  return text.slice(a, b === -1 ? undefined : b);
};
/** E-32 as U7's (or the last) doctor wrote it to `.local/doctor-last.json`. */
const e32 = (user) => (JSON.parse(readFileSync(join(user, '.local/doctor-last.json'), 'utf8')).checks ?? [])
  .find((c) => c.id === 'E-32') ?? null;
/** The steps the plan promised, from its one line: `steps that will re-run: B02 … (…); B06 … (…)`. */
const planned = (text) => {
  const line = text.split('\n').find((l) => l.includes('steps that will re-run: ')) ?? '';
  const list = line.slice(line.indexOf('steps that will re-run: ') + 'steps that will re-run: '.length);
  return list.startsWith('none') ? [] : list.split('; ').map((item) => item.slice(0, 3)).sort();
};
/** The steps that RAN in a bootstrap's output: every `[Bnn/09]` line that is not cached or skipped, but B00 and B09. */
const ran = (text) => text.split(/\r?\n/)
  .map((l) => /\[(B\d\d)\/09\] .* … (.+)$/.exec(l))
  .filter((m) => m && !['B00', 'B09'].includes(m[1]) && m[2] !== 'ok (cached)' && !m[2].startsWith('skipped'))
  .map((m) => m[1]).sort();

test('ARC-09-C140 — 2.0.13 to 2.1.0-rc.1: B01 fetches the manifest the old U4 never did, U7 reads verified, and a held one is not fetched again', async (t) => {
  const w = await buildManifestWorld(t);
  bootstrapUser(w.user, { store: false });
  const cache = join(w.user, '.local', 'release-manifest.json');
  assert.equal(existsSync(cache), false, '2.0.13 wrote a manifest cache, so this is not the owner\'s starting point');
  const gone = `${w.licences.bare}.gone`;
  const status = () => snowarch(w.user, ['status'], { bin: w.bin }).text;

  // (a) The owner's sequence: 2.0.13's U1 to U5 fetch nothing, and U6 is 2.1.0-rc.1's bootstrap with B01's inputs
  // unchanged. Before ARC-09-C140 it printed `[B01/09] workspace … ok (cached)` and U7 ended in E-32 FAIL.
  const up = snowarch(w.user, ['upgrade', '--to', 'v2.1.0-rc.1', '--yes'], { bin: w.bin });
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v2.1.0-rc.1', up.text);
  const u6 = between(up.text, '[U6/7]', '[U7/7]');
  t.diagnostic(`(a) ${u6.split('\n').find((l) => l.includes('[B01/09]')) ?? 'U6 printed no B01 line'}`);
  t.diagnostic(`(a) ${u6.split('\n').find((l) => l.includes('release manifest:')) ?? 'U6 printed no manifest line'}`);
  assert.doesNotMatch(u6, /\[B01\/09\][^\n]*\(cached\)/, u6);
  assert.match(u6, /release manifest: v2\.1\.0-rc\.1 fetched \(\d+ files\)/, u6);
  const u7 = between(up.text, '[U7/7]');
  t.diagnostic(`(a) ${u7.split('\n').find((l) => l.includes('E-32')) ?? 'U7 printed no E-32 line (ok checks are not listed)'}`);
  assert.doesNotMatch(u7, /E-32\s+FAIL/, u7);
  assert.equal(e32(w.user)?.status, 'ok', JSON.stringify(e32(w.user)));
  assert.match(status(), VERIFIED_RC1);

  // (b) Down to 2.0.13 and back, with the licences repository gone: the cache survives both moves and is this
  // release's, so B01 stays cached, nothing is fetched, and E-32 reads verified straight away.
  const down = snowarch(w.user, ['upgrade', '--to', 'v2.0.13', '--yes'], { bin: w.bin });
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v2.0.13', down.text);
  assert.ok(existsSync(cache), 'the cache did not survive the move to 2.0.13');
  renameSync(w.licences.bare, gone);
  const back = snowarch(w.user, ['upgrade', '--to', 'v2.1.0-rc.1', '--yes'], { bin: w.bin });
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v2.1.0-rc.1', back.text);
  assert.match(between(back.text, '[U6/7]', '[U7/7]'), /\[B01\/09\][^\n]*ok \(cached\)/, back.text);
  assert.doesNotMatch(back.text, /release manifest:/, 'a held manifest was fetched again');
  assert.equal(e32(w.user)?.status, 'ok', JSON.stringify(e32(w.user)));
  assert.match(status(), VERIFIED_RC1);

  // (c) A cache that holds another release's manifest, signed and valid: B01 runs for it and fetches this one.
  renameSync(gone, w.licences.bare);
  writeManifestCache(w.user, { tag: 'v2.0.13', checkedAt: new Date().toISOString(), source: 'fixture',
    doc: signManifest(manifestFromArchive(w.work, 'v2.0.13'), licenceFixture().primary.privateKey) });
  const other = snowarch(w.user, BOOTSTRAP, { bin: w.bin });
  assert.equal(other.status, 0, other.text);
  assert.doesNotMatch(other.text, /\[B01\/09\][^\n]*\(cached\)/, other.text);
  assert.match(other.text, /release manifest: v2\.1\.0-rc\.1 fetched \(\d+ files\)/, other.text);
  assert.match(status(), VERIFIED_RC1);

  // ARC-11-C141 — an edited skill and an added one, after the install: the next command puts the signed skill back and
  // moves the added one aside, says so once, and runs on the signed tree. Nothing is deleted.
  const skill = join(w.user, '.claude', 'skills', 'itsm-specialist', 'SKILL.md');
  const signedSkill = readFileSync(skill, 'utf8');
  writeFileSync(skill, `${signedSkill}my own rule\n`);
  mkdirSync(join(w.user, '.claude', 'skills', 'my-skill'), { recursive: true });
  writeFileSync(join(w.user, '.claude', 'skills', 'my-skill', 'SKILL.md'), 'my own skill\n');
  const restored = snowarch(w.user, ['status'], { bin: w.bin });
  t.diagnostic(`(c2) ${restored.text.split('\n').find((l) => l.startsWith('Integrity: restored')) ?? 'no restore line'}`);
  assert.match(restored.stderr, /^Integrity: restored — The AI Architect's own files are not yours to change under this licence: 1 file restored from v2\.1\.0-rc\.1, 1 moved to \.local\/integrity-removed\/\d{8}T\d{6}Z\/ \(\.claude\/skills\/itsm-specialist\/SKILL\.md\)\. Your own material belongs under clients\/<name>\/\.$/m,
    restored.text);
  assert.equal(readFileSync(skill, 'utf8'), signedSkill);
  assert.equal(existsSync(join(w.user, '.claude', 'skills', 'my-skill')), false);
  const kept = readdirSync(join(w.user, '.local', 'integrity-removed'));
  assert.equal(kept.length, 1, kept.join(', '));
  assert.equal(readFileSync(join(w.user, '.local', 'integrity-removed', kept[0], '.claude', 'skills', 'my-skill', 'SKILL.md'), 'utf8'),
    'my own skill\n');
  assert.match(restored.stdout, VERIFIED_RC1);

  // (d) No network and no manifest: B01 warns with the reason, and E-32 FAILs with the remedy. Nothing crashes.
  rmSync(cache);
  renameSync(w.licences.bare, gone);
  const offline = snowarch(w.user, BOOTSTRAP, { bin: w.bin });
  assert.equal(offline.status, 0, offline.text);
  assert.match(offline.text, /\[B01\/09\][^\n]*warn/, offline.text);
  assert.match(offline.text, /release manifest: could not be reached \(/, offline.text);
  const doctor = snowarch(w.user, ['doctor'], { bin: w.bin });
  t.diagnostic(`(d) ${doctor.text.split('\n').find((l) => l.includes('E-32')) ?? 'the doctor printed no E-32 line'}`);
  assert.match(doctor.text, /E-32\s+FAIL/, doctor.text);
  assert.ok(doctor.text.includes('Integrity: cannot restore — no signed manifest for v2.1.0-rc.1'), doctor.text);
  assert.ok(doctor.text.includes('licence check --refresh'), doctor.text);
  assert.doesNotMatch(`${offline.text}${doctor.text}`, /crashed|TypeError|ReferenceError/);
  // ARC-11-C141 — and a tree that cannot be restored refuses a command outside the repair set, with the same line.
  const refused = snowarch(w.user, ['docs', 'verify'], { bin: w.bin });
  assert.equal(refused.status, 3, refused.text);
  assert.ok(refused.stderr.includes("this command does not run while the AI Architect's own files cannot be restored"), refused.text);
  assert.ok(refused.stderr.includes('Integrity: cannot restore — no signed manifest for v2.1.0-rc.1 — '), refused.text);
}, 3 * MINUTES);

test('ARC-09-C140 — 2.1 to 2.1: the plan and the run agree on B01, after an install that could not fetch and after one that did', async (t) => {
  const w = await buildWorld(t);
  const gone = `${w.licences.bare}.gone`;

  // An install with no network: B01 warns, E-32 FAILs with the remedy.
  renameSync(w.licences.bare, gone);
  const install = bootstrapUser(w.user);
  assert.match(install, /release manifest: could not be reached \(/, install);
  const doctor = snowarch(w.user, ['doctor'], { bin: w.bin });
  assert.match(doctor.text, /E-32\s+FAIL/, doctor.text);
  assert.ok(doctor.text.includes('licence check --refresh'), doctor.text);
  renameSync(gone, w.licences.bare);

  // 9.0.0 → 9.1.0: B01's last run warned, so the plan names it and the run runs it, line for line.
  const one = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(one.status, 0, one.text);
  t.diagnostic(`9.0.0 → 9.1.0 plan ${planned(one.text).join(', ') || '(none)'} · ran ${ran(between(one.text, '[U6/7]', '[U7/7]')).join(', ') || '(none)'}`);
  assert.ok(planned(one.text).includes('B01'), one.text);
  assert.deepEqual(ran(between(one.text, '[U6/7]', '[U7/7]')), planned(one.text), one.text);
  assert.equal(e32(w.user)?.status, 'ok', JSON.stringify(e32(w.user)));

  // 9.1.0 → 9.2.0: U5 writes the target's manifest, so the plan leaves B01 out and U6 finds it cached.
  const two = snowarch(w.user, ['upgrade', '--to', 'v9.2.0', '--yes'], { bin: w.bin });
  assert.equal(two.status, 0, two.text);
  t.diagnostic(`9.1.0 → 9.2.0 plan ${planned(two.text).join(', ') || '(none)'} · ran ${ran(between(two.text, '[U6/7]', '[U7/7]')).join(', ') || '(none)'}`);
  assert.equal(planned(two.text).includes('B01'), false, two.text);
  assert.match(between(two.text, '[U6/7]', '[U7/7]'), /\[B01\/09\][^\n]*ok \(cached\)/, two.text);
  assert.deepEqual(ran(between(two.text, '[U6/7]', '[U7/7]')), planned(two.text), two.text);
  assert.equal(e32(w.user)?.status, 'ok', JSON.stringify(e32(w.user)));

  // And B01's own write does not make it stale: a second bootstrap finds it cached. (What else re-runs here is not
  // B01's: B02's recorded warn is the fixture corpus's dead citations, which every bootstrap in this world reports.)
  const again = snowarch(w.user, BOOTSTRAP, { bin: w.bin });
  assert.equal(again.status, 0, again.text);
  t.diagnostic(`second bootstrap ran ${ran(again.text).join(', ') || 'B00 and B09 only'}`);
  assert.match(again.text, /\[B01\/09\][^\n]*ok \(cached\)/, again.text);
  assert.equal(ran(again.text).includes('B01'), false, again.text);
}, 3 * MINUTES);

// ── ARC-09-C185c — an install whose origin is another GitHub repository than the one releases are published at ─────────

test('ARC-09-C185c — a GitHub origin that is not the releases\' gets the set-url line at U4 and at U2; others stay silent', async (t) => {
  // The final's manifest is signed over another commit than the tag the old origin carries, as a 2.2.1 final's is over
  // its distribution commit (ARC-09-C185b).
  const w = await buildWorld(t, { foreign: ['v9.2.0'] });
  bootstrapUser(w.user);
  const head = git(w.user, ['rev-parse', 'HEAD']);
  const home = 'https://github.com/farstic/snowarch.git';
  const old = 'https://github.com/farstic/old-home.git';
  const said = `upgrade: origin is ${old}, and releases are published at ${home} — git remote set-url origin ${home}`;
  // A GitHub-shaped origin and no network: `insteadOf` sends git to the world's own origin, while the URL the install
  // has configured, the one the product reads, stays the GitHub one.
  const key = (to) => `url.${pathToFileURL(to).href}.insteadOf`;
  const via = (url, to) => {
    git(w.user, ['config', key(to), url]);
    assert.equal(git(w.user, ['config', '--get', key(to)]), url, 'the insteadOf did not take');
  };
  const unvia = (to) => {
    git(w.user, ['config', '--unset', key(to)]);
    assert.equal(git(w.user, ['config', '--get', key(to)], { allowFail: true }), null, 'the insteadOf is still set');
  };
  const origin = (url) => {
    git(w.user, ['remote', 'set-url', 'origin', url]);
    assert.equal(git(w.user, ['config', '--get', 'remote.origin.url']), url, 'the origin did not move');
  };
  origin(old);
  via(old, w.origin);

  // U4: the published manifest names another commit than the tag here.
  const u4 = snowarch(w.user, ['upgrade', '--to', 'v9.2.0', '--yes'], { bin: w.bin });
  assert.equal(u4.status, 1, u4.text);
  assert.match(u4.text, /upgrade: v9\.2\.0 has no verified signed manifest \(the published manifest names ddddddd, and v9\.2\.0 here is [0-9a-f]{7}\) — nothing was changed/);
  assert.ok(u4.text.includes(said), u4.text);

  // U2: the old origin no longer answers, as a private repository does not, and the same line follows git's own error.
  unvia(w.origin);
  via(old, join(w.scratch, 'gone.git'));
  const u2 = snowarch(w.user, ['upgrade', '--check'], { bin: w.bin });
  assert.equal(u2.status, 1, u2.text);
  assert.ok(u2.text.includes(said), u2.text);
  unvia(join(w.scratch, 'gone.git'));

  // Controls, refused at U4 the same way: the releases' own repository, and an origin that is not on GitHub.
  origin(home);
  via(home, w.origin);
  const own = snowarch(w.user, ['upgrade', '--to', 'v9.2.0', '--yes'], { bin: w.bin });
  unvia(w.origin);
  origin(pathToFileURL(w.origin).href);
  const mirror = snowarch(w.user, ['upgrade', '--to', 'v9.2.0', '--yes'], { bin: w.bin });
  for (const r of [own, mirror]) {
    assert.equal(r.status, 1, r.text);
    assert.match(r.text, /upgrade: v9\.2\.0 has no verified signed manifest \(the published manifest names ddddddd/, r.text);
    assert.equal(r.text.includes('releases are published at'), false, r.text);
  }
  assert.equal(git(w.user, ['rev-parse', 'HEAD']), head, 'HEAD moved after a refusal');
}, 2 * MINUTES);

// ── ARC-09-C194 — the way back named after a move is the one that re-verifies ────────────────────────────────────────

test('ARC-09-C194 — after a move from a release, the way back named is upgrade --to it, and it re-verifies', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const up = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(up.status, 0, up.text);
  // The target's manifest is cached at U5, so `git checkout v9.0.0` would leave the cache naming v9.1.0: integrity
  // reads 'other' and every command is refused. The upgrade back fetches, verifies and caches v9.0.0's own.
  assert.match(up.text, /HEAD is detached at v9\.1\.0 — return with: \S+ upgrade --to v9\.0\.0/, up.text);
  assert.doesNotMatch(up.text, /HEAD is detached at v9\.1\.0 — return with: git checkout/, up.text);
  const back = snowarch(w.user, ['upgrade', '--to', 'v9.0.0', '--yes'], { bin: w.bin });
  assert.equal(back.status, 0, back.text);
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v9.0.0', back.text);
  const report = JSON.parse(readFileSync(join(w.user, '.local/doctor-last.json'), 'utf8'));
  const e32 = (report.checks ?? []).find((c) => c.id === 'E-32');
  assert.match(e32?.detail ?? '', /^Integrity: verified · v9\.0\.0 · \d+ files$/, JSON.stringify(e32));
}, 2 * MINUTES);
