// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The released sections of `docs/CHANGELOG.md`, and what makes one of them no longer the section that was released.
 *
 * ARC-09-C268. A released section is a record of what was said at the time (see `changelog-history.mjs`), and a plain merge of
 * `develop` can rewrite it without a conflict: a branch that added its bullets to `## Unreleased` BEFORE a release and merges
 * `develop` AFTER it has those bullets carried into the section that block became, because git sees one block that grew. #582
 * had its `docs lookup` bullet and a changed E-33 line inside `## 2.2.6` that way, through two merges, and nothing noticed: the
 * changelog tests were green and so were 74 of 74 CI cells.
 *
 * Two witnesses, because a CI checkout is shallow and has no tags:
 *   - the RECORD, `tests/fixtures/changelog-released-sections.json`: the sha256 of each released section's text, which holds
 *     anywhere. A section is recorded when its release has been published (the post-release records pull request), and the
 *     newest one may be unrecorded until then;
 *   - the TAG, where this clone has it: the section in the file at `v<version>` is the section that was released, byte for byte.
 */
import { createHash } from 'node:crypto';

/** `## 2.2.6 — 2026-11-15`: a released section's heading; the version carries its prerelease tag when it has one. */
export const RELEASED_HEADING = /^## (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) — (\d{4}-\d{2}-\d{2})$/;

/**
 * Every released section as `[version, text]`, in file order (newest first). The text runs from the heading to the next `## `
 * line, with LF line ends and no trailing blank lines, so a checkout that converts line ends hashes the same.
 */
export function releasedSections(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = RELEASED_HEADING.exec(lines[i]);
    if (!m) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].startsWith('## ')) j += 1;
    out.push([m[1], lines.slice(i, j).join('\n').trimEnd()]);
  }
  return out;
}

export const sectionHash = (body) => createHash('sha256').update(body, 'utf8').digest('hex');

/** The first line at which two texts differ, as `line N of the section: "<then>" became "<now>"`, each cut to a window round the first character that differs. */
function firstDifference(then, now) {
  const a = then.split('\n');
  const b = now.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === b[i]) continue;
    const x = a[i] ?? '';
    const y = b[i] ?? '';
    let at = 0;
    while (at < x.length && at < y.length && x[at] === y[at]) at += 1;
    const from = Math.max(0, at - 24);
    const cut = (s) => `${from > 0 ? '…' : ''}${s.slice(from, at + 40)}${s.length > at + 40 ? '…' : ''}`;
    return `line ${i + 1} of the section: ${JSON.stringify(cut(x))} became ${JSON.stringify(cut(y))}`;
  }
  return 'no line differs';
}

/**
 * What is wrong with the released sections of `text`, as a list of sentences; none means they are what was released.
 * `record` maps a version to its sha256; `tagText(version)` is the changelog as the tag `v<version>` has it, or `null` when this
 * clone has no such tag.
 */
export function releasedProblems({ text, record, tagText = () => null }) {
  const problems = [];
  const sections = releasedSections(text);
  const newest = sections[0]?.[0];
  for (const [version, body] of sections) {
    const hash = sectionHash(body);
    const tagged = tagText(version);
    if (tagged !== null) {
      const inTag = releasedSections(tagged).find(([v]) => v === version)?.[1];
      if (inTag === undefined) problems.push(`${version}: the file at tag v${version} has no such section`);
      else if (inTag !== body) problems.push(`${version}: differs from the same section in the file at tag v${version} (${firstDifference(inTag, body)})`);
    }
    const recorded = record[version];
    if (recorded === undefined) {
      if (version !== newest) problems.push(`${version}: released, and not the newest, but no hash is recorded: add "${version}": "${hash}"`);
    } else if (recorded !== hash) {
      problems.push(`${version}: its text hashes to ${hash.slice(0, 12)}, not the recorded ${recorded.slice(0, 12)}`);
    }
  }
  for (const version of Object.keys(record)) {
    if (!sections.some(([v]) => v === version)) problems.push(`${version}: a hash is recorded, and the section is gone`);
  }
  return problems;
}
