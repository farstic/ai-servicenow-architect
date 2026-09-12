#!/usr/bin/env node
// ARC-03-S09 — the weekly bump, as a script the workflow calls and a human can run.
//
// Thin on purpose. Everything that decides anything lives in ARC-03-S07's `syncUpstream`: what the
// new pin is, which citations broke, what the report says. This adds the pull-request body around
// that report and nothing else — a second place that decided what "newly dead" means would be a
// second answer to the same question.
//
// The report goes into the body VERBATIM, inside a fence. S07's headings are the contract; wrapping
// them in prose here would let the two drift apart with nothing to notice.
import { appendFileSync, existsSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORPUS_DIR, EXIT, SyncError } from '../tools/snowarch/lib/docs/sync.mjs';
import { syncUpstream, formatUpstream } from '../tools/snowarch/lib/docs/upstream.mjs';

/**
 * The repository to act on: the working directory when it is one, else this script's own.
 *
 * The workflow runs from the checkout root, so `cwd` is right there; a maintainer running it by
 * path from elsewhere gets the script's repository, which is what they meant. Resolving it ONLY
 * from the script's location made every test operate on the real repository instead of its fixture
 * — which is how this was found.
 */
const root = existsSync(join(process.cwd(), 'engine.config.json'))
  ? process.cwd()
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const value = (n) => { const i = argv.indexOf(n); return i === -1 ? undefined : argv[i + 1]; };

const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();

/**
 * The body a reviewer reads: what to check, then exactly what the tool saw.
 *
 * The checklist comes first because it is the ask. The fenced report is evidence, and it is
 * S07's text unaltered — a reviewer who compares the PR against a local `docs sync --upstream`
 * should find the same bytes.
 */
export function prBody(report) {
  const { text } = formatUpstream(report);
  return [
    '- [ ] newly dead citations remapped (or none)',
    '- [ ] `node scripts/docs.mjs verify` → `dead: 0`',
    '- [ ] release notes skimmed: `vendor/ServiceNowDocs/markdown/release-notes/`',
    '',
    '```',
    text,
    '```',
    '',
    '_Opened by `.github/workflows/docs-bump.yml`. Never auto-merged._',
  ].join('\n');
}

/**
 * Undo everything the refresh staged and wrote — the manual procedure from S07, automated.
 *
 * A dry run that left a moved pin behind would be worse than no dry run: the next thing to read the
 * config would believe the bump had happened. So the restore is verified rather than assumed, and
 * the script fails if the tree is not clean afterwards — which is how the third staged path was
 * caught: the recipe block was regenerated, unstaged, and left modified in the working tree.
 */
function restore(oldPin, staged) {
  git(['restore', '--staged', '.']);
  git(['-C', CORPUS_DIR, 'checkout', '--detach', oldPin]);
  // Restore what the refresh SAID it staged, rather than the one file this used to name. The
  // recipe fix made `docs/ARCHITECTURE.md` a third possible path, and a hard-coded list is a list
  // that goes stale the next time the refresh writes something new — here, silently, because the
  // porcelain check below would blame the tree rather than this function. The corpus is excluded
  // because it is a gitlink the line above already moved.
  const files = staged.filter((f) => f !== CORPUS_DIR);
  if (files.length > 0) git(['restore', '--', ...files]);
  const porcelain = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter((l) => l.trim() !== '');
  if (porcelain.length > 0) {
    throw new SyncError(`dry run could not restore the tree — still dirty:\n${porcelain.join('\n')}`,
      EXIT.git);
  }
  return true;
}

/**
 * The CLI, behind a guard so the module can be imported.
 *
 * Without this, `import { prBody }` RUNS THE REFRESH — the test that wanted the body renderer would
 * fetch from upstream and move the pin. A script that does its work at import cannot be tested, and
 * the first test written against this one said so immediately.
 */
function main() {
  const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const oldPin = config.docs.pin;
  const dryRun = flag('--dry-run');

  let report;
  try {
    report = syncUpstream({ root, config, to: value('--to') ?? null, verify: true, log: null });
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    writeSync(2, `${e.message}\n`);
    // The annotation is what a maintainer sees in the Actions summary; the exit code is what the
    // job keys on. Both, because one without the other is a failure nobody reads.
    writeSync(1, `::error::docs-bump: ${e.message}\n`);
    process.exit(e.code);
  }

  const body = prBody(report);
  const out = { ...report, prBody: body, dryRun };
  if (value('--body-out')) writeFileSync(value('--body-out'), `${body}\n`);
  // The workflow's outputs, written by the thing that computed them. This used to be an inline
  // `node -e` step in the YAML, which shellcheck flagged (SC2016) for the `${…}` inside single
  // quotes — they are JavaScript template literals, not shell, and the honest answer to a linter
  // confused by that is not a suppression comment but to stop writing a program inside a YAML
  // string. One place computes; the workflow consumes.
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, [
      `from=${report.from}`,
      `to=${report.to}`,
      `short=${report.to.slice(0, 7)}`,
      `moved=${String(report.from !== report.to)}`,
      `newly_dead=${report.newlyDead.length}`,
      `date=${report.upstreamDate}`,
      '',
    ].join('\n'));
  }

  if (flag('--json')) {
    const p = join(root, 'bump.json');
    writeFileSync(p, `${JSON.stringify(out, null, 2)}\n`);
    writeSync(2, `docs-bump: wrote ${p}\n`);
  }
  writeSync(1, `${body}\n`);

  if (dryRun) {
    restore(oldPin, report.staged);
    writeSync(1, '\ndocs-bump: dry run — tree restored, porcelain empty, nothing staged\n');
    if (report.newlyDead.length > 0) {
      // A dry run's job is to REPORT. Newly dead citations are the finding it exists to surface, not
      // a failure of the run, so they arrive as a warning annotation and the job stays green. The
      // red build belongs on the pull request a non-dry run opens, where someone can act on it.
      writeSync(1, `::warning::docs-bump: ${report.newlyDead.length} newly dead citation(s) `
        + `if the pin moves to ${report.to.slice(0, 7)} — see the body above\n`);
    }
    process.exit(EXIT.ok);
  }

  process.exit(formatUpstream(report).code);
}

// `argv[1]` is the script that was invoked. Compared as a path rather than by name, so a copy under
// another name still behaves and an import never does.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
