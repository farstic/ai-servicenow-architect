import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planRecipe, readAreas } from '../tools/snowarch/lib/docs/sync.mjs';

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
  const m = /## The git-only corpus recipe\n[\s\S]*?```sh\n([\s\S]*?)```/.exec(text);
  assert.ok(m, 'no git-only recipe block in docs/ARCHITECTURE.md');
  return m[1].trimEnd().split('\n');
};

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

test('the block carries the pin, the family and every area', () => {
  const areas = readAreas(root, config.docs.areasFile);
  const text = blockOf(arch).join('\n');
  assert.ok(text.includes(config.docs.pin), 'the pin is not in the block');
  assert.ok(text.includes(`--branch ${config.docs.family}`), 'the family is not in the block');
  for (const a of areas) assert.ok(text.includes(a), `area missing from the block: ${a}`);
  // Counted from the file, never a literal: the count moves whenever gen-docs-areas runs.
  console.log(`    recipe: ${blockOf(arch).length} commands, ${areas.length} areas`);
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
  assert.deepEqual(win.slice(0, posix.length), posix);
  assert.deepEqual(win.slice(posix.length), ['git -C vendor/ServiceNowDocs config core.longpaths true']);
});
