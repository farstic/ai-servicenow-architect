// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * A changelog as `scripts/release.mjs` writes it, for the sweeps that read `docs/CHANGELOG.md`.
 *
 * ARC-07-C43. The rc.3 cut failed on its own write: a commit's subject in the generated `### Internal`
 * group was read as a page. The sweeps that read the changelog without that group test it on this
 * fixture. It is built by the generator's own functions (`buildFile`, `extractUnreleased`,
 * `renderGroups`, `trailerLine`), so a change to the line the generator writes reaches every case that
 * uses it, and the cases cannot each hold a different idea of what a release writes.
 */
import { buildFile, extractUnreleased, renderGroups, trailerLine } from '../../scripts/lib/release/changelog.mjs';

const sha = (seed) => seed.padEnd(40, '0');
const trailer = trailerLine('9.9.9', { contract: '0'.repeat(12), docsPin: '0'.repeat(7) });

/** One commit as `readCommits` returns it: not a merge, so the generator gives it a line. */
export const commit = (subject, seed) => ({ sha: sha(seed), subject, body: '', parents: [sha('0')] });

/** The hand-written block, carried down into a release section, then the commits' generated groups. */
export function releasedChangelog(handWritten, commits) {
  const text = `# Changelog\n\n## Unreleased\n\n${handWritten}\n`;
  const built = buildFile({ text, version: '9.9.9', date: '2026-10-12', carried: extractUnreleased(text),
    body: renderGroups(commits), trailer });
  if (!built.ok) throw new Error(built.message);
  return built.text;
}
