// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C303 — which forms of `./snowarch` a root process may run. The architect's ruling, 2026-11-19: every command that writes
 * refuses root, not only the bootstrap, and the refusal is FAIL-CLOSED, decided once, at the dispatch, before any command, licence read or
 * integrity check runs.
 *
 * `sudo ./snowarch upgrade` leaves a root-owned tree; `instance add` and `set-credentials` a root-owned 0600 store the user's own server
 * cannot read; `mode live` root-owned settings; a full `doctor` starts Claude Code, which creates `~/.claude.json` in the user's home. So:
 *
 *   - a form is allowed only when it is NAMED here as one that reads and writes nothing (`ELEVATED`, one entry per command);
 *   - a command, a sub-command or a flag that is not named is refused: nothing is guarded by being on a list of writers;
 *   - an allowed form that WOULD write by default is forced not to: the doctor's cache is off, the status panel's cache is off, and no log
 *     file is made;
 *   - a test fails for a command that is registered and not classified, so a new command is decided by someone, not by default.
 *
 * The licence's own classification (`CLI_ALLOWED`) cannot be reused: it is the set that runs WITHOUT a licence, and it holds `bootstrap`,
 * `upgrade` and `mode design`, which all write.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMMANDS, main } from '../lib/cli.mjs';
import { ELEVATED, elevatedRefusal, elevatedVerdict } from '../lib/root-guard.mjs';
import { elevatedSentence } from '../lib/root-guard.mjs';
import { parseArgs } from '../lib/cli.mjs';
import { pretendRoot } from '../../../tests/helpers/elevated.mjs';

/** A verdict for the words a person types, parsed the way the frame parses them. */
function verdict(...words) {
  const [name, ...rest] = words;
  const command = COMMANDS[name];
  const parsed = command?.raw ? { flags: Object.create(null), positional: [] } : parseArgs(rest, { booleans: command?.booleans ?? [] });
  return elevatedVerdict(name, { positional: parsed.positional, flags: parsed.flags, argv: rest });
}

const ALLOWED = [
  ['version'], ['version', '--json'],
  ['status'], ['status', '--json'],
  ['doctor', '--quick'], ['doctor', '--quick', '--json'], ['doctor', '--quick', '--no-network'], ['doctor', '--quick', '--no-cache'],
  ['doctor', '--quick', '--section', 'docs'],
  ['docs'], ['docs', 'status'], ['docs', 'status', '--json'], ['docs', 'verify'], ['docs', 'verify', '--json'], ['docs', 'lookup', 'incident'],
  ['licence', 'show'], ['licence', 'check'], ['licence', 'verify', 'some.licence'],
  ['mode'],
  ['instance', 'list'], ['instance', 'list', '--json'], ['instance', 'list', '--all', '--verbose'],
  ['store', 'backups'],
];

const REFUSED = [
  ['bootstrap'], ['bootstrap', '--yes'], ['bootstrap', '--reset'],
  ['upgrade'], ['upgrade', '--check'], ['upgrade', '--yes'],
  ['mode', 'live'], ['mode', 'design'],
  ['doctor'], ['doctor', '--json'], ['doctor', '--no-network'], ['doctor', '--section', 'docs'],
  ['doctor', '--fix'], ['doctor', '--quick', '--fix'], ['doctor', '--quick', '--fix', '--yes'], ['doctor', '--quick', '--write-cache'],
  ['docs', 'sync'], ['docs', 'sync', '--upstream'], ['docs', 'family', 'x', '--yes'], ['docs', 'surprise'],
  ['licence', 'check', '--refresh'], ['licence', 'keygen', '--out', 'k'], ['licence', 'issue'], ['licence', 'init-list'], ['licence', 'surprise'], ['licence'],
  ['instance', 'add', 'lab'], ['instance', 'remove', 'lab'], ['instance', 'test'], ['instance', 'set-credentials', 'lab'],
  ['instance', 'set-preset', 'lab', 'full'], ['instance'], ['instance', 'list', '--bogus'],
  ['store', 'migrate'], ['store', 'restore', 'f'], ['store'], ['store', 'backups', 'extra'],
  ['version', '--bogus=1'], ['status', 'extra'], ['mode', 'live', '--yes'],
];

test('C303 — every command the frame registers is classified, and nothing is classified that is not registered', () => {
  assert.deepEqual(Object.keys(ELEVATED).sort(), Object.keys(COMMANDS).sort(),
    'a command with no entry is decided by nobody; an entry with no command is a stale rule');
});

test('C303 — a command that is not classified is refused, whatever it is called', () => {
  for (const name of ['frobnicate', 'constructor', '__proto__', 'toString', 'hasOwnProperty', '']) {
    assert.equal(elevatedVerdict(name, { positional: [], flags: {}, argv: [] }).ok, false, name);
  }
});

test('C303 — the forms named as reading are allowed', () => {
  for (const words of ALLOWED) assert.equal(verdict(...words).ok, true, words.join(' '));
});

test('C303 — every other form is refused: the writers, and the forms that are not named', () => {
  for (const words of REFUSED) assert.equal(verdict(...words).ok, false, words.join(' '));
});

test('C303 — a plain doctor is refused with the one form that runs, and no other refusal has a hint', () => {
  assert.match(verdict('doctor').hint ?? '', /only .*doctor --quick.* runs/);
  assert.match(verdict('doctor', '--json').hint ?? '', /doctor --quick/);
  for (const words of REFUSED.filter((w) => !(w[0] === 'doctor' && !w.includes('--quick')))) {
    assert.equal(verdict(...words).hint, undefined, words.join(' '));
  }
});

test('C303 — an allowed form that would write by default is forced not to', () => {
  assert.equal(verdict('doctor', '--quick').flags?.['no-cache'], true, 'the doctor\'s cache is off');
  assert.equal(verdict('doctor', '--quick', '--json').flags?.['no-cache'], true);
  assert.equal(verdict('status').run?.writeCache, false, 'the status panel\'s cache is off');
  assert.equal(verdict('version').flags, undefined, 'and a form that never wrote is left as it is');
});

test('C303 — the refusal says which command, that root only runs what reads, and the root sentence; a hint follows it', () => {
  const lines = elevatedRefusal('upgrade', './snowarch');
  assert.match(lines[0], /^snowarch upgrade: refused: this process runs as root/);
  assert.equal(lines[1], elevatedSentence());
  assert.equal(lines.length, 2);
  const hinted = elevatedRefusal('doctor', './snowarch', 'As root only ./snowarch doctor --quick runs.');
  assert.equal(hinted.length, 3);
  assert.equal(hinted[2], 'As root only ./snowarch doctor --quick runs.');
});

// ── the frame: main() asks first ──────────────────────────────────────────────────────────────────────────────────────

/** Commands that record that they ran, under names the licence gate allows; they declare `readOnly`, so the frame makes no log for them. */
function planted(calls) {
  const make = (name, extra = {}) => [name, { summary: name, readOnly: true, usage: () => `usage: ${name}`, ...extra,
    run: async (args) => { calls.push({ name, ...args }); return 0; } }];
  return Object.fromEntries([make('version'), make('status'), make('doctor', { booleans: ['quick', 'no-network', 'fix', 'yes', 'no-cache', 'write-cache'] }),
    make('bootstrap', { booleans: ['yes', 'reset'] }), make('upgrade', { booleans: ['check', 'yes'] })]);
}
const sink = () => { const chunks = []; return { write: (s) => { chunks.push(String(s)); return true; }, text: () => chunks.join('') }; };

test('C303 — main() refuses a form that writes before the command runs, with exit 3 and the sentence on stderr', async (t) => {
  pretendRoot(t);
  for (const argv of [['bootstrap'], ['upgrade', '--check'], ['doctor'], ['doctor', '--quick', '--fix']]) {
    const calls = [];
    const err = sink();
    const code = await main(argv, { commands: planted(calls), out: sink(), err, env: {} });
    assert.equal(code, 3, argv.join(' '));
    assert.deepEqual(calls, [], `${argv.join(' ')} ran`);
    assert.ok(err.text().includes(elevatedSentence()), err.text());
  }
});

test('C303 — main() runs a form that reads, and hands it the forced no-write', async (t) => {
  pretendRoot(t);
  let calls = [];
  assert.equal(await main(['doctor', '--quick'], { commands: planted(calls), out: sink(), err: sink(), env: {} }), 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].flags['no-cache'], true, 'the doctor is told not to write its cache');
  calls = [];
  assert.equal(await main(['status'], { commands: planted(calls), out: sink(), err: sink(), env: {} }), 0);
  assert.equal(calls[0].writeCache, false, 'the status panel is told not to write its cache');
});

test('C303 — not root, nothing changes: the same forms run as they did, with no forced flag', async () => {
  const calls = [];
  assert.equal(await main(['bootstrap'], { commands: planted(calls), out: sink(), err: sink(), env: {} }), 0);
  assert.equal(await main(['doctor', '--quick'], { commands: planted(calls), out: sink(), err: sink(), env: {} }), 0);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].flags['no-cache'], undefined);
  assert.equal(calls[1].writeCache, undefined);
});

test('C303 — help and usage errors are answered first, as root as for anyone: they write nothing', async (t) => {
  pretendRoot(t);
  const out = sink();
  assert.equal(await main(['bootstrap', '--help'], { commands: planted([]), out, err: sink(), env: {} }), 0);
  assert.match(out.text(), /usage: bootstrap/);
  const err = sink();
  assert.equal(await main(['nonesuch'], { commands: planted([]), out: sink(), err, env: {} }), 2);
});
