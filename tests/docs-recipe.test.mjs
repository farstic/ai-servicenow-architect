import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATTRIBUTION, planRecipe, readAreas } from '../tools/snowarch/lib/docs/sync.mjs';
import { recipeLines } from '../tools/snowarch/lib/docs/recipe-block.mjs';

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

/**
 * AC 5 — the recipe has ONE source, and three files repeat it.
 *
 * `docs/ARCHITECTURE.md` publishes it, `docs-recipe.sh` and `docs-recipe.ps1` are what the
 * Node-free launchers will source, and `docs sync --print-recipe` is what the Node path prints.
 * Four readers of one function. The whole point of generating them is that nobody types the
 * commands twice; the whole point of this test is that nobody can.
 */
const LAUNCHERS = [
  { id: 'sh', path: 'tools/snowarch/launcher/docs-recipe.sh', platform: 'linux' },
  { id: 'ps1', path: 'tools/snowarch/launcher/docs-recipe.ps1', platform: 'win32' },
];

/** The lines between `# recipe-begin <mode>` and `# recipe-end`, unindented. */
function launcherRecipe(text, mode) {
  const begin = `# recipe-begin ${mode}`;
  const start = text.indexOf(begin);
  const stop = text.indexOf('# recipe-end', start);
  assert.notEqual(start, -1, `no ${begin} marker`);
  assert.notEqual(stop, -1, '# recipe-end marker missing');
  // `\r` stripped: `.gitattributes` stores `*.ps1` as `eol=crlf`, so in a real checkout every line
  // of the PowerShell launcher ends with one. Without this the parity test would fail on every
  // machine that had actually cloned the repository — including, eventually, CI.
  return text.slice(start + begin.length, stop).split('\n')
    .map((l) => l.replace(/\r$/, '').replace(/^ {2}/, '')).filter((l) => l.trim() !== '');
}

/** A unified diff naming the target and the line, because "they differ" is not a bug report. */
function unified(target, expected, actual) {
  const out = [`--- expected (recipe-block.mjs)`, `+++ ${target}`];
  const n = Math.max(expected.length, actual.length);
  for (let i = 0; i < n; i += 1) {
    if (expected[i] !== actual[i]) {
      if (expected[i] !== undefined) out.push(`-${i + 1}: ${expected[i]}`);
      if (actual[i] !== undefined) out.push(`+${i + 1}: ${actual[i]}`);
    }
  }
  return out.join('\n');
}

test('AC 5 — all three targets carry the generated recipe, for both modes', () => {
  const cfg = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const areasList = readFileSync(join(root, cfg.docs.areasFile), 'utf8')
    .split('\n').map((l) => l.trim()).filter(Boolean);

  // The published block: sparse, POSIX.
  const expectedBlock = recipeLines({ config: cfg, areas: areasList });
  assert.deepEqual(blockOf(arch), expectedBlock,
    unified('docs/ARCHITECTURE.md', expectedBlock, blockOf(arch)));

  for (const launcher of LAUNCHERS) {
    const text = readFileSync(join(root, launcher.path), 'utf8');
    for (const mode of ['sparse', 'full']) {
      const expected = recipeLines({ config: cfg, areas: areasList, mode, platform: launcher.platform });
      const actual = launcherRecipe(text, mode);
      assert.deepEqual(actual, expected, unified(`${launcher.path} (${mode})`, expected, actual));
    }
  }
});

test('AC 5 negative — one changed line in any target is caught, with the line named', () => {
  // Proven per target rather than once: a diff that only checked the first file would let the two
  // launchers drift silently, which is the exact failure this test exists to prevent.
  const cfg = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const areasList = readFileSync(join(root, cfg.docs.areasFile), 'utf8')
    .split('\n').map((l) => l.trim()).filter(Boolean);

  for (const launcher of LAUNCHERS) {
    const text = readFileSync(join(root, launcher.path), 'utf8');
    const expected = recipeLines({ config: cfg, areas: areasList, mode: 'sparse',
      platform: launcher.platform });
    const tampered = launcherRecipe(text, 'sparse').map((l, i) => (i === 2 ? `${l} --tampered` : l));
    assert.notDeepEqual(tampered, expected, launcher.id);
    const diff = unified(launcher.path, expected, tampered);
    assert.match(diff, new RegExp(`\\+\\+\\+ ${launcher.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(diff, /^\+3: .*--tampered$/m, 'the diff must name the LINE, not just the file');
  }
});

test('the Windows launcher carries the long-paths line and the POSIX one does not', () => {
  const cfg = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const areasList = readFileSync(join(root, cfg.docs.areasFile), 'utf8')
    .split('\n').map((l) => l.trim()).filter(Boolean);
  const sh = launcherRecipe(readFileSync(join(root, LAUNCHERS[0].path), 'utf8'), 'sparse');
  const ps1 = launcherRecipe(readFileSync(join(root, LAUNCHERS[1].path), 'utf8'), 'sparse');

  assert.ok(ps1.some((l) => l.includes('core.longpaths')), 'a 197-character path needs it there');
  assert.ok(!sh.some((l) => l.includes('core.longpaths')), 'and POSIX does not');
  assert.equal(ps1.length, sh.length + 1, 'that line is the only difference');
  assert.deepEqual(ps1.filter((l) => !l.includes('core.longpaths')), sh);
  assert.ok(areasList.length > 0);
});

test('the CLI prints lines from the same recipe, for the state the tree is in', () => {
  // `--print-recipe` renders for the state the checkout is ACTUALLY in: on a machine that already
  // has the corpus at the pin it omits the clone, the fetch and the checkout, because those are
  // done. So the claim is not equality — it is that every line it prints is a line of the generated
  // fresh-checkout recipe, in order. That proves the command and the three files come out of one
  // function without pretending a populated tree needs a clone.
  const r = spawnSync(process.execPath,
    [join(root, 'tools/snowarch/bin/snowarch.mjs'), 'docs', 'sync', '--print-recipe', '--mode', 'sparse'],
    { encoding: 'utf8', cwd: root });
  assert.equal(r.status, 0, r.stderr);
  const printed = r.stdout.split('\n').map((l) => l.trim())
    .filter((l) => l.startsWith('git ') || l.startsWith('echo '));
  assert.ok(printed.length > 0, 'the command printed no recipe at all');

  const cfg = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const areasList = readFileSync(join(root, cfg.docs.areasFile), 'utf8')
    .split('\n').map((l) => l.trim()).filter(Boolean);
  const fresh = recipeLines({ config: cfg, areas: areasList, mode: 'sparse',
    platform: process.platform });

  let at = 0;
  for (const line of printed) {
    const found = fresh.indexOf(line, at);
    assert.notEqual(found, -1, unified('--print-recipe', fresh, printed)
      + `\n(the line above is not in the generated recipe, or is out of order: ${line})`);
    at = found + 1;
  }
  // Not vacuous: the last line is the attribution, which every rendering carries.
  assert.equal(printed.at(-1), fresh.at(-1));
});

test('the generator respects the file\'s own line endings, so a CRLF checkout stays current', () => {
  // `.gitattributes` stores `*.ps1` as `eol=crlf`, so `docs-recipe.ps1` arrives CRLF in EVERY
  // checkout on every OS. A generator that spliced LF into it would report STALE for ever on a
  // clean tree — `gen:check` red on a repository nobody had touched.
  const target = join(root, 'tools/snowarch/launcher/docs-recipe.ps1');
  const original = readFileSync(target);
  try {
    const lf = original.toString('utf8').replace(/\r\n/g, '\n');
    const crlf = lf.replace(/\n/g, '\r\n');
    assert.notEqual(lf, crlf, 'precondition: the two forms really differ');

    for (const [name, content] of [['LF', lf], ['CRLF', crlf]]) {
      writeFileSync(target, content);
      const r = spawnSync(process.execPath, [join(root, 'scripts/gen-docs-recipe.mjs'), '--check'],
        { encoding: 'utf8', cwd: root });
      assert.equal(r.status, 0, `${name} checkout reported stale:\n${r.stderr}`);
      assert.equal(readFileSync(target, 'utf8'), content, `--check wrote to the ${name} file`);
    }
  } finally {
    writeFileSync(target, original);
  }
});
