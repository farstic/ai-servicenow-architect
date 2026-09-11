import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, helpText, COMMANDS } from '../lib/cli.mjs';
import { EXIT_OK, EXIT_USAGE } from '../lib/exit.mjs';
import { contractSha, cwdNote, loadConfig, version } from '../lib/config.mjs';

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
  assert.equal(r.stderr.trim(), 'snowarch: unknown command "nope" — run ./snowarch help');
});

test("an unknown flag prints the sub-command's usage, not a stack trace", () => {
  const r = run(['version', '--nonsense']);
  assert.equal(r.code, EXIT_USAGE);
  assert.match(r.stderr, /--nonsense needs a value/);
  assert.match(r.stderr, /usage: \.\/snowarch version/);
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
  const viaCli = run(['docs', 'status', '--json']);
  const viaScript = execFileSync(process.execPath, [join(repoRoot, 'scripts/docs.mjs'), 'status', '--json'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.deepEqual(JSON.parse(viaCli.stdout), JSON.parse(viaScript));

  const cliUsage = run(['docs', 'nonsense-subcommand']);
  const scriptUsage = run([]);
  assert.ok(cliUsage.stderr.includes('usage: node scripts/docs.mjs'),
    'the mounted docs command lost its usage block');
  assert.ok(scriptUsage.stdout.includes('snowarch'), 'the frame lost its help');
});
