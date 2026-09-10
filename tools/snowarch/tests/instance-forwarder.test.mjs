import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CLI_PATH, NOT_INSTALLED, buildArgv, instanceCommand, preconditions, serverDepsInstalled,
} from '../lib/instance.mjs';
import { EXIT_PREREQ } from '../lib/exit.mjs';
import { recorder } from './helpers/workspace.mjs';

/**
 * ARC-07-S05 — the forwarder forwards, and nothing else.
 *
 * Three properties, and the third is the one that matters most: the argv it builds contains only
 * what the user typed. A secret cannot reach `ps` through a process that never invents an
 * argument — so the test greps the whole of `tools/snowarch/` for a `--password` construction as
 * well as asserting the builder.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const fakeRoot = () => {
  const dir = mkdtempSync(join(tmpdir(), 'forwarder-'));
  writeFileSync(join(dir, 'engine.config.json'), JSON.stringify({
    docs: { pin: 'a'.repeat(40), family: 'australia', areasFile: 'vendor/docs-areas.txt', upstream: 'x' },
    mcp: { serverKey: 'servicenow', packageDir: 'packages/snowarch' },
    floors: { node: '20.0.0', claudeCode: '2.1.214', git: '2.34.1' },
  }));
  return dir;
};

test('every precondition is a separate answer, because each has its own remedy', () => {
  const dir = fakeRoot();
  try {
    const config = JSON.parse(readFileSync(join(dir, 'engine.config.json'), 'utf8'));
    const nothing = preconditions({ root: dir, config, exists: () => false, depsInstalled: () => false });
    assert.equal(nothing.ok, false);
    assert.ok(nothing.problems.some((p) => p.includes(CLI_PATH)));
    assert.ok(nothing.problems.some((p) => p.includes('dependencies')));

    // Node below the floor is its own problem, and it is read from engine.config.json — the same
    // number the bootstrap enforces, never a literal here.
    const old = preconditions({ root: dir, config, nodeVersion: '18.20.0',
      exists: () => true, depsInstalled: () => true });
    assert.ok(old.problems.some((p) => p.includes('20.0.0')), old.problems.join('; '));

    const fine = preconditions({ root: dir, config, nodeVersion: '22.0.0',
      exists: () => true, depsInstalled: () => true });
    assert.deepEqual(fine.problems, []);
    assert.equal(fine.ok, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a checkout that cannot run the wizard says ONE sentence, exits 3, and spawns nothing', async () => {
  const dir = fakeRoot();
  const log = recorder();
  let spawned = 0;
  try {
    const code = await instanceCommand({
      log, argv: ['add', 'pdi'], root: dir, exists: () => false,
      run: () => { spawned += 1; return { status: 0 }; },
    });
    assert.equal(code, EXIT_PREREQ);
    assert.equal(spawned, 0, 'the server CLI was spawned anyway');
    assert.ok(log.lines.join('\n').includes(NOT_INSTALLED));
    // The reasons go to the log, not into the sentence: three of them at once would bury the
    // one action the reader has to take.
    assert.equal(log.lines.filter((l) => l.includes('Live mode is not installed')).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the argv is what the user typed — the builder adds nothing at all', () => {
  const typed = ['add', 'pdi', '--url', 'https://dev12345.service-now.com', '--env', 'pdi'];
  assert.deepEqual(buildArgv('/x/cli.js', typed), ['/x/cli.js', 'instance', ...typed]);
  assert.deepEqual(buildArgv('/x/cli.js', []), ['/x/cli.js', 'instance']);
});

test('...and nothing under tools/snowarch constructs a secret flag', () => {
  // The builder is one function; this is the claim about the whole surface. A `--password`
  // assembled anywhere here would put a credential in `ps` for every user on the machine (P-34).
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules') continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.mjs')) files.push(p);
    }
  };
  walk(join(root, 'tools', 'snowarch'));
  assert.ok(files.length > 20, `only ${files.length} files scanned`);

  const offenders = [];
  for (const file of files) {
    for (const [i, line] of readFileSync(file, 'utf8').split('\n').entries()) {
      if (/^\s*(\/\/|\*)/.test(line)) continue;                       // prose about the rule
      if (/['"`]--(password|client-secret|secret)\b/.test(line)) offenders.push(`${file}:${i + 1}`);
    }
  }
  assert.deepEqual(offenders, []);
  // Not vacuous — and the control is ASSEMBLED, because a file that spells the string it forbids
  // becomes a hit in its own sweep. (Twelfth time in this repository; the first draft of this very
  // test was the twelfth.)
  const control = `args.push('${'--pass'}${'word'}', pw)`;
  assert.ok(/['"`]--(password|client-secret|secret)\b/.test(control));
});

test('the hand-over keeps the terminal, the checkout and the exit code', async () => {
  const dir = fakeRoot();
  const log = recorder();
  let seen = null;
  try {
    const code = await instanceCommand({
      log, argv: ['add', 'pdi'], root: dir, exists: () => true, nodeVersion: '22.0.0',
      depsInstalled: () => true,
      run: (file, args, opts) => { seen = { file, args, opts }; return { status: 7 }; },
    });
    assert.equal(code, 7, 'the child exit code must reach the caller');
    assert.equal(seen.file, process.execPath, 'spawned by name rather than by path');
    assert.deepEqual(seen.args.slice(1), ['instance', 'add', 'pdi']);
    // Inherited stdio is what lets S01's masked prompt work: a pipe here turns "type your
    // password" into "read a pipe", which that module refuses to do.
    assert.equal(seen.opts.stdio, 'inherit');
    // ARC-06-S08's rule: our spawn, so the session variable is SET rather than inherited.
    assert.equal(seen.opts.env.CLAUDE_PROJECT_DIR, dir);
    assert.equal(seen.opts.cwd, dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the dependency check RESOLVES rather than guessing a path', () => {
  // npm hoists `@modelcontextprotocol/sdk` to the repository root in this workspace, so the
  // nested `packages/snowarch/node_modules/...` path is absent on a correctly installed checkout
  // — the forwarder refused to run on a machine where everything was fine. `createRequire` asks
  // the question Node will ask when the CLI starts.
  assert.equal(serverDepsInstalled(root), true);
  const empty = mkdtempSync(join(tmpdir(), 'no-deps-'));
  try {
    mkdirSync(join(empty, 'packages', 'snowarch'), { recursive: true });
    writeFileSync(join(empty, 'packages', 'snowarch', 'package.json'), '{"name":"x"}');
    assert.equal(serverDepsInstalled(empty), false);
  } finally { rmSync(empty, { recursive: true, force: true }); }
});
