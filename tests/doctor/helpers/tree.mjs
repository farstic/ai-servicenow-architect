/**
 * Fixture trees for the engine checks — composed from the real checkout at test time.
 *
 * A committed copy of `.mcp.json` or `.claude/settings.json` under `tests/fixtures/` would be a
 * second copy of the product's wiring, and the day somebody edits the real file the fixture keeps
 * asserting the old shape: the test passes, the install is broken. So the green tree is BUILT from
 * whatever those files say today, and every negative case is a mutation applied to a copy of it.
 * What the test then proves is the check, not the fixture.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hookEntry } from '../../../tools/snowarch/lib/settings-local.mjs';
import { emptyState } from '../../../tools/snowarch/lib/state.mjs';
import { tempDir } from '../../../tools/snowarch/tests/helpers/temp.mjs';

export const REAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The committed files every repo check reads. Copied, never retyped. */
export const WIRING = Object.freeze([
  'engine.config.json',
  // The ignore rules. `.claude/settings.local.json` MUST stay untracked — it holds a user's
  // approvals — and the toggle writer refuses to touch it when it is not ignored, so a fixture
  // without this file is a fixture where F6 can only fail.
  '.gitignore',
  // The version of record. A checkout without it is not a checkout, and the doctor reports the
  // version it finds — so a fixture without one would be asserting an absence nobody ships.
  'package.json',
  'CLAUDE.md',
  '.mcp.json',
  '.claude/settings.json',
  'packages/snowarch/package.json',
  'tools/snowarch/hooks/session-start.mjs',
]);

const git = (dir, args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });

export const readJson = (root, rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
export const writeJson = (root, rel, value) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), `${JSON.stringify(value, null, 2)}\n`);
};

/**
 * A checkout that passes E-05…E-11: the real wiring, committed, bootstrapped in `mode`.
 *
 * `git init` + one commit is what makes `git diff --quiet HEAD` answerable — half these checks ask
 * git whether a file is as committed, and a directory that is not a repository has no answer.
 */
export function greenTree(t, { mode = 'design', extra = {} } = {}) {
  const root = tempDir('snowarch-doctor-', t);
  for (const rel of WIRING) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    cpSync(join(REAL_ROOT, rel), join(root, rel));
  }
  // ARC-09-C2, the second half. The copied `engine.config.json` carries the REAL `docs.upstream`,
  // so a fixer that decided to repair a corpus cloned it from github.com — 305 MB, over the
  // network, from a unit test. A fixture's upstream is a path that cannot answer: a sync that
  // should not be happening fails in milliseconds and says so, and the two tests that genuinely
  // exercise a sync build their own bare repository and set it explicitly.
  const config = readJson(root, 'engine.config.json');
  writeJson(root, 'engine.config.json',
    { ...config, docs: { ...config.docs, upstream: join(root, 'no-upstream-in-a-fixture.git') } });

  for (const [rel, value] of Object.entries(extra)) writeJson(root, rel, value);

  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'fixture@example.com']);
  git(root, ['config', 'user.name', 'fixture']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'fixture']);

  bootstrap(root, { mode });
  return root;
}

/** What `./bootstrap.sh` leaves behind: `.local/`, the state file, and the local toggles. */
export function bootstrap(root, { mode = 'design', hooks = true, state: over = {} } = {}) {
  mkdirSync(join(root, '.local', 'logs'), { recursive: true, mode: 0o700 });
  // 0700 is asserted by E-11, and `mkdir -p` honours the process umask rather than the mode
  // argument for intermediate directories — so it is set explicitly, on the directory itself.
  execFileSync('chmod', ['700', join(root, '.local')]);
  const serverKey = readJson(root, 'engine.config.json').mcp.serverKey;
  const state = { ...emptyState({ engineVersion: '0.0.0-test' }), mode, docs: { mode: 'sparse', pin: null },
    ...over };
  writeJson(root, '.local/bootstrap-state.json', state);
  writeJson(root, '.claude/settings.local.json', {
    ...(mode === 'live' ? { enabledMcpjsonServers: [serverKey] }
      : { disabledMcpjsonServers: [serverKey] }),
    ...(hooks ? { hooks: hookEntry() } : {}),
  });
  return root;
}

/**
 * The heavy parts of a real install, LINKED rather than copied.
 *
 * The server checks need a built `dist/`, the roster checks need `.claude/skills` and
 * `.claude/agents`, and the contract checks need `packages/contract` — together tens of megabytes
 * that no fixture should duplicate per test. They are all read-only to the code under test, so a
 * junction (Windows) or a symlink (everywhere else) is the same thing to a reader and free to
 * make. `vendor/docs-areas.txt` is a small file and is copied, because a fixer may write beside it.
 */
export const LINKED = Object.freeze([
  'packages/snowarch/dist',
  'packages/contract',
  'node_modules',
  '.claude/skills',
  '.claude/agents',
  'scripts',
  // The engine's own library. The hook and the launcher resolve the root from their file location,
  // so a fixture that is to run either of them has to look like a checkout from the inside too.
  'tools/snowarch/lib',
  'tests/lib',
  'tests/fixtures',
  // The corpus, so the docs checks answer about a real one rather than about its absence. Linked
  // like the rest: 35,000 files that no fixture should copy — and linked ONLY when it is really
  // there. See `isCorpus` below; this entry is the one that is not read-only.
  'vendor/ServiceNowDocs',
]);

/**
 * Is this a corpus, or the empty hole where a submodule would be?
 *
 * ARC-09-C2. `existsSync` answers YES for `vendor/ServiceNowDocs` on a checkout with no submodule
 * content, because git creates the mount point. Linking that hole gave every `--fix` fixture a
 * corpus path that resolved into the LIVE checkout with nothing in it — and F2, whose job is to
 * repair a missing corpus, did exactly that: one test cloned 305 MB from the real upstream into the
 * developer's (or the runner's) own `vendor/ServiceNowDocs`.
 *
 * Eight tests in `tests/doctor/fix.test.mjs` reached it. On a machine whose corpus is already
 * complete the sync is a no-op, so it was invisible for four stories; on a CI cell that checks out
 * no submodule it built the corpus one area at a time while the rest of the suite ran, which is
 * what made `the two docs entry points are one implementation` read 17 areas and then 19 a moment
 * later.
 */
const isCorpus = (path) => existsSync(join(path, 'markdown'));

export function linkInstall(root, { from = REAL_ROOT, links = LINKED } = {}) {
  for (const rel of links) {
    const target = join(from, rel);
    if (!existsSync(target)) continue;
    // A fixture gets a REAL corpus or its own empty directory — never the live mount point. With
    // the hole linked, a fixer writing "the corpus that is missing" writes it into the checkout
    // this suite is supposed to leave alone.
    if (rel === 'vendor/ServiceNowDocs' && !isCorpus(target)) continue;
    const dest = join(root, rel);
    if (existsSync(dest)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    // `junction` on Windows: a directory symlink there needs a privilege a CI runner does not
    // have, and a junction does not.
    symlinkSync(target, dest, process.platform === 'win32' ? 'junction' : 'dir');
  }
  for (const rel of ['vendor/docs-areas.txt']) {
    const target = join(from, rel);
    if (!existsSync(target) || existsSync(join(root, rel))) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    cpSync(target, join(root, rel));
  }
  return root;
}

/** A copy of a tree, for one mutation. The original stays green for the next case. */
export function copyTree(t, from) {
  const to = tempDir('snowarch-doctor-', t);
  cpSync(from, to, { recursive: true });
  return to;
}

/** The context a check receives, with the run's memo fields empty. */
export function contextFor(root, over = {}) {
  return {
    root,
    config: readJson(root, 'engine.config.json'),
    contract: null,
    flags: {},
    platform: process.platform,
    env: process.env,
    home: '',
    now: () => Date.now(),
    ...over,
  };
}

/** Run one check by id from a list, and return its result. */
export const runById = (checks, id, ctx) => checks.find((c) => c.id === id).run(ctx);
