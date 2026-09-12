#!/usr/bin/env node
/**
 * The release body: the changelog's own section for this version, and nothing written twice.
 *
 * ARC-09-S03. The story spells this as `changelog.mjs --section <tag>`, which would put a CLI on a
 * library that S01 and S02 both import — and a module that is sometimes a program is a module whose
 * imports have side effects. The wrapper is three lines and keeps `sectionFor` a function.
 *
 * ONE WRITER OF THE BODY (ARC-09-C21). The metrics table and the doctor sentence used to be
 * appended by the workflow AFTER this script ran, so nothing knew the total size — and rehearsal
 * run 9 reached `publish` for the first time only to be refused by the API:
 *
 *     HTTP 422: Validation Failed — body is too long (maximum is 125000 characters)
 *
 * 2.0.0's section is ~1,636 lines, because ARC-09-C12c correctly moved 1,224 lines of hand-written
 * Notes into it. That is a one-off history dump, but a workflow that only works while the changelog
 * stays small is a workflow that breaks on a release nobody is watching. So the body is composed
 * here, whole, and bounded: the generated groups entire, the Notes truncated at a paragraph
 * boundary with a link to the file that has all of them, then the metrics and the doctor sentence.
 *
 * The RECORD is not truncated: `docs/CHANGELOG.md` at the tag has every word, and the body says so.
 *
 * Usage: node scripts/ci/release-notes.mjs <tag> [--root <dir>] [--metrics <file>]
 * Exit 0 · 1 the version has no section · 2 cannot run.
 */
import { existsSync, readFileSync, writeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sectionFor } from '../lib/release/changelog.mjs';

/**
 * GitHub's own limit on a release body. A constant rather than a literal because the number belongs
 * to the API, and a reader who meets a truncation needs to know whose rule produced it.
 */
export const RELEASE_BODY_MAX = 125_000;

/** The repository the continuation link points into. */
const REPO = 'farstic/ai-servicenow-architect';

/** The sentence ARC-09-C19 puts beside the numbers, wherever the body is assembled. */
const DOCTOR_NOTE = '\n_The attached doctor JSONs come from hosted runners without Claude Code — '
  + 'E-00 is expected there, and every other check must be ok._\n';

/**
 * The body, bounded, with the Notes truncated at a PARAGRAPH boundary if they do not fit.
 *
 * Never mid-sentence and never inside a fenced block: a body that stops in the middle of a command
 * example is worse than one that says where the rest is. The generated groups are never truncated —
 * they are what the release IS. The Notes are prose about it, and prose has a canonical home.
 */
export function composeBody({ section, metrics = '', tag: tagName, max = RELEASE_BODY_MAX }) {
  const tail = metrics ? `\n${metrics.replace(/\s+$/, '')}\n` : '';
  const whole = `${section}\n${tail}${DOCTOR_NOTE}`;
  if (whole.length <= max) return whole;

  // WHICH END SURVIVES is the whole decision. The section is the version heading, then the
  // hand-written Notes, then the GENERATED GROUPS and the trailer — and the groups are what the
  // release IS: the list of what changed, derived from the commits. The Notes are prose about it,
  // and prose has a canonical home this body can link to. So the cut is made from the TOP of the
  // prose and the end is kept whole, which is the opposite of the obvious implementation (truncate
  // the tail) and the reason this function exists rather than a `slice`.
  const lines = section.split('\n');
  const heading = lines[0].startsWith('## ') ? lines[0] : '';
  const rest = heading ? lines.slice(1) : lines;

  const link = `\n_Notes continue in [docs/CHANGELOG.md § ${tagName.replace(/^v/, '')}]`
    + `(https://github.com/${REPO}/blob/${tagName}/docs/CHANGELOG.md)._\n`;
  const budget = max - (heading.length + 1 + link.length + tail.length + DOCTOR_NOTE.length);

  // Backwards, so the end is what fits. A fence is counted the same way in reverse: an odd number
  // of markers in the kept tail would mean the body OPENS inside a code block.
  const keptTail = [];
  let used = 0;
  let fences = 0;
  let lastSafe = 0;             // how many trailing lines end at a blank line with fences balanced
  for (let i = rest.length - 1; i >= 0; i -= 1) {
    const line = rest[i];
    if (used + line.length + 1 > budget) break;
    if (/^\s{0,3}(```|~~~)/.test(line)) fences += 1;
    keptTail.unshift(line);
    used += line.length + 1;
    if (line.trim() === '' && fences % 2 === 0) lastSafe = keptTail.length;
  }
  const kept = keptTail.slice(keptTail.length - (lastSafe || keptTail.length));
  const body = kept.join('\n').replace(/^\n+/, '');
  return `${heading}${heading ? '\n' : ''}${link}\n${body}\n${tail}${DOCTOR_NOTE}`;
}

const argv = process.argv.slice(2);
const value = (n) => (argv.indexOf(n) === -1 ? undefined : argv[argv.indexOf(n) + 1]);
const root = resolve(value('--root') ?? process.cwd());
const tag = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--root');

/**
 * The program half, and only when RUN. This file's own header warns that "a module that is
 * sometimes a program is a module whose imports have side effects" — and then it was one: importing
 * `composeBody` from a test ran everything below, printing a usage line and exiting 2 before a
 * single test ran. The same guard `assert-publish-target.mjs` uses.
 */
const isMain = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  if (!tag) {
    writeSync(2, 'release-notes: usage: node scripts/ci/release-notes.mjs <tag>\n');
    process.exit(2);
  }
  const file = join(root, 'docs/CHANGELOG.md');
  if (!existsSync(file)) {
    writeSync(2, `release-notes: ${file} is not there\n`);
    process.exit(2);
  }
  const version = tag.replace(/^v/, '');
  const section = sectionFor(readFileSync(file, 'utf8'), version);
  if (section === null) {
    // Not a warning with an empty body: a Release whose notes are blank is worse than a release
    // that stopped, because it is published and looks finished.
    writeSync(2, `release-notes: docs/CHANGELOG.md has no section for ${version} — `
      + 'the release commit should have written it\n');
    process.exit(1);
  }
  const metricsPath = value('--metrics');
  const metrics = metricsPath && existsSync(resolve(root, metricsPath))
    ? readFileSync(resolve(root, metricsPath), 'utf8')
    : '';
  writeSync(1, composeBody({ section, metrics, tag }));
}
