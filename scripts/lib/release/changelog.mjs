/**
 * The changelog section for a release, generated from the commits since the previous tag.
 *
 * ARC-09-S02. P-12 counted five version counters and the lesson generalises: anything maintained by
 * hand drifts from what it describes. So the per-release sections are GENERATED — from the subjects
 * people already write — and exactly one part of the file is hand-written and survives every
 * regeneration: the `### Notes` block under `## Unreleased`, which moves down into the release it
 * belongs to. That is the escape hatch, and it is deliberate: a generator with no place for a
 * sentence a human needed to write is a generator people route around.
 *
 * Three regions, and the boundaries matter more than the formatting:
 *   `## Unreleased`        Notes (hand-written) and nothing else; the next release takes it
 *   `## <x.y.z> — <date>`  generated groups, newest first, inserted directly under Unreleased
 *   `## Before 2.0.0`      the imported engine history, NEVER touched (AC 7)
 */
import { execFileSync } from 'node:child_process';

/** The conventional-commit subject, as the convention defines it. */
export const SUBJECT = /^(feat|fix|perf|refactor|docs|test|build|ci|chore|revert)(\(([^)]+)\))?(!)?: (.+)$/;

/** Where the imported history begins. Nothing at or below this line is ever rewritten. */
export const FROZEN_HEADING = '## Before 2.0.0';

/** type → section. `perf` and `refactor` are Changed; everything unlisted is Internal. */
const GROUP_OF = { feat: 'Added', fix: 'Fixed', perf: 'Changed', refactor: 'Changed' };
export const GROUPS = Object.freeze(['Breaking', 'Added', 'Fixed', 'Changed', 'Internal']);

// ASCII record and unit separators, written as escapes: a literal control character in a source
// file is invisible in every diff and review tool a person would read this in.
const RS = '\x1e';
const US = '\x1f';

/**
 * The commits to describe, newest first — `%H`, `%s`, `%b`, `%P`, one record each.
 *
 * `%P` comes along so merges can be skipped by their PARENT COUNT rather than by their subject: a
 * subject match would also swallow a real commit whose message happened to start with "Merge".
 */
export function readCommits({ root, from = null, git = defaultGit }) {
  const range = from ? [`${from}..HEAD`] : ['HEAD'];
  const out = git(root, ['log', `--format=%H${US}%s${US}%b${US}%P${RS}`, ...range]);
  return out.split(RS).map((r) => r.trim()).filter(Boolean).map((record) => {
    const [sha, subject, body, parents] = record.split(US);
    return {
      sha: (sha ?? '').trim(),
      subject: subject ?? '',
      body: body ?? '',
      parents: (parents ?? '').trim().split(/\s+/).filter(Boolean),
    };
  });
}

const defaultGit = (root, args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/**
 * One commit becomes one bullet, or `null` when it is not this file's to describe.
 *
 * A merge and a `chore(release):` commit are both noise here: the first describes an integration,
 * the second describes the release the reader is already looking at.
 */
export function classify(commit) {
  if (commit.parents.length > 1) return null;
  const short = commit.sha.slice(0, 7);
  const m = SUBJECT.exec(commit.subject);
  if (!m) {
    // History is not rewritten to suit a parser. An unconventional subject is recorded as written
    // and MARKED, so a reader sees it was not classified rather than wondering why a commit is
    // missing. Only the lint refuses, and only on commits not yet made.
    return { group: 'Internal', text: `${commit.subject} (${short}) (unconventional)`, breaking: null };
  }
  const [, type, , scope, bang, subject] = m;
  if (type === 'chore' && scope === 'release') return null;

  const footer = /^BREAKING CHANGE:\s*(.+)$/m.exec(commit.body ?? '');
  const breakingText = footer?.[1]?.trim() || subject;
  return {
    group: GROUP_OF[type] ?? 'Internal',
    text: `${scope ? `${scope}: ` : ''}${subject} (${short})`,
    breaking: (bang || footer) ? `${breakingText} (${short})` : null,
  };
}

/** The generated body: the non-empty groups, in the fixed order. */
export function renderGroups(commits) {
  const buckets = Object.fromEntries(GROUPS.map((g) => [g, []]));
  for (const commit of commits) {
    const entry = classify(commit);
    if (!entry) continue;
    buckets[entry.group].push(entry.text);
    if (entry.breaking) buckets.Breaking.push(entry.breaking);
  }
  return GROUPS
    .filter((g) => buckets[g].length > 0)
    .map((g) => `### ${g}\n\n${buckets[g].map((t) => `- ${t}`).join('\n')}\n`)
    .join('\n');
}

/** `Tag v2.0.0 · contract 7f798598a38e · docs-pin 11b39be` — what the release recorded. */
export const trailerLine = (version, { contract, docsPin } = {}) =>
  `Tag v${version} · contract ${String(contract ?? '').slice(0, 12)} · docs-pin ${String(docsPin ?? '').slice(0, 7)}`;

/** The `### Notes` block under `## Unreleased`, verbatim; `''` when empty, `null` with no heading. */
export function extractNotes(text) {
  const unreleased = /^## Unreleased[ \t]*$/m.exec(text);
  if (!unreleased) return null;
  const after = text.slice(unreleased.index + unreleased[0].length);
  const end = /^## /m.exec(after);
  const block = end ? after.slice(0, end.index) : after;
  const notes = /^### Notes[ \t]*$/m.exec(block);
  if (!notes) return '';
  const body = block.slice(notes.index + notes[0].length);
  const nextHeading = /^### /m.exec(body);
  return (nextHeading ? body.slice(0, nextHeading.index) : body).replace(/^\n+/, '').replace(/\s+$/, '');
}

/**
 * The new file: Unreleased emptied to a fresh Notes, and the release section inserted below it.
 *
 * Insertion is positional and bounded — after Unreleased's block, before whatever `## ` heading
 * follows, which is the newest release section or the frozen heading. Nothing below
 * `## Before 2.0.0` is read, matched or rewritten: it is not a region this function has an opinion
 * about, and that is what makes AC 7 true by construction rather than by care.
 */
export function buildFile({ text, version, date, notes, body, trailer }) {
  if (new RegExp(`^## ${version.replace(/\./g, '\\.')}[ \t]`, 'm').test(text)) {
    return { ok: false, message: `changelog: section ${version} already exists` };
  }
  const unreleased = /^## Unreleased[ \t]*$/m.exec(text);
  if (!unreleased) return { ok: false, message: 'changelog: no "## Unreleased" heading' };

  const head = text.slice(0, unreleased.index);
  const after = text.slice(unreleased.index + unreleased[0].length);
  const nextSection = /^## /m.exec(after);
  const tail = nextSection ? after.slice(nextSection.index) : '';

  const section = [
    `## ${version} — ${date}`,
    '',
    ...(notes ? ['### Notes', '', notes, ''] : []),
    ...(body ? [body.replace(/\s+$/, ''), ''] : []),
    trailer,
    '',
  ].join('\n');

  return { ok: true, text: `${head}## Unreleased\n\n### Notes\n\n${section}\n${tail}`, section };
}

/**
 * What `scripts/release.mjs` calls. Returns the section text as well, so S03 can use it as the
 * GitHub Release body instead of generating it again from a different input and getting a
 * different answer.
 */
export function writeChangelog({ root, version, date, from = null, tag = {}, git = defaultGit,
  read, write }) {
  const text = read('docs/CHANGELOG.md');
  const notes = extractNotes(text);
  if (notes === null) return { ok: false, message: 'changelog: no "## Unreleased" heading' };

  const commits = readCommits({ root, from, git });
  const built = buildFile({ text, version, date, notes,
    body: renderGroups(commits), trailer: trailerLine(version, tag) });
  if (!built.ok) return built;

  write('docs/CHANGELOG.md', built.text);
  return { ok: true, section: built.section };
}

/** One release's section, for S03's release body. `null` when that version is not in the file. */
export function sectionFor(text, version) {
  const heading = new RegExp(`^## ${version.replace(/\./g, '\\.')} — .*$`, 'm').exec(text);
  if (!heading) return null;
  const after = text.slice(heading.index + heading[0].length);
  const end = /^## /m.exec(after);
  return (end ? after.slice(0, end.index) : after).replace(/^\n+/, '').replace(/\s+$/, '');
}
