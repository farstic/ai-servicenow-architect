#!/usr/bin/env node
/**
 * Every commit on a pull request follows the convention, or the job is red.
 *
 * ARC-09-S02. The changelog is generated from commit subjects, so a subject nobody checked is a
 * changelog entry nobody wrote. The generator deliberately never fails on history — it records an
 * unconventional subject with `(unconventional)` and moves on — which means this is the only place
 * the discipline is actually enforced, and it enforces it where it can still be fixed: on the
 * commits of a pull request, before they are history.
 *
 * No npm dependency. A maintainer may swap in `@commitlint/cli` later; what this file fixes is the
 * JOB NAME and the MESSAGE FORMAT, because those are what a contributor reads and what the branch
 * protection requires.
 *
 * Usage: node scripts/ci/commitlint.mjs [--base <ref>] [--head <ref>]
 * Exit 0 every subject conforms · 1 at least one does not · 2 the range could not be resolved.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUBJECT } from '../lib/release/changelog.mjs';

const MAX_SUBJECT = 100;

const argv = process.argv.slice(2);
const value = (n) => (argv.indexOf(n) === -1 ? undefined : argv[argv.indexOf(n) + 1]);

// The repository being linted is the one the command was RUN in, not the one this file lives in.
// In CI those are the same directory; in a test they are deliberately not, and a lint that always
// asked its own checkout would answer about the wrong commits while looking like it worked.
const ROOT = resolve(value('--root') ?? process.cwd());

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

/**
 * The scopes a subject may use: the fixed vocabulary, plus every skill and agent directory name.
 *
 * Derived from the tree rather than listed, so a new skill does not need an edit here to be
 * nameable in a commit — the same reason the roster is loaded rather than spelled anywhere else.
 */
export function allowedScopes(root = process.cwd()) {
  const fixed = ['engine', 'server', 'contract', 'docs', 'bootstrap', 'doctor', 'wizard', 'ci',
    'release', 'deps', 'changelog', 'tests', 'plan'];
  const dirs = (rel) => {
    try {
      return readdirSync(join(root, rel), { withFileTypes: true })
        .filter((e) => e.isDirectory()).map((e) => e.name);
    } catch { return []; }
  };
  return new Set([...fixed, ...dirs('.claude/skills'), ...dirs('.claude/agents')]);
}

/**
 * The range to check: the commits this branch ADDS, and no others.
 *
 * Two-dot on purpose. `A..B` is "reachable from B, not from A", which is exactly the commits a
 * pull request contributes; `A...B` is the SYMMETRIC difference and would drag in everything the
 * base has that the branch does not — the opposite of what a lint of "your commits" means.
 *
 * The BASE is the part that goes wrong. In CI the pull request names it and there is nothing to
 * guess. Locally, the first version of this defaulted to `origin/main`, and in this repository
 * `main` lags `develop` by a whole milestone: `origin/main..HEAD` therefore included every commit
 * merged into `develop` since the last release — thirty-odd commits of somebody else's work, some
 * of them written before this convention existed. The lint was right about them and useless to the
 * person running it. So the local base is the branch's own upstream when it has one, and
 * `origin/develop` — where the work actually targets — when it does not.
 */
export function resolveRange(env = process.env, flags = {}, { upstream = null, exists = () => false } = {}) {
  if (flags.base && flags.head) return { base: flags.base, head: flags.head, source: 'flags' };
  if (env.GITHUB_BASE_REF) {
    return { base: `origin/${env.GITHUB_BASE_REF}`, head: env.GITHUB_SHA || 'HEAD', source: 'ci' };
  }
  if (upstream) return { base: upstream, head: 'HEAD', source: 'upstream' };
  const base = exists('origin/develop') ? 'origin/develop' : 'origin/main';
  return { base, head: 'HEAD', source: 'local' };
}

/** `null` when the subject is fine; the reason when it is not. */
export function check(subject, scopes) {
  if (/^Merge (pull request|branch|remote-tracking)/.test(subject)) return null;
  const m = SUBJECT.exec(subject);
  if (!m) return 'expected type(scope)?: subject';
  if (subject.length > MAX_SUBJECT) return `subject is ${subject.length} characters, the limit is ${MAX_SUBJECT}`;
  const scope = m[3];
  if (scope && !scopes.has(scope)) {
    return `scope "${scope}" is not one of the allowed scopes`;
  }
  return null;
}

/** The line a contributor reads. Fixed by the story; the tests assert it character for character. */
export const failLine = (sha, subject, reason) =>
  `commitlint: FAIL ${sha.slice(0, 7)} "${subject}" — ${reason}; see docs/CONTRIBUTING.md#commits`;

export function lint({ commits, scopes }) {
  const failures = [];
  let checked = 0;
  for (const { sha, subject, parents } of commits) {
    if ((parents ?? []).length > 1) continue;          // a merge is not somebody's message
    const reason = check(subject, scopes);
    if (reason === null) { checked += 1; continue; }
    failures.push(failLine(sha, subject, reason));
  }
  return { checked, failures };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const tryGit = (args) => {
    try { return git(args).trim(); } catch { return null; }
  };
  const range = resolveRange(process.env, { base: value('--base'), head: value('--head') }, {
    upstream: tryGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']),
    exists: (ref) => tryGit(['rev-parse', '--verify', '--quiet', ref]) !== null,
  });
  let out;
  try {
    // `%P` so a merge is identified by its parents, not by its wording.
    out = git(['log', '--format=%H\x1f%s\x1f%P\x1e', `${range.base}..${range.head}`]);
  } catch (e) {
    process.stderr.write(`commitlint: cannot resolve ${range.base}..${range.head} (${range.source}) — `
      + 'the job needs fetch-depth: 0\n');
    process.stderr.write(`${String(e.stderr ?? e.message).split('\n')[0]}\n`);
    process.exit(2);
  }

  const commits = out.split('\x1e').map((r) => r.trim()).filter(Boolean).map((record) => {
    const [sha, subject, parents] = record.split('\x1f');
    return { sha, subject: subject ?? '', parents: (parents ?? '').trim().split(/\s+/).filter(Boolean) };
  });

  const { checked, failures } = lint({ commits, scopes: allowedScopes() });
  for (const line of failures) process.stderr.write(`${line}\n`);
  if (failures.length) process.exit(1);
  process.stdout.write(`commitlint: ${checked} commits ok\n`);
}
