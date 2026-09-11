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
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// The changelog is ARC-09-S02's: it moves the hand-written Notes down into the release and
// generates the groups from the commit subjects since the previous tag. S01 shipped a stub that
// moved the heading and nothing else; this is the real one, imported rather than re-implemented.
import { writeChangelog as generateChangelog } from './changelog.mjs';

export { generateChangelog };

/** The files this script is allowed to stage. Explicit, never `git add -A`. */
export const STAGED = Object.freeze([
  // ARC-09-C12b: the rebuilt artefact and its pin are part of the release commit. Without them
  // `git add` staged a version bump whose contract still said `-dev`, and the release commit
  // failed its own `dist ok` gate on its own pull request.
  'packages/snowarch/dist',
  'packages/contract/required-tools.json',
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
export function applyWrites({ root, version, date, run, from = null, tag = {}, git = undefined,
  read = (p) => readFileSync(join(root, p), 'utf8'),
  write = (p, t) => writeFileSync(join(root, p), t),
  sha = (p) => createHash('sha256').update(readFileSync(join(root, p))).digest('hex') }) {
  const touched = [];

  const code = run(['npm', 'version', version, '--no-git-tag-version', '--workspaces',
    '--include-workspace-root']);
  if (code !== 0) return { ok: false, message: `release: npm version exited ${code} — nothing else was written` };
  touched.push('package.json', 'package-lock.json',
    'packages/snowarch/package.json', 'tools/snowarch/package.json');

  // ── THE ARTEFACT, REBUILT, BEFORE ANYTHING QUOTES ITS SHA (ARC-09-C12b) ────────────────────
  //
  // `dist/contract.json` EMBEDS the package version — `build-dist` bakes it in from
  // `packages/snowarch/package.json`, and `contract.test.ts` asserts the committed file is
  // byte-identical to an in-process build. So the moment `npm version` runs above, the committed
  // contract is stale: the release commit would fail its own `dist ok` gate on its own pull
  // request, and the tag would name a contract whose `version` still said `-dev`.
  //
  // This is a design gap in ARC-09-S01, not a test that needs relaxing, and `--dry-run` could
  // never have found it — a dry run stops before the writes. The v2.0.0-rc.0 rehearsal reached
  // this point and was rolled back by the post-write gate.
  //
  // Order matters and is the whole fix: version → rebuild → pin → generate → and only THEN the
  // changelog and the tag message, both of which quote the contract sha.
  const built = run(['node', 'scripts/build-dist.mjs']);
  if (built !== 0) return { ok: false, message: `release: build-dist exited ${built}`, touched };
  touched.push('packages/snowarch/dist');

  // The pin is the second record of the same thing, and it must move with it or the contract gate
  // fails on the release commit. `--yes` because there is nobody at a terminal inside a release.
  const pinned = run(['node', 'packages/contract/pin.mjs', '--yes']);
  if (pinned !== 0) return { ok: false, message: `release: pin.mjs exited ${pinned}`, touched };
  touched.push('packages/contract/required-tools.json');

  // The sha the rest of this release quotes: computed from the file that now exists, never from
  // the one that existed when the script started.
  const contractSha = sha('packages/snowarch/dist/contract.json');

  for (const [file, fn] of [
    ['CLAUDE.md', (t) => writeMarker(t, version)],
    ['docs/README-head.md', (t) => writeHead(t, version)],
  ]) {
    const result = fn(read(file));
    if (!result.ok) return { ok: false, message: result.message, touched };
    write(file, result.text);
    touched.push(file);
  }

  // Every generator, not only the README: a generated block that embeds the version or the
  // contract sha is stale for the same reason `dist/` was, and `gen-all --check` runs inside the
  // lint that the release PR will face.
  const gen = run(['npm', 'run', 'gen']);
  if (gen !== 0) return { ok: false, message: `release: gen-all exited ${gen}`, touched };
  touched.push('README.md');

  // The changelog LAST, because its trailer quotes the contract sha that only now exists.
  const log = generateChangelog({ root, version, date, from,
    tag: { ...tag, contract: contractSha }, read, write, ...(git ? { git } : {}) });
  if (!log.ok) return { ok: false, message: `release: ${log.message}`, touched };
  touched.push('docs/CHANGELOG.md');

  return { ok: true, touched, contractSha };
}

/**
 * Undo everything this script wrote. Only the paths it names — never the maintainer's other work.
 *
 * Two halves since ARC-09-C12b, because the writes now include a REBUILD. `git checkout --` restores
 * a tracked file that changed; it does nothing about a file that did not exist before, and
 * `build-dist` can add one. The preflight guarantees the tree was clean when the release started,
 * so anything untracked under these paths afterwards was written by this script and is safe to
 * remove — and leaving it behind is what makes the NEXT attempt refuse with "working tree not
 * clean" for a reason the maintainer did not cause.
 */
export function rollback(root, files) {
  if (files.length === 0) return;
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

  // Untracked FIRST, and identified before anything is restored: `git checkout --` cannot restore
  // a path git has never seen, and handed one it fails outright — taking the whole rollback with
  // it and leaving the tree in exactly the half-written state this function exists to prevent.
  // (Found by C12b's own rollback test, where the fixture's generated README is untracked.)
  const untracked = git(['status', '--porcelain', '--', ...files]).split('\n')
    .filter((l) => l.startsWith('??')).map((l) => l.slice(3).trim()).filter(Boolean);

  // What git actually tracks under these paths — a directory expands to its files.
  const tracked = git(['ls-files', '--', ...files]).split('\n').map((l) => l.trim()).filter(Boolean);
  if (tracked.length > 0) execFileSync('git', ['checkout', '--', ...tracked], { cwd: root, stdio: 'pipe' });

  // The preflight guarantees the tree was clean when the release started, so anything untracked
  // under these paths was written by this script: leaving it behind makes the NEXT attempt refuse
  // on a dirty tree the maintainer did not cause.
  for (const rel of untracked) rmSync(join(root, rel), { recursive: true, force: true });
}
