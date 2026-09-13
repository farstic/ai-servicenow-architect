import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ARC-05 acceptance, B05-04 — `gen-retired-names.mjs --check`, on a tree that is actually stale.
 *
 * `tests/contract/retired-names.test.mjs` runs `--check` on the committed tree, which is the
 * POSITIVE case and the one that is true every day; the failing path the generator exists for was
 * asserted by nothing, and neither was the line it prints.
 *
 * **The fixture has the ARC-03 shape, and it has to.** The generator resolves everything from its
 * own module location — `here` for `retired-identifiers.json` and its output, `here/../..` for
 * `packages/snowarch/tool-rename-map.json` and `retired-tools.json` — and takes **no path override
 * of any kind**. So "copy `packages/contract` to a temp root and run it" is not enough: with only
 * that directory copied, `root` resolves above the temp tree and the run dies on a missing rename
 * map rather than performing the check. Both package directories are copied, and a **marker** that
 * the real repository does not have proves where the generator actually resolved — because a
 * fixture that might be operating on the wrong tree is worse than no fixture.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = 'packages/contract/gen-retired-names.mjs';
const OUT = 'packages/contract/retired-names.json';
const IDENT = 'packages/contract/retired-identifiers.json';

/** The generator's whole world: its own directory, and the two files it reads one level up. */
const NEEDED = [SCRIPT, OUT, IDENT,
  'packages/snowarch/tool-rename-map.json', 'packages/snowarch/retired-tools.json'];

/**
 * The marker: a key no committed file carries, so finding it proves which tree was read.
 *
 * Deliberately NOT tool-shaped. The first draft carried the server's tool prefix, and
 * engine-lint's L01 failed it by name — *token … not in contract* — because every token with that
 * prefix in an engine file must be a tool the contract declares. The check is right, and the
 * marker does not need the prefix: its whole job is to be a key nothing else has. The old spelling
 * is not quoted here either, for the same reason — L01 cannot tell a name used from a name being
 * recorded as wrong, and it does not have to.
 */
const MARKER = 'fixture_marker_only_in_the_copied_tree';

function fixtureTree() {
  const dir = mkdtempSync(join(tmpdir(), 'gen-retired-'));
  for (const rel of NEEDED) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    copyFileSync(join(root, rel), join(dir, rel));
  }
  return dir;
}

const run = (dir, args) => spawnSync(process.execPath, [join(dir, SCRIPT), ...args],
  { encoding: 'utf8', cwd: root });   // cwd is the REAL repo on purpose — see below

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

test('B05-04 — a key added to retired-identifiers makes --check exit 1 and name it', () => {
  const dir = fixtureTree();
  const realOutBefore = readFileSync(join(root, OUT), 'utf8');
  try {
    // Sanity: the copied tree is current before it is made stale, or "exit 1" below would be
    // telling us about the copy rather than about the key.
    const current = run(dir, ['--check']);
    assert.equal(current.status, 0, current.stdout + current.stderr);
    assert.match(current.stdout, /retired-names\.json current \(\d+ names\)/);

    const ident = read(join(dir, IDENT));
    assert.ok(!(MARKER in ident), 'fixture: the marker is already a real key');
    ident[MARKER] = 'snow_core_status_read';
    writeFileSync(join(dir, IDENT), `${JSON.stringify(ident, null, 2)}\n`);

    const stale = run(dir, ['--check']);
    assert.equal(stale.status, 1, stale.stdout + stale.stderr);
    assert.match(stale.stderr, /gen-retired-names: retired-names\.json is stale\./);
    assert.match(stale.stderr, new RegExp(`missing: ${MARKER} -> snow_core_status_read`));
    assert.match(stale.stderr, /Run: node packages\/contract\/gen-retired-names\.mjs/);

    // `--check` WRITES NOTHING, in either tree.
    assert.ok(!(MARKER in read(join(dir, OUT))), '--check wrote to the fixture output');

    // And the run without `--check` adds it — to the FIXTURE.
    const written = run(dir, []);
    assert.equal(written.status, 0, written.stdout + written.stderr);
    assert.equal(read(join(dir, OUT))[MARKER], 'snow_core_status_read');
    const after = run(dir, ['--check']);
    assert.equal(after.status, 0, after.stdout + after.stderr);
  } finally {
    // THE MARKER ASSERTION, and it is the point of the fixture: the real repository must be
    // untouched and must never have heard of the marker. `cwd` was the real repo throughout, so a
    // generator that read `cwd` instead of its own location would have failed this, loudly.
    assert.equal(readFileSync(join(root, OUT), 'utf8'), realOutBefore,
      'the generator wrote into the REAL retired-names.json — it resolved the wrong tree');
    assert.ok(!readFileSync(join(root, IDENT), 'utf8').includes(MARKER));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('B05-04 — the fixture needs BOTH package directories, and says so when it does not', () => {
  // The negative control for the fixture itself. Copy only `packages/contract`, as the acceptance
  // plan proposed, and the generator cannot find the rename map: it fails on a missing file rather
  // than performing the check. Without this, a future edit could quietly drop the second directory
  // and the test above would still pass against whatever it happened to resolve.
  const dir = mkdtempSync(join(tmpdir(), 'gen-retired-partial-'));
  try {
    for (const rel of [SCRIPT, OUT, IDENT]) {
      mkdirSync(join(dir, dirname(rel)), { recursive: true });
      copyFileSync(join(root, rel), join(dir, rel));
    }
    const r = run(dir, ['--check']);
    assert.notEqual(r.status, 0, 'a half-copied fixture somehow succeeded');
    assert.match(r.stderr, /tool-rename-map\.json/,
      `the failure was not the missing rename map: ${r.stderr.slice(0, 200)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
