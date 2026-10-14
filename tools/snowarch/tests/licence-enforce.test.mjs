// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C1 and C6 — with no valid licence, the CLI refuses every command but the five a person needs to
// see and repair the licence (ruling R1): licence, doctor, status, version and upgrade. On every build, from
// 2.0.13: no variable turns it off (`licence-unconditional.test.mjs` passes every value to show it).
//
// The check sits in `main()`, after the help and the usage errors and before the command runs, so a
// refused command has done nothing at all — no log file, no state file, no network — when it says so.
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

async function run(argv, env = process.env) {
  const out = sink();
  const err = sink();
  const code = await main(argv, { out, err, env });
  return { code, out: out.text, err: err.text };
}

test('ARC-11-C6 — every command but the allowed ones is refused for a refused state, whatever the status says of enforcement', () => {
  for (const name of Object.keys(COMMANDS)) {
    for (const state of ['ok', 'expiring', ...REFUSED]) {
      const expected = REFUSED.includes(state) && !CLI_ALLOWED.includes(name);
      assert.equal(refusesCommand(name, { state, enforced: true }), expected, `${name} with ${state}`);
      // A status that says otherwise changes nothing: the state alone decides.
      assert.equal(refusesCommand(name, { state, enforced: false }), expected, `${name} with ${state}, enforced: false`);
    }
  }
  assert.deepEqual(Object.keys(COMMANDS).filter((n) => !CLI_ALLOWED.includes(n)).sort(), ['docs', 'instance', 'mode', 'store']);
  // `mode` is refused, but for one form: `mode design`, which uninstall needs.
  const missing = { state: 'missing' };
  assert.equal(refusesCommand('mode', missing, ['design']), false, 'mode design');
  assert.equal(refusesCommand('mode', missing, ['live']), true, 'mode live');
  assert.equal(refusesCommand('mode', missing, []), true, 'bare mode');
  assert.equal(refusesCommand('docs', missing, ['design']), true, 'a form allowed for mode is not allowed for another command');
});

test('ARC-11-C6 — with no licence: mode is refused with the state and the remedy, and runs nothing', async () => {
  const r = await run(['mode']);
  assert.equal(r.code, EXIT_PREREQ);
  assert.equal(r.out, '', 'a refused command printed its own output');
  assert.match(r.err, /^snowarch mode: licence missing — this command does not run without a valid licence\n/);
  assert.match(r.err, /licence check to see why/);
});

test('ARC-11-C6 — with no licence: mode design reaches the command; mode live is refused', async () => {
  // This state root was never bootstrapped, so `mode design` stops at its own first check, writing nothing:
  // what matters is that it got there, past the licence.
  const design = await run(['mode', 'design']);
  assert.doesNotMatch(design.err, /licence missing/, design.err);
  assert.match(`${design.out}${design.err}`, /bootstrap/);
  const live = await run(['mode', 'live']);
  assert.equal(live.code, EXIT_PREREQ);
  assert.match(live.err, /^snowarch mode: licence missing — this command does not run without a valid licence\n/);
});

test('ARC-11-C6 — with no licence: version and licence still run, and help still answers', async () => {
  const version = await run(['version']);
  assert.equal(version.code, EXIT_OK, version.err);
  const check = await run(['licence', 'check']);
  assert.match(check.out, /Licence: missing\n/);
  const help = await run(['mode', '--help']);
  assert.equal(help.code, EXIT_OK);
});
