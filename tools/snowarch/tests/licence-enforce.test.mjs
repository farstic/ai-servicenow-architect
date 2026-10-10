// ARC-11-C1 — under SNOW_LICENCE_ENFORCE="true", the CLI refuses every command but the five a person
// needs to see and repair the licence (ruling R1): licence, doctor, status, version and upgrade.
//
// The check sits in `main()`, after the help and the usage errors and before the command runs, so a
// refused command has done nothing at all — no log file, no state file, no network — when it says so.
// Off, which is the default, `main()` behaves exactly as it did.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMMANDS, main } from '../lib/cli.mjs';
import { EXIT_OK, EXIT_PREREQ } from '../lib/exit.mjs';
import { CLI_ALLOWED, REFUSED, refusesCommand } from '../lib/licence/state.mjs';
import { useStateRoot } from './helpers/state-root.mjs';

useStateRoot();

function sink() {
  let text = '';
  return { write: (s) => { text += s; return true; }, get text() { return text; } };
}

async function run(argv, env) {
  const out = sink();
  const err = sink();
  const code = await main(argv, { out, err, env });
  return { code, out: out.text, err: err.text };
}

test('ARC-11-C1 — every command but the five is refused for a refused state, and only under enforcement', () => {
  for (const name of Object.keys(COMMANDS)) {
    for (const state of ['ok', 'expiring', ...REFUSED]) {
      const s = { state, enforced: true };
      const expected = REFUSED.includes(state) && !CLI_ALLOWED.includes(name);
      assert.equal(refusesCommand(name, s), expected, `${name} with ${state}`);
      assert.equal(refusesCommand(name, { state, enforced: false }), false, `${name} with ${state}, not enforced`);
    }
  }
  assert.deepEqual(Object.keys(COMMANDS).filter((n) => !CLI_ALLOWED.includes(n)).sort(),
    ['bootstrap', 'docs', 'instance', 'mode', 'store']);
});

test('ARC-11-C1 — enforced with no licence: mode is refused with the state and the remedy, and runs nothing', async () => {
  const r = await run(['mode'], { ...process.env, SNOW_LICENCE_ENFORCE: 'true' });
  assert.equal(r.code, EXIT_PREREQ);
  assert.equal(r.out, '', 'a refused command printed its own output');
  assert.match(r.err, /^snowarch mode: licence missing — SNOW_LICENCE_ENFORCE is "true", so this command does not run without a valid licence\n/);
  assert.match(r.err, /licence check to see why/);
});

test('ARC-11-C1 — enforced with no licence: version and licence still run, and help still answers', async () => {
  const env = { ...process.env, SNOW_LICENCE_ENFORCE: 'true' };
  const version = await run(['version'], env);
  assert.equal(version.code, EXIT_OK, version.err);
  assert.equal(version.err.includes('SNOW_LICENCE_ENFORCE'), false);
  const check = await run(['licence', 'check'], env);
  assert.match(check.out, /Licence: missing · enforced/);
  const help = await run(['mode', '--help'], env);
  assert.equal(help.code, EXIT_OK);
});

test('ARC-11-C1 — not enforced, nothing is refused and nothing is added', async () => {
  for (const env of [{ ...process.env, SNOW_LICENCE_ENFORCE: '' }, { ...process.env, SNOW_LICENCE_ENFORCE: 'TRUE' }]) {
    // Not the exit code: `mode` in an unbootstrapped state root exits 3 on its own account. Every refusal
    // names the licence, and the command's own report never does.
    const r = await run(['mode'], env);
    assert.equal(`${r.out}${r.err}`.includes('licence'), false, `${r.out}${r.err}`);
    assert.notEqual(`${r.out}${r.err}`, '', 'mode printed nothing at all');
  }
});
