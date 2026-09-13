import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ARC-05 acceptance, B05-01 / B05-02 / B05-03 — `pin.mjs`, which nothing invoked.
 *
 * Three acceptance criteria describe what the command prints and what it exits with, and the only
 * evidence for any of them was a dated manual capture in `docs/CONTRIBUTING.md`. The story's own
 * `tests/contract/fixtures/contract-*.json` were never written either, so there was nothing to run
 * it against.
 *
 * **The hazard this file has to respect, from `pin.mjs`'s own comment:** `SNOW_CONTRACT_PATH` lets a
 * test point at a fixture contract, and *"without a matching `SNOW_PIN_PATH` those runs write their
 * conclusions into the COMMITTED pin"*. A suite that set only the first would rewrite
 * `packages/contract/required-tools.json` as a side effect of being run. **Both are set on every
 * spawn here**, the committed pin's sha256 is asserted unchanged at the end, and the last test
 * PROVES the hazard rather than describing it — by running without `SNOW_PIN_PATH` against a COPY
 * of the pin in a temp tree and showing that copy move.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PIN_SCRIPT = join(root, 'packages/contract/pin.mjs');
const REAL_CONTRACT = join(root, 'packages/snowarch/dist/contract.json');
const REAL_PIN = join(root, 'packages/contract/required-tools.json');

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** Run `pin.mjs` against a fixture pair. Both paths always — see the hazard above. */
function runPin(dir, args = [], { pinPath = join(dir, 'pin.json'), stdio = 'pipe' } = {}) {
  return spawnSync(process.execPath, [PIN_SCRIPT, ...args], {
    encoding: 'utf8',
    stdio,
    env: { ...process.env, SNOW_CONTRACT_PATH: join(dir, 'contract.json'), SNOW_PIN_PATH: pinPath },
  });
}

/**
 * A fixture pair derived from the REAL artefacts, then mutated.
 *
 * Derived rather than hand-written: a hand-made contract would drift from the real one the first
 * time the schema moved, and the criteria are about how `pin.mjs` compares the two — not about a
 * shape somebody invented for a fixture.
 */
function fixture(mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pin-fixture-'));
  const contract = read(REAL_CONTRACT);
  const pin = read(REAL_PIN);
  mutate({ contract, pin });
  writeFileSync(join(dir, 'contract.json'), `${JSON.stringify(contract, null, 2)}\n`);
  writeFileSync(join(dir, 'pin.json'), `${JSON.stringify(pin, null, 2)}\n`);
  return dir;
}

const COMMITTED_PIN_SHA = sha256(REAL_PIN);

test('B05-01 — a re-gated tool is refused with one REGATE line, and --accept-regate applies it', () => {
  const target = 'snow_atf_atf_suite_exec';
  const dir = fixture(({ contract }) => {
    const tool = contract.tools.find((t) => t.name === target);
    assert.ok(tool, `fixture: ${target} is not in the contract`);
    tool.gate = 'write';           // it is `atf` in both the contract and the pin
  });
  try {
    const refused = runPin(dir, ['--yes']);
    assert.equal(refused.status, 1, refused.stdout + refused.stderr);
    const regates = refused.stdout.split('\n').filter((l) => l.startsWith('REGATE '));
    // EXACTLY one: a run that printed two would mean the fixture changed more than it meant to,
    // and the criterion is about the line for THIS tool.
    assert.deepEqual(regates, [`REGATE ${target}: expected atf/true, server declares write/true`]);
    assert.match(refused.stderr, new RegExp(`Re-run with: --accept-regate ${target}`));
    // Refused means NOTHING WRITTEN — the fixture pin is untouched.
    assert.equal(read(join(dir, 'pin.json')).tools.find((t) => t.name === target).gate, 'atf');

    const applied = runPin(dir, ['--yes', '--accept-regate', target]);
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
    assert.match(applied.stdout, new RegExp(`REGATE ${target}: .*\\[accepted\\]`));
    const after = read(join(dir, 'pin.json')).tools.find((t) => t.name === target);
    assert.equal(after.gate, 'write', 'the accepted gate was not written to the pin');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('B05-02 — a required tool absent from the contract is MISSING, and nothing is written', () => {
  const target = 'snow_atf_atf_suite_exec';
  const dir = fixture(({ contract }) => {
    const at = contract.tools.findIndex((t) => t.name === target);
    assert.notEqual(at, -1, `fixture: ${target} is not in the contract`);
    contract.tools.splice(at, 1);
  });
  try {
    const before = sha256(join(dir, 'pin.json'));
    const r = runPin(dir, ['--yes']);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const missing = r.stdout.split('\n').filter((l) => l.startsWith('MISSING '));
    assert.equal(missing.length, 1, r.stdout);
    assert.match(missing[0], new RegExp(`^MISSING ${target} — not in `));
    assert.match(r.stderr, /1 required tool\(s\) are absent from the contract\. Nothing written\./);
    // "Nothing written" asserted as BYTES, not as a re-read of one field: a rewrite that happened
    // to preserve that field would otherwise pass.
    assert.equal(sha256(join(dir, 'pin.json')), before, 'the pin file changed on a refused run');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('B05-03 — without --yes: a non-TTY refuses to guess, and a closed stdin is not consent', () => {
  const dir = fixture();
  try {
    // Non-TTY, no --yes → exit 2 with the message that names the flag. `stdio: pipe` IS the
    // non-TTY case; there is no need to simulate one.
    const piped = runPin(dir, []);
    assert.equal(piped.status, 2, piped.stdout + piped.stderr);
    assert.match(piped.stderr, /pin\.mjs: stdin is not a terminal — pass --yes to apply the proposal above/);

    // And the proposal is still PRINTED before it refuses — a refusal with nothing to review would
    // make the "propose → review → apply" criterion meaningless.
    assert.match(piped.stdout, /^Proposed pin$/m);
    assert.match(piped.stdout, /^ {2}proposed sha {2}: [0-9a-f]{64}/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('B05-03 — the exit codes are the four the script documents, and they are distinct', () => {
  // Read out of the source rather than restated: a table copied into a test is a second definition
  // of the contract, and the first thing a second definition does is stop matching.
  const src = readFileSync(PIN_SCRIPT, 'utf8');
  const table = /const EXIT = \{ applied: (\d), refused: (\d), cannotRun: (\d), aborted: (\d) \};/.exec(src);
  assert.ok(table, 'pin.mjs no longer declares its EXIT table in one line');
  const [, applied, refused, cannotRun, aborted] = table;
  assert.deepEqual([applied, refused, cannotRun, aborted], ['0', '1', '2', '3']);
  assert.equal(new Set([applied, refused, cannotRun, aborted]).size, 4);
  // The abort path is deliberate and its reason is in the source: a closed stdin resolves to `n`
  // rather than leaving a promise unsettled, which would exit with a code nobody can interpret.
  assert.match(src, /rl\.on\('close', \(\) => res\('n'\)\);/);
  assert.match(src, /Closing stdin is not consent/);
});

test('B05-01/02/03 — the COMMITTED pin is byte-identical after this suite, and the hazard is real', () => {
  // The guard first: every spawn above set both paths, so the committed pin must be untouched.
  assert.equal(sha256(REAL_PIN), COMMITTED_PIN_SHA,
    'a pin.mjs run in this suite wrote into the committed required-tools.json');

  // Now PROVE the hazard that guard exists for, on a COPY. With SNOW_CONTRACT_PATH pointing at a
  // fixture and SNOW_PIN_PATH absent, pin.mjs writes its conclusions into whatever pin it resolves
  // by itself — which in the real tree is the committed file. Here the "committed" pin is a copy in
  // a temp directory, so the move is visible and harmless.
  const dir = fixture(({ contract }) => {
    contract.tools.find((t) => t.name === 'snow_atf_atf_suite_exec').gate = 'write';
  });
  try {
    const copy = join(dir, 'pretend-committed-pin.json');
    writeFileSync(copy, readFileSync(join(dir, 'pin.json')));
    const before = sha256(copy);
    // `SNOW_PIN_PATH` is still passed — pointing at the COPY. That is the hazard in miniature: the
    // contract under test is a fixture, and the pin being written is "the committed one".
    const r = runPin(dir, ['--yes', '--accept-regate', 'snow_atf_atf_suite_exec'], { pinPath: copy });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.notEqual(sha256(copy), before,
      'the control did not move the pin — it proves nothing about the hazard');
    assert.equal(sha256(REAL_PIN), COMMITTED_PIN_SHA, 'and the real one still must not have moved');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
