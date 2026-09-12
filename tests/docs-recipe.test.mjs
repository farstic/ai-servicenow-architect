import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATTRIBUTION, planRecipe, readAreas } from '../tools/snowarch/lib/docs/sync.mjs';
import { PRECONDITION, RERUN_NOTE, TOLERATED, joinRecipe, recipeLines, stepName } from '../tools/snowarch/lib/docs/recipe-block.mjs';

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
  // Against the RENDERED recipe, not the bare command list: since ARC-03-C1 the block is a chain
  // that stops at the first failure, and comparing it to the unjoined commands would assert the
  // block is exactly the thing it must no longer be.
  assert.deepEqual(blockOf(arch), joinRecipe(planned, 'sh'));
});

test('the block ends with the attribution line, the same string sync prints', () => {
  // Three copies of a licence attribution is three chances for one to be wrong. The recipe's last
  // line is an `echo` of the module's own constant, and this is what compares them.
  const block = blockOf(arch);
  // Two claims, because the block gained a trailing line that is not a command: the re-run note is
  // last, and the attribution is the last thing the recipe RUNS. The note has to be last — a
  // comment between two chained steps is joined onto the `\` above it and eats the step below.
  assert.equal(block[block.length - 1], RERUN_NOTE);
  assert.equal(block[block.length - 2], `echo "${ATTRIBUTION}"`);
  assert.ok(!RERUN_NOTE.includes('\\'), 'the note must not itself carry a continuation');
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

test('every Windows git command carries long paths — not just the last one', () => {
  // AMENDED by ARC-06-S14. This test used to assert the Windows form differed by exactly ONE line:
  // a trailing `config core.longpaths true`. That was the bug, not the specification. The clone,
  // the sparse-checkout and the CHECKOUT all ran with the default `false`, and the first Node-free
  // Windows install ever performed — the `no-node, windows-latest` CI cell — finished with one
  // corpus file missing from the working tree, its path over 260 characters. `git status` inside
  // the submodule said ` D markdown/platform-security/…/sc-limit-attachme…`; the pointer had not
  // moved, so the outer repository just said "modified" and nothing said why.
  const areas = readAreas(root, config.docs.areasFile);
  const posix = planRecipe({ config, areas, state: { present: false }, platform: 'linux' });
  const win = planRecipe({ config, areas, state: { present: false }, platform: 'win32' });
  const attribution = `echo "${ATTRIBUTION}"`;
  assert.equal(posix[posix.length - 1], attribution);
  assert.equal(win[win.length - 1], attribution);

  const gitLines = (lines) => lines.filter((l) => l.startsWith('git '));
  for (const line of gitLines(win)) {
    assert.match(line, /^git -c core\.longpaths=true /, `a Windows git command without long paths: ${line}`);
  }
  for (const line of gitLines(posix)) {
    assert.equal(line.includes('core.longpaths'), false, `POSIX does not need it: ${line}`);
  }
  // The persistent setting stays as its own line, because a person typing `git -C
  // vendor/ServiceNowDocs …` afterwards has no `-c` flag on their command.
  assert.equal(win[win.length - 2], 'git -c core.longpaths=true -C vendor/ServiceNowDocs config core.longpaths true');
  // And the two forms are otherwise the same recipe: strip the flag and the extra line, and what
  // is left is POSIX, in order.
  const stripped = win.slice(0, -2).map((l) => l.replace('-c core.longpaths=true ', ''));
  assert.deepEqual(stripped, posix.slice(0, -1));
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

/**
 * The commands inside a rendering, with the fail-fast packaging removed.
 *
 * Deliberately NOT `joinRecipe` run backwards: this strips by SHAPE (a trailing continuation, a
 * `{ … || true ; }` wrapper, a `$LASTEXITCODE` guard, a comment), so a test using it fails when the
 * rendering grows a shape nobody told it about, instead of quietly agreeing with the generator.
 */
function commandsOf(lines) {
  return lines
    .map((l) => l.trim())
    .filter((l) => l !== '' && l !== '}' && !l.startsWith('#')
      && !l.startsWith('if ($LASTEXITCODE') && !l.startsWith('if (-not (Test-Path'))
    .map((l) => l.replace(/ && \\$/, ''))
    .map((l) => l.replace(/^\{ (.*) \|\| true ; \}$/, '$1'))
    // The clone's precondition: `{ <test> || <command> ; }` — the COMMAND is what this returns.
    .map((l) => l.replace(/^\{ \[ [^\]]*\] \|\| (.*) ; \}$/, '$1'));
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
  const expectedBlock = joinRecipe(recipeLines({ config: cfg, areas: areasList }), 'sh');
  assert.deepEqual(blockOf(arch), expectedBlock,
    unified('docs/ARCHITECTURE.md', expectedBlock, blockOf(arch)));

  for (const launcher of LAUNCHERS) {
    const text = readFileSync(join(root, launcher.path), 'utf8');
    for (const mode of ['sparse', 'full']) {
      const expected = joinRecipe(
        recipeLines({ config: cfg, areas: areasList, mode, platform: launcher.platform }),
        launcher.platform === 'win32' ? 'ps1' : 'sh');
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

  // The claim is about the git COMMANDS, and since ARC-03-C1 each rendering wraps them in its own
  // fail-fast packaging — ` && \` and `{ … || true ; }` in sh, `if ($LASTEXITCODE …)` in ps1, a
  // trailing note in both. `commandsOf` strips exactly that packaging back off, so this test keeps
  // asserting what it always asserted and the packaging is proven separately below.
  const shCmd = commandsOf(sh);
  const ps1Cmd = commandsOf(ps1);
  // Every command, not just the last (see the amendment above): the checkout is the one that
  // drops the file, and it is not the last line.
  for (const line of ps1Cmd) assert.match(line, /^(git -c core\.longpaths=true |echo )/, line);
  assert.ok(!shCmd.some((l) => l.includes('core.longpaths')), 'and POSIX does not');
  assert.equal(ps1Cmd.length, shCmd.length + 1, 'the persistent config line is the only EXTRA line');
  assert.deepEqual(
    ps1Cmd.filter((l) => !l.endsWith('config core.longpaths true'))
      .map((l) => l.replace('-c core.longpaths=true ', '')),
    shCmd);
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

/**
 * ARC-03-C1 — the rendered recipe stops at the first failure, on every surface.
 *
 * Until this, the generated bodies were commands in sequence with no check of any kind, so a shell
 * function's exit status was its final `echo`'s — always 0. `bootstrap (no-node, macos-latest)` hit
 * an HTTP 408 at the fetch on 89bb06f, the function returned 0, `|| die B02` never fired, and the
 * doctor reported "area missing" three steps downstream. The joiners are rendered from the ONE
 * source, so no surface can be fixed and another left behind.
 */

test('the sh renderings fail fast — every step but the last chains, the last does not', () => {
  const cfg = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const areasList = readAreas(root, cfg.docs.areasFile);

  for (const [label, lines] of [
    ['docs/ARCHITECTURE.md', blockOf(arch)],
    ['docs-recipe.sh (sparse)', launcherRecipe(readFileSync(join(root, LAUNCHERS[0].path), 'utf8'), 'sparse')],
    ['docs-recipe.sh (full)', launcherRecipe(readFileSync(join(root, LAUNCHERS[0].path), 'utf8'), 'full')],
  ]) {
    const steps = lines.filter((l) => !l.startsWith('#'));
    assert.ok(steps.length >= 5, `${label}: too few steps to be the recipe`);
    // Both directions, per line: every step but the last ends with the continuation…
    for (const l of steps.slice(0, -1)) {
      assert.ok(l.endsWith(' && \\'), `${label}: a step does not chain: ${l}`);
    }
    // …and the last carries none, or the chain would swallow whatever follows the block.
    assert.ok(!steps[steps.length - 1].endsWith('\\'), `${label}: the last step chains into nothing`);
    // `set -e` is NOT the mechanism, deliberately: this text is pasted into interactive shells, and
    // `set -e` stays set there and kills the user's session on their next failed command.
    assert.ok(!lines.some((l) => l.includes('set -e')), `${label}: set -e in pasteable text`);
  }

  // The joiner is not a property of the file — it is what the generator renders. Proven against a
  // list the generator has never seen, so the claim is about the function and not about the pin.
  const rendered = joinRecipe(['git one', 'git two', 'echo three'], 'sh');
  assert.deepEqual(rendered.slice(0, 3), ['git one && \\', 'git two && \\', 'echo three']);
  assert.equal(rendered[3], RERUN_NOTE);
  assert.ok(areasList.length > 0);
});

test('the tolerated steps are the two the Node path also lets fail — named, not positional', () => {
  assert.deepEqual([...TOLERATED], ['submodule absorbgitdirs', 'submodule init']);

  // The attribution, not a restatement: in `sync.mjs` every FATAL step goes through `runMapped`
  // (which throws), and the two tolerated ones deliberately do not — `absorbgitdirs` is wrapped in
  // try/catch, `submodule init` goes through `probe` and only warns. If a step ever changes sides
  // there, this fails rather than letting the launcher and the Node path disagree about what a
  // failed install is.
  const sync = readFileSync(join(root, 'tools/snowarch/lib/docs/sync.mjs'), 'utf8');
  // `runMapped(` may wrap before its argument list, and the corpus calls spread `...C` in front of
  // the verb — both forms are the same claim, so one pattern covers them.
  const routed = (verb) => new RegExp(`runMapped\\(\\s*\\[(?:\\.\\.\\.C,\\s*)?'${verb}'`).test(sync);
  for (const verb of ['clone', 'fetch', 'checkout', 'sparse-checkout']) {
    assert.ok(routed(verb), `${verb} is fatal in the recipe but is not a runMapped call in sync.mjs`);
  }
  assert.ok(!routed('submodule'),
    'submodule is tolerated in the recipe but throws in sync.mjs — the two paths disagree');
  // Not vacuous: a verb that is in neither list must not match either, or `routed` is matching
  // something other than what it claims.
  assert.ok(!routed('bisect'), 'the detector matches a verb sync.mjs never calls');
  // And the rendering honours it, both directions.
  const out = joinRecipe(['git clone X', 'git submodule absorbgitdirs Y', 'git submodule init -- Y',
    'echo done'], 'sh');
  // The clone carries its PRECONDITION — skipped when the checkout is already there, and still
  // fatal when it runs and fails. A tolerated step is the other shape: it runs and may fail.
  assert.equal(out[0], `{ ${PRECONDITION.clone.sh} || git clone X ; } && \\`);
  assert.equal(out[1], '{ git submodule absorbgitdirs Y || true ; } && \\');
  assert.equal(out[2], '{ git submodule init -- Y || true ; } && \\');
});

test('the ps1 rendering guards every fatal step and no tolerated one', () => {
  // TRIMMED first, and that is not cosmetic: the clone sits inside an `if (-not (Test-Path …))`
  // block, so it and its guard are indented. Classifying on the raw line would drop both — the
  // counts would still match, and the test would silently stop covering the step it was written
  // for. (It did, for one commit.)
  const ps1 = launcherRecipe(readFileSync(join(root, LAUNCHERS[1].path), 'utf8'), 'sparse')
    .map((l) => l.trim()).filter((l) => l !== '' && l !== '}');
  const gitSteps = ps1.filter((l) => l.startsWith('git '));
  const guards = ps1.filter((l) => l.startsWith('if ($LASTEXITCODE -ne 0)'));
  // The clone is guarded, and it is guarded INSIDE its precondition block.
  const raw = launcherRecipe(readFileSync(join(root, LAUNCHERS[1].path), 'utf8'), 'sparse');
  const at = raw.findIndex((l) => l.trim().startsWith('if (-not (Test-Path'));
  assert.notEqual(at, -1, 'the clone has no precondition block');
  assert.match(raw[at + 1].trim(), /^git .*\bclone\b/, 'the block does not contain the clone');
  assert.equal(raw[at + 2].trim(), 'if ($LASTEXITCODE -ne 0) { throw "corpus: clone failed" }');
  assert.equal(raw[at + 3].trim(), '}', 'the block does not close after its guard');
  const tolerated = gitSteps.filter((l) => TOLERATED.includes(stepName(l)));
  assert.ok(tolerated.length > 0, 'fixture: no tolerated step in the recipe to prove the gap with');
  assert.equal(guards.length, gitSteps.length - tolerated.length,
    'one guard per fatal git step, and none for a tolerated one');

  // Each guard sits directly UNDER its step and names it — a guard one line off would check the
  // previous command's code, which is how this class of bug survives review.
  for (let i = 0; i < ps1.length; i += 1) {
    if (!ps1[i].startsWith('git ')) continue;
    const name = stepName(ps1[i]);
    if (TOLERATED.includes(name)) {
      assert.ok(!(ps1[i + 1] ?? '').startsWith('if ($LASTEXITCODE'), `${name} must not be guarded`);
    } else {
      assert.equal(ps1[i + 1], `if ($LASTEXITCODE -ne 0) { throw "corpus: ${name} failed" }`);
    }
  }
  // PowerShell before 7.4 does not stop on a native command's exit code, so no preference setting
  // could replace these — asserted so a future edit does not "simplify" them away.
  assert.ok(!ps1.some((l) => l.includes('$ErrorActionPreference')),
    'an ErrorActionPreference does not reach a native command exit code');
});

test('every surface carries the re-run note, as its last line', () => {
  const files = {
    'docs/ARCHITECTURE.md': blockOf(arch),
    [LAUNCHERS[0].path]: launcherRecipe(readFileSync(join(root, LAUNCHERS[0].path), 'utf8'), 'sparse'),
    [LAUNCHERS[1].path]: launcherRecipe(readFileSync(join(root, LAUNCHERS[1].path), 'utf8'), 'sparse'),
  };
  for (const [path, lines] of Object.entries(files)) {
    assert.equal(lines[lines.length - 1], RERUN_NOTE, `${path} does not end with the note`);
    assert.equal(lines.filter((l) => l === RERUN_NOTE).length, 1, `${path} repeats the note`);
  }
  // The note names both halves of the promise the rest of this story makes true: the launcher
  // removes a directory it created (so a clone can run again), and `docs sync` finishes a partial
  // corpus rather than re-cloning it.
  assert.match(RERUN_NOTE, /^# /);
  assert.match(RERUN_NOTE, /leaves nothing behind/);
  assert.match(RERUN_NOTE, /fetches only what is missing/);
  // A comment between two chained steps would be joined onto the `\` above it and would eat the
  // step below — which is why it is last, and why it must never grow a continuation.
  assert.ok(!RERUN_NOTE.includes('\\'), 'the note carries a continuation');
});

test('the block is the POSIX printed recipe plus the packaging — and nothing else', () => {
  // The relation `docs/ARCHITECTURE.md` claims, asserted in BOTH directions. It used to claim the
  // block was byte-identical to `--print-recipe`; since ARC-03-C1 that is false — the block carries
  // the fail-fast packaging and `--print-recipe` deliberately does not, because the shell it is
  // pasted into is unknown on Windows.
  //
  // Against the POSIX rendering, with the platform PINNED, and that is the whole lesson of this
  // test's first version: it compared the block to `--print-recipe` on the RUNNING platform, passed
  // on macOS, and failed on all three Windows cells, where the CLI legitimately prints
  // `-c core.longpaths=true` on every command and one extra `config` line. The fix is not to strip
  // those from the printed lines to make them match — that would let a Windows-only step slip into
  // the POSIX block unnoticed, which is the one thing this test exists to catch. The CLI's own tie
  // to the recipe, on whatever platform it is running, is asserted by "the CLI prints lines from
  // the same recipe" above; this test owns the block, and the block is POSIX.
  const cfg = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const posix = recipeLines({ config: cfg, areas: readAreas(root, config.docs.areasFile),
    platform: 'linux' });
  const block = blockOf(arch);
  const commands = commandsOf(block);

  // Direction 1 — the commands ARE the POSIX recipe: same commands, same order, none added, none
  // dropped. A Windows-only line in the block fails here by name.
  assert.deepEqual(commands, posix, unified('docs/ARCHITECTURE.md (commands)', posix, commands));
  assert.ok(!commands.some((l) => l.includes('core.longpaths')),
    'a Windows-only step reached the POSIX block');

  // Direction 2 — the block adds NOTHING but the four packaging forms.
  const packaging = block.filter((l) => !commands.includes(l));
  assert.ok(packaging.length > 0, 'the block carries no packaging at all — the joiner is gone');
  for (const l of packaging) {
    const ok = l.endsWith(' && \\') || l === RERUN_NOTE
      || /^\{ \[ -e .*\] \|\| .* ; \}/.test(l) || /^\{ .* \|\| true ; \}/.test(l);
    assert.ok(ok, `the block adds something that is not joiner, precondition, tolerance or note: ${l}`);
  }
});
