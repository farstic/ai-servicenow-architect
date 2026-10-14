// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve, sep } from 'node:path';
import { root, stateRoot } from '../lib/config.mjs';
import { INPUT_FILES, cachePath, collectInputs, inputsPath } from '../lib/doctor-cache.mjs';
import { doctorCachePath, statePath } from '../lib/state.mjs';
import { storePath } from '../lib/mode.mjs';
import { cachePath as upgradeCachePath } from '../lib/upgrade-check.mjs';
import { createLogger } from '../lib/log.mjs';
import { commit, releasedChangelog } from '../../../tests/helpers/changelog-fixture.mjs';
import { withoutGeneratedInternal } from '../../../tests/helpers/changelog-history.mjs';
import { tempDir } from './helpers/temp.mjs';

/**
 * ARC-07-C43, HEAD 1 — the state-root seam, and the two properties that make it safe to ship alone.
 *
 * The defect the seam exists for is measured in C43's row: `root` comes from `config.mjs`'s own
 * location, so a spawned CLI given a temp `cwd` still writes `.local/` into the checkout, and five
 * suites do exactly that on every `npm test`. Head 2 routes the twenty sites that still hand-build
 * those paths and only then sets the variable.
 *
 * So what is asserted here is not "the redirect works" alone. It is:
 *
 *   INERT     with the variable unset — which is every run today — every builder returns the path it
 *             returned before. This is what lets head 1 land before head 2 without a half-moved state
 *             root, and it is the claim that would rot silently if nobody pinned it.
 *   BOUNDED   a caller that passes a fixture root of its own keeps it. Every existing case that writes
 *             into a temp tree relies on that, and an exported variable that captured them would be a
 *             seam that reaches further than the thing it was added for.
 *
 * The builders are listed once, by name, and the same list drives all three cases: a seventh builder
 * added to the product and not to this list is a builder nobody proved either way.
 */
const BUILDERS = [
  ['state.statePath', statePath, join('.local', 'bootstrap-state.json')],
  ['state.doctorCachePath', doctorCachePath, join('.local', 'doctor-last.json')],
  ['doctor-cache.cachePath', cachePath, join('.local', 'doctor-last.json')],
  ['doctor-cache.inputsPath', inputsPath, join('.local', 'doctor-last.inputs.json')],
  ['upgrade-check.cachePath', upgradeCachePath, join('.local', 'upgrade-check.json')],
  ['mode.storePath', storePath, join('.local', 'instances.json')],
];

/** The logger is the seventh site and not a path function, so it is measured by where it WRITES. */
const logDirFor = (from, t) => {
  const log = createLogger({ command: 'probe', quiet: true, logRoot: from,
    out: { write: () => {} }, err: { write: () => {} } });
  log.step('one line, to open the file');
  const file = log.logFile;
  assert.ok(file, 'the logger wrote nothing, so this case is measuring the wrong thing');
  t.diagnostic(`log file: ${file}`);
  return file;
};

test('C43 head 1 — with the variable unset, every builder is exactly what it was', (t) => {
  const fixture = tempDir('state-root-inert-', t);
  for (const [name, build, tail] of BUILDERS) {
    assert.equal(build(fixture), join(fixture, tail), `${name} moved with no variable set`);
    assert.equal(build(root), join(root, tail), `${name} moved the REAL root with no variable set`);
  }
  assert.equal(stateRoot(root, {}), root);
  assert.equal(stateRoot(fixture, {}), fixture);
  // The logger too: unset, it opens under the root it was given.
  assert.equal(logDirFor(fixture, t).startsWith(join(fixture, '.local', 'logs') + sep), true,
    'the logger did not write under the root it was given');
});

test('C43 head 1 — set, it redirects THIS checkout\'s state and nothing else', (t) => {
  const target = tempDir('state-root-target-', t);
  const env = { SNOWARCH_STATE_ROOT: target };

  assert.equal(stateRoot(root, env), resolve(target));
  // A relative value is resolved, so a caller cannot make the path depend on the cwd it was run from.
  assert.equal(resolve(stateRoot(root, { SNOWARCH_STATE_ROOT: '.' })), resolve('.'));
  // Empty is not a redirect: it is the absence of one, and must not send `.local/` to `/`.
  assert.equal(stateRoot(root, { SNOWARCH_STATE_ROOT: '' }), root);
});

test('C43 head 1 — every builder redirects when it is set, the logger included', (t) => {
  /*
   * THE LOGGER NEEDED ITS OWN CASE, and a control is what said so. Control HD un-seamed `log.mjs` and
   * the suite still passed: the inertness case above asserts the logger writes under the root it was
   * GIVEN, which is true whether or not the seam is there, and nothing asserted the redirect. So this
   * is the direction that fails when the builder is un-seamed.
   *
   * `process.env` rather than an injected `env`, because `createLogger` takes a `logRoot` and not an
   * environment — the seam it reaches is `stateRoot`'s default. `logRoot` is the REAL root here, which
   * is the only configuration that proves anything: unset, this would open a log inside the checkout.
   */
  const target = tempDir('state-root-writes-', t);
  const saved = process.env.SNOWARCH_STATE_ROOT;
  process.env.SNOWARCH_STATE_ROOT = target;
  try {
    for (const [name, build, tail] of BUILDERS) {
      assert.equal(build(root), join(resolve(target), tail), `${name} did not follow the state root`);
    }
    const file = logDirFor(root, t);
    assert.equal(file.startsWith(join(resolve(target), '.local', 'logs') + sep), true,
      `the logger wrote to ${file} — with the variable set it must not open a log in the checkout`);
    assert.equal(file.startsWith(join(root, '.local') + sep), false,
      'the logger opened a log inside the checkout while the state root pointed elsewhere');
  } finally {
    if (saved === undefined) delete process.env.SNOWARCH_STATE_ROOT;
    else process.env.SNOWARCH_STATE_ROOT = saved;
  }
});

test('C43 head 1 — a caller that passes its own root keeps it, set or not', (t) => {
  const fixture = tempDir('state-root-fixture-', t);
  const target = tempDir('state-root-other-', t);
  const env = { SNOWARCH_STATE_ROOT: target };

  assert.equal(stateRoot(fixture, env), fixture,
    'the variable captured a fixture root — every case that writes into a temp tree would move');
  // The guard is about identity with the real root, not about the string's shape: a path INSIDE the
  // checkout is still somebody else's root and is left alone.
  const inside = join(root, 'tests', 'fixtures');
  assert.equal(stateRoot(inside, env), inside);
});

test('C43 head 1 — the doctor\'s repository inputs do not move with `.local/`', (t) => {
  const target = tempDir('state-root-inputs-', t);
  const saved = process.env.SNOWARCH_STATE_ROOT;
  process.env.SNOWARCH_STATE_ROOT = target;
  try {
    const seen = [];
    collectInputs(root, { exists: (p) => { seen.push(p); return false; }, stat: () => ({ mtimeMs: 0 }) });
    const under = (p) => p.startsWith(resolve(target) + sep);
    for (const [key, parts] of Object.entries(INPUT_FILES)) {
      const p = seen.find((q) => q.endsWith(join(...parts)));
      assert.ok(p, `${key} was not looked for at all`);
      // `.local/` state follows the redirect; `.mcp.json`, the settings files and `engine.config.json`
      // are the CHECKOUT's, and a redirected run that looked for them in the temp directory would
      // find nothing, call every input changed and re-run the doctor for ever.
      assert.equal(under(p), parts[0] === '.local',
        `${key} resolved to ${under(p) ? 'the state root' : 'the checkout'}, which is the wrong one`);
    }
  } finally {
    if (saved === undefined) delete process.env.SNOWARCH_STATE_ROOT;
    else process.env.SNOWARCH_STATE_ROOT = saved;
  }
});

/**
 * Does this file name the variable, as head 2 reads it? One predicate, so the walk over the real tree and
 * the fixture changelogs below cannot disagree about what "named" means. `rel` is relative to the root,
 * in the platform's separator. The changelog is read without its generated Internal entries, the commit
 * log a release writes (the case after head 2's says why).
 */
const namesTheVariable = (rel, text) =>
  (rel === join('docs', 'CHANGELOG.md') ? withoutGeneratedInternal(text) : text).includes('SNOWARCH_STATE_ROOT');

test('C43 head 2 — the variable is documented where a contributor reads, and nowhere else', async () => {
  /*
   * THIS CASE IS THE INVERSION OF HEAD 1'S, AND THE INVERSION IS THE POINT.
   *
   * Head 1 asserted the variable was named in NO page: it was inert, and a reader who exported it
   * before the twenty-five hand-built paths were routed would have got a half-moved state root — the
   * doctor reading the real `bootstrap-state.json` while writing its cache elsewhere. Head 2 routed
   * them, so the seam is supported and the bound is lifted. What replaces it is not "anything goes":
   *
   *   CONTRIBUTING     yes. It is a test and CI seam, and that page is where the rules for whoever
   *                    changes this repository live.
   *   ci.yml           yes (ARC-11-C6, the architect's ruling of 2026-10-12): its fixture-licence steps set it
   *                    per step, for the product steps outside the allowed set. That is the CI seam
   *                    CONTRIBUTING describes, not a way to relocate an install.
   *   release.yml      yes, for the same reason (ARC-11-C6 step 5, the architect's ruling): its evidence doctor
   *                    runs licensed, per step, so the published evidence is the licensed picture.
   *   docs/plans/      yes. C43's row is the engineering record of both heads.
   *   the changelog's  yes, in its generated `### Internal` entries alone (the architect's ruling of
   *   commit log       2026-10-12, after the rc.3 cut): a release writes each commit's subject there, and
   *                    a commit log is not a page. Its Notes and hand-written groups are pages.
   *   ANY USER PAGE    no. `INSTALL.md`, `README.md`, `TROUBLESHOOTING.md`, `MODES-AND-PRESETS.md`,
   *                    the settings files, the launchers and other workflows stay clean, because nothing
   *                    in the product sets it and an installed checkout keeps its state beside itself.
   *                    A user who reads it as a way to relocate an installation has been misled by us.
   */
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const pages = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'vendor') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(md|json|ya?ml|sh|ps1)$/.test(e.name) && statSync(p).size < 2_000_000) pages.push(p);
    }
  };
  walk(root);
  const named = pages.map((p) => p.slice(root.length + 1))
    .filter((rel) => !rel.startsWith(`docs${sep}plans${sep}`))
    .filter((rel) => namesTheVariable(rel, readFileSync(join(root, rel), 'utf8')));
  // Sorted: a directory's entries come back in the filesystem's order, which is not alphabetical everywhere.
  assert.deepEqual(named.sort(), [join('.github', 'workflows', 'ci.yml'), join('.github', 'workflows', 'release.yml'),
    join('docs', 'CONTRIBUTING.md')].sort(),
    'SNOWARCH_STATE_ROOT is named somewhere new — it belongs in CONTRIBUTING, not in a user-facing page');
  // And the page has to actually explain it, not merely mention it: the two bounds are what stop a
  // reader treating it as a way to move a real installation.
  const contributing = readFileSync(join(root, 'docs', 'CONTRIBUTING.md'), 'utf8');
  assert.match(contributing, /local-paths\.mjs/, 'the page does not say where the paths are named');
  assert.match(contributing, /useStateRoot\(\)/, 'the page does not say how a suite opts in');
  assert.match(contributing, /test and CI seam/, 'the page does not say it is not for a real install');
});

test('C43 head 2 — in the changelog, only the generated Internal group is a commit log', () => {
  /*
   * THE RC.3 CUT FAILED ON THE RELEASE'S OWN WRITE (the architect's ruling of 2026-10-12). A release writes
   * every commit since the last final into the new section, and f3843c9, a `test:` commit whose subject says
   * ci.yml may name the variable, went into its generated `### Internal` group. That group is a commit log
   * written by `scripts/lib/release/changelog.mjs`, not a page a reader is sent to. The dry run never saw
   * it, because a dry run writes nothing.
   *
   * So the guard reads every other line of the changelog. The Notes and every hand-written group are held,
   * and so are the hand-written `### Internal` entries the older sections carry: 52 lines today, which is
   * why the heading alone cannot decide it, only the heading and the generator's exact line together. The
   * generated Added, Fixed and Changed groups are held too, because they describe a change to the product.
   *
   * The fixtures are built by the generator's own functions (`tests/helpers/changelog-fixture.mjs`), so a
   * change to the line it writes reaches this case.
   */
  const VAR = 'SNOWARCH_STATE_ROOT';
  const changelog = join('docs', 'CHANGELOG.md');
  const notes = '### Notes\n\nA hand-written note.';
  const handInternal = `${notes}\n\n### Internal\n\n- **ARC-07-C43** — a hand-written entry naming ${VAR}.`;
  const plain = commit('docs(plan): a row', 'aaaaaaa1');
  const fix = commit(`fix(snowarch): the CLI follows ${VAR}`, 'ccccccc3');

  // The commit log: f3843c9's own subject, and one outside the convention, which the generator also files there.
  const log = releasedChangelog(notes, [plain,
    commit(`test(tests): ci.yml may name ${VAR}, for its per-step fixture licence (ARC-11-C6)`, 'f3843c94'),
    commit(`a subject outside the convention, naming ${VAR}`, 'bbbbbbb2')]);
  assert.ok(log.split('\n').includes(
    `- tests: ci.yml may name ${VAR}, for its per-step fixture licence (ARC-11-C6) (f3843c9)`),
  'the fixture does not hold the line the rc.3 write produced, so this case measures something else');
  assert.equal(namesTheVariable(changelog, log), false,
    'a generated Internal line was read as a page; the rc.3 cut fails on exactly this');

  // Everything else in the changelog is a page.
  for (const [where, text] of [
    ['the Notes', releasedChangelog(`### Notes\n\nA note naming ${VAR}.`, [plain])],
    ['a hand-written Internal entry', releasedChangelog(handInternal, [plain])],
    ['a generated Fixed line', releasedChangelog(notes, [fix])],
  ]) {
    assert.equal(namesTheVariable(changelog, text), true,
      `${where} went unread; only the generated Internal group is a commit log`);
  }
  // And the reading is the changelog's alone: the same text in any other file is a page.
  assert.equal(namesTheVariable(join('docs', 'INSTALL.md'), log), true,
    'the commit-log reading reached a file that is not the changelog');
});
