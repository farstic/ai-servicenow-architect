/**
 * The upgrade harness: a bare origin at v9.0.0, two fixture releases, and a user's clone.
 *
 * ARC-09-S07. An upgrade cannot be tested against a mock: the thing under test is what happens to
 * a real git tree — a fetch, a checkout, a second bootstrap run, a store migration — and every
 * interesting failure is one where the tree ends up somewhere the user did not expect. So the
 * harness builds the real thing, small, in a temp directory:
 *
 *   ORIGIN    a bare repository holding THIS checkout's tree with its versions rewritten to 9.x,
 *             tagged `v9.0.0` with a real annotated release message (S01's `buildTagMessage`).
 *   v9.1.0    changes ONE declared input — `vendor/docs-areas.txt` — so exactly one bootstrap step
 *             is stale and AC 1 can say which.
 *   v9.2.0    changes the STORE's schema: a 1→2 migration through S06's `migrations` seam, with
 *             `storeSchemaVersion: 2` in the contract the tag ships.
 *   USER      a clone of the origin at v9.0.0, bootstrapped design-only, carrying a fixture store.
 *
 * 9.x rather than 2.x because a fixture release must never be mistaken for a real one — not in a
 * developer's tag list, and not by `sortTags` if one ever leaked into the real repository.
 *
 * No network: the origin is a path, the clone is `file://`, and nothing here resolves a hostname.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync, cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { AREAS, buildUpstream } from '../helpers/docs-fixture.mjs';

export const REAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Assembled, never spelled. */
export const FIXTURE_PASSWORD = `${'Fix'}-${'ture'}-${'8821'}`;

const IDENTITY = ['-c', 'user.email=f@example.com', '-c', 'user.name=f'];

export function git(cwd, args, { allowFail = false } = {}) {
  try {
    return String(execFileSync('git', [...IDENTITY, ...args],
      { cwd, encoding: 'utf8', stdio: 'pipe' })).trim();
  } catch (e) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')} in ${cwd}: ${String(e.stderr ?? e.message)}`);
  }
}

/**
 * The files a fixture release needs to be a believable checkout of this product.
 *
 * Copied, not linked: the whole point is that `git checkout <tag>` MOVES them, and a symlink
 * would move nothing. `vendor/ServiceNowDocs` is deliberately absent — a fixture release that
 * carried 35,000 files would make every one of these tests a minute longer, and the corpus's own
 * movement is B02's business, which AC 1 exercises through the areas file instead.
 */
const COPIED = Object.freeze([
  'engine.config.json', 'package.json', 'package-lock.json', '.gitignore', 'CLAUDE.md',
  '.mcp.json', '.claude/settings.json', 'vendor/docs-areas.txt',
  'snowarch', 'snowarch.cmd', 'bootstrap.sh', 'bootstrap.cmd',
  'tools', 'scripts', 'packages',
  // `scripts/lib/roster.mjs` imports it, and B01 reaches the roster — a fixture without it fails
  // for a reason that has nothing to do with an upgrade.
  'tests/lib',
  // A checkout's own fixtures: the vocabulary lint reads `tests/fixtures/retired-*`. Small files,
  // and a fixture release without them fails for a reason that is not an upgrade.
  'tests/fixtures',
  // The skills and agents the roster counts. Small, and a checkout without them is not one.
  '.claude/skills', '.claude/agents',
]);

/**
 * Stage everything, RE-ASSERT the gitlink, commit.
 *
 * The re-assertion is not belt and braces. `git add -A` walks the working tree, finds no
 * `vendor/ServiceNowDocs` on disk — the corpus is a submodule and this tree has never checked one
 * out — and stages its DELETION. The first version of this harness lost the gitlink on the second
 * release, so the upgraded checkout had no submodule entry at all and B02 failed its completeness
 * check for a reason no user could ever meet.
 */
function commit(root, message, pin) {
  git(root, ['add', '-A']);
  git(root, ['update-index', '--add', '--cacheinfo', '160000', pin, 'vendor/ServiceNowDocs']);
  git(root, ['commit', '-qm', message]);
}

/** A version everywhere it is written, so `./snowarch version` in the clone says 9.x. */
function rewriteVersion(root, version) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ ...pkg, version }, null, 2)}\n`);
  const server = join(root, 'packages/snowarch/package.json');
  const sp = JSON.parse(readFileSync(server, 'utf8'));
  writeFileSync(server, `${JSON.stringify({ ...sp, version }, null, 2)}\n`);
}

/** The tag message S01 writes, with THIS tree's real contract sha and gitlink. */
async function tagRelease(root, version, { claudeFloor = null } = {}) {
  const { buildTagMessage } = await import('../../scripts/lib/release/tag.mjs');
  const { createHash } = await import('node:crypto');
  const contract = createHash('sha256')
    .update(readFileSync(join(root, 'packages/snowarch/dist/contract.json'))).digest('hex');
  const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const floors = { ...config.floors, ...(claudeFloor ? { claudeCode: claudeFloor } : {}) };
  const message = buildTagMessage({
    version, contract, docsPin: config.docs.pin, floors,
  });
  git(root, ['tag', '-a', `v${version}`, '-m', message]);
  return message;
}

/**
 * Build the whole world.
 *
 * `t` is not optional in spirit: this makes three git trees and a node_modules link, and an
 * untracked one per run is how a TMPDIR reaches five figures (ARC-08-S06's lesson, and C1's).
 */
export async function buildWorld(t, { claudeFloor = null } = {}) {
  const scratch = tempDir('snowarch-upgrade-', t);
  const work = join(scratch, 'work');
  mkdirSync(work, { recursive: true });

  for (const rel of COPIED) {
    const from = join(REAL_ROOT, rel);
    if (!existsSync(from)) continue;
    mkdirSync(dirname(join(work, rel)), { recursive: true });
    cpSync(from, join(work, rel), { recursive: true, dereference: true });
  }
  // A REAL corpus upstream, three areas big.
  //
  // Not the product's: cloning 35,000 files per test would make this harness unusable, and not a
  // dead path either — AC 1's whole claim is that the docs step RE-RUNS when the areas file moves,
  // and a step that cannot sync is a step that skips. `buildUpstream` is the docs suite's own
  // fixture builder, so what B02 does here is what B02 does everywhere.
  const upstream = buildUpstream(join(scratch, 'corpus'));
  const config = JSON.parse(readFileSync(join(work, 'engine.config.json'), 'utf8'));
  writeFileSync(join(work, 'engine.config.json'), `${JSON.stringify({
    ...config,
    docs: { ...config.docs, upstream: pathToFileURL(upstream.bare).href, pin: upstream.pin,
      family: 'australia' },
  }, null, 2)}\n`);
  writeFileSync(join(work, 'vendor/docs-areas.txt'), `${AREAS.join('\n')}\n`);
  // The corpus REGISTERED, exactly as a cloned engine checkout carries it: a `.gitmodules` entry
  // plus a 160000 index entry and nothing on disk. Without it `git submodule status` reports the
  // corpus uninitialised for ever and B02 fails its completeness check after a perfectly good
  // sync — which is what the first run of this harness did.
  writeFileSync(join(work, '.gitmodules'),
    `[submodule "vendor/ServiceNowDocs"]\n\tpath = vendor/ServiceNowDocs\n`
    + `\turl = ${pathToFileURL(upstream.bare).href}\n\tbranch = australia\n\tshallow = true\n`);

  // `node_modules`, LINKED. Fixture release B rebuilds `dist/`, which needs TypeScript, and a
  // fixture that copied 400 MB of dependencies per run would make this harness unusable. It is
  // gitignored, so it never reaches a commit or a tag — the tree the releases carry is the same
  // either way.
  symlinkSync(join(REAL_ROOT, 'node_modules'), join(work, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir');

  rewriteVersion(work, '9.0.0');
  git(work, ['init', '-q', '-b', 'main']);
  commit(work, 'v9.0.0', upstream.pin);
  await tagRelease(work, '9.0.0', { claudeFloor });

  // ── A: v9.1.0 — one declared input moves, so exactly one step goes stale ──────────────────
  const areas = join(work, 'vendor/docs-areas.txt');
  // One area REMOVED rather than added: every area the file names must exist upstream, and a
  // release that asks for one that does not is a broken release rather than a test.
  writeFileSync(areas, `${AREAS.slice(0, -1).join('\n')}\n`);
  rewriteVersion(work, '9.1.0');
  commit(work, 'feat(docs): one fewer area', upstream.pin);
  await tagRelease(work, '9.1.0', { claudeFloor });

  // ── B: v9.2.0 — the store's schema moves, so B06 migrates rather than re-wizards ──────────
  const migrations = join(work, 'packages/snowarch/src/store/migrations/index.ts');
  const src = readFileSync(migrations, 'utf8');
  writeFileSync(migrations, src.replace('export const MIGRATIONS: Migration[] = [];',
    `export const MIGRATIONS: Migration[] = [{
  from: 1,
  to: 2,
  describe: 'add notes to every instance',
  up: (store) => ({
    ...store,
    instances: Object.fromEntries(Object.entries(
      store.instances as Record<string, Record<string, unknown>>)
      .map(([label, inst]) => [label, { ...inst, notes: '' }])),
  }),
}];`));
  const schema = join(work, 'packages/snowarch/src/store/schema.ts');
  writeFileSync(schema, readFileSync(schema, 'utf8')
    .replace('export const STORE_VERSION = 1;', 'export const STORE_VERSION = 2;'));

  // The contract the tag SHIPS has to say 2, which means a real build — `upgrade` reads
  // `storeSchemaVersion` out of the tag before it checks anything out.
  execFileSync(process.execPath, [join(work, 'scripts/build-dist.mjs')],
    { cwd: work, stdio: 'pipe', encoding: 'utf8' });
  execFileSync(process.execPath, [join(work, 'packages/contract/pin.mjs'), '--yes'],
    { cwd: work, stdio: 'pipe', encoding: 'utf8' });
  rewriteVersion(work, '9.2.0');
  commit(work, 'feat(server): store schema v2', upstream.pin);
  await tagRelease(work, '9.2.0', { claudeFloor });

  // ── the bare origin, and the user's clone at v9.0.0 ───────────────────────────────────────
  const origin = join(scratch, 'origin.git');
  execFileSync('git', ['clone', '--quiet', '--bare', work, origin], { stdio: 'pipe' });

  const user = join(scratch, 'user');
  execFileSync('git', ['clone', '--quiet', pathToFileURL(origin).href, user], { stdio: 'pipe' });
  // `node_modules`, linked here too: B06's migration runs the BUILT CLI, which imports commander,
  // and a design-only bootstrap never installs dependencies. The story's own note says the harness
  // installs them; a link is the same thing without a minute of `npm ci` and without the network.
  symlinkSync(join(REAL_ROOT, 'node_modules'), join(user, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir');
  git(user, ['checkout', '--quiet', 'v9.0.0']);
  git(user, ['config', 'user.email', 'f@example.com']);
  git(user, ['config', 'user.name', 'f']);

  // A `claude` on PATH, because the bootstrap's preflight requires one and a CI runner has none —
  // the upgrade's U6 is a real bootstrap and refuses to run without it, exactly as it would on a
  // user's machine. The FIXTURE supplies the prerequisite; the product does not skip the check.
  // AC 8 overrides this with a version below a release's floor.
  const bin = fakeClaude(join(scratch, 'bin'), '2.1.258 (Claude Code)');

  return { scratch, work, origin, user, bin };
}

/** The user's clone, bootstrapped design-only, with a v1 store beside it. */
export function bootstrapUser(user, { store = true } = {}) {
  const r = execFileSync(process.execPath,
    [join(user, 'tools/snowarch/bin/snowarch.mjs'), 'bootstrap',
      '--mode', 'design', '--yes', '--skip-claude-check', '--docs', 'sparse'],
    { cwd: user, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, CLAUDE_PROJECT_DIR: user } });
  if (store) writeStore(user);
  return r;
}

/** Two instances, fixture credentials, schema v1 — the file the upgrade must not touch. */
export function writeStore(user) {
  const dir = join(user, '.local');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, 'instances.json');
  writeFileSync(path, `${JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        url: 'https://dev12345.service-now.com', environment: 'pdi',
        auth: { method: 'basic', username: 'fixture.user', password: FIXTURE_PASSWORD },
        preset: 'pdi-developer', toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      },
      other: {
        url: 'https://dev67890.service-now.com', environment: 'dev',
        auth: { method: 'basic', username: 'fixture.two', password: FIXTURE_PASSWORD },
        preset: 'read-only', toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(path, 0o600);
  return path;
}

/**
 * `./snowarch <args>` in the user's clone, as a user would type it.
 *
 * Spawned, never imported: the command spawns `bootstrap` and `doctor` of its own, and a test that
 * called the function in-process would be exercising a different program from the one a user runs.
 */
export function snowarch(user, args, { env = {}, input = '', bin = null } = {}) {
  // The shim goes FIRST on PATH unless the caller brought its own environment: U6 runs a real
  // bootstrap, whose preflight wants Claude Code, and a hosted runner has none.
  const path = bin && !env.PATH
    ? { PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}` }
    : {};
  const r = spawnSync(process.execPath,
    [join(user, 'tools/snowarch/bin/snowarch.mjs'), ...args], {
      cwd: user, encoding: 'utf8', input,
      env: { ...process.env, CLAUDE_PROJECT_DIR: user, ...path, ...env },
    });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '',
    text: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** A PATH shim that makes `claude --version` answer whatever a test needs (AC 8). */
export function fakeClaude(dir, version) {
  mkdirSync(dir, { recursive: true });
  if (process.platform === 'win32') {
    writeFileSync(join(dir, 'claude.cmd'), `@echo off\r\necho ${version}\r\n`);
  } else {
    const p = join(dir, 'claude');
    writeFileSync(p, `#!/bin/sh\necho "${version}"\n`);
    chmodSync(p, 0o755);
  }
  return dir;
}
