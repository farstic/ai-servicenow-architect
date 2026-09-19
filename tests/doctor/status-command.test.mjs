/**
 * ARC-08-C18 — `./snowarch status`, the command.
 *
 * The panel's own rendering is `panel.test.mjs`'s subject. What is proved here is everything the
 * skill used to ask a model to do around it: resolve the checkout and exit 3 with a `cd` remedy,
 * fall back to the bootstrap state when the doctor cannot run and name ONLY the cause it observed,
 * emit the doctor's report under `--json` rather than a shape of its own, and return the doctor's
 * verdict as the exit code without letting that suppress the panel.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createRegistry, defineCheck } from '../../tools/snowarch/lib/doctor/registry.mjs';
import { fallbackPanel, statusCommand } from '../../tools/snowarch/lib/commands/status.mjs';
import { maskForJson } from '../../tools/snowarch/lib/doctor/json-boundary.mjs';
import { BANNER } from '../../tools/snowarch/lib/text.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { greenTree } from './helpers/tree.mjs';

/** A collector standing in for stdout, so nothing in a test reaches a terminal. */
const sink = () => {
  const chunks = [];
  return { write: (text) => chunks.push(text), text: () => chunks.join('') };
};

const registry = (...checks) => createRegistry(checks.map((over) => defineCheck({
  id: 'E-00', section: 'prereqs', title: 'a check', severity: 'fail',
  quick: true, network: false, spawns: false, fixable: false,
  run: async () => ({ status: 'ok', detail: 'fine' }),
  ...over,
})));

test('a passing run prints the panel and exits 0', async (t) => {
  const root = greenTree(t);
  const out = sink();
  const code = await statusCommand({ out, cwd: root, registry: registry({}) });

  assert.equal(code, 0);
  const lines = out.text().trimEnd().split('\n');
  assert.match(lines[0], /^Mode: /);
  assert.ok(lines.some((l) => l.startsWith('Doctor: 1 ok, 0 warn, 0 fail')));
  // No FAIL block and no --fix invitation on a clean run.
  assert.equal(out.text().includes('FAIL'), false);
  assert.equal(out.text().includes('--fix'), false);
});

test('a failing check exits 1 AND still prints the panel', async (t) => {
  // The two halves are one assertion on purpose. An exit 1 here is a finding about the checkout,
  // not a failure to render, and a command that signalled the finding by withholding the report
  // would leave a reader with a number and nothing to act on — which is exactly the `1 fail` that
  // reached a user with no failing line beside it in ARC-09-C46.
  const root = greenTree(t);
  const out = sink();
  const code = await statusCommand({ out, cwd: root, registry: registry({
    id: 'E-00', title: 'a check', fixable: true,
    run: async () => ({ status: 'fail', detail: 'it did not', remedy: './snowarch fix-it' }),
  }) });

  assert.equal(code, 1);
  const text = out.text();
  assert.match(text, /^Mode: /);
  assert.ok(text.includes('E-00 FAIL a check: it did not — ./snowarch fix-it'));
  assert.ok(text.includes('Run ./snowarch doctor --fix for the fixable ones (1).'));
});

test('--json emits the doctor report, unchanged, and nothing else on stdout', async (t) => {
  // A panel-shaped JSON would be a second schema for one set of facts, and the first consumer to
  // read the wrong one would be reading a shape nothing maintains. `JSON.parse` of the WHOLE
  // stream is the assertion that proves no prose was interleaved.
  const root = greenTree(t);
  const out = sink();
  const code = await statusCommand({ out, cwd: root, flags: { json: true },
    home: '/home/nobody', registry: registry({}) });

  assert.equal(code, 0);
  const parsed = JSON.parse(out.text());
  assert.equal(parsed.schema, 1);
  assert.equal(parsed.product, 'snowarch');
  assert.equal(parsed.options.quick, true);
  // Through the same boundary as `doctor --json`: labels and hosts leave masked.
  assert.deepEqual(parsed, maskForJson(parsed, { home: '/home/nobody' }));
  // The stream IS the object: not "no Mode line anywhere" — `modeLine` is a key of the report and
  // its value is that sentence — but nothing before the brace and nothing after the close.
  assert.equal(out.text().trimStart()[0], '{');
  assert.equal(out.text().trimEnd().endsWith('}'), true);
});

test('outside a checkout it exits 3 and says cd, with its own name on the line', async (t) => {
  // The skill's step 4 — "print the cd remedy and nothing else about mode" — is this branch, and
  // it is the command's now because the command is what observed it. `STATUS:` rather than
  // `DOCTOR:` because nobody ran a doctor: a reader sent looking for one would be looking for a
  // run that never happened.
  const outside = tempDir('snowarch-not-a-checkout-', t);
  const out = sink();
  const code = await statusCommand({ out, cwd: outside });

  assert.equal(code, 3);
  assert.equal(out.text().trimEnd(), 'STATUS: not at the repository root — run: cd <the checkout>');
});

test('inside the checkout but not at it, the remedy names the root', async (t) => {
  const root = greenTree(t);
  const deep = join(root, 'clients', 'acme');
  mkdirSync(deep, { recursive: true });
  const out = sink();

  assert.equal(await statusCommand({ out, cwd: deep }), 3);
  assert.equal(out.text().trimEnd(), `STATUS: not at the repository root — run: cd ${root}`);
});

test('when the doctor throws, the panel names the cause it observed and no other', async (t) => {
  // SKILL.md's rule for this line is "never state a cause you did not check", and the sentence it
  // pointed at — `BANNER.fromState` — ended "until Node 20+ is installed" unconditionally. That is
  // the one cause this command can never be the one to report: a machine without Node cannot run
  // it to find out. The cause is an argument now, and this is the argument arriving.
  const root = greenTree(t);
  const out = sink();
  const code = await statusCommand({ out, cwd: root, registry: registry({
    run: async () => { throw new TypeError('a check exploded'); },
  }), now: () => { throw new RangeError('not this one'); } });

  assert.equal(code, 1);
  const text = out.text().trimEnd();
  // `design`, not `design-only`: the state file records the mode the bootstrap wrote, and the
  // fallback QUOTES it rather than translating it into the banner's vocabulary. A renderer that
  // prettified it here would be inventing a word the file does not contain.
  assert.match(text, /^Mode: design — from bootstrap state \(/);
  assert.ok(text.endsWith('doctor unavailable after it failed (RangeError)'), text);
  assert.equal(text.includes('Node 20+'), false, 'it stated a cause it did not check');
  // The thrown message never reaches the line — it can carry a path or a value, and this line is
  // pasted into conversations.
  assert.equal(text.includes('not this one'), false);
});

test('the fallback says what it does not know rather than inventing a mode', async (t) => {
  const root = tempDir('snowarch-no-state-', t);
  assert.equal(fallbackPanel(root, 'after it failed (Error)'),
    'Mode: unknown — doctor unavailable after it failed (Error), and .local/bootstrap-state.json'
    + ' is absent — run ./bootstrap.sh (Windows: bootstrap.cmd)');

  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'bootstrap-state.json'), '{ not json');
  assert.match(fallbackPanel(root, 'after it failed (Error)'),
    /^Mode: unknown — doctor unavailable after it failed \(Error\), and \.local\/bootstrap-state\.json is unreadable \(/);

  writeFileSync(join(root, '.local', 'bootstrap-state.json'),
    JSON.stringify({ mode: 'live', updatedAt: '2026-09-10T10:00:00.000Z' }));
  assert.equal(fallbackPanel(root, 'after it failed (Error)'),
    'Mode: live — from bootstrap state (2026-09-10T10:00:00.000Z); doctor unavailable'
    + ' after it failed (Error)');
});

test('the banner sentence still reads as it always did, with its cause supplied', () => {
  // `fromState` gained a parameter and lost its default; the string the Node-free launchers carry
  // in `text.json` is unchanged, and this is the assertion that keeps it so.
  assert.equal(BANNER.fromState('design-only', '2026-09-10T10:00:00.000Z',
    'until Node 20+ is installed'),
  'Mode: design-only — from bootstrap state (2026-09-10T10:00:00.000Z); doctor unavailable'
  + ' until Node 20+ is installed');
  const sample = JSON.parse(readFileSync(
    join(import.meta.dirname, '../../tools/snowarch/lib/text.json'), 'utf8'));
  assert.equal(sample.banner.fromState, BANNER.fromState('design-only',
    '2026-09-10T10:00:00.000Z', 'until Node 20+ is installed'));
  // No default: a caller that forgets renders `undefined`, which is visibly broken — the right
  // failure for a sentence whose whole job is to be trusted.
  assert.match(BANNER.fromState('live', 'now'), /doctor unavailable undefined$/);
});

test('the command writes no file', async (t) => {
  // rc.5: the model, executing the skill's instructions by hand, wrote the doctor JSON to /tmp
  // twice to read it back. The panel is stdout and only stdout.
  const root = greenTree(t);
  const before = readdirSync(root).sort();
  const localBefore = readdirSync(join(root, '.local')).sort();

  await statusCommand({ out: sink(), cwd: root, registry: registry({}) });

  assert.deepEqual(readdirSync(root).sort(), before);
  // `.local/` is the one place a doctor run may touch, and only its own cache — never a report.
  const localAfter = readdirSync(join(root, '.local')).sort();
  // Exactly the doctor's own cache, both halves of it — the report the banner reads and the
  // inputs that decide whether it is stale. Nothing else, and nothing outside `.local/`.
  assert.deepEqual(localAfter.filter((f) => !localBefore.includes(f)),
    ['doctor-last.inputs.json', 'doctor-last.json']);
});
