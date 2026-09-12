#!/usr/bin/env node
/**
 * The tag says what was released. This checks that the tree agrees.
 *
 * ARC-09-S03. A release downloaded six months later is a tarball and a tag, and the tag's message
 * is the only place that records which contract, which corpus and which floors were in force. That
 * makes it worth exactly one thing: being TRUE. A message written by `scripts/release.mjs` is true
 * by construction; a tag made by hand, or edited afterwards, is not — and this runs on the release
 * workflow before any gate, so a wrong tag never reaches a published Release.
 *
 * Usage: node scripts/ci/verify-tag.mjs <tag> [--root <dir>]
 * Exit 0 verified · 1 the tag and the tree disagree · 2 cannot run.
 *
 * Stdlib only, and no shell: the release workflow's Windows leg runs under pwsh with no Git Bash.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { parseTagMessage } from '../lib/release/tag.mjs';

const argv = process.argv.slice(2);
const value = (n) => (argv.indexOf(n) === -1 ? undefined : argv[argv.indexOf(n) + 1]);
const ROOT = resolve(value('--root') ?? process.cwd());
const tag = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--root');

const die = (m) => { writeSync(2, `${m}\n`); process.exit(2); };
const fail = (m) => { writeSync(2, `${m}\n`); process.exit(1); };

if (!tag) die('verify-tag: usage: node scripts/ci/verify-tag.mjs <tag>');

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
const tryGit = (args) => { try { return git(args); } catch { return null; } };

/**
 * The annotated tag's own object, or `null` for a lightweight one.
 *
 * A lightweight tag is a ref pointing straight at a commit: `cat-file -t` says `commit`, not `tag`.
 * That distinction IS the check — a lightweight tag has no message, so it records nothing, and a
 * release cut from one would publish a version whose provenance is unwritten.
 */
function annotation(name) {
  const type = tryGit(['cat-file', '-t', `refs/tags/${name}`])?.trim();
  if (type !== 'tag') return null;
  return tryGit(['cat-file', '-p', `refs/tags/${name}`]);
}

/**
 * Does the REMOTE hold an annotated object for this tag?
 *
 * ARC-09-C16. `git ls-remote --tags` lists a `^{}` peel line for a tag object and nothing of the
 * sort for a lightweight one, so the remote can be asked the question the local clone can no longer
 * answer. This matters because `actions/checkout@v4` writes `refs/tags/<name>` pointing at the
 * COMMIT — it peels the tag — and a perfectly well-formed annotated tag then looks lightweight
 * here. Saying "not annotated" in that case blames the tag for the checkout's behaviour, and the
 * v2.0.0-rc.0 rehearsal lost three jobs to exactly that message.
 *
 * Diagnosis only: the refusal stands either way, because this clone genuinely cannot read a message
 * that is not in it. What changes is what the next person is told to do.
 */
function remoteHasAnnotation(name) {
  // QUIET, and only ever on the failing path. A checkout with no `origin` — every fixture in the
  // test suite — makes git print two lines about access rights to stderr, which is noise in a
  // report about a tag and broke a test that asserts the exact refusal. `stdio: pipe` keeps git's
  // opinion to itself; the answer here is a yes/no, not a diagnosis of the remote.
  let out;
  try {
    out = execFileSync('git', ['ls-remote', '--tags', 'origin',
      `refs/tags/${name}`, `refs/tags/${name}^{}`],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return false; }
  return typeof out === 'string' && out.includes(`refs/tags/${name}^{}`);
}

const body = annotation(tag);
if (body === null) {
  if (remoteHasAnnotation(tag)) {
    fail(`tag ${tag}: the remote has the annotated object; this checkout peeled it to a commit — `
      + 're-fetch the tag (git fetch --force origin "+refs/tags/<tag>:refs/tags/<tag>"); '
      + 'release.yml does this after checkout');
  }
  fail(`tag ${tag} is not annotated — create it with scripts/release.mjs`);
}

const parsed = parseTagMessage(body);
if (!parsed) fail(`tag ${tag}: the message is not a snowarch tag message — create it with scripts/release.mjs`);

// ── what the tree says ─────────────────────────────────────────────────────────────────────────
const contractPath = join(ROOT, 'packages/snowarch/dist/contract.json');
if (!existsSync(contractPath)) die(`verify-tag: ${contractPath} is not there`);
const contract = createHash('sha256').update(readFileSync(contractPath)).digest('hex');

const gitlink = /^\d+ commit ([0-9a-f]{40})\t/.exec(git(['ls-tree', 'HEAD', 'vendor/ServiceNowDocs']))?.[1];
const config = JSON.parse(readFileSync(join(ROOT, 'engine.config.json'), 'utf8'));
const rootVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const marker = /^\*\*Version:\*\* (\S+) /m.exec(readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8'))?.[1];

// ── the comparisons, each with the sentence it fails with ──────────────────────────────────────
const problems = [];
const short = (v) => String(v ?? '').slice(0, 12);

if (parsed.contract !== contract) {
  problems.push(`${tag}: contract sha in message (${short(parsed.contract)}…) `
    + `!= dist/contract.json (${short(contract)}…)`);
}
if (parsed.docsPin !== gitlink) {
  problems.push(`${tag}: docs-pin in message (${short(parsed.docsPin)}…) != the gitlink (${short(gitlink)}…)`);
}
// The pin file is the third record of the same thing, and a release where it disagrees is one the
// contract gate would already have refused — checked here because the tag outlives the gate.
if (gitlink !== config.docs?.pin) {
  problems.push(`${tag}: the gitlink (${short(gitlink)}…) != engine.config.json docs.pin (${short(config.docs?.pin)}…)`);
}
for (const [key, name] of [['claudeCode', 'claude-floor'], ['node', 'node-floor'], ['git', 'git-floor']]) {
  if (parsed.floors?.[key] !== config.floors?.[key]) {
    problems.push(`${tag}: ${name} in message (${parsed.floors?.[key]}) != engine.config.json (${config.floors?.[key]})`);
  }
}
// The tag NAME and the tree's version. A tag called v2.0.0 on a tree carrying 2.0.0-dev is the
// mistake this catches, and it is the easy one to make.
const named = tag.replace(/^v/, '');
if (named !== rootVersion) problems.push(`${tag}: the tree carries ${rootVersion}, not ${named}`);
if (marker !== rootVersion) problems.push(`${tag}: the CLAUDE.md marker says ${marker}, not ${rootVersion}`);
if (parsed.version !== named) problems.push(`${tag}: the message names v${parsed.version}`);

if (problems.length) {
  for (const p of problems) writeSync(2, `${p}\n`);
  process.exit(1);
}
writeSync(1, `tag ${tag} verified\n`);
