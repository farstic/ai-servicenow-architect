// B01 workspace — make `.local/`, and prove the two committed files are still the committed files.
//
// The verification is the interesting half. `.mcp.json` and `.claude/settings.json` ARE the
// registration: a clone is the install, and Claude Code reads them directly. So an edit to either
// changes what gets registered, and the bootstrap must not proceed as though it had not. Two
// questions are asked, because they catch different mistakes: `git diff` catches an uncommitted
// edit, and the S01 rules — re-evaluated here rather than only at commit time — catch one that was
// committed.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cloudSyncWarning } from '../cloud-sync.mjs';
import { checkMcpJson, checkSettingsJson } from '../registration.mjs';
import { FILE, TEXT } from './inputs.mjs';

export const id = 'B01';
export const title = 'workspace';
export const needsNode = false;
export const runsWhen = () => true;
export const inputs = (ctx) => [
  FILE('.mcp.json'),
  FILE('.claude/settings.json'),
  TEXT(`mode=${ctx.mode}`),
];

export const REGISTRATION_REMEDY =
  'run: git checkout -- .mcp.json   (never edit this file; per-machine values belong in '
  + '.claude/settings.local.json)';

/** `.local/` at 0700, whether it is new or already there. Windows has no mode to set. */
export function ensureLocalDir(root, plat = process.platform) {
  const dir = join(root, '.local');
  const existed = existsSync(dir);
  mkdirSync(join(dir, 'logs'), { recursive: true, mode: 0o700 });
  if (plat === 'win32') return { existed, modes: 'acl-inherited' };
  // An existing directory keeps whatever mode it had — `mkdirSync` does not change it — so a
  // checkout bootstrapped before this rule existed would stay 0755 forever without the chmod.
  chmodSync(dir, 0o700);
  return { existed, modes: '0700' };
}

/** Does the working tree still hold what was committed? */
export function committedFilesUnchanged(root, files, run = defaultRun) {
  try {
    run(['diff', '--quiet', 'HEAD', '--', ...files], root);
    return { clean: true, files: [] };
  } catch {
    // `--name-only` for the report: naming the file that differs is the difference between a
    // remedy someone can follow and one they have to guess at.
    try {
      const out = run(['diff', '--name-only', 'HEAD', '--', ...files], root);
      return { clean: false, files: out.split('\n').map((l) => l.trim()).filter(Boolean) };
    } catch { return { clean: false, files }; }
  }
}

const defaultRun = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });

export const run = async (ctx) => {
  const plat = ctx.plat ?? process.platform;
  const dir = ensureLocalDir(ctx.root, plat);
  ctx.state.writer = 'node';
  if (plat === 'win32') ctx.state.fileModes = 'acl-inherited';

  const data = { localDir: dir.existed ? 'reused' : 'created', modes: dir.modes };

  // The cloud-sync warning is recorded as well as printed, so B09 can repeat it at the end — the
  // one line a user most needs to see again is the one that scrolled past ten steps ago.
  const cloud = cloudSyncWarning(ctx.root);
  if (cloud) data.cloudSync = cloud;

  const files = ['.mcp.json', '.claude/settings.json'];
  const diff = committedFilesUnchanged(ctx.root, files, ctx.git ?? defaultRun);
  if (!diff.clean) {
    return { status: 'fail', data,
      detail: `${diff.files.join(' and ')} differs from the committed version`,
      remedy: REGISTRATION_REMEDY };
  }

  // ...and the rules themselves, in case the difference was committed.
  const readJson = (rel) => {
    try { return JSON.parse(readFileSync(join(ctx.root, rel), 'utf8')); } catch { return null; }
  };
  const problems = [
    ...checkMcpJson(readJson('.mcp.json') ?? {}, ctx.config),
    ...checkSettingsJson(readJson('.claude/settings.json') ?? {}),
  ];
  if (problems.length > 0) {
    return { status: 'fail', data, detail: problems[0], remedy: REGISTRATION_REMEDY };
  }

  return cloud
    ? { status: 'warn', detail: cloud, data }
    : { status: 'ok', detail: `.local/ ${data.localDir} (${dir.modes})`, data };
};
