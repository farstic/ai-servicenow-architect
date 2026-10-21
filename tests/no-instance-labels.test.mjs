// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C216 — the maintainers' own instance labels stay out of the repository.
//
// A record cites an instance by what it is, "a Brazil-family PDI", never by the label a maintainer gave it. The labels
// are not client environments, but they name our own, and the repository is public. This guard holds that without
// writing a label down: DENIED holds the SHA-256 of each label, and every word-shaped token of every text file the
// commit will contain is hashed and looked up.
//
// A token is a maximal run of [a-z0-9], or of [a-z0-9_-], 3 to 40 characters long, after lowercasing. So a label is
// found inside a URL, a path, backticks or a sentence, in any case, and a label with a hyphen or an underscore is
// found whole.
//
// TO DENY A NEW LABEL: never type it into a file, a commit message or a pull request. Hash it at a prompt instead:
//   node -e "process.stdin.once('data', (d) => console.log(require('node:crypto').createHash('sha256').update(String(d).trim().toLowerCase()).digest('hex')))"
// type the label, press Enter, and add the printed hash to DENIED with a comment that says what kind of environment
// it is, never which one.
//
// A hash of a short label is obfuscation, not secrecy: a short label can be guessed from its hash. The guard's job is
// that no plain label lands in the tree again, from ARC-09-C216 on. History is not rewritten: a released tag keeps
// what it shipped, as the owner ruled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The SHA-256 of each denied label, lowercased. Each comment says what kind of environment it is, never which. */
export const DENIED = new Set([
  '45b2c93ee5b1a328ff5f6434819ca9fb8c9134a6f5b3c55048aea526dafbacbd', // a maintainer's PDI, Brazil family
  '3720d8a796dbd75a53e64f7503991a6c49ef1302ba84c1d2a61d492a4da55b3e', // the same PDI, under its second label
]);

/** A scan that reads fewer text files than this read the wrong tree, or none, and proves nothing. */
const FLOOR = 1000;

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** The tokens of one line: maximal runs of either shape, lowercased, 3 to 40 characters. */
export function tokens(line) {
  const lower = line.toLowerCase();
  const found = new Set();
  for (const shape of [/[a-z0-9]+/g, /[a-z0-9_-]+/g]) {
    for (const token of lower.match(shape) ?? []) if (token.length >= 3 && token.length <= 40) found.add(token);
  }
  return found;
}

/**
 * Every file the commit will contain: tracked, plus untracked and not ignored, so a local run answers what CI will
 * (ARC-10-C1's reason). A gitlink (`vendor/ServiceNowDocs`) reads as a directory and a deleted file not at all; both
 * are skipped. A file with a NUL byte in its first 8,000 bytes is binary, by git's own test, and skipped.
 */
export function scan({ cwd = root, denied = DENIED, env = process.env } = {}) {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd, env, encoding: 'utf8' }).split('\n').filter(Boolean).sort();
  const hashOf = new Map();
  const hits = [];
  let scanned = 0;
  for (const file of files) {
    let bytes;
    try { bytes = readFileSync(join(cwd, file)); } catch { continue; }
    if (bytes.subarray(0, 8000).includes(0)) continue;
    scanned += 1;
    bytes.toString('utf8').split('\n').forEach((line, i) => {
      for (const token of tokens(line)) {
        let hash = hashOf.get(token);
        if (hash === undefined) hashOf.set(token, hash = sha256(token));
        // The report names the place and the hash's first characters, never the token, so a red run in CI's public
        // log does not print the label it found.
        if (denied.has(hash)) hits.push(`${file}:${i + 1}: a denied instance label (sha256 ${hash.slice(0, 12)}…)`);
      }
    });
  }
  return { hits, scanned };
}

test('ARC-09-C216 — no text file names a maintainer\'s instance label', () => {
  const { hits, scanned } = scan();
  assert.ok(scanned >= FLOOR, `the scan read ${scanned} text files, fewer than ${FLOOR}: it did not read this tree`);
  assert.deepEqual(hits, [], `${hits.length} line(s) name a denied instance label:\n${hits.slice(0, 50).join('\n')}`);
});

test('ARC-09-C216 — the scan can fail: a planted label is found in any case, in a URL, a path and whole', (t) => {
  // The control runs in a repository of its own, so no other guard running beside this one meets the plant. The
  // labels are random, so this file names no label either.
  // Its git reads no global or system configuration, so a developer's own excludes cannot hide a planted file.
  const dir = tempDir('c216-', t);
  const env = { ...process.env, HOME: dir, USERPROFILE: dir, XDG_CONFIG_HOME: dir, GIT_CONFIG_NOSYSTEM: '1' };
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, env });
  const plain = `zq${randomBytes(6).toString('hex')}`;
  const hyphened = `zq-${randomBytes(4).toString('hex')}`;
  const denied = new Set([sha256(plain), sha256(hyphened)]);
  writeFileSync(join(dir, 'tracked.md'), `intro\nOn \`${plain.toUpperCase()}\`, see https://${plain}.service-now.com/x.\n`);
  execFileSync('git', ['add', 'tracked.md'], { cwd: dir, env });
  writeFileSync(join(dir, 'unstaged.txt'), `.local/${hyphened}/instances.json\n`);
  writeFileSync(join(dir, 'binary.bin'), Buffer.concat([Buffer.from([0]), Buffer.from(plain)]));
  writeFileSync(join(dir, 'clean.md'), `a Brazil-family PDI, ${plain.slice(0, 5)} and ${plain}x are not the label\n`);

  const { hits, scanned } = scan({ cwd: dir, denied, env });
  assert.equal(scanned, 3, 'the binary file is skipped; the tracked, the unstaged and the clean file are read');
  assert.deepEqual(hits.map((h) => h.replace(/ \(sha256 .*$/, '')), [
    'tracked.md:2: a denied instance label',
    'unstaged.txt:1: a denied instance label',
  ]);
  assert.ok(hits.every((h) => !h.includes(plain) && !h.includes(hyphened)), 'a report printed the label it found');
});
