// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C206 — the server package's changelog at the cut.
 *
 * The 2.2.1 cut changed `packages/snowarch/src` and left `packages/snowarch/CHANGELOG.md` with no 2.2.1 section: its
 * Unreleased held only the carried C119 "Known gap" paragraph, and the bump wrote the section afterwards (#491). The
 * root CHANGELOG has a writer at the cut; the package's had none, and no check asked.
 *
 * Two halves, as ruled. The release WRITER renames the package's Unreleased to the version at a final, as it does for
 * the root, and opens the next Unreleased with the open Known-gap paragraphs carried. The cut REFUSES a final whose
 * package source changed since the previous final while the package changelog says nothing about it: no section for
 * the version, and an Unreleased of carried Known-gap paragraphs only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyWrites } from '../scripts/lib/release/writers.mjs';

const REAL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Loaded here rather than imported, so the applyWrites case below runs, and fails for its own reason, before the
// module exists.
const { packageChangelogRefusal, writePackageChangelog } = await import('../scripts/lib/release/package-changelog.mjs')
  .catch(() => ({ packageChangelogRefusal: () => { throw new Error('no package-changelog module'); },
    writePackageChangelog: () => { throw new Error('no package-changelog module'); } }));

const HEAD = '# Changelog\n\nAll notable changes to this project are documented here.\n\n';
const GAP = '**Known gap, raised not closed: a second failed login (ARC-09-C119).** A call that wrote a cut value and\n'
  + 'then failed still reads the dictionary to confirm the cut.';
const ENTRY = '**A refusal by the instance\'s own rules has its own code, `INSTANCE_REFUSED` (ARC-09-C182).** A 403\n'
  + 'that a data policy returns says so.';
const PREVIOUS = '## 2.2.0 — 2026-10-17\n\n**An earlier entry.**\n';

/** The package changelog as it stood before the 2.2.1 cut, with something written under Unreleased. */
const written = `${HEAD}## Unreleased (2.2.1-dev)\n\n${GAP}\n\n${ENTRY}\n\n${PREVIOUS}`;
/** As it actually stood: only the carried gap, which is the shape the cut let through. */
const gapOnly = `${HEAD}## Unreleased (2.2.1-dev)\n\n${GAP}\n\n${PREVIOUS}`;

test('ARC-09-C206 — at a final the writer renames Unreleased to the version and carries only the open gaps forward', () => {
  const r = writePackageChangelog(written, '2.2.1', '2026-10-20');
  assert.equal(r.ok, true, r.message);
  assert.equal(r.changed, true);
  assert.equal(r.text, `${HEAD}## Unreleased\n\n${GAP}\n\n## 2.2.1 — 2026-10-20\n\n${ENTRY}\n\n${PREVIOUS}`);
});

test('ARC-09-C206 — with nothing written, the writer changes nothing; with no heading, or a section already there, it refuses', () => {
  const same = writePackageChangelog(gapOnly, '2.2.1', '2026-10-20');
  assert.deepEqual([same.ok, same.changed, same.text], [true, false, gapOnly]);
  assert.equal(writePackageChangelog(`${HEAD}${PREVIOUS}`, '2.2.1', '2026-10-20').ok, false);
  const twice = writePackageChangelog(`${HEAD}## Unreleased\n\n${ENTRY}\n\n## 2.2.1 — 2026-10-20\n\n${ENTRY}\n`,
    '2.2.1', '2026-10-20');
  assert.equal(twice.ok, false);
  assert.match(twice.message, /2\.2\.1 already exists/);
});

test('ARC-09-C206 — the cut refuses a final whose package source changed while its changelog says nothing', () => {
  // The 2.2.1 cut's shape: src changed since v2.2.0, no 2.2.1 section, Unreleased of the carried gap only.
  const refused = packageChangelogRefusal({ text: gapOnly, version: '2.2.1', since: 'v2.2.0', srcChanged: true });
  assert.match(refused ?? '', /^release: packages\/snowarch\/src changed since v2\.2\.0/, refused);
  assert.match(refused, /nothing was written$/, refused);
  // Something written under Unreleased, or the section already cut (the --tag-only pass): nothing to refuse.
  assert.equal(packageChangelogRefusal({ text: written, version: '2.2.1', since: 'v2.2.0', srcChanged: true }), null);
  const cut = writePackageChangelog(written, '2.2.1', '2026-10-20').text;
  assert.equal(packageChangelogRefusal({ text: cut, version: '2.2.1', since: 'v2.2.0', srcChanged: true }), null);
  // The source did not change: a release with nothing to say about the server says nothing.
  assert.equal(packageChangelogRefusal({ text: gapOnly, version: '2.2.1', since: 'v2.2.0', srcChanged: false }), null);
});

test('ARC-09-C206 — applyWrites renames the package Unreleased at a final, and leaves it alone for a release candidate', () => {
  // Every other write is the real one, over this checkout's own files in memory; nothing runs and nothing is written.
  const files = new Map(['CLAUDE.md', 'docs/README-head.md', 'docs/INSTALL.md', 'docs/MIGRATION.md',
    'docs/CHANGELOG.md'].map((p) => [p, readFileSync(join(REAL_ROOT, p), 'utf8')]));
  const cut = (version) => {
    const fs = new Map(files);
    fs.set('packages/snowarch/CHANGELOG.md', written);
    const r = applyWrites({ root: REAL_ROOT, version, date: '2026-10-20', run: () => 0, git: () => '',
      read: (p) => fs.get(p), write: (p, t) => fs.set(p, t), sha: () => 'f'.repeat(64) });
    assert.equal(r.ok, true, r.message);
    return { r, text: fs.get('packages/snowarch/CHANGELOG.md') };
  };
  const final = cut('9.9.9');
  assert.match(final.text, /^## 9\.9\.9 — 2026-10-20$/m, final.text);
  assert.ok(final.r.touched.includes('packages/snowarch/CHANGELOG.md'),
    'the package changelog is not in what a rollback restores');
  const rc = cut('9.9.9-rc.1');
  assert.equal(rc.text, written,
    'a release candidate renamed the package Unreleased, so the final would find it empty');
});

test('ARC-09-C206 — preflight asks the package changelog at a final, with the source diff since the previous final', () => {
  // Asserted on the source, as ARC-09-C66's wiring is: driving `preflight` means fixturing eight checks to read one.
  // The behaviour is the pure verdict above; what can be wrong here is only whether preflight asks it, and with what.
  const source = readFileSync(join(REAL_ROOT, 'scripts/lib/release/preflight.mjs'), 'utf8');
  assert.match(source, /packageChangelogRefusal\(\{/, 'preflight does not ask the package changelog');
  assert.match(source, /`\$\{latestFinal\}\.\.HEAD`, '--', 'packages\/snowarch\/src'/,
    'preflight does not measure the package source since the previous final');
});
