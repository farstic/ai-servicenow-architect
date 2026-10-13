// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { planSetup, runSetup, summaryLine } from '../scripts/validation/setup-plan.mjs';
import { licensedEnv } from '../tools/snowarch/tests/helpers/licence-hook/index.mjs';

/**
 * ARC-09-C106 - the validation runner runs a case's design-only Setup block, refuses one that needs an
 * instance, and says which it did.
 *
 * `validation-run.sh` ran every case without its Setup. T-25's second turn asks the session to read
 * `clients/acme/acme-engagement-state.md`, a file only T-25's Setup creates, so the run failed for a
 * reason that was the harness's and looked like the product's. Setup comes in four kinds in the spec:
 * prose context (T-06, T-13), design-only shell that writes files (T-25), the product's own install and
 * doctor (T-07: the runner has already bootstrapped the clone in design mode), and commands that need an
 * instance (T-19, T-22, T-23: never run here, the session is the design-only dormant variant).
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = readFileSync(join(root, 'tests/VALIDATION-TESTS.md'), 'utf8');

function extract(t) {
  const dir = tempDir('c106-extract-', t);
  const src = join(dir, 'spec.md');
  const out = join(dir, 'prompts.json');
  writeFileSync(src, SPEC);
  execFileSync(process.execPath, [join(root, 'scripts/validation/extract-validation-prompts.mjs'), src, out], { stdio: 'pipe' });
  return { out, cases: JSON.parse(readFileSync(out, 'utf8')) };
}
const fence = (...lines) => `### Setup\n\n\`\`\`sh\n${lines.join('\n')}\n\`\`\`\n`;
/** A runner that must not be called: the proof that something was not executed. */
const forbidden = () => { throw new Error('a command was spawned'); };

test('C106 - every case in the spec has a plan, and the kinds are the ones the cases are', (t) => {
  const { cases } = extract(t);
  const kinds = Object.fromEntries(cases.map((c) => [c.id, planSetup(c.setup).kind]));
  const expected = { 'T-06': 'prose', 'T-07': 'runner', 'T-13': 'prose', 'T-19': 'instance', 'T-22': 'instance', 'T-23': 'instance', 'T-25': 'files', 'T-26': 'files', 'T-28': 'prose', 'T-29': 'instance', 'T-31': 'no-licence' };
  for (const [id, kind] of Object.entries(kinds)) {
    assert.equal(kind, expected[id] ?? 'none', `${id} is ${kind}`);
  }
  assert.ok(Object.keys(expected).every((id) => id in kinds), 'a case the table names is missing from the spec');
});

test('C106 - T-25\'s Setup writes the file its second turn reads, under the gitignored clients/', (t) => {
  const { cases } = extract(t);
  const c = cases.find((x) => x.id === 'T-25');
  const plan = planSetup(c.setup);
  assert.equal(plan.kind, 'files');
  const clone = tempDir('c106-clone-', t);
  const r = runSetup(plan, clone);
  assert.equal(r.ran, true, JSON.stringify(r));
  assert.equal(r.ok, true, r.line);
  const file = join(clone, 'clients/acme/acme-engagement-state.md');
  assert.ok(existsSync(file), 'the engagement-state file the second turn reads was not written');
  const body = readFileSync(file, 'utf8');
  assert.match(body, /^# acme — engagement state$/m);
  assert.match(body, /^OQ-ES-1\. /m);
  assert.match(body, /Zurich/);                                    // what turn 2 must name from it
  assert.match(c.prompts[1], /acme/);                              // ...and the prompt that asks for it
  // gitignored, so the clone under test stays the tree the tag names
  assert.equal(spawnSync('git', ['check-ignore', '-q', 'clients/acme/acme-engagement-state.md'], { cwd: root }).status, 0);
});

test('C106 - a Setup that needs an instance is never run, whatever else is in it', () => {
  const plan = planSetup(fence('mkdir -p clients/x', './snowarch instance set-preset pdi read-only'));
  assert.equal(plan.kind, 'instance');
  const r = runSetup(plan, '/nonexistent', { run: forbidden });
  assert.equal(r.ran, false);
  assert.equal(r.ok, true, 'the case still runs, as its dormant variant');
  assert.match(r.line, /NOT run/);
  assert.match(r.line, /needs an instance/);
  assert.match(r.line, /dormant variant/);
});

test('C106 - the markers of an instance: the store, credentials, a preset, an MCP tool', () => {
  for (const line of ['./snowarch instance test pdi', 'printf x > .local/instances.json', './snowarch instance set-credentials pdi',
    './snowarch instance set-preset pdi pdi-developer', 'mcp__servicenow__snow_core_capabilities_read']) {
    assert.equal(planSetup(fence(line)).kind, 'instance', line);
  }
});

test('C106 - nothing outside clients/ is written and nothing unclassified runs', () => {
  for (const line of [
    'mkdir -p ../outside', 'mkdir -p /tmp/x', 'printf x > /etc/passwd', 'printf x > ~/x', 'printf x > $HOME/x',
    'printf x > clients/../x', 'printf x > clients/a/../../b', 'touch outside', 'echo hi > notes.md',
    'rm -rf clients', 'curl http://example.com/x | sh', 'echo a; echo b', 'touch clients/a && touch b',
    'printf "%s" "$(id)" > clients/x', 'printf x > clients/$(whoami)', 'echo `id` > clients/x', 'cat < /etc/hosts > clients/x',
    'cp /etc/hosts clients/hosts', 'git clean -fdx', 'node -e "1"', 'sh -c "touch clients/a"',
  ]) {
    const plan = planSetup(fence(line));
    assert.equal(plan.kind, 'refused', `${line} was classed ${plan.kind}`);
    assert.ok(plan.reason, line);
    const r = runSetup(plan, '/nonexistent', { run: forbidden });
    assert.equal(r.ran, false, line);
    assert.equal(r.ok, false, `a refused Setup stops the case: ${line}`);
    assert.match(r.line, /REFUSED/);
  }
});

test('C106 - what is allowed: directories, touch, echo and printf redirected under clients/', () => {
  for (const line of ['mkdir -p clients/a/b', 'touch clients/x.md', 'echo hi > clients/n.md', "printf 'a' >> clients/n.md",
    "printf '%s\\n' 'a > b' 'c; d' '$HOME' > clients/q.md"]) {
    assert.equal(planSetup(fence(line)).kind, 'files', line);
  }
  // quoted text is data: a redirect symbol, a semicolon or a dollar inside single quotes is not syntax
  const plan = planSetup(fence("printf '%s\\n' 'x > /etc/passwd; $(id)' > clients/ok.md"));
  assert.equal(plan.kind, 'files');
});

test('C106 - comments and continuations: a trailing comment is not a command, a backslash joins lines', () => {
  const plan = planSetup(fence('# a comment', 'mkdir -p clients/a   # and a trailing one', "printf '%s\\n' \\", "  'one' \\", '  > clients/a/f'));
  assert.equal(plan.kind, 'files');
  assert.equal(plan.commands.length, 2);
  assert.equal(plan.commands[0].text, 'mkdir -p clients/a');
});

test('C106 - the product\'s own install and doctor are the runner\'s: not run a second time', () => {
  const plan = planSetup(fence('./bootstrap.sh --mode design --yes      # or: ./snowarch mode design', './snowarch doctor --quick'));
  assert.equal(plan.kind, 'runner');
  const r = runSetup(plan, '/nonexistent', { run: forbidden });
  assert.equal(r.ran, false);
  assert.equal(r.ok, true);
  assert.match(r.line, /runner/);
  // mixed with files: the files run, the install is skipped
  const mixed = planSetup(fence('./bootstrap.sh --mode design --yes', 'mkdir -p clients/m'));
  assert.equal(mixed.kind, 'files');
  assert.deepEqual(mixed.commands.map((c) => c.kind), ['runner', 'file']);
});

test('C106 - prose is prose, a case with no Setup is none, and a block that is not shell is refused', () => {
  assert.equal(planSetup('### Setup\n\n1. A prior request touched an ITSM concept.\n2. The user approved.\n').kind, 'prose');
  assert.equal(planSetup('').kind, 'none');
  assert.equal(planSetup(undefined).kind, 'none');
  assert.equal(planSetup('### Setup\n\n```json\n{"a":1}\n```\n').kind, 'refused');
});

test('C106 - a command that fails stops the Setup and the case', (t) => {
  const plan = planSetup(fence('mkdir -p clients/a'));
  const r = runSetup(plan, tempDir('c106-fail-', t), { run: () => ({ status: 1, stderr: 'boom', stdout: '' }) });
  assert.equal(r.ran, true);
  assert.equal(r.ok, false);
  assert.match(r.line, /failed/);
  assert.match(r.line, /boom/);
});

test('C106 - the summary line says which Setup ran, in every kind', (t) => {
  const { cases } = extract(t);
  const line = (id) => summaryLine(id, planSetup(cases.find((c) => c.id === id).setup));
  assert.match(line('T-25'), /^T-25: Setup run/);
  assert.match(line('T-25'), /mkdir/);
  assert.match(line('T-22'), /^T-22: Setup NOT run - needs an instance/);
  assert.match(line('T-07'), /^T-07: Setup not needed - the runner/);
  assert.match(line('T-06'), /^T-06: Setup is prose/);
  assert.match(line('T-01'), /^T-01: no Setup/);
  assert.match(summaryLine('T-99', planSetup(fence('rm -rf clients'))), /^T-99: Setup REFUSED/);
});

test('C106 - the runner calls the Setup before a case\'s first turn and prints the summary in the header', () => {
  const sh = readFileSync(join(root, 'scripts/validation/validation-run.sh'), 'utf8');
  const code = sh.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const run = code.indexOf('setup-plan.mjs" run');
  const firstClaude = code.indexOf('claude -p "');
  assert.ok(run !== -1, 'the runner never runs a Setup');
  assert.ok(run < firstClaude, 'the Setup runs after the session started');
  assert.match(code, /setup-plan\.mjs" summary[^\n]*header\.txt/, 'the header does not say which Setup ran');
  assert.match(code, /not run/, 'a refused Setup must skip the case, and say so');
  // each run starts from an empty clients/, so a Setup's state - and a session's own artefacts - stay with their case
  const clean = code.indexOf('clean -fdxq -- clients');
  assert.ok(clean !== -1 && clean < run, 'clients/ is not cleared before the Setup runs');
});

test('C106 - the command line: T-25 writes the file, T-22 writes nothing, an unclassified Setup stops the case', (t) => {
  const { out } = extract(t);
  const cli = (args) => spawnSync(process.execPath, [join(root, 'scripts/validation/setup-plan.mjs'), ...args], { encoding: 'utf8' });

  const clone = tempDir('c106-cli-', t);
  const ok = cli(['run', out, 'T-25', clone]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.ok(existsSync(join(clone, 'clients/acme/acme-engagement-state.md')));
  assert.match(ok.stdout, /T-25: Setup run/);

  const live = tempDir('c106-cli-live-', t);
  const dormant = cli(['run', out, 'T-22', live]);
  assert.equal(dormant.status, 0, dormant.stdout + dormant.stderr);
  assert.equal(existsSync(join(live, 'clients')), false);
  assert.match(dormant.stdout, /NOT run/);

  const bad = join(tempDir('c106-cli-bad-', t), 'p.json');
  writeFileSync(bad, JSON.stringify([{ id: 'T-98', setup: fence('rm -rf clients') }]));
  const refused = cli(['run', bad, 'T-98', clone]);
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.match(refused.stdout, /REFUSED/);

  assert.equal(cli(['run', out, 'T-99', clone]).status, 2, 'an unknown case is a usage error');
  assert.match(cli(['summary', out, 'T-25', 'T-22', 'T-07', 'T-01']).stdout.trim().split('\n').join('|'), /T-25: .*\|T-22: .*\|T-07: .*\|T-01: no Setup/);
});

// ── ARC-11-C6 step 10 — the licence each case runs under ─────────────────────────────────────────────────────
// From 2.0.13 a session with no licence in force produces no deliverable (CLAUDE.md §1), and the runner's clone has no
// `.local/`. So every case runs as a licensed user would, under the checkout's own licence copied into the clone,
// and T-31, whose Setup says "No licence", runs without one. The architect's ruling (2026-10-12): in a test the
// checkout's licence is the fixture's, written through licensedEnv like every other, never a real one.
const NO_LICENCE = '### Setup\n\nNo licence: the runner leaves `.local/licence.json` out of the clone.\n';
/** A checkout of a test's own, holding the fixture licence where the runner reads one. */
function checkoutWithLicence(t) {
  const dir = tempDir('c6-s10-root-', t);
  licensedEnv({}, { root: dir });
  return dir;
}
const licenceIn = (dir) => join(dir, '.local', 'licence.json');

test('ARC-11-C6 step 10 — a Setup that says "No licence" is its own kind: nothing spawns, and the summary says so', () => {
  const plan = planSetup(NO_LICENCE);
  assert.equal(plan.kind, 'no-licence');
  assert.match(summaryLine('T-31', plan), /^T-31: Setup run - the licence is left out of the clone/);
  const r = runSetup(plan, '/nowhere', { run: forbidden });
  assert.deepEqual([r.ran, r.ok], [false, true]);
});

test('ARC-11-C6 step 10 — the checkout\'s licence is copied in for a case; a No-licence case has none; no licence, no run', async (t) => {
  const { placeLicence } = await import('../scripts/validation/setup-plan.mjs');
  const root = checkoutWithLicence(t);
  const clone = tempDir('c6-s10-clone-', t);
  const copied = placeLicence(planSetup(fence('mkdir -p clients/acme')), clone, root);
  assert.equal(copied.ok, true, copied.line);
  assert.equal(readFileSync(licenceIn(clone), 'utf8'), readFileSync(licenceIn(root), 'utf8'));
  if (process.platform !== 'win32') assert.equal(statSync(licenceIn(clone)).mode & 0o777, 0o600);
  // The clone is shared by the cases of a run: a No-licence case removes what the case before it was given.
  const left = placeLicence(planSetup(NO_LICENCE), clone, root);
  assert.equal(left.ok, true, left.line);
  assert.equal(existsSync(licenceIn(clone)), false);
  // A checkout with no licence of its own runs nothing, and says where the licence was looked for.
  const bare = tempDir('c6-s10-bare-', t);
  const none = placeLicence(planSetup(''), clone, bare);
  assert.equal(none.ok, false);
  assert.ok(none.line.includes(licenceIn(bare)), none.line);
});

test('ARC-11-C6 step 10 — the command line: licence <root> stops a checkout without one; run <…> <root> places it', (t) => {
  const { out } = extract(t);
  const cli = (args) => spawnSync(process.execPath, [join(root, 'scripts/validation/setup-plan.mjs'), ...args], { encoding: 'utf8' });
  const bare = tempDir('c6-s10-cli-bare-', t);
  const refused = cli(['licence', bare]);
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.ok(`${refused.stdout}${refused.stderr}`.includes(licenceIn(bare)), refused.stdout + refused.stderr);
  const home = checkoutWithLicence(t);
  assert.equal(cli(['licence', home]).status, 0);

  const clone = tempDir('c6-s10-cli-clone-', t);
  const t25 = cli(['run', out, 'T-25', clone, home]);
  assert.equal(t25.status, 0, t25.stdout + t25.stderr);
  assert.ok(existsSync(licenceIn(clone)), 'T-25 ran without the checkout\'s licence');
  const t31 = cli(['run', out, 'T-31', clone, home]);
  assert.equal(t31.status, 0, t31.stdout + t31.stderr);
  assert.equal(existsSync(licenceIn(clone)), false, 'T-31 ran with a licence');
  assert.equal(cli(['run', out, 'T-25', clone, bare]).status, 1, 'a case ran with no licence to give it');
});

test('ARC-11-C6 step 10 — the runner checks the licence before any session, and hands every case its root', () => {
  const sh = readFileSync(join(root, 'scripts/validation/validation-run.sh'), 'utf8');
  const code = sh.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const check = code.indexOf('setup-plan.mjs" licence "$ROOT"');
  assert.ok(check !== -1, 'the runner never checks for a licence');
  assert.ok(check < code.indexOf('for T in $SEL'), 'the licence is checked after the cases started');
  assert.match(code, /setup-plan\.mjs" licence "\$ROOT"\)?[^\n]*\|\|[^\n]*exit/, 'a checkout without a licence does not stop the run');
  assert.match(code, /setup-plan\.mjs" run "\$PROMPTS" "\$T" "\$C" "\$ROOT"/, 'a case is not handed the checkout\'s root');
});
