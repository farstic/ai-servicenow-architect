#!/usr/bin/env node
/**
 * One command that cuts a release, and refuses to cut a bad one.
 *
 * ARC-09-S01. `node scripts/release.mjs <x.y.z>` — preflight, gates, writes, one commit, one
 * annotated tag. Nothing is written until every gate has passed, nothing is pushed unless asked,
 * and every refusal happens before the first byte: a tag pushed to a public repository is a name
 * other people have already fetched.
 *
 * Usage:
 *   node scripts/release.mjs <x.y.z> [--dry-run] [--yes] [--push] [--tag-only]
 *                                    [--allow-branch <name>] [--allow-prerelease]
 *                                    [--offline] [--no-install] [--sign]
 *
 * Exit 0 released (or nothing to do) · 1 a gate failed · 2 preflight refused.
 *
 * THE SUPPORTED FLOW on a `main` with required status checks (which is what this repository has —
 * 42 of them, `strict: true`): a release commit pushed straight to `main` carries no checks and the
 * strict rule refuses it, so the one-shot flow the story describes cannot land here. Four steps
 * instead, recorded in `docs/CONTRIBUTING.md`:
 *
 *   1. `node scripts/release.mjs <x.y.z> --yes --allow-branch release/v<x.y.z>` on a branch cut
 *      from `main` — writes and commits, no tag.
 *   2. A pull request to `main`. CI runs the required checks on the release commit itself.
 *   3. `node scripts/release.mjs <x.y.z> --tag-only` on `main` at the merge commit — the tag.
 *   4. `git push origin v<x.y.z>`.
 *
 * Stdlib only, and no shell anywhere: a maintainer may release from Windows, where there is no
 * bash and `npm` is `npm.cmd`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { askOnce, isYes } from '../tools/snowarch/lib/ask.mjs';
import { EXIT_GATE, gatePlan, runGates } from './lib/release/gates.mjs';
import { EXIT_PREFLIGHT, preflight } from './lib/release/preflight.mjs';
import { buildTagMessage } from './lib/release/tag.mjs';
import { applyWrites, rollback, STAGED } from './lib/release/writers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const FLAGS = ['--dry-run', '--yes', '--push', '--tag-only', '--allow-prerelease', '--offline',
  '--no-install', '--sign'];
const VALUE_FLAGS = ['--allow-branch', '--root'];

export function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (FLAGS.includes(arg)) { flags[arg.slice(2)] = true; continue; }
    if (VALUE_FLAGS.includes(arg)) { flags[arg.slice(2)] = argv[i + 1]; i += 1; continue; }
    if (arg.startsWith('--')) return { error: `release: unknown flag ${arg}` };
    rest.push(arg);
  }
  if (rest.length !== 1) return { error: 'release: usage: node scripts/release.mjs <x.y.z> [flags]' };
  return { version: rest[0], flags };
}

/**
 * The release, as a function, so the tests drive it rather than a subprocess.
 *
 * Every side effect goes through an injected seam: `git` for the repository, `run` for the child
 * processes the gates and npm need, `ask` for the one question. A test can then stub the gates —
 * which take minutes and need the network — while still exercising the real preflight, the real
 * writers and the real ordering, which is where the behaviour under test actually lives.
 */
export async function release({
  argv,
  root = resolve(HERE, '..'),
  out = process.stdout,
  err = process.stderr,
  ask = null,
  git = null,
  run = null,
  now = () => new Date(),
  platform = process.platform,
} = {}) {
  const write = (text) => out.write(`${text}\n`);
  const fail = (text) => err.write(`${text}\n`);

  const parsed = parseArgs(argv);
  if (parsed.error) { fail(parsed.error); return EXIT_PREFLIGHT; }
  const { version, flags } = parsed;

  // `git` returns stdout, `null` when the command failed and the caller allowed it to — and THROWS
  // otherwise. An earlier version returned an empty string for an unexpected failure, and the
  // fixture found what that costs: a `git status --porcelain` that cannot run (a corpus gitlink
  // pointing at a gitdir that is not there) came back as "", which reads as a CLEAN TREE. The
  // release then proceeded on a repository git itself could not describe. A refusal to answer and
  // an answer of "nothing" must never be the same value.
  const gitDefault = (args, { allowFail = false } = {}) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (r.status !== 0) {
      if (allowFail) return null;
      const detail = String(r.stderr ?? '').split('\n')[0] || `exit ${r.status}`;
      throw new Error(`release: git ${args.join(' ')} failed — ${detail}`);
    }
    return r.stdout ?? '';
  };
  const gitRun = git ?? gitDefault;

  // Child processes for the gates and for npm. `shell` on Windows only, and only because `npm`
  // there is `npm.cmd` — a batch file, which Node has refused to exec directly since
  // CVE-2024-27980. Every argument here is ours; none comes from a user.
  const runDefault = (args) => {
    const [cmd, ...rest] = args;
    const r = spawnSync(cmd, rest, { cwd: root, stdio: 'inherit', shell: platform === 'win32' });
    return r.status ?? 1;
  };
  const runChild = run ?? runDefault;

  const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));

  try {
    return await runRelease({ version, flags, root, out, err, write, fail, git: gitRun,
      run: runChild, config, ask, now, platform, injectedRun: run !== null });
  } catch (e) {
    // A git command that could not run is a refusal, not a crash: the maintainer needs the sentence,
    // not the stack. Anything else is a bug and keeps its stack.
    if (String(e.message).startsWith('release: git ')) { fail(e.message); return EXIT_PREFLIGHT; }
    throw e;
  }
}

async function runRelease({ version, flags, root, out, err, write, fail, git: gitRun, run: runChild,
  config, ask, now, platform, injectedRun }) {
  // ── preflight ──────────────────────────────────────────────────────────────────────────────
  // The npm probe is skipped when the caller injected a runner: a test has no npm to find, and a
  // preflight that failed on the absence of a tool it was never going to spawn would be asserting
  // about the machine rather than about the release.
  const hasNpm = injectedRun || Boolean(spawnSync('npm', ['--version'],
    { encoding: 'utf8', shell: platform === 'win32' }).stdout);
  const pre = preflight({ version, root, git: gitRun, config, flags, platform, hasNpm });
  if (!pre.ok) { fail(pre.message); return EXIT_PREFLIGHT; }

  const contractSha = createHash('sha256')
    .update(readFileSync(join(root, 'packages/snowarch/dist/contract.json'))).digest('hex');
  const tagMessage = buildTagMessage({ version, contract: contractSha, docsPin: pre.docsPin,
    floors: config.floors });

  // The pin file and the artefact must already agree. They are two records of one thing, and a
  // release that recorded a sha nobody pinned would be a release whose contract nothing verifies.
  const pinned = JSON.parse(readFileSync(join(root, 'packages/contract/required-tools.json'), 'utf8'));
  if (pinned.contractSha256 && pinned.contractSha256 !== contractSha) {
    fail(`release: the pin says ${pinned.contractSha256.slice(0, 12)}… and dist/contract.json is `
      + `${contractSha.slice(0, 12)}… — run node packages/contract/pin.mjs`);
    return EXIT_PREFLIGHT;
  }

  // ── --tag-only ─────────────────────────────────────────────────────────────────────────────
  if (flags['tag-only']) {
    const carried = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    if (carried !== version) {
      fail(`release: --tag-only, but the tree carries ${carried}, not ${version}`);
      return EXIT_PREFLIGHT;
    }
    const subject = gitRun(['log', '-1', '--format=%s']).trim();
    const merged = gitRun(['log', '-20', '--format=%s']).split('\n')
      .some((s) => s.trim() === `chore(release): v${version}`);
    if (!merged) {
      fail(`release: --tag-only, but no "chore(release): v${version}" commit is in the last 20 `
        + `(HEAD is "${subject}")`);
      return EXIT_PREFLIGHT;
    }
    if (flags['dry-run']) { write(tagMessage); return 0; }
    createTag({ root, version, tagMessage, sign: flags.sign });
    write(`Tagged v${version} — push with: git push origin v${version}`);
    if (flags.push) runChild(['git', 'push', 'origin', `v${version}`]);
    return 0;
  }

  // ── the plan screen ────────────────────────────────────────────────────────────────────────
  const current = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const commits = pre.latest
    ? gitRun(['log', '--oneline', `${pre.latest}..HEAD`]).split('\n').filter(Boolean).length
    : gitRun(['log', '--oneline']).split('\n').filter(Boolean).length;
  const plan = gatePlan({ noInstall: flags['no-install'], platform });

  write([
    `release ${current} → ${version}`,
    `  branch   ${pre.branch}${pre.latest ? ` · ${commits} commits since ${pre.latest}` : ` · ${commits} commits, no previous tag`}`,
    `  gates    ${plan.map((g) => g.name).join(' → ')}`,
    `  writes   ${STAGED.join(', ')}`,
    `  tag      v${version} (annotated)`,
    `  push     ${flags.push ? 'yes — git push origin ' + pre.branch + ' --follow-tags' : 'no'}`,
  ].join('\n'));

  if (!flags.yes && !flags['dry-run']) {
    out.write('Proceed? [Y/n] ');
    const answer = await (ask ?? askOnce(process.stdin))();
    if (!isYes(answer)) { write('release: nothing changed'); return 0; }
  }

  // ── gates ──────────────────────────────────────────────────────────────────────────────────
  const gated = runGates({
    plan,
    run: (args) => runChild(args),
    diffDist: () => gitRun(['diff', '--exit-code', '--quiet', '--', 'packages/snowarch/dist'],
      { allowFail: true }) === null,
    onStart: (name) => write(`  gate ${name}…`),
  });
  if (!gated.ok) { fail(gated.message); return EXIT_GATE; }

  if (flags['dry-run']) {
    write('');
    write(tagMessage);
    write('release: --dry-run — nothing was written');
    return 0;
  }

  // ── writes ─────────────────────────────────────────────────────────────────────────────────
  const date = now().toISOString().slice(0, 10);
  const written = applyWrites({ root, version, date, run: runChild });
  if (!written.ok) {
    rollback(root, written.touched);
    fail(written.message);
    return EXIT_GATE;
  }

  // The post-write check: the tree that was just produced must satisfy the one test that asserts
  // the counters agree. A release whose own consistency test fails is rolled back rather than
  // committed — the alternative is a tag on a tree nobody can reproduce.
  if (runChild(['node', '--test', 'tests/version-consistency.test.mjs']) !== 0) {
    rollback(root, written.touched);
    fail('release: version-consistency failed after the writes — rolled back, nothing was committed');
    return EXIT_GATE;
  }

  // ── commit and tag ─────────────────────────────────────────────────────────────────────────
  execFileSync('git', ['add', ...STAGED.filter((f) => existsSync(join(root, f)))],
    { cwd: root, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', `chore(release): v${version}`], { cwd: root, stdio: 'pipe' });
  const short = gitRun(['rev-parse', '--short', 'HEAD']).trim();

  // On a protected `main` the tag is cut in a second pass (`--tag-only`) after the pull request has
  // merged; on a release branch the commit is the deliverable and the tag would name the wrong sha.
  if (flags['allow-branch']) {
    write(`Committed chore(release): v${version} (${short}) on ${pre.branch} — `
      + `open a pull request to main, then run --tag-only there`);
    return 0;
  }

  createTag({ root, version, tagMessage, sign: flags.sign });
  write(`Released v${version} (commit ${short}) — push with: git push origin ${pre.branch} --follow-tags`);
  if (flags.push) runChild(['git', 'push', 'origin', pre.branch, '--follow-tags']);
  return 0;
}

/** `git tag -a -F <file>`: the message goes through a file, never through argv. */
function createTag({ root, version, tagMessage, sign = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-tag-'));
  const file = join(dir, 'TAG_MESSAGE');
  try {
    writeFileSync(file, tagMessage);
    execFileSync('git', ['tag', '-a', ...(sign ? ['-s'] : []), `v${version}`, '-F', file],
      { cwd: root, stdio: 'pipe' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  release({ argv: process.argv.slice(2) }).then((code) => process.exit(code));
}
