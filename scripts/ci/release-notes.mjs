#!/usr/bin/env node
/**
 * The release body: the changelog's own section for this version, and nothing written twice.
 *
 * ARC-09-S03. The story spells this as `changelog.mjs --section <tag>`, which would put a CLI on a
 * library that S01 and S02 both import — and a module that is sometimes a program is a module whose
 * imports have side effects. The wrapper is three lines and keeps `sectionFor` a function.
 *
 * Usage: node scripts/ci/release-notes.mjs <tag> [--root <dir>]
 * Exit 0 · 1 the version has no section · 2 cannot run.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { sectionFor } from '../lib/release/changelog.mjs';

const argv = process.argv.slice(2);
const value = (n) => (argv.indexOf(n) === -1 ? undefined : argv[argv.indexOf(n) + 1]);
const root = resolve(value('--root') ?? process.cwd());
const tag = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--root');

if (!tag) {
  process.stderr.write('release-notes: usage: node scripts/ci/release-notes.mjs <tag>\n');
  process.exit(2);
}

const file = join(root, 'docs/CHANGELOG.md');
if (!existsSync(file)) {
  process.stderr.write(`release-notes: ${file} is not there\n`);
  process.exit(2);
}

const version = tag.replace(/^v/, '');
const section = sectionFor(readFileSync(file, 'utf8'), version);
if (section === null) {
  // Not a warning with an empty body: a Release whose notes are blank is worse than a release that
  // stopped, because it is published and looks finished.
  process.stderr.write(`release-notes: docs/CHANGELOG.md has no section for ${version} — `
    + 'the release commit should have written it\n');
  process.exit(1);
}
process.stdout.write(`${section}\n\n`);
