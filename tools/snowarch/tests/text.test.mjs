import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADD_INSTANCE, EXPECTED_DIALOGS, MODE_DESIGN_NOTE, MODE_VARIANTS, changeLaterBlock, doctorLine,
  exportable, isWindowsShell, modeLine, nextBlock, restartSentence, spellings, summaryBlock,
} from '../lib/text.mjs';
import { COLUMNS } from '../lib/plan.mjs';
import { USAGE as MODE_USAGE } from '../lib/mode.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const config = JSON.parse(readFileSync(join(repoRoot, 'engine.config.json'), 'utf8'));
const KEY = config.mcp.serverKey;

test('AC 2 — the dialog count agrees with the row where it was measured', () => {
  // `docs/plans/03-RISKS-AND-UNKNOWNS.md` §F, the "S-01 (dialog count, 2.1.258)" row: the owner's
  // sitting on 2026-09-07 recorded `live` = 1 dialog (workspace trust only), `design` = 1, and
  // `control` — no toggle written — = 2. A wrong count here is a promise broken on first contact,
  // so the constant is checked against the row rather than against another copy of itself.
  const risks = readFileSync(join(repoRoot, 'docs/plans/03-RISKS-AND-UNKNOWNS.md'), 'utf8');
  const row = risks.split('\n').find((l) => l.includes('S-01 (dialog count'));
  assert.ok(row, 'the S-01 dialog-count row is gone — the constant has nothing to agree with');
  assert.match(row, /`live` = \*\*1\*\* dialog/);
  assert.match(row, /`control`[^|]*= \*\*2\*\*/, 'the control case is what "budgeted, not promised" means');
  assert.equal(EXPECTED_DIALOGS, 1);

  // ...and the row still says which version it was measured on, because the engine's floor is
  // older and that row is recorded as pending.
  assert.match(row, /2\.1\.258/);
});

test('one sentence per dialog — never a hedge', () => {
  const one = nextBlock({ mode: 'live', dialogs: 1, serverKey: KEY, platform: 'linux', env: {} });
  assert.equal(one.split('\n').filter((l) => /answer Yes\./.test(l)).length, 1);
  assert.ok(!one.includes('may see'), 'a hedge makes a reader distrust every other line');

  const two = nextBlock({ mode: 'live', dialogs: 2, serverKey: KEY, platform: 'linux', env: {} });
  assert.equal(two.split('\n').filter((l) => /answer Yes\./.test(l)).length, 2);
  assert.match(two, new RegExp(`…and one approval for the "${KEY}" MCP server — answer Yes\\.`));
  // The server key comes from the config, not from a literal — it is a name the contract owns.
  assert.ok(two.includes(KEY));
});

test('the Mode line has exactly two base forms', () => {
  assert.equal(modeLine({ mode: 'design-only' }), 'Mode: design-only');
  assert.equal(modeLine({ mode: 'live', instance: { label: 'pdi', environment: 'pdi', preset: 'full' } }),
    'Mode: live — instance=pdi (pdi) preset=full');
  // Live with nothing configured is still `live` — the mode is what was asked for, and the doctor
  // is what says whether it works.
  assert.equal(modeLine({ mode: 'live' }), 'Mode: live');
  // A label, an environment and a preset. Nothing that identifies a host or an account.
  const line = modeLine({ mode: 'live', instance: { label: 'pdi', environment: 'prod', preset: 'read-only',
    url: 'https://example.service-now.invalid', username: 'admin' } });
  assert.ok(!line.includes('service-now') && !line.includes('admin'), line);
});

test('AC 4 — the spellings follow the SHELL, not only the platform', () => {
  // Git Bash on Windows runs `./bootstrap.sh` perfectly well; telling that user to type
  // `.\bootstrap.cmd` would be telling them to type something that does not work.
  assert.deepEqual(spellings({ platform: 'linux', env: {} }),
    { bootstrap: './bootstrap.sh', cli: './snowarch' });
  assert.deepEqual(spellings({ platform: 'win32', env: {} }),
    { bootstrap: '.\\bootstrap.cmd', cli: '.\\snowarch.cmd' });
  assert.deepEqual(spellings({ platform: 'win32', env: { SHELL: '/usr/bin/bash' } }),
    { bootstrap: './bootstrap.sh', cli: './snowarch' }, 'Git Bash');
  assert.deepEqual(spellings({ platform: 'win32', env: { MSYSTEM: 'MINGW64' } }),
    { bootstrap: './bootstrap.sh', cli: './snowarch' }, 'MSYS');

  assert.equal(isWindowsShell({ platform: 'win32', env: {} }), true);
  assert.equal(isWindowsShell({ platform: 'darwin', env: {} }), false);

  // ...and the block that quotes them follows. Proven from any machine, because both are parameters.
  const cmd = nextBlock({ mode: 'design-only', serverKey: KEY, platform: 'win32', env: {} });
  assert.match(cmd, /snowarch\.cmd mode live/);
  const posix = nextBlock({ mode: 'design-only', serverKey: KEY, platform: 'linux', env: {} });
  assert.match(posix, /\.\/snowarch mode live/);
});

test('the DOCTOR line says what it does not know', () => {
  assert.equal(doctorLine({ ok: 41, warn: 0, fail: 0 }), 'DOCTOR: 41 ok, 0 warn, 0 fail');
  assert.equal(doctorLine({ nodeUsable: false }),
    'DOCTOR: unavailable until Node 20+ is installed (design-only is complete)');
  // The parenthesis matters: without it the line reads as a failed install.
  assert.match(doctorLine({ nodeUsable: false }), /design-only is complete/);
});

/**
 * ARC-08-C37 — the line at the END of a bootstrap names which check it counted.
 *
 * B09 already prints every FAIL in full underneath this line (`failures`, from ARC-08 Sitting A),
 * but its warnings come from `warningsFrom(state)` — the bootstrap STEPS' own warnings — so a
 * doctor warning was counted here and named nowhere. The owner met that twice: once on this line
 * and once on `/snowarch status`'s. The ids travel on the counts object, so `summaryBlock` needs no
 * new parameter and B09's call site is unchanged apart from what `doctorCounts` puts in it.
 */
test('ARC-08-C37 — B09\'s DOCTOR line names the checks it counted', () => {
  const checks = [{ id: 'E-23', status: 'warn' }, { id: 'E-29', status: 'fail' }];
  assert.equal(doctorLine({ ok: 14, warn: 1, fail: 1, skip: 26, checks }),
    'DOCTOR: 14 ok, 1 warn (E-23), 1 fail (E-29), 26 skipped');

  // THE FALLBACK TALLY HAS NOTHING TO NAME. When the doctor could not be spawned at all, B09 counts
  // `state.steps` instead, and those are bootstrap steps rather than checks — so the line says
  // nothing rather than filling a bracket with a guess.
  assert.equal(doctorLine({ ok: 14, warn: 1, fail: 1, skip: 26 }),
    'DOCTOR: 14 ok, 1 warn, 1 fail, 26 skipped');

  // AND THE SITE: the closing block a reader actually sees at the end of `./bootstrap.sh`.
  const block = summaryBlock({ mode: 'design', counts: { ok: 14, warn: 1, fail: 1, skip: 26, checks },
    serverKey: 'servicenow', platform: 'darwin', env: {} });
  assert.match(block.split('\n')[0], /^DOCTOR: 14 ok, 1 warn \(E-23\), 1 fail \(E-29\), 26 skipped$/);

  // THE COUNT AND THE IDS HAVE DIFFERENT SOURCES, and when they disagree the line shows both.
  // Decided rather than stumbled into: in production they cannot disagree — `summary` and `checks`
  // are two fields of one report — so a `0 fail (E-29)` line means the REPORT is inconsistent, and
  // a renderer that quietly dropped the id would hide an upstream defect instead of showing it. My
  // first draft of the case above asserted exactly this by accident, with `fail: 0` beside a
  // failing check, which is how the question got asked at all.
  assert.equal(doctorLine({ ok: 1, warn: 0, fail: 0, skip: 0, checks }),
    'DOCTOR: 1 ok, 0 warn (E-23), 0 fail (E-29)');
});

test('the summary block is five lines, and the warnings recap comes after them', () => {
  const clean = summaryBlock({ mode: 'design-only', counts: { ok: 7, warn: 0, fail: 0 },
    serverKey: KEY, platform: 'linux', env: {} });
  assert.equal(clean.split('\n').length, 5);
  assert.match(clean.split('\n')[0], /^DOCTOR: /);
  assert.equal(clean.split('\n')[1], 'Mode: design-only');

  const warned = summaryBlock({ mode: 'design-only', counts: { ok: 6, warn: 2, fail: 0 },
    serverKey: KEY, platform: 'linux', env: {},
    warnings: ['a cloud-synced folder (Dropbox)', '2 dead citation(s)'] });
  const lines = warned.split('\n');
  assert.equal(lines[5], 'Warnings: 2');
  assert.deepEqual(lines.slice(6), ['      a cloud-synced folder (Dropbox)', '      2 dead citation(s)']);
});

test('AC 5 — text.json is generated from these strings and is current', () => {
  const generated = JSON.parse(readFileSync(join(repoRoot, 'tools/snowarch/lib/text.json'), 'utf8'));
  const fresh = exportable({ serverKey: KEY });
  for (const [k, v] of Object.entries(fresh)) {
    assert.deepEqual(generated[k], v, `text.json is stale at ${k} — run node scripts/gen-text.mjs`);
  }
  // The launchers read this file, so the two shells' blocks must both be in it.
  assert.match(generated.posix.nextDesign, /\.\/snowarch mode live/);
  assert.match(generated.windows.nextDesign, /snowarch\.cmd mode live/);
  assert.equal(generated.expectedDialogs, EXPECTED_DIALOGS);
  assert.match(generated.$comment, /GENERATED by scripts\/gen-text\.mjs/);
});


/**
 * ARC-05-S06 criterion 3 — ONE remedy for "there is no instance yet".
 *
 * Sitting A got two, for one state, in one run: the doctor's Mode line said `./snowarch instance
 * add`, the bootstrap's Next block said `./snowarch mode live`. Both work, which is exactly what
 * makes two worse than one wrong one — the reader has to decide which is THE path.
 *
 * Asserted the way this repository already asserts AUTHENTICATION_FAILED: the string is defined
 * once and every surface that offers it is checked against that definition, so a reworded copy
 * fails here rather than reaching a user.
 */
test('the add-an-instance remedy is one string, in every place that offers it', () => {
  const remedy = ADD_INSTANCE();
  assert.match(remedy, /mode live/, 'the documented path is `mode live` — it runs the wizard as B06');
  assert.doesNotMatch(remedy, /instance add/,
    '`instance add` is the wizard alone: it leaves a live instance with design toggles around it');

  // Each surface is checked against the remedy AS THAT SURFACE SPELLS THE LAUNCHER. The Next block
  // renders `spellings().cli`, which is `.\\snowarch.cmd` on Windows, so comparing it against the
  // `./snowarch` default was the test choosing a platform and then checking a different one — it
  // passed on macOS and failed on every Windows cell.
  const surfaces = {
    'the doctor Mode line': [MODE_VARIANTS.unconfigured, ADD_INSTANCE()],
    'the bootstrap Next block': [nextBlock({ mode: 'design-only', serverKey: 'servicenow' }),
      ADD_INSTANCE(spellings().cli)],
  };
  for (const [where, [text, expected]] of Object.entries(surfaces)) {
    assert.ok(text.includes(expected), `${where} does not carry the one remedy verbatim:\n${text}`);
  }

  // Both directions — N places, counted. If a third surface starts offering its own wording, this
  // number is what makes somebody come back here instead of adding a fourth.
  assert.equal(Object.keys(surfaces).length, 2);

  // WINDOWS, asserted from a machine that is not Windows. The first version of this test compared
  // the Next block against the `./snowarch` default and was green here and red on four Windows
  // cells for three pushes. `spellings()` takes the platform, so the case can simply be stated.
  const win = spellings({ platform: 'win32', env: {} });
  // ARC-07-C1, closed by W7: the premise MOVED, deliberately, and this tripwire is what brought me
  // here. PowerShell does not resolve a command from the current directory and nothing puts the
  // checkout on PATH, so the bare name was the one spelling it refuses. The assertion stays a
  // premise rather than becoming a wildcard, so the next move trips it too.
  assert.equal(win.cli, '.\\snowarch.cmd', 'the premise moved: Windows no longer spells the launcher this way');
  const winBlock = nextBlock({ mode: 'design-only', serverKey: 'servicenow', platform: 'win32', env: {} });
  assert.ok(winBlock.includes(ADD_INSTANCE(win.cli)),
    `the Windows Next block does not carry the one remedy:\n${winBlock}`);
  assert.doesNotMatch(winBlock, /\.\/snowarch mode live/,
    'a Windows reader must not be handed the POSIX spelling');
});

test('ARC-06 — the restart sentence follows the mode being switched TO', () => {
  // After `mode design` this used to say "reconnect to LOAD the server" — pointing the user at the
  // thing the switch had just turned off. Seen on two of Sitting A's runs.
  const live = restartSentence('servicenow', 'live');
  assert.match(live, /to load the server/);

  const design = restartSentence('servicenow', 'design-only');
  assert.doesNotMatch(design, /to load the server/,
    'design-only must not tell anyone to reconnect in order to load a server it just unloaded');
  assert.match(design, /unload/);
  assert.match(design, /will not be listed in \/mcp/, 'say what they will see, not what to do again');

  // The default stays `live`, so every existing caller keeps its wording.
  assert.equal(restartSentence('servicenow'), live);
});


/**
 * ARC-07-W12 — the live ending says what can still be changed.
 *
 * THE FIXTURE IS `{ platform, env: {} }` AND THE EMPTY ENV IS LOAD-BEARING, for the reason
 * `tests/windows-spellings.test.mjs` writes out at length: `isWindowsShell` reads `env.SHELL` and
 * `env.MSYSTEM`, and `env` defaults to `process.env`, so `{ platform: 'win32' }` alone renders the
 * POSIX spellings on this machine and a case written that way passes against unfixed code.
 */
const LIVE = Object.freeze({
  mode: 'live',
  instance: { label: 'pdi', environment: 'pdi', preset: 'pdi-developer' },
  counts: { ok: 9, warn: 0, fail: 0 },
  serverKey: 'servicenow',
  platform: 'darwin',
  env: {},
});

test('ARC-07-W12 — the live ending names what can still be changed, with the label just saved', () => {
  const block = summaryBlock(LIVE);

  // The five subjects a live run has just decided. Named by what they change, not by their command:
  // a reader scanning this block is looking for a word, and finds the command on the same row.
  for (const subject of ['preset', 'flags', 'credentials', 'docs', 'design-only']) {
    assert.match(block, new RegExp(`^ +${subject} `, 'm'), `no row for ${subject}`);
  }

  // ARC-07-W11's rule, one row later: the command carries the answer the run already has. A block
  // that said `set-preset <label>` when the label is `pdi` is a command with a hole in it.
  assert.match(block, /instance set-preset pdi <preset>/);
  assert.match(block, /instance set-credentials pdi/);
  assert.doesNotMatch(block, /<label>/, 'the live ending knows the label; it must not print a hole');

  // The architect's ruling for this row, and the docs mode is the one that needs both names.
  assert.match(block, /docs sync --mode full/);
  assert.match(block, /--mode sparse/);

  // ...and `mode design`'s own sentence, QUOTED. Not paraphrased: see the constant's guard below.
  assert.ok(block.includes(MODE_DESIGN_NOTE), 'the design switch is described in new words');
});

test('ARC-07-W12 — a line that carries a command carries nothing else', () => {
  // THE SHAPE, NOT THE STRING — ARC-07-W7, where two wrong forms passed a string-equality
  // assertion. My first draft of this block wrote `mode design   — switch back to design-only …`:
  // prose inside a command, the identical defect the architect caught in that row's `pushd "{root}"
  // then .\bootstrap.cmd`. A reader selects the row and pastes it, and the shell sees the prose.
  for (const where of [{ platform: 'darwin', env: {} }, { platform: 'win32', env: {} }]) {
    const cli = spellings(where).cli;
    for (const line of changeLaterBlock({ label: 'pdi', ...where }).split('\n')) {
      if (!line.includes(cli)) continue;
      assert.doesNotMatch(line, / — /, `prose on a command line: ${line}`);
      assert.doesNotMatch(line, /\(/, `an aside on a command line: ${line}`);
      // Everything after the subject word is the command, so the row is pasteable from the launcher
      // to the end of the line.
      assert.ok(line.trimEnd().endsWith(line.slice(line.indexOf(cli)).trimEnd()),
        `something follows the command: ${line}`);
    }
  }
});

test('ARC-07-W12 — the block fits the column budget on both shells', () => {
  // The inline form was 100 columns on POSIX and 104 on Windows against a budget of 100, which is
  // why the aside became a third column rather than a suffix: one change fixed the paste hazard and
  // the width together.
  for (const where of [{ platform: 'darwin', env: {} }, { platform: 'win32', env: {} }]) {
    for (const line of changeLaterBlock({ label: 'pdi', ...where }).split('\n')) {
      assert.ok(line.length <= COLUMNS, `${line.length} > ${COLUMNS}: ${line}`);
    }
  }
});

test('ARC-07-W12 — the launcher is spelled by the definition, and `<label>` is the honest default', () => {
  const win = changeLaterBlock({ label: 'pdi', platform: 'win32', env: {} });
  assert.match(win, /\.\\snowarch\.cmd instance set-preset pdi/);
  assert.doesNotMatch(win, /\.\/snowarch instance/, 'a POSIX spelling reached a Windows block');

  // No instance to name — the caller that has none gets a placeholder rather than an invented label.
  const bare = changeLaterBlock({ platform: 'darwin', env: {} });
  assert.match(bare, /instance set-preset <label> <preset>/);
});

test('ARC-07-W12 — the design-only ending is unchanged, and the asymmetry is deliberate', () => {
  // FOUR OF THE FIVE ROWS NAME AN INSTANCE, and design-only has none. The design ending already
  // ends with a command that CHANGES what that reader chose — `Add a live instance later: run
  // ./snowarch mode live` — which is the asymmetry this row closes from the other side: the reader
  // who had chosen nothing was told how to change it, and the reader who had chosen six things was
  // told how to verify them. The three five-line assertions in this file and `b09-summary` are all
  // design-only, and they stay green untouched, which is the evidence that nothing moved there.
  const design = summaryBlock({ mode: 'design-only', counts: { ok: 7, warn: 0, fail: 0 },
    serverKey: KEY, platform: 'linux', env: {} });
  assert.equal(design.split('\n').length, 5);
  assert.doesNotMatch(design, /Change later/);
});

test('ARC-07-W12 — the warning is still the last thing on screen', () => {
  // The block goes BEFORE the warnings recap. The wizard's save path states the rule and this is
  // the same one: the line that matters is the one still there when the command ends.
  const warned = summaryBlock({ ...LIVE, warnings: ['STORE_IN_CLOUD_SYNC_FOLDER'] });
  assert.equal(warned.split('\n').at(-1), '      STORE_IN_CLOUD_SYNC_FOLDER');
  assert.match(warned, /Change later/);
});

test('ARC-07-W12 — one sentence about the design switch, and two readers of it', () => {
  // `mode --help` and the live ending. Two copies of "the instance store is kept" is how one of
  // them comes to say the opposite, and the question a reader hesitates over is exactly that.
  assert.ok(MODE_USAGE.includes(MODE_DESIGN_NOTE), 'mode --help no longer quotes the constant');
  assert.ok(changeLaterBlock({ label: 'pdi' }).includes(MODE_DESIGN_NOTE));
  // The help line's shape is unchanged: the sentence is the tail of the `design` row.
  const row = MODE_USAGE.split('\n').find((l) => l.trimStart().startsWith('design '));
  assert.ok(row.endsWith(MODE_DESIGN_NOTE), `the design row was reshaped: ${row}`);
});

test('ARC-07-W12 — the set-flags example is the one the server\'s own help prints', async () => {
  // The engine MAY read the server's `dist/` — `cloud-sync.mjs` does — and this is the direction
  // that is allowed. `set-flags` has an unusual argument shape, so the block shows an example; a
  // second example written here would drift from the one `instance --help` prints, which is the
  // defect this programme has met in every surface that re-spelled something.
  const { SUB_COMMANDS } = await import('../../../packages/snowarch/dist/cli/help-tables.js');
  const summary = SUB_COMMANDS['set-flags'].summary;
  for (const pair of ['WRITE=on', 'CMDB_WRITE=off']) {
    assert.ok(summary.includes(pair), `the help no longer shows ${pair} — the block's example is stale`);
    assert.ok(changeLaterBlock({ label: 'pdi' }).includes(pair));
  }
});
