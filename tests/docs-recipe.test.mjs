import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATTRIBUTION, planRecipe, readAreas } from '../tools/snowarch/lib/docs/sync.mjs';

/**
 * The launcher recipe in `docs/ARCHITECTURE.md` and the module must be the same commands.
 *
 * ARC-06's bash and PowerShell launchers execute that block verbatim when Node is absent, so a
 * block that has drifted from the module is a bootstrap that produces a different checkout from
 * every other path — and the difference would only surface as a citation failure much later.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
const arch = readFileSync(join(root, 'docs/ARCHITECTURE.md'), 'utf8');

const blockOf = (text) => {
  // The heading moved a level deeper when ARC-03-S10 consolidated six corpus sections under one.
  // Matched at either level rather than pinned to `###`, so the next reorganisation moves prose
  // without breaking a test about git commands.
  const m = /#{2,3} The git-only corpus recipe\n[\s\S]*?```sh\n([\s\S]*?)```/.exec(text);
  assert.ok(m, 'no git-only recipe block in docs/ARCHITECTURE.md');
  return m[1].trimEnd().split('\n');
};

test('the generated block is current — the generator is the parity guarantee now', () => {
  // The block embeds the docs pin, so a byte-for-byte assertion against `--print-recipe` failed on
  // every bump pull request by construction: the pin moved, the block did not. It is generated now,
  // like the roster block, and `--check` is the same guarantee without the built-in failure.
  const r = spawnSync(process.execPath, ['scripts/gen-docs-recipe.mjs', '--check'],
    { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
});

test('the ARCHITECTURE block equals the recipe for a fresh sparse checkout', () => {
  const areas = readAreas(root, config.docs.areasFile);
  // `state: { present: false }` is the launcher's situation — nothing on disk. The CLI's
  // --print-recipe reports the state it is actually in, so on a checkout-less tree the two agree,
  // which is what acceptance criterion 9 asserts and what this pins.
  // `platform: 'linux'` explicitly: the block is the POSIX sequence, and on Windows the recipe
  // legitimately carries one extra `core.longpaths` line — a single block cannot be byte-identical
  // on both, and reading the ambient platform here made this test pass on macOS and fail on the
  // Windows matrix cell for a difference that is by design.
  const planned = planRecipe({ config, areas, mode: 'sparse', state: { present: false }, platform: 'linux' });
  assert.deepEqual(blockOf(arch), planned);
});

test('the block ends with the attribution line, the same string sync prints', () => {
  // Three copies of a licence attribution is three chances for one to be wrong. The recipe's last
  // line is an `echo` of the module's own constant, and this is what compares them.
  const block = blockOf(arch);
  assert.equal(block[block.length - 1], `echo "${ATTRIBUTION}"`);
  assert.match(ATTRIBUTION, /^docs: ServiceNow product documentation © 2026 ServiceNow, Apache-2\.0 — vendor\/ServiceNowDocs\/LICENSE$/);
});

test('the block carries the pin, the family and every area', () => {
  const areas = readAreas(root, config.docs.areasFile);
  const text = blockOf(arch).join('\n');
  assert.ok(text.includes(config.docs.pin), 'the pin is not in the block');
  assert.ok(text.includes(`--branch ${config.docs.family}`), 'the family is not in the block');
  for (const a of areas) assert.ok(text.includes(a), `area missing from the block: ${a}`);
  // Counted from the file, never a literal: the count moves whenever gen-docs-areas runs.
  console.log(`    recipe: ${blockOf(arch).length} commands, ${areas.length} areas`);
});

test('AC 4 — one changed CHARACTER fails the parity check, with the diff', () => {
  // A lost line is the easy case. The one that matters is a single byte: a launcher running
  // `--depth 2` or a mistyped area name produces a different checkout and looks identical in review.
  const areas = readAreas(root, config.docs.areasFile);
  const planned = planRecipe({ config, areas, mode: 'sparse', state: { present: false }, platform: 'linux' });
  const clone = blockOf(arch);
  const i = clone.findIndex((l) => l.includes('--depth 1'));
  assert.ok(i !== -1, 'the recipe no longer carries --depth 1 — this negative is testing nothing');
  clone[i] = clone[i].replace('--depth 1', '--depth 2');

  let message = '';
  try { assert.deepEqual(clone, planned); }
  catch (e) { message = e.message; }
  assert.ok(message, 'a one-character change went unnoticed');
  assert.match(message, /depth/, 'the failure does not show what differs');
});

test('negative — a block that lost a command fails', () => {
  const areas = readAreas(root, config.docs.areasFile);
  const planned = planRecipe({ config, areas, mode: 'sparse', state: { present: false }, platform: 'linux' });
  const broken = arch.replace(`${planned[planned.length - 1]}\n`, '');
  assert.notEqual(broken, arch, 'the fixture-negative changed nothing');
  assert.throws(() => assert.deepEqual(blockOf(broken), planned), assert.AssertionError);
});

test('full mode disables sparse instead of setting it', () => {
  const areas = readAreas(root, config.docs.areasFile);
  const full = planRecipe({ config, areas, mode: 'full', state: { present: false }, platform: 'linux' });
  assert.ok(full.some((l) => l.includes('sparse-checkout disable')));
  assert.ok(!full.some((l) => l.includes('sparse-checkout set')));
});

test('the Windows recipe adds the long-paths line, and only that', () => {
  const areas = readAreas(root, config.docs.areasFile);
  const posix = planRecipe({ config, areas, state: { present: false }, platform: 'linux' });
  const win = planRecipe({ config, areas, state: { present: false }, platform: 'win32' });
  // The attribution echo is LAST on both, so the Windows line is inserted before it rather than
  // appended after — compared with the echo set aside, which is what makes the delta one line.
  const attribution = `echo "${ATTRIBUTION}"`;
  assert.equal(posix[posix.length - 1], attribution);
  assert.equal(win[win.length - 1], attribution);
  const p2 = posix.slice(0, -1);
  const w2 = win.slice(0, -1);
  assert.deepEqual(w2.slice(0, p2.length), p2);
  assert.deepEqual(w2.slice(p2.length), ['git -C vendor/ServiceNowDocs config core.longpaths true']);
});
