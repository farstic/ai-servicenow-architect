/**
 * Eight questions asked before anything is written, and the exact sentence for each refusal.
 *
 * ARC-09-S01. A release is the one operation whose mistakes are hard to take back: a tag pushed to
 * a public repository is a name other people have already fetched. So every refusal happens BEFORE
 * the first byte is written — exit 2, nothing touched — and every message says what is wrong and
 * what to do about it, because a maintainer meets these at the end of a long day.
 *
 * The messages are fixed by the story and asserted verbatim in `tests/release.test.mjs`. They are
 * not a log format: `release: working tree not clean:` followed by the porcelain lines is the thing
 * a maintainer pastes into a chat when asking why.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const EXIT_PREFLIGHT = 2;

const SEMVER = /^\d+\.\d+\.\d+$/;
const PRERELEASE = /^\d+\.\d+\.\d+-[0-9A-Za-z.]+$/;

/** `2.0.0` → [2,0,0]; a prerelease compares by its release triple, then as lower. */
function triple(version) {
  const [core, pre] = String(version).split('-');
  const parts = core.split('.').map(Number);
  return { parts, pre: pre ?? null };
}

/** -1 / 0 / 1, with a prerelease sorting BELOW the release it precedes (semver §11). */
export function compareVersions(a, b) {
  const [x, y] = [triple(a), triple(b)];
  for (let i = 0; i < 3; i += 1) {
    if (x.parts[i] !== y.parts[i]) return x.parts[i] < y.parts[i] ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/** The newest `v*` tag, or `null` when none exists — the 2.0.0 case. */
export function latestTag(tags) {
  const versions = tags
    .map((t) => t.trim())
    .filter((t) => /^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(t))
    .map((t) => t.slice(1));
  if (versions.length === 0) return null;
  return `v${versions.sort(compareVersions).at(-1)}`;
}

/**
 * Run the eight checks in order, stopping at the first failure.
 *
 * `git` is injected — every call goes through it, so the whole sequence can be driven against a
 * fixture repository and against a stub that answers what no fixture easily can (a `git fetch` that
 * fails, a branch behind its remote).
 *
 * Returns `{ ok: true, branch, latest }` or `{ ok: false, message }`.
 */
export function preflight({ version, root, git, config, flags = {}, platform = process.platform,
  nodeVersion = process.versions.node, hasNpm = true }) {
  // 1. The version itself. Checked first because every later message quotes it back.
  const shapeOk = flags['allow-prerelease'] ? (SEMVER.test(version) || PRERELEASE.test(version))
    : SEMVER.test(version);
  if (!shapeOk) return { ok: false, message: `release: version "${version}" is not x.y.z` };

  // 2. The name is free. `git tag -l` prints nothing for a tag that does not exist and the tag name
  // for one that does — an exact-match query, not a pattern search.
  if (git(['tag', '-l', `v${version}`]).trim() !== '') {
    return { ok: false, message: `release: tag v${version} already exists` };
  }

  // 3. Forward, not backward. Skipped entirely when there is no tag yet, which is the 2.0.0 case
  // this script was written for: "greater than nothing" is not a question.
  const latest = latestTag(git(['tag', '-l', 'v*']).split('\n'));
  if (latest && compareVersions(version, latest.slice(1)) <= 0) {
    return { ok: false, message: `release: ${version} is not greater than the latest tag ${latest}` };
  }

  // 4. The right branch. `--allow-branch` exists for the two-phase flow and for a hotfix; naming it
  // in the message means the maintainer does not have to look it up.
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const expected = flags['allow-branch'] || 'main';
  if (branch !== expected) {
    return { ok: false,
      message: `release: must run on main (currently on ${branch}); use --allow-branch <name> for a hotfix branch` };
  }

  // 5. Clean, including untracked. A release built from a tree with an extra file in it is a
  // release nobody can reproduce from the tag.
  const porcelain = git(['status', '--porcelain']).replace(/\s+$/, '');
  if (porcelain !== '') {
    return { ok: false,
      message: `release: working tree not clean:\n${porcelain}\nCommit or stash first — nothing was written` };
  }

  // 6. Up to date with the remote, unless the maintainer says the network is not available.
  //
  // THREE STATES, not two (ARC-09-C14). `merge-base --is-ancestor origin/<branch> HEAD` fails both
  // when the branch is behind AND when `origin/<branch>` does not exist — a ref cannot be an
  // ancestor of anything if it is not there — so a branch that had never been pushed was reported
  // as "behind origin/<branch>", and the remedy offered was `git pull --ff-only`, which cannot work
  // on a ref that does not exist. Rehearsal run 3 stopped there for ten minutes.
  if (!flags.offline) {
    const fetched = git(['fetch', 'origin', branch], { allowFail: true });
    const hasUpstream = git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`],
      { allowFail: true }) !== null;
    if (!hasUpstream) {
      return { ok: false,
        message: `release: origin/${branch} does not exist — this branch has never been pushed.\n`
          + `Push it first (git push -u origin ${branch}), or pass --offline if the remote is not `
          + 'part of this release' };
    }
    const behind = fetched === null
      || git(['merge-base', '--is-ancestor', `origin/${branch}`, 'HEAD'], { allowFail: true }) === null;
    if (behind) {
      return { ok: false, message: `release: HEAD is behind origin/${branch} — git pull --ff-only first` };
    }
  }

  // 7. The corpus is present AND is the one the pin names. The tag records the gitlink, so a
  // release cut against a different corpus would carry a pin nobody can reproduce.
  const gitlink = /^\d+ commit ([0-9a-f]{40})\t/.exec(git(['ls-tree', 'HEAD', 'vendor/ServiceNowDocs']))?.[1];
  if (!existsSync(join(root, 'vendor/ServiceNowDocs/.git')) || gitlink !== config?.docs?.pin) {
    return { ok: false, message: 'release: docs pin mismatch or corpus missing — run ./snowarch docs sync' };
  }

  // 8. The toolchain. Last, because it is the one a maintainer can least often do anything about
  // in the moment, and the others are more likely.
  const major = Number(String(nodeVersion).split('.')[0]);
  if (!Number.isFinite(major) || major < 20) {
    return { ok: false, message: `release: Node ${nodeVersion} is below the floor of 20 — upgrade Node first` };
  }
  if (!hasNpm) return { ok: false, message: 'release: npm is not on PATH' };

  return { ok: true, branch, latest, docsPin: gitlink, platform };
}
