/**
 * ARC-08-C25 — a script that exports helpers must not RUN when something imports it.
 *
 * THREE TIMES IN THREE ROWS I wrote a file under `scripts/` that exports helpers and also executes
 * at module scope. Each time the symptom was the same and quiet:
 *
 *   ARC-08-C20  `make-status-fixtures.mjs` — the drift test imported `capture()`, the module
 *               captured both fixtures and called `process.exit()`, and the run reported `pass 1`
 *               with four assertions gone. The test that would have caught the drift was the first
 *               casualty of the file it was testing.
 *   ARC-08-C22  `gen-cli-help.mjs`, written a day later — `cli-help.test.mjs`, `pass 1`, same
 *               cause.
 *   ARC-08-C25  `validate-report.mjs` — `workflows.test.mjs`, `pass 0`, same cause.
 *
 * Remembering the guard is not a strategy I have evidence for. This is the instrument instead: it
 * imports every exporting script in a CHILD process — so a module that exits cannot take the test
 * runner with it, which is exactly what made the first three so quiet — and fails if the import
 * produces output, a non-zero exit, or a hang.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every `.mjs` under `scripts/`, recursively. */
function scripts(dir = join(ROOT, 'scripts'), found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scripts(path, found);
    else if (entry.name.endsWith('.mjs')) found.push(path);
  }
  return found;
}

/** A file with no `export` cannot be imported for its helpers, so nothing depends on it not running. */
const exportsSomething = (source) => /^export[\s{]/m.test(source);

test('every exporting script can be imported without running', () => {
  const offenders = [];
  const checked = [];

  for (const path of scripts()) {
    const source = readFileSync(path, 'utf8');
    if (!exportsSomething(source)) continue;
    const rel = relative(ROOT, path);
    checked.push(rel);

    // A CHILD, with a timeout: an unguarded module may exit, write, or wait for input, and all
    // three are indistinguishable from the parent if the parent is the one importing it.
    const r = spawnSync(process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(path).href)});`],
      { encoding: 'utf8', timeout: 20_000, cwd: ROOT });

    if (r.status !== 0 || r.signal) {
      offenders.push(`${rel}: exited ${r.signal ?? r.status} on import — ${(r.stderr || r.stdout || '').trim().split('\n')[0] ?? ''}`);
      continue;
    }
    // Output on import is the milder half of the same defect: the module DID something. A helper
    // being imported for one function should be silent.
    const said = `${r.stdout}${r.stderr}`.trim();
    if (said) offenders.push(`${rel}: printed on import — ${said.split('\n')[0]}`);
  }

  assert.ok(checked.length >= 5, `only ${checked.length} exporting scripts found — the walk is wrong`);
  assert.deepEqual(offenders, [],
    'a script runs when imported: add the `INVOKED_DIRECTLY` guard before its main body');
});

test('the guard is what makes them importable, not luck', () => {
  // The negative control: a module shaped like the four that failed — an export, then a top-level
  // `process.exit` — must be seen by the check above. A walk that silently found nothing would
  // look exactly like a clean repository, which is how the first three stayed quiet.
  const r = spawnSync(process.execPath,
    ['--input-type=module', '-e', 'export const x = 1; process.exit(3);'],
    { encoding: 'utf8', timeout: 10_000 });
  assert.equal(r.status, 3,
    'the child-process check cannot see a module that exits — the walk above proves nothing');

  // …and the milder half: a module that merely PRINTS on import is caught too.
  const said = spawnSync(process.execPath,
    ['--input-type=module', '-e', 'export const x = 1; process.stdout.write("ran");'],
    { encoding: 'utf8', timeout: 10_000 });
  assert.equal(said.status, 0);
  assert.equal(said.stdout.trim(), 'ran', 'output on import is invisible to the check');
});
