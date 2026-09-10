/**
 * The five writes, and the rollback if the tree they produce is not consistent.
 *
 * ARC-09-S01. Nothing here runs until every gate has passed. What they write is the version, into
 * every place that carries one — and the point of the exercise is that there is exactly one
 * counter: `01` §12 makes the root `package.json` the version of record and everything else a
 * rendering of it, so these functions are the only writers and `tests/version-consistency.test.mjs`
 * is the assertion that they agreed.
 *
 * README IS GENERATED (ARC-06-S13): `README.md` = `docs/README-head.md` + `docs/INSTALL.md` body +
 * `docs/README-tail.md`, byte-asserted by `gen-readme --check` inside `npm run lint`. So the version
 * is written into the HEAD and the README is regenerated. A writer that edited `README.md` directly
 * would produce a tree whose own lint fails — after the gates had already passed, which is the
 * worst moment to discover it.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The `CLAUDE.md` marker (ARC-01-S06). Exactly one line matches, and the test proves it. */
export const MARKER = /^\*\*Version:\*\* (\S+) .*$/m;

/** The head's own version line — the fourth field, and the one a reader sees first. */
export const HEAD_VERSION = /^\*\*v(\S+)\*\* · /m;

/** shields.io escapes a literal `-` as `--`, so a prerelease does not become two fields. */
export const badgeVersion = (version) => version.replace(/-/g, '--');

export const badgeLine = (version) =>
  `![version](https://img.shields.io/badge/version-${badgeVersion(version)}-blue)`;

/**
 * `**Version:** <x.y.z> — …`, replaced in place.
 *
 * Zero or two matches is a refusal rather than a repair: the marker is how three other tools find
 * the version, and a file that has lost it — or grown a second — is one somebody edited by hand in
 * a way this script cannot safely guess at.
 */
export function writeMarker(text, version) {
  const hits = text.split('\n').filter((l) => MARKER.test(l));
  if (hits.length !== 1) return { ok: false, message: 'release: CLAUDE.md marker line missing or duplicated' };
  return { ok: true, text: text.replace(MARKER,
    `**Version:** ${version} — the version of record is the root package.json; this line is written by `
    + 'scripts/release.mjs. Supersedes engine v2.8.0 and snow-mcp 1.0.0.') };
}

/**
 * The README head: the version line, and the badge.
 *
 * The badge is INSERTED on the first release if it is absent — this story's first run is the one
 * that puts it there — and the head is kept short, because it is the part of the README a reader
 * sees before deciding whether to keep reading.
 */
export function writeHead(text, version) {
  let out = text;
  if (HEAD_VERSION.test(out)) {
    out = out.replace(HEAD_VERSION, `**v${version}** · `);
  } else {
    return { ok: false, message: 'release: docs/README-head.md has no "**v<x.y.z>** ·" line' };
  }
  const badge = badgeLine(version);
  if (/!\[version\]\(https:\/\/img\.shields\.io\/badge\/version-[^)]*\)/.test(out)) {
    out = out.replace(/!\[version\]\(https:\/\/img\.shields\.io\/badge\/version-[^)]*\)/, badge);
  } else {
    // Line 3, after the title and the version line — where a reader looks for it and where the
    // generated README puts it above the description.
    const lines = out.split('\n');
    const at = lines.findIndex((l) => HEAD_VERSION.test(l));
    lines.splice(at + 1, 0, '', badge);
    out = lines.join('\n');
  }
  return { ok: true, text: out };
}

/**
 * The changelog heading. S02 replaces the body generation; this is the heading move only.
 *
 * `## Unreleased` becomes `## <x.y.z> — <date>` and an empty `## Unreleased` is re-created above
 * it, so the next change has somewhere to go and nobody has to remember to add it.
 */
export function writeChangelog(text, version, date) {
  const heading = /^## Unreleased\s*$/m;
  if (!heading.test(text)) {
    return { ok: false, message: 'release: docs/CHANGELOG.md has no "## Unreleased" heading' };
  }
  return { ok: true,
    text: text.replace(heading, `## Unreleased\n\n## ${version} — ${date}`) };
}

/** The files this script is allowed to stage. Explicit, never `git add -A`. */
export const STAGED = Object.freeze([
  'package.json',
  'package-lock.json',
  'packages/snowarch/package.json',
  'tools/snowarch/package.json',
  'CLAUDE.md',
  'README.md',
  'docs/README-head.md',
  'docs/CHANGELOG.md',
]);

/**
 * Apply every write, or none of them.
 *
 * The version numbers themselves go through `npm version --workspaces`, not through a hand-written
 * JSON edit: it updates the three manifests AND `package-lock.json` in one call, and a lock file
 * edited by anything other than npm is a lock file npm will rewrite differently on the next install.
 *
 * `run` and the file accessors are injected so the whole sequence is testable without an npm.
 */
export function applyWrites({ root, version, date, run,
  read = (p) => readFileSync(join(root, p), 'utf8'),
  write = (p, t) => writeFileSync(join(root, p), t) }) {
  const touched = [];

  const code = run(['npm', 'version', version, '--no-git-tag-version', '--workspaces',
    '--include-workspace-root']);
  if (code !== 0) return { ok: false, message: `release: npm version exited ${code} — nothing else was written`, touched };
  touched.push('package.json', 'package-lock.json',
    'packages/snowarch/package.json', 'tools/snowarch/package.json');

  for (const [file, fn] of [
    ['CLAUDE.md', (t) => writeMarker(t, version)],
    ['docs/README-head.md', (t) => writeHead(t, version)],
    ['docs/CHANGELOG.md', (t) => writeChangelog(t, version, date)],
  ]) {
    const result = fn(read(file));
    if (!result.ok) return { ok: false, message: result.message, touched };
    write(file, result.text);
    touched.push(file);
  }

  // The README is a rendering of the head. Regenerated rather than edited, so `gen-readme --check`
  // — which runs inside the lint this release has already passed — still holds afterwards.
  const gen = run(['node', 'scripts/gen-readme.mjs']);
  if (gen !== 0) return { ok: false, message: `release: gen-readme exited ${gen}`, touched };
  touched.push('README.md');

  return { ok: true, touched };
}

/** Undo everything this script wrote. Only the files it names — never the maintainer's other work. */
export function rollback(root, files) {
  if (files.length === 0) return;
  execFileSync('git', ['checkout', '--', ...files], { cwd: root, stdio: 'pipe' });
}
