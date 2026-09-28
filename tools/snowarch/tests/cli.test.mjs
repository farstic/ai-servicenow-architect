import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, helpText, COMMANDS, main } from '../lib/cli.mjs';
import { createLogger } from '../lib/log.mjs';
import { spellings } from '../lib/text.mjs';

/**
 * ARC-07-C31 — the launcher these cases assert, DERIVED, and named for what prints it.
 *
 * `run()` spawns `bin/snowarch.mjs`, so the child renders the shell IT is running in: on the
 * three Windows cells that is `.\\snowarch.cmd`. Both expectations below held the POSIX form as a
 * literal — green on a mac, red under pwsh, and about nothing either way. Rule 1, and rule 2 for
 * the regex: `RegExp.escape` is not on Node 20 and the spelling contains `.` and `\\`.
 */
const FRAME_CLI = spellings().cli;
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
import { EXIT_OK, EXIT_USAGE } from '../lib/exit.mjs';
import { contractSha, cwdNote, loadConfig, version } from '../lib/config.mjs';
import { stateRootInUse, useStateRoot } from './helpers/state-root.mjs';
/*
 * ARC-07-C43 head 2 — THIS SUITE RUNS THE REAL CLI, so its `.local/` goes somewhere else.
 *
 * Measured: with this line absent, a full `npm test` leaves logs and the doctor/upgrade caches in the
 * repository's own `.local/`, which is gitignored and therefore invisible to `assert-clean`. A `cwd`
 * cannot fix it — `root` comes from `config.mjs`'s own location — so the state root is what moves.
 */
useStateRoot();


/**
 * The CLI frame: parse, dispatch, refuse clearly.
 *
 * What is tested is the FRAME, not the sub-commands — every command this will ever grow lands on
 * this parser and these exit codes, so a wrong answer here is wrong in everything written after.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const bin = join(repoRoot, 'tools', 'snowarch', 'bin', 'snowarch.mjs');

/**
 * Run the CLI as a user would, and keep BOTH streams whatever the exit code.
 *
 * `execFileSync` throws on failure and returns only stdout on success, so a helper built on it
 * silently discards stderr from a successful run — which is where this CLI puts its notes and
 * warnings. Two of these tests passed against an empty string before that was fixed.
 */
function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [bin, ...args],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/*
 * ARC-07-C43 head 2 — A SPAWNED CLI WRITES NOTHING UNDER THIS CHECKOUT, and the assertion is the
 * checkout's own `.local/` listed before and after rather than a claim about where the log went.
 *
 * `mode sideways` is the case the architect set, and it is the right one: it FAILS — `mode takes live
 * or design` — and a failing run logs, so before head 2 this exact command left
 * `.local/logs/mode-<stamp>.log` in the repository. It also needs no store, no instance and no
 * network, so what it proves is about the state root and nothing else.
 *
 * Two directions, because one alone would pass for the wrong reason: nothing NEW appears under the
 * checkout, AND the log the command certainly wrote is found under the redirected root. A case that
 * only checked the checkout would also pass if the command had silently stopped logging at all.
 */
test('ARC-07-C43 — a spawned `mode sideways` writes under the state root, not the checkout', () => {
  // NOT `useStateRoot()` — that would make this case pass on its own while every OTHER case in the
  // file still wrote into the checkout. It READS the suite's opt-in, so removing the call at the top
  // of this file fails here, which is the property that actually protects the other cases.
  const stateRootDir = stateRootInUse();
  assert.ok(stateRootDir,
    'this suite never called useStateRoot(), so every case in it writes into the checkout');
  const listing = (dir) => {
    const walk = (d, at = '') => {
      let out = [];
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const rel = at ? `${at}/${e.name}` : e.name;
        out = out.concat(e.isDirectory() ? walk(join(d, e.name), rel) : [rel]);
      }
      return out.sort();
    };
    return existsSync(dir) ? walk(dir) : [];
  };

  const checkoutLocal = join(repoRoot, '.local');
  const before = listing(checkoutLocal);
  const logsBefore = listing(join(stateRootDir, '.local', 'logs'));

  const m = run(['mode', 'sideways'], { cwd: repoRoot });

  assert.equal(m.code, EXIT_USAGE, 'the command did not run the way this case assumes');
  assert.match(m.stderr, /mode takes live or design/);
  assert.deepEqual(listing(checkoutLocal), before,
    'a spawned CLI added something under the checkout\'s .local/ — the state root did not reach it');
  const logsAfter = listing(join(stateRootDir, '.local', 'logs'));
  const added = logsAfter.filter((f) => !logsBefore.includes(f));
  assert.equal(added.length, 1, `expected one new log under the state root, got ${added.join(', ')}`);
  assert.match(added[0], /^mode-\d{8}-\d{6}\.log$/);
});

test('the parser: every form, and the errors', () => {
  const cases = [
    [['--flag', 'value'], { flag: 'value' }, []],
    [['--flag=value'], { flag: 'value' }, []],
    [['--flag='], { flag: '' }, []],
    [['--json'], { json: true }, []],
    [['--json', '--quiet'], { json: true, quiet: true }, []],
    [['--area', 'a', '--area', 'b'], { area: ['a', 'b'] }, []],
    [['--needs-a-value'], {}, ['--needs-a-value needs a value']],
    [['--Bad'], {}, ['malformed flag "--Bad"']],
  ];
  for (const [argv, flags, errors] of cases) {
    const r = parseArgs(argv);
    assert.deepEqual({ ...r.flags }, flags, argv.join(' '));
    assert.deepEqual(r.errors, errors, argv.join(' '));
  }
  assert.deepEqual(parseArgs(['--json', '--', '--not-a-flag']).positional, ['--not-a-flag']);
});

/**
 * ARC-07-C42 — A REPEATED BOOLEAN MEANT THE OPPOSITE OF WHAT IT SAID.
 *
 * `--no-cache --no-cache` produced `[true, true]`, and `doctorCommand` asks
 * `flags['no-cache'] === true`; an array is not `true`, so the doctor WROTE the cache it had twice been
 * told not to. Measured end to end before the fix, on the real CLI: one `--no-cache` left nothing in
 * `.local/`, two left `doctor-last.json` and `doctor-last.inputs.json`. Five `=== true` reads in
 * `doctor/index.mjs` shared the cause.
 *
 * BOTH DIRECTIONS IN ONE CASE, because the two halves of the parser's contract pull against each other:
 * a repeated VALUE flag must still accumulate (`--area a --area b` means both, which the parser's own
 * comment has said since ARC-06-S02 and which `--section` relies on), and a repeated DECLARED BOOLEAN
 * must collapse. A fix that made the parser last-wins everywhere would pass the boolean half and break
 * the value half silently — which is why the value half is asserted here rather than left to the case
 * above.
 */
test('ARC-07-C42 — a repeated declared boolean is true, and a repeated value flag is still both', () => {
  const doctor = { booleans: ['quick', 'no-cache', 'fix'] };

  // The defect, exactly: twice-given means the same as once-given, for every reader including `=== true`.
  assert.equal(parseArgs(['--no-cache', '--no-cache'], doctor).flags['no-cache'], true);
  assert.equal(parseArgs(['--no-cache', '--no-cache', '--no-cache'], doctor).flags['no-cache'], true);
  assert.equal(parseArgs(['--quick', '--quick'], doctor).flags.quick, true);
  // A UNIVERSAL boolean too — `json`, `quiet`, `verbose`, `help` are declared for every sub-command, so
  // a fix that only covered the per-command list would leave `--json --json` an array.
  assert.equal(parseArgs(['--json', '--json']).flags.json, true);

  // ...and the half that must NOT change. `--section` is a real value flag on this very command.
  assert.deepEqual(parseArgs(['--area', 'a', '--area', 'b']).flags.area, ['a', 'b']);
  assert.deepEqual(parseArgs(['--section', 'repo', '--section', 'host'], doctor).flags.section,
    ['repo', 'host']);
  // Three of them, so a fix that special-cased "exactly two" is caught.
  assert.deepEqual(parseArgs(['--area', 'a', '--area', 'b', '--area', 'c']).flags.area,
    ['a', 'b', 'c']);

  // A declared boolean given with an explicit VALUE is left alone, and that is deliberate: `--json=false`
  // carries the STRING 'false', every reader already treats it as truthy, and collapsing repeats of it to
  // `true` here would quietly change what a wrong command does. `--json=false` enabling `--json` is a
  // separate defect; this row does not pretend to fix it, and this assertion says so out loud.
  assert.deepEqual(parseArgs(['--json=false', '--json=false']).flags.json, ['false', 'false']);
});

test('a boolean flag does not eat the next word', () => {
  // `--json status` must not make `status` the value of `--json`: a parser that did would swallow a
  // sub-command and report "unknown command" for something the user typed correctly.
  const r = parseArgs(['--json', 'status']);
  assert.equal(r.flags.json, true);
  assert.deepEqual(r.positional, ['status']);
});

test('version prints what the files say, not what anyone typed', () => {
  const r = run(['version']);
  assert.equal(r.code, EXIT_OK);
  const config = loadConfig();
  assert.match(r.stdout, /^snowarch \S+ · contract [0-9a-f]{12} · docs pin [0-9a-f]{7} /);
  assert.ok(r.stdout.includes(version()), 'the version is not package.json\'s');
  assert.ok(r.stdout.includes(config.docs.pin.slice(0, 7)), 'the pin is not the config value');
  assert.ok(r.stdout.includes(config.docs.family));
  for (const v of Object.values(config.floors)) {
    assert.ok(r.stdout.includes(v), `floor ${v} is not printed from the config`);
  }
});

test('version --json is the shape the doctor will read', () => {
  const r = run(['version', '--json']);
  assert.equal(r.code, EXIT_OK);
  const o = JSON.parse(r.stdout);

  // ARC-06-S02's FIVE KEYS, unchanged in name and in type. This was a `deepEqual` over every key
  // until ARC-09-S04, which adds the git facts beside them — so the assertion became the one that
  // was always meant: these five are present and are what they were. A consumer written against
  // the old object still reads the same values out of the new one.
  for (const key of ['version', 'contractSha', 'docsPin', 'docsFamily', 'floors']) {
    assert.ok(key in o, `${key} is gone from version --json`);
  }
  assert.equal(o.version, version());
  assert.equal(o.contractSha, contractSha());
  assert.deepEqual(o.floors, loadConfig().floors);
  assert.equal(typeof o.docsPin, 'string');
  assert.equal(typeof o.docsFamily, 'string');
});

test('an unbuilt checkout says so rather than printing a stale sha', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-cli-'));
  try {
    writeFileSync(join(dir, 'engine.config.json'), readFileSync(join(repoRoot, 'engine.config.json')));
    // Precondition: the whole point is the ABSENT file.
    assert.ok(!existsSync(join(dir, 'packages/snowarch/dist/contract.json')), 'the fixture has a dist');
    assert.equal(contractSha(dir), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unknown command names itself and points at help', () => {
  const r = run(['nope']);
  assert.equal(r.code, EXIT_USAGE);
  assert.equal(r.stderr.trim(), `snowarch: unknown command "nope" — run ${FRAME_CLI} help`);
});

test("an unknown flag prints the sub-command's usage, not a stack trace", () => {
  const r = run(['version', '--nonsense']);
  assert.equal(r.code, EXIT_USAGE);
  assert.match(r.stderr, /--nonsense needs a value/);
  assert.match(r.stderr, new RegExp(`usage: ${esc(FRAME_CLI)} version`));
  assert.ok(!r.stderr.includes('\n    at '), 'a stack trace reached the user');
});

test('help lists every command and the exit codes', () => {
  const r = run([]);
  assert.equal(r.code, EXIT_OK);
  for (const name of Object.keys(COMMANDS)) assert.ok(r.stdout.includes(name), `${name} is not listed`);
  assert.match(r.stdout, /exit: 0 ok · 1 failed · 2 usage · 3 prerequisite missing · 130 interrupted/);
  assert.equal(r.stdout, `${helpText()}\n`);
});

test('the not-yet-built commands say which story adds them', () => {
  // THE LIST IS EMPTY, and that is the point it was built to reach. `bootstrap` left it at
  // ARC-06-S03 and `doctor` at ARC-08-S01 — the only way a placeholder should ever leave it is the
  // story that names it shipping it. The two assertions below are what stop either being quietly
  // re-added as a stub.
  for (const [name, story] of []) {
    const r = run([name]);
    assert.equal(r.code, EXIT_USAGE, name);
    assert.match(r.stderr, new RegExp(`"${name}" is not available in this build — ${story} adds it`));
  }

  // ...and `doctor` is not one of them any more: it runs, and an unknown section is a usage error
  // rather than a "not available" sentence.
  const doctor = run(['doctor', '--section', 'nonsense']);
  assert.equal(doctor.code, EXIT_USAGE);
  assert.match(doctor.stdout + doctor.stderr, /unknown section "nonsense"/);
  // ...and bootstrap is not one of them any more.
  const r = run(['bootstrap', '--mode', 'nonsense']);
  assert.equal(r.code, EXIT_USAGE);
  assert.match(r.stderr, /--mode must be design or live/);
  assert.ok(!r.stderr.includes('not available in this build'), 'bootstrap is still a placeholder');
  // Nor is `mode`, as of ARC-06-S12: it refuses a bad argument on its own terms.
  const m = run(['mode', 'sideways']);
  assert.equal(m.code, EXIT_USAGE);
  assert.match(m.stderr, /mode takes live or design/);
  assert.ok(!m.stderr.includes('not available in this build'), 'mode is still a placeholder');
  // Nor is `instance`, as of ARC-07-S05: it is a FORWARDER, and on a checkout whose server
  // dependencies are missing it says so and exits 3 rather than pretending the story is unwritten.
  const i = run(['instance', 'add']);
  assert.ok(!i.stderr.includes('not available in this build'), 'instance is still a placeholder');
  assert.ok([0, 1, 2, 3].includes(i.code), `unexpected exit ${i.code}`);
});

test('root discovery: from a nested directory the CLI finds the repository and says so', () => {
  const nested = join(repoRoot, 'tools', 'snowarch', 'lib');
  const r = run(['version'], { cwd: nested });
  assert.equal(r.code, EXIT_OK);
  assert.match(r.stderr, /^note: running against .* \(you are in .*lib\)$/m);
  assert.ok(r.stdout.startsWith('snowarch '), 'the command did not run from a nested cwd');
  assert.equal(cwdNote(repoRoot), undefined, 'a note appears when standing in the root');
});

test('--json keeps stdout parseable even when there is prose to print', () => {
  const r = run(['version', '--json'], { cwd: join(repoRoot, 'tools') });
  JSON.parse(r.stdout);                      // throws if the note leaked into stdout
  assert.match(r.stderr, /^note: /m);
});

test('AC 5 — nothing outside node: is imported', () => {
  const files = execFileSync('git', ['ls-files', 'tools/snowarch/lib', 'tools/snowarch/bin'],
    { cwd: repoRoot, encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(files.length > 5, 'the file list is suspiciously short — is the CLI committed?');
  const bad = [];
  for (const f of files) {
    for (const m of readFileSync(join(repoRoot, f), 'utf8').matchAll(/from '([^']+)'/g)) {
      if (!m[1].startsWith('node:') && !m[1].startsWith('.')) bad.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(bad, [], 'a third-party import reached the CLI');
});

test('AC 6 — the CLI package has no dependencies, and declares its floor', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'tools/snowarch/package.json'), 'utf8'));
  assert.ok(!('dependencies' in pkg), 'the CLI grew a dependency');
  assert.ok(!('devDependencies' in pkg));
  assert.equal(pkg.engines.node, '>=20');
});

test('the two docs entry points are one implementation', () => {
  // They must not become two behaviours with one name. Compared on the richest thing both produce.
  //
  // Both entry points resolve the root from their own location, so both read THIS checkout — and
  // that made this test a detector for anything else in a parallel run touching the corpus. It
  // was one: ARC-09-C2 found `tests/doctor/fix.test.mjs` syncing a corpus into the live tree
  // through `linkInstall`'s symlink, so two reads a moment apart saw 17 areas and then 19. Fixed
  // at the cause; the corpus is sampled either side here so that if it ever happens again the
  // failure says "the corpus moved", not "the two entry points disagree". Sampled, never retried:
  // a retry would hide exactly the thing this notices.
  const corpusAreas = () => {
    const dir = join(repoRoot, 'vendor', 'ServiceNowDocs', 'markdown');
    return existsSync(dir) ? readdirSync(dir).sort().join(',') : 'absent';
  };
  const corpusBefore = corpusAreas();

  const viaCli = run(['docs', 'status', '--json']);
  const viaScript = execFileSync(process.execPath, [join(repoRoot, 'scripts/docs.mjs'), 'status', '--json'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  assert.equal(corpusAreas(), corpusBefore,
    'the corpus moved between the two reads — something in this run is writing the live checkout, '
    + 'which is ARC-09-C2 and is not what this test is about');
  assert.deepEqual(JSON.parse(viaCli.stdout), JSON.parse(viaScript));

  const cliUsage = run(['docs', 'nonsense-subcommand']);
  const scriptUsage = run([]);
  assert.ok(cliUsage.stderr.includes('usage: node scripts/docs.mjs'),
    'the mounted docs command lost its usage block');
  assert.ok(scriptUsage.stdout.includes('snowarch'), 'the frame lost its help');
});

/**
 * ARC-07-C31 — the frame's help renders the READER'S shell, driven by argument.
 *
 * `env: {}` is load-bearing: `isWindowsShell` is `platform === 'win32' && !env.SHELL && !env.MSYSTEM`
 * and `env` defaults to `process.env`, so `{ platform: 'win32' }` alone renders POSIX on any machine
 * whose shell is set. BY ARGUMENT rather than by forcing `process.platform`, which ARC-07 measured as
 * unusable — 550 of 1271 root cases fail under it, because faking the platform breaks path handling,
 * executable resolution and fixture creation.
 *
 * THE TWO GENERATED USAGES ARE EXCLUDED BY NAME, not by accident. `instance` and `store` take their
 * `USAGE` from a `help-begin`/`help-end` region written by `scripts/gen-cli-help.mjs`, which is
 * committed and therefore PINNED POSIX — the same ruling `codes.ts` and the doctor's documented block
 * carry. Asserting that every usage derives would be asserting the opposite of that ruling, so the
 * split is written down here and held in both directions.
 */
const GENERATED_USAGE = ['instance', 'store'];

/**
 * ...and the ones ARC-07-C31 has NOT reached yet, listed so the gap is a fact rather than a silence.
 *
 * `bootstrap.mjs` and `commands/upgrade.mjs` are e2e TRIGGER FILES: touching either obliges the five
 * `tests/upgrade` files at `--test-concurrency=2` and risks a broken install on the platform a mac
 * cannot check, so the architect split them into their own slice. Their usages are still POSIX
 * strings, and a Windows reader is still shown a command their shell refuses in those two helps.
 *
 * ASSERTED, NOT SKIPPED, and asserted to still BE strings — so when that slice converts them this
 * case fails and the list shrinks with the sweep instead of outliving it. That is the same rule
 * `SWEEP_REMAINDER` is held to, for the same reason.
 */
// ARC-07-C31 slice 4 — EMPTY, and the list emptying is what it was for. `bootstrap` and `upgrade`
// were here because their files are e2e triggers and the architect split them into their own slice.
// That slice landed, their usages are functions, and this case failed with `take it off the list, the
// sweep reached it` — which is the list shrinking with the work instead of outliving it.
const DEFERRED_TO_TRIGGER_SLICE = [];

test('ARC-07-C31 — every usage the frame renders itself spells the reader\'s launcher', () => {
  const WIN = { platform: 'win32', env: {} };
  const win = spellings(WIN).cli;
  const posix = spellings({ platform: 'linux', env: {} }).cli;

  assert.match(helpText(WIN).split('\n')[0], new RegExp(`^usage: ${esc(win)} <command>`));
  assert.doesNotMatch(helpText(WIN), /\.\/snowarch/, 'a POSIX launcher on a Windows shell');
  assert.match(helpText({ platform: 'linux', env: {} }).split('\n')[0],
    new RegExp(`^usage: ${esc(posix)} <command>`));

  let derived = 0;
  for (const [name, c] of Object.entries(COMMANDS)) {
    if (GENERATED_USAGE.includes(name)) {
      // The other direction of the ruling: a pinned usage must NOT follow the shell, or the committed
      // region and the runtime would disagree and `gen:check` would fail on the next machine.
      assert.equal(typeof c.usage, 'string', `${name}'s usage is generated, so it is a pinned string`);
      assert.ok(c.usage.includes(posix), `${name}'s generated usage is not the pinned POSIX form`);
      continue;
    }
    if (DEFERRED_TO_TRIGGER_SLICE.includes(name)) {
      assert.equal(typeof c.usage, 'string',
        `${name} is listed as deferred but now renders — take it off the list, the sweep reached it`);
      continue;
    }
    assert.equal(typeof c.usage, 'function',
      `${name}'s usage is a string, so it cannot render a Windows reader's shell`);
    const w = c.usage(WIN);
    const p = c.usage({ platform: 'linux', env: {} });
    assert.doesNotMatch(w, /\.\/snowarch/, `${name} renders a POSIX launcher on a Windows shell`);
    // A member that carries a launcher must carry the RIGHT one; one that carries none — there are
    // none today — must not silently start passing by saying nothing.
    assert.equal(p.includes(posix), w.includes(win),
      `${name} spells a launcher in one rendering and not the other`);
    if (p.includes(posix)) derived += 1;
  }
  assert.ok(derived >= 5, `only ${derived} usages carry a launcher — the floor caught an empty sweep`);
});

test('ARC-07-C31 — the unknown-command line spells the reader\'s launcher too', async () => {
  const captured = [];
  const sink = { write: (t) => { captured.push(t); return true; } };
  const code = await main(['nope'], { out: sink, err: sink, platform: 'win32', env: {} });
  assert.equal(code, EXIT_USAGE);
  assert.match(captured.join(''), /run \.\\snowarch\.cmd help/);
  assert.doesNotMatch(captured.join(''), /\.\/snowarch/, 'a POSIX launcher on a Windows shell');
});

/**
 * ARC-07-C33's residual — A RUN THAT WRITES NOTHING LEAVES NO LOG.
 *
 * `log.mjs`'s own comment has said since ARC-06 that "a `version` that prints one line should not leave a log
 * behind", and that was the contract rather than the behaviour: the file opens on the FIRST line, `version`
 * prints through the logger, and so `./snowarch version` created `.local/logs/version-<stamp>.log` every time.
 * Measured three times in a checkout with no `.local/` at all, and a bare `./snowarch mode` — which only
 * reports — did the same.
 *
 * That is what left the unexplained `.local/` in the tree after `npm test`, which C33 recorded as OPEN with
 * everything it had ruled out: `tests/version-tag.test.mjs` spawns `version` with the REAL checkout as its cwd,
 * deliberately, because it reads the version of record — and `.local/` is gitignored, so `assert-clean` could
 * not see it. The process-level tracer could not see it either; a fresh `git worktree`, which has no `.local/`
 * at all, found it in one run.
 */
test('ARC-07-C33 — a read-only command writes no log file, and a writing one still does', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-nofile-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sink = { write: () => true };

  const logsIn = (root) => {
    const at = join(root, '.local', 'logs');
    return existsSync(at) ? readdirSync(at).filter((f) => f.endsWith('.log')).length : 0;
  };

  const quiet = join(dir, 'quiet');
  mkdirSync(quiet, { recursive: true });
  createLogger({ command: 'version', logRoot: quiet, noFile: true, out: sink, err: sink })
    .step('the line that used to open the file');
  assert.equal(logsIn(quiet), 0, 'a read-only run left a log file');
  assert.equal(existsSync(join(quiet, '.local')), false,
    'a read-only run created .local/ — which is the residual C33 recorded, returning');

  // ...and the other direction, so this is not "never log again": a writing run still opens its file.
  const writes = join(dir, 'writes');
  mkdirSync(writes, { recursive: true });
  createLogger({ command: 'bootstrap', logRoot: writes, out: sink, err: sink }).step('a line worth keeping');
  assert.equal(logsIn(writes), 1, 'a writing run stopped logging');
});

test('ARC-07-C33 — the command table says which runs write, and `mode` decides by its argument', () => {
  // `readOnly` is a FUNCTION where the answer depends on the arguments, and `mode` is why: bare it reports, and
  // `mode live` rewrites the toggles. A static flag would have had to pick one and be wrong about the other.
  const readOnly = (name, positional = []) => {
    const command = COMMANDS[name];
    return typeof command.readOnly === 'function'
      ? command.readOnly({ positional, flags: {} }) : Boolean(command.readOnly);
  };

  assert.equal(readOnly('version'), true);
  assert.equal(readOnly('mode'), true, 'a bare `mode` only reports');
  assert.equal(readOnly('mode', ['live']), false, '`mode live` rewrites the toggles and must keep its log');
  assert.equal(readOnly('mode', ['design']), false);
  // Everything that writes stays writing, named rather than assumed.
  for (const name of ['doctor', 'bootstrap', 'instance', 'store', 'upgrade']) {
    assert.equal(readOnly(name), false, `${name} stopped logging`);
  }
});
