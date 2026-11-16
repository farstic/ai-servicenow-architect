// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { releasedProblems, releasedSections, sectionHash } from './helpers/changelog-released.mjs';

/**
 * ARC-09-C268 — a released section of docs/CHANGELOG.md is the section that was released.
 *
 * A plain merge of develop rewrote `## 2.2.6` in #582 without a conflict: the branch had added its bullets to `## Unreleased`
 * before the release, and the release renamed that block, so git carried the bullets (and a changed E-33 line) into the section
 * the block became. Nothing noticed, because nothing compared a released section with what was released. `changelog-released.mjs`
 * says how; this file applies it to the real changelog and to texts that are made to be wrong, so that the check is seen to fail.
 *
 * TWO WITNESSES, because CI's `test` cells clone shallow and without tags: the sha256 of every released section, recorded in
 * `tests/fixtures/changelog-released-sections.json`, holds everywhere; and where this clone has the tag, the section in the file at
 * `v<version>` is compared byte for byte, which also keeps the record honest. A new release is recorded in the post-release
 * records pull request: until then it is the newest section, and the only one that may be unrecorded.
 */
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(REPO, rel), 'utf8');
const RECORD = JSON.parse(read('tests/fixtures/changelog-released-sections.json'));

/** The changelog as the tag v<version> has it, or null when this clone has no such tag. */
function tagFile(version) {
  try {
    return execFileSync('git', ['show', `v${version}:docs/CHANGELOG.md`],
      { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
}

test('ARC-09-C268 — every released section of docs/CHANGELOG.md is what was released: its recorded hash, and the tag\'s own text where the tag is here', (t) => {
  const text = read('docs/CHANGELOG.md');
  const sections = releasedSections(text);
  assert.ok(sections.length >= 24, `${sections.length} released sections: the heading pattern no longer reads this file`);
  const tagged = sections.filter(([version]) => tagFile(version) !== null).length;
  if (tagged === 0) console.log('    deferred (the tag half): no release tag in this clone, a shallow checkout; the recorded hashes are the check here');
  else t.diagnostic(`${tagged} of ${sections.length} released sections compared with the file at their tag`);
  const problems = releasedProblems({ text, record: RECORD, tagText: tagFile });
  assert.deepEqual(problems, [],
    'a released section is a record of what was said at the time. If a branch of yours added lines to it, a merge of develop carried them from '
    + 'the `## Unreleased` block that the release renamed: move them back to `## Unreleased`. If the change is deliberate, say why in the commit '
    + 'and update tests/fixtures/changelog-released-sections.json.');
});

// ── The check is seen to fail: texts made to be wrong ────────────────────────────────────────────────────────────

const HEAD = '# Changelog\n\n';
const UNRELEASED = '## Unreleased\n\n### Notes\n\nNext.\n\n';
const V2 = '## 2.0.0 — 2026-02-02\n\n### Notes\n\nTwo.\n\n### Added\n\n- b\n\n';
const V1 = '## 1.0.0 — 2026-01-01\n\n### Notes\n\nOne.\n\n### Added\n\n- a\n\n';
const FILE = `${HEAD}${UNRELEASED}${V2}${V1}`;
const recordOf = (text) => Object.fromEntries(releasedSections(text).map(([v, body]) => [v, sectionHash(body)]));

test('control — a file whose released sections are as recorded has no problem, and a change to Unreleased is not one', () => {
  assert.deepEqual(releasedProblems({ text: FILE, record: recordOf(FILE) }), []);
  const moved = FILE.replace('Next.', 'Next, and a new bullet.\n\n### Added\n\n- c');
  assert.deepEqual(releasedProblems({ text: moved, record: recordOf(FILE) }), []);
});

test('control — a bullet carried into a released section is found by its hash, and says which line moved', () => {
  const carried = FILE.replace('### Added\n\n- b', '### Added\n\n- b\n- c, carried in by a merge');
  const problems = releasedProblems({ text: carried, record: recordOf(FILE) });
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.match(problems[0], /^2\.0\.0: its text hashes to [0-9a-f]{12}, not the recorded [0-9a-f]{12}$/);
});

test('control — the same bullet is found by the tag where there is no record, and the message names the line', () => {
  const carried = FILE.replace('- b', '- b changed');
  const problems = releasedProblems({ text: carried, record: {}, tagText: () => FILE });
  assert.ok(problems.some((p) => /^2\.0\.0: differs from the same section in the file at tag v2\.0\.0 \(line 9 of the section: "- b" became "- b changed"\)$/.test(p)), problems.join('\n'));
});

test('control — a section the tag lacks, a section whose record is gone, and a recorded section that has gone are each reported', () => {
  assert.deepEqual(releasedProblems({ text: FILE, record: recordOf(FILE), tagText: (v) => (v === '2.0.0' ? HEAD : null) }),
    ['2.0.0: the file at tag v2.0.0 has no such section']);
  const record = recordOf(FILE);
  delete record['1.0.0'];
  const missing = releasedProblems({ text: FILE, record });
  assert.equal(missing.length, 1, missing.join('\n'));
  assert.match(missing[0], /^1\.0\.0: released, and not the newest, but no hash is recorded: add "1\.0\.0": "[0-9a-f]{64}"$/);
  assert.deepEqual(releasedProblems({ text: FILE, record: { ...recordOf(FILE), '0.9.0': 'a'.repeat(64) } }),
    ['0.9.0: a hash is recorded, and the section is gone']);
});

test('control — the newest section may be unrecorded, an older one may not, and line ends and trailing blank lines do not change a hash', () => {
  const record = recordOf(FILE);
  delete record['2.0.0'];
  assert.deepEqual(releasedProblems({ text: FILE, record }), [], 'the newest release is recorded in the post-release pull request');
  const crlf = FILE.replace(/\n/g, '\r\n');
  assert.deepEqual(releasedProblems({ text: crlf, record: recordOf(FILE) }), []);
  assert.deepEqual(releasedProblems({ text: `${FILE}\n\n\n`, record: recordOf(FILE) }), []);
});
