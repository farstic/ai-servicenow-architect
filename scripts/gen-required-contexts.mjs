#!/usr/bin/env node
/**
 * `tests/fixtures/required-contexts.json` — every check name a pull request must produce.
 *
 * ARC-09-S08. `main`'s branch protection lists its required contexts BY NAME, and a list typed
 * into a settings page is a list that silently stops matching: a renamed cell is not a red build,
 * it is a required check nobody produces any more, and protection either waits for ever or quietly
 * stops requiring the thing it was there for. So the list is GENERATED from `ci.yml` and the
 * architect's protection call reads this file.
 *
 * Two rules, and both are about being wrong loudly rather than quietly:
 *
 *   A job this generator cannot CLASSIFY is a hard failure, never an omission. If a matrix shape
 *   appears that the name-builder does not understand, the build stops and says which job — an
 *   omitted name would be a context that never becomes required, discovered months later by a bad
 *   merge.
 *
 *   Path-filtered and conditional workflows are excluded EXPLICITLY, by name, with the reason in
 *   the file — never by "it did not appear in the last run". `docs-real.yml` is one: its jobs are
 *   named after the OS and it runs only when its paths change, so a PR that touches those paths
 *   produces four extra check runs that are not, and must not become, required.
 *
 * Usage: node scripts/gen-required-contexts.mjs [--check]
 * Exit 0 current/written · 1 stale · 2 a job it cannot classify.
 */
import { readFileSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'tests/fixtures/required-contexts.json';
const CHECK = process.argv.includes('--check');

/**
 * Workflows whose checks are NOT required, with the reason each is here.
 *
 * A conditional workflow's contexts cannot be required: protection would wait for a check that a
 * PR touching other paths never produces.
 */
const NOT_REQUIRED = Object.freeze({
  'docs-real.yml': 'path-filtered: runs only when the docs corpus tooling changes, so a PR that '
    + 'touches nothing else never produces these',
  'docs-bump.yml': 'scheduled and manual: it opens the corpus-pin PR, it does not gate one',
  'release.yml': 'tags only (`v*`), never a pull request',
  'e2e-live.yml': 'manual, and it needs a real instance and a credential',
  'publish-npm.yml': 'manual dispatch only; never a pull request, never a tag — and a dry run '
    + 'unless the dispatcher says otherwise (ARC-09-S10)',
});

/** The one workflow that gates a pull request. */
const GATING = 'ci.yml';

const text = readFileSync(join(root, '.github/workflows', GATING), 'utf8');

/** Every `  <job>:` at the top level of `jobs:`. */
function jobBlocks(source) {
  const jobsAt = source.indexOf('\njobs:');
  const body = source.slice(jobsAt);
  const names = [...body.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)];
  return names.map((m, i) => ({
    id: m[1],
    body: body.slice(m.index, i + 1 < names.length ? names[i + 1].index : undefined),
  }));
}

const die = (why) => { writeSync(2, `gen-required-contexts: ${why}\n`); process.exit(2); };

/**
 * The context names one job produces, exactly as a check run prints them.
 *
 * GitHub's rule: a job with no matrix is its `name:` (or its id); a job with a matrix is
 * `<name> (<value>, <value>…)` with the matrix values in declaration order — unless `name:`
 * interpolates them itself, in which case that string is the name and the suffix is not added.
 */
function contextsFor(job) {
  const nameLine = /^\s{4}name:\s*(.+)$/m.exec(job.body);
  const declared = nameLine ? nameLine[1].trim().replace(/^['"]|['"]$/g, '') : job.id;
  const matrixAt = job.body.indexOf('\n      matrix:');
  if (matrixAt === -1) {
    if (/\$\{\{\s*matrix\./.test(declared)) {
      die(`${job.id}: its name interpolates a matrix value but it declares no matrix`);
    }
    return [declared];
  }

  // The matrix's own keys, in order. `include:` rows are the explicit form and are read whole.
  //
  // Sliced PAST the `matrix:` line before splitting: the slice starts with `\n      matrix:`,
  // which is itself a six-space key, so splitting on that boundary first returned an empty string
  // and every job "declared a matrix this generator cannot read".
  const afterMatrixLine = job.body.slice(matrixAt + '\n      matrix:'.length);
  const matrixBody = afterMatrixLine.split(/\n {6}\S/)[0];
  const include = [...matrixBody.matchAll(/^ {10}- \{([^}]*)\}$/gm)];
  const axes = [...matrixBody.matchAll(/^ {8}([a-z][a-z0-9_-]*):\s*\[([^\]]+)\]$/gm)]
    .map((m) => ({ key: m[1], values: m[2].split(',').map((v) => v.trim().replace(/^['"]|['"]$/g, '')) }));

  const rows = [];
  if (include.length > 0) {
    for (const [, fields] of include) {
      // Split on commas OUTSIDE quotes. `label: 'ubuntu-latest, node 20'` is one field with a
      // comma in it, and a naive split turned every bootstrap cell into `bootstrap (ubuntu-latest)`
      // — thirteen names that no run produces, which is precisely the failure this file exists to
      // prevent. Caught by comparing the generated list against a real run rather than trusting it.
      const row = {};
      for (const [, key, quoted, bare] of fields.matchAll(
        /([a-z][a-z0-9_-]*)\s*:\s*(?:'([^']*)'|"([^"]*)"|([^,}]*))/gi)) {
        row[key] = (quoted ?? bare ?? '').trim();
      }
      rows.push(row);
    }
  } else if (axes.length > 0) {
    const combine = (i, acc) => {
      if (i === axes.length) { rows.push({ ...acc }); return; }
      for (const v of axes[i].values) combine(i + 1, { ...acc, [axes[i].key]: v });
    };
    combine(0, {});
  } else {
    die(`${job.id}: it declares a matrix this generator cannot read`);
  }

  return rows.map((row) => {
    // A name that interpolates its own matrix values IS the context name; GitHub adds no suffix.
    if (/\$\{\{\s*matrix\./.test(declared)) {
      return declared.replace(/\$\{\{\s*matrix\.([a-z0-9_-]+)\s*\}\}/gi, (_, key) => {
        if (!(key in row)) die(`${job.id}: name uses matrix.${key}, which the matrix does not set`);
        return row[key];
      });
    }
    return `${declared} (${Object.values(row).join(', ')})`;
  });
}

const contexts = jobBlocks(text).flatMap(contextsFor).sort();
if (contexts.length === 0) die(`${GATING} produced no contexts — the parser is wrong, not the file`);

const body = `${JSON.stringify({
  _rule: 'GENERATED by scripts/gen-required-contexts.mjs from .github/workflows/ci.yml. This is '
    + "the list of check names a pull request must produce, and the file main's branch protection "
    + 'is set from. Do not hand-edit: run `npm run gen`. A job the generator cannot classify is a '
    + 'hard failure rather than an omission, because an omitted name is a required check nobody '
    + 'ever notices is missing.',
  _notRequired: NOT_REQUIRED,
  count: contexts.length,
  contexts,
}, null, 2)}\n`;

const current = (() => {
  try { return readFileSync(join(root, TARGET), 'utf8'); } catch { return null; }
})();

if (current === body) {
  writeSync(1, `gen-required-contexts: ${TARGET} current (${contexts.length} contexts).\n`);
} else if (CHECK) {
  writeSync(1, `gen-required-contexts: ${TARGET} is stale — run npm run gen and commit the result\n`);
  process.exitCode = 1;
} else {
  writeFileSync(join(root, TARGET), body);
  writeSync(1, `gen-required-contexts: wrote ${TARGET} (${contexts.length} contexts).\n`);
}
