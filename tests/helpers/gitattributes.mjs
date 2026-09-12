/**
 * The repository's own `.gitattributes`, into a fixture tree — copied, never retyped.
 *
 * ARC-09-C12. Three fixtures have now had to learn the same lesson, and the third learned it from
 * a red Windows cell: a fixture repository with no `.gitattributes` inherits the RUNNER's
 * `core.autocrlf`, so on `windows-latest` a `git checkout --` restores CRLF into files the fixture
 * wrote as LF. `tests/release.test.mjs`'s rollback test asserts byte-equality before and after —
 * correctly — and it failed on Windows alone, because the rollback restored
 * `{\r\n  "schema": 1 …}` where the fixture had written `{\n  "schema": 1 …}`. The rollback was
 * right; the fixture was missing the file that decides what git writes.
 *
 * ARC-09-S07 hit this first (its harness now copies the real file), and a docs fixture hand-typed
 * a one-line subset — which is the other failure mode: a rule that drifts from the repository's.
 * `packages/snowarch/dist/** text eol=lf` exists precisely so that a Windows checkout does not
 * rewrite the committed artefact, and a fixture that pins only `* text=auto eol=lf` is not
 * reproducing the repository it stands in for.
 *
 * So this copies the tracked file. It cannot drift, and `tests/gitattributes-helper.test.mjs`
 * asserts that what it writes equals what is tracked.
 */
import { copyFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = join(REPO, '.gitattributes');

/** Write the repository's `.gitattributes` into `root`. Call it BEFORE the fixture's first commit. */
export function writeGitattributes(root) {
  copyFileSync(SOURCE, join(root, '.gitattributes'));
  return '.gitattributes';
}

/** The tracked file's text, for a test that wants to compare rather than copy. */
export const gitattributesText = () => readFileSync(SOURCE, 'utf8');
